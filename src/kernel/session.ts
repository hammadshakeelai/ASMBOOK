// ================================================================
// LiveSession — the notebook kernel (R1 core + R2 extensions)
// DOM-free and Node-testable (tests/session.test.ts).
// ================================================================
import { CPU, Parser, Executor } from './engine.mjs';
import { parseExpects, evaluateExpects, type ExpectClause, type ExpectResult, type EvalContext } from './expect.js';
import { friendlyErrors, type FriendlyError } from './errors.js';

export interface Cell {
  id: string;
  kind: 'code' | 'markdown';
  source: string;
}

export interface RunResult {
  reason: 'step' | 'cell-end' | 'halted' | 'breakpoint' | 'cap' | 'left-cell' | 'reached' | 'end' | 'restart-needed' | 'error';
  error?: string;
  steps: number;
  output: string;
  regDiff: Record<string, [number, number]>;
  halted: boolean;
  expectResults: ExpectResult[];
  allPassed: boolean;
}

export interface CellOutput {
  text: string;
  regDiff: Record<string, [number, number]>;
  steps: number;
  reason: RunResult['reason'];
  stale: boolean;
  expectResults: ExpectResult[];
  allPassed: boolean;
  error?: string;
}

interface Parsed {
  errors: { message: string; lineNum?: number }[];
  instrs: { op: string; args: string[]; lineNum: number; raw?: string }[];
  labels: Record<string, number>;
  vars: Record<string, any>;
}

interface Cursor {
  cellId: string | null;
  line: number | null;
  instrIndex: number;
}

export interface LiveState {
  regs: Record<string, number>;
  flags: Record<string, number>;
  cursor: Cursor | null;
  halted: boolean;
  needsRestart: boolean;
  totalInstrs: number;
}

const REG_LIST = ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP', 'CS', 'DS', 'ES', 'SS'];

/** Known 8086 instruction set — used to flag unknown opcodes at parse time. */
const VALID_OPS = new Set([
  'NOP','HLT','MOV','XCHG','LEA','CBW','CWD','XLAT','XLATB',
  'ADD','ADC','SUB','SBB','INC','DEC','NEG','MUL','IMUL','DIV','IDIV',
  'AND','OR','XOR','TEST','NOT','CMP',
  'SHL','SAL','SHR','SAR','ROL','ROR','RCL','RCR',
  'PUSH','POP','PUSHF','POPF',
  'JMP','CALL','RET','RETN','RETF',
  'JE','JZ','JNE','JNZ','JL','JNGE','JLE','JNG','JG','JNLE','JGE','JNL',
  'JA','JNBE','JAE','JNB','JNC','JB','JNAE','JC','JBE','JNA',
  'JS','JNS','JO','JNO','JP','JPE','JNP','JPO','JCXZ',
  'LOOP','LOOPE','LOOPZ','LOOPNE','LOOPNZ',
  'CLC','STC','CMC','CLD','STD','CLI','STI',
  'INT','INTO','IRET',
  'MOVSB','MOVSW','STOSB','STOSW','LODSB','LODSW','SCASB','SCASW','CMPSB','CMPSW',
  'REP','REPE','REPZ','REPNE','REPNZ',
  'DAA','DAS','AAA','AAS','AAM','AAD',
  'PUSHA','PUSHAW','POPA','POPAW',
  'LAHF','SAHF',
  'ENTER','LEAVE','INS','OUTS',
  'WAIT','FWAIT','LOCK','ESC','HNT',
]);

export class LiveSession {
  private cells: Cell[] = [];
  private cpu: CPU;
  private ex: Executor;
  private parsed: Parsed | null = null;
  private starts: number[] = [];
  private cellStarts = new Map<string, number>();
  private cellEnds = new Map<string, number>();
  private lineOwner: string[] = [];
  private bpSource = new Set<string>();
  private breakpoints = new Set<number>();
  private expectsByCell = new Map<string, ExpectClause[]>();
  private lastHalted = false;
  private outputs = new Map<string, CellOutput>();
  private execCounts = new Map<string, number>();
  private globalExecCount = 0;
  private needsRestart = false;
  private built = false;

  constructor() {
    this.cpu = new CPU();
    this.parsed = new Parser().parse('') as Parsed;
    this.ex = new Executor(this.cpu, this.parsed);
  }

  setCells(cells: Cell[]): { needsRestart: boolean } {
    return this.rebuild(cells);
  }

  get cellCount(): number { return this.cells.length; }
  get instrCount(): number { return this.parsed?.instrs?.length ?? 0; }
  get allCells(): Cell[] { return this.cells; }

  private rebuild(cells: Cell[]): { needsRestart: boolean } {
    this.cells = cells;
    this.outputs.clear();
    this.expectsByCell.clear();
    this.lastHalted = false;

    const codeCells = cells.filter(c => c.kind === 'code');
    const parts: string[] = [];
    this.starts = [];
    this.lineOwner = [];
    this.cellStarts.clear();
    this.cellEnds.clear();
    for (const c of codeCells) {
      const startLine = parts.length + 1;
      this.cellStarts.set(c.id, startLine);
      this.starts.push(startLine);
      const lines = c.source.split('\n');
      for (const ln of lines) { this.lineOwner.push(c.id); parts.push(ln); }
      const endLine = parts.length;
      this.cellEnds.set(c.id, endLine);
    }

    const concat = parts.join('\n');
    const parsed = (new Parser().parse(concat) as unknown) as Parsed;
    this.parsed = parsed;
    if (this.globalExecCount === 0 && this.cpu.ip === 0) {
      this.cpu = new CPU();
    }
    this.ex = new Executor(this.cpu, parsed);

    // Validate opcodes — flag unknown instructions as parse errors
    for (const ins of parsed.instrs) {
      if (!VALID_OPS.has(ins.op)) {
        parsed.errors.push({ message: `error: unknown instruction: ${ins.op}`, lineNum: ins.lineNum });
      }
    }

    for (const c of codeCells) {
      this.expectsByCell.set(c.id, parseExpects(c.source));
    }

    this.built = true;
    this.resyncBreakpoints();

    const prevIP = this.cpu.ip;
    if (prevIP < parsed.instrs.length) {
      return { needsRestart: false };
    }
    // IP is past end — reset to start so the program can run again.
    this.cpu = new CPU();
    this.ex = new Executor(this.cpu, parsed);
    return { needsRestart: true };
  }

  /** Convert a user-visible code line number to the parser's absolute line number.
   *  User line 1 = first instruction line, skipping directives/blanks.
   *  Returns the parser's lineNum value, or null if not found. */
  private userLineToParserLine(cellId: string, userLine: number): number | null {
    const startLine = this.cellStarts.get(cellId);
    if (startLine === undefined) return null;
    const endLine = this.cellEnds.get(cellId) ?? Infinity;
    // Count only instruction lines (lines that the parser assigned a lineNum to)
    let instrCount = 0;
    for (let i = 0; i < this.parsed!.instrs.length; i++) {
      const ins = this.parsed!.instrs[i];
      if (ins.lineNum >= startLine && ins.lineNum <= endLine) {
        instrCount++;
        if (instrCount === userLine) return ins.lineNum;
      }
    }
    return null;
  }

  /** Run from a clean machine up to the END of the given cell. */
  runUpTo(cellId: string): RunResult {
    this.resetMachine();
    return this.run(cellId, 'through');
  }

  /** Run from current state up to a specific line in a cell (temporary breakpoint). */
  runToLine(cellId: string, line: number): RunResult {
    if (!this.built) return this.errorResult('No program built yet');
    if (this.needsRestart) return this.errorResult('Machine needs restart', 'restart-needed');

    // Convert user line number to parser's lineNum
    const parserLine = this.userLineToParserLine(cellId, line);
    if (parserLine === null) return this.errorResult(`Line ${line} not found in cell ${cellId}`);

    // Set temporary breakpoint at the target line
    const key = cellId + ':' + line;
    const hadBp = this.bpSource.has(key);
    this.bpSource.add(key);
    this.resyncBreakpoints(parserLine);

    // Run until breakpoint
    this.lastHalted = false;
    if (this.cpu.halted) this.cpu.halted = false;
    const before = this.snapshotRegs();
    const outStart = (this.ex as any).output?.length ?? 0;
    let reason: RunResult['reason'] = 'end';
    let runtimeError: string | undefined = undefined;
    let steps = 0;
    const stepsLimit = 500000;

    while (steps < stepsLimit) {
      try {
        this.ex.step();
      } catch (e) {
        runtimeError = (e as Error).message || 'Unknown execution error';
        reason = 'error';
        break;
      }
      steps++;
      if (this.cpu.halted) { reason = 'halted'; this.lastHalted = true; break; }
      if (this.breakpoints.has(this.cpu.ip)) { reason = 'breakpoint'; break; }
    }
    if (steps >= stepsLimit) reason = 'cap';

    // Collect output produced during this run
    const exOutput: string[] = (this.ex as any).output ?? [];
    const output = exOutput.slice(outStart).join('');

    const after = this.snapshotRegs();
    const regDiff = diffRegs(before, after);
    const cellOutput: CellOutput = {
      text: output,
      error: runtimeError,
      regDiff,
      steps,
      reason,
      stale: false,
      expectResults: [],
      allPassed: true
    };
    this.outputs.set(cellId, cellOutput);

    // Remove temporary breakpoint
    if (!hadBp) {
      this.bpSource.delete(key);
      this.resyncBreakpoints();
    }

    return { reason, error: runtimeError, steps, output, regDiff, halted: this.cpu.halted, expectResults: cellOutput.expectResults, allPassed: cellOutput.allPassed };
  }

  /** Run a single cell — execute its instructions, then stop.
   *  Always starts from the cell's first instruction (sets IP to cell start)
   *  but preserves CPU state (registers, memory) between runs.
   *  This allows re-running cells with accumulated state. */
  runCell(cellId: string): RunResult {
    if (!this.built) return this.errorResult('No program built yet');
    // Set IP to the start of this cell so re-runs execute from the beginning
    const startLine = this.cellStarts.get(cellId);
    if (startLine !== undefined) {
      for (let i = 0; i < this.parsed!.instrs.length; i++) {
        if (this.parsed!.instrs[i].lineNum >= startLine) {
          this.cpu.ip = i;
          break;
        }
      }
    }
    // Un-halt if halted so we can run
    this.lastHalted = false;
    if (this.cpu.halted) this.cpu.halted = false;
    // Clear needsRestart since we're explicitly running
    this.needsRestart = false;
    return this.run(cellId, 'through');
  }

  /** Continue execution until breakpoint, halt, or cap. */
  continueRun(): RunResult {
    return this.run(null, 'continue');
  }

  /** Continue execution until breakpoint, halt, or cap (alias). */
  runToBreakpoint(): RunResult {
    return this.continueRun();
  }

  private run(targetCellId: string | null, mode: 'through' | 'continue'): RunResult {
    if (!this.built) return this.errorResult('No program built yet');

    // If needsRestart is set (e.g. after cell edits moved IP past end),
    // reset IP to the target cell start (or program start) instead of erroring.
    // CPU state (registers, memory) is preserved — only IP is reset.
    if (this.needsRestart) {
      this.needsRestart = false;
      if (targetCellId) {
        const startLine = this.cellStarts.get(targetCellId);
        if (startLine !== undefined) {
          for (let i = 0; i < this.parsed!.instrs.length; i++) {
            if (this.parsed!.instrs[i].lineNum >= startLine) { this.cpu.ip = i; break; }
          }
        }
      } else {
        this.cpu.ip = 0;
      }
    }

    // If the machine is halted (e.g. from a previous cell's HLT), un-halt
    // so execution can continue — HLT is a soft stop in notebook mode.
    // The engine already advanced IP past HLT in step(), so no ip++ needed.
    this.lastHalted = false;
    if (this.cpu.halted) {
      this.cpu.halted = false;
    }

    const before = this.snapshotRegs();
    // The engine pushes INT 21h output into ex.output — snapshot its length
    // so we can extract only the output produced during this run.
    const outStart = (this.ex as any).output?.length ?? 0;

    const targetStartLine = targetCellId !== null ? (this.cellStarts.get(targetCellId) ?? -1) : -1;
    const targetEndLine = targetCellId !== null ? (this.cellEnds.get(targetCellId) ?? -1) : -1;

    const stepsLimit = 500000;
    let steps = 0;
    let reason: RunResult['reason'] = 'end';
    let runtimeError: string | undefined = undefined;

    while (steps < stepsLimit) {
      const ip = this.cpu.ip;
      if (ip >= this.parsed!.instrs.length) { reason = 'end'; break; }
      const ins = this.parsed!.instrs[ip];
      if (mode === 'through' && targetEndLine !== -1 && ins.lineNum > targetEndLine) {
        reason = 'left-cell'; break;
      }
      if (this.breakpoints.has(ip) && steps > 0) { reason = 'breakpoint'; break; }

      try {
        this.ex.step();
      } catch (e) {
        runtimeError = (e as Error).message || 'Unknown execution error';
        reason = 'error';
        break;
      }
      steps++;
      if (this.cpu.halted) {
        const curLine = ins.lineNum ?? 0;
        if (mode === 'through' && targetStartLine !== -1 && curLine < targetStartLine) {
          this.lastHalted = true;
          this.cpu.halted = false;
        } else {
          reason = 'halted';
          this.lastHalted = true;
          break;
        }
      }
    }
    if (steps >= stepsLimit) reason = 'cap';

    // Collect output produced during this run
    const exOutput: string[] = (this.ex as any).output ?? [];
    const output = exOutput.slice(outStart).join('');

    const after = this.snapshotRegs();
    const ip = Math.min(this.cpu.ip, this.parsed!.instrs.length - 1);
    const ins = ip >= 0 ? this.parsed!.instrs[ip] : null;
    const ipCellId = ins ? this.lineOwner[ins.lineNum - 1] ?? null : null;
    // When a specific cell was targeted, attribute output to that cell.
    // When running freely (continueRun), use the IP-derived cell.
    const cellId = targetCellId ?? ipCellId;
    const expectResults = cellId ? evaluateExpects(this.evalCtx(), this.expectsByCell.get(cellId) || []) : [];

    const result: RunResult = {
      reason,
      error: runtimeError,
      steps,
      output,
      regDiff: diffRegs(before, after),
      halted: this.lastHalted || !!this.cpu.halted,
      expectResults,
      allPassed: expectResults.every(r => r.passed)
    };

    if (cellId) {
      this.outputs.set(cellId, {
        text: result.output,
        error: runtimeError,
        regDiff: result.regDiff,
        steps: result.steps,
        reason: result.reason,
        stale: false,
        expectResults: result.expectResults,
        allPassed: result.allPassed
      });
      // Mark outputs of subsequent cells as stale (per NOTEBOOK_SEMANTICS.md)
      const codeCells = this.cells.filter(c => c.kind === 'code');
      const curIdx = codeCells.findIndex(c => c.id === cellId);
      if (curIdx >= 0) {
        for (let i = curIdx + 1; i < codeCells.length; i++) {
          const nextOut = this.outputs.get(codeCells[i].id);
          if (nextOut) nextOut.stale = true;
        }
      }
      // Increment global execution count (Jupyter-style In [N])
      this.globalExecCount++;
      this.execCounts.set(cellId, this.globalExecCount);
    }
    return result;
  }

  /** Get the execution count for a cell (1-based, like Jupyter's In [N]). */
  getExecCount(cellId: string): number {
    return this.execCounts.get(cellId) || 0;
  }

  /** Get the current execution counter (max exec count across all cells). */
  get currentExecCount(): number {
    return this.globalExecCount;
  }

  private errorResult(msg: string, reason: RunResult['reason'] = 'error'): RunResult {
    return { reason, error: msg, steps: 0, output: '', regDiff: {}, halted: false, expectResults: [], allPassed: true };
  }

  step(): RunResult {
    if (!this.built) return this.errorResult('No program built yet');
    if (this.needsRestart) return this.errorResult('Machine needs restart', 'restart-needed');
    const before = this.snapshotRegs();
    try { this.ex.step(); } catch (e) {
      return { reason: 'error', error: (e as Error).message || 'Unknown', steps: 0, output: '', regDiff: {}, halted: false, expectResults: [], allPassed: true };
    }
    const after = this.snapshotRegs();
    const ip = this.cpu.ip;
    const ins = ip < this.parsed!.instrs.length ? this.parsed!.instrs[ip] : null;
    const cellId = ins ? this.lineOwner[ins.lineNum - 1] ?? null : null;
    const expectResults = cellId ? evaluateExpects(this.evalCtx(), this.expectsByCell.get(cellId) || []) : [];
    return { reason: this.cpu.halted ? 'halted' : 'step', steps: 1, output: '', regDiff: diffRegs(before, after), halted: !!this.cpu.halted, expectResults, allPassed: expectResults.every(r => r.passed) };
  }

  resetMachine(clearBps = false) {
    this.cpu = new CPU();
    if (!this.parsed) return;
    this.ex = new Executor(this.cpu, this.parsed);
    this.needsRestart = false;
    this.globalExecCount = 0;
    this.execCounts.clear();
    if (clearBps) { this.bpSource.clear(); this.breakpoints.clear(); } else this.resyncBreakpoints();
  }

  /** Full reset of CPU, memory, registers, stack, and outputs. */
  reset(clearBps = false): void {
    this.resetMachine(clearBps);
    this.outputs.clear();
  }

  snapshotRegs(): Record<string, number> {
    const r: Record<string, number> = {};
    for (const k of REG_LIST) { r[k] = this.cpu.getReg(k) ?? 0; }
    for (const f of ['CF', 'PF', 'AF', 'ZF', 'SF', 'OF', 'DF', 'IF', 'TF']) {
      r['FLAG_' + f] = this.cpu.flags[f] ?? 0;
    }
    r['IP'] = this.cpu.ip;
    return r;
  }

  evalCtx(): EvalContext {
    const cpu = this.cpu;
    return {
      getReg: (n: string) => cpu.getReg(n),
      getFlag: (n: string) => { const f = cpu.flags[n.toUpperCase()]; return f !== undefined ? f : null; },
      memReadByte: (linear: number) => cpu.memRead(linear & 0xfffff, 8),
      getScreenChar: (row: number, col: number) => {
        const off = (row * 80 + col) * 2;
        return cpu.memRead(0xB8000 + off, 8);
      },
      getVar: (n: string) => {
        const v = this.parsed?.vars?.[n.toUpperCase()];
        if (!v) return null;
        const linear = cpu.linear('DS', v.addr);
        return v.size === 1 ? cpu.memRead(linear, 8) : cpu.memRead(linear, 16);
      }
    };
  }

  getFriendlyErrors(): FriendlyError[] {
    const parseErrs = friendlyErrors(this.getParseErrors());
    const lints = this.lintProgram();
    return [...parseErrs, ...lints];
  }

  private lintProgram(): FriendlyError[] {
    const lints: FriendlyError[] = [];
    if (!this.parsed || !this.parsed.instrs) return lints;

    const vars = this.parsed.vars || {};
    const instrs = this.parsed.instrs;

    let currentAH: number | null = null;
    let currentDXVar: string | null = null;

    for (const ins of instrs) {
      const op = (ins.op || '').toUpperCase();
      const args = ins.args || [];

      if (op === 'MOV' && args.length === 2) {
        const dst = args[0].toUpperCase();
        const src = args[1];
        if (dst === 'AH') {
          const val = parseInt(src.replace(/h$/i, ''), src.toLowerCase().endsWith('h') ? 16 : 10);
          currentAH = isNaN(val) ? null : val;
        } else if (dst === 'AX') {
          const val = parseInt(src.replace(/h$/i, ''), src.toLowerCase().endsWith('h') ? 16 : 10);
          currentAH = isNaN(val) ? null : (val >> 8) & 0xFF;
        } else if (dst === 'DX') {
          const cleanSrc = src.replace(/^OFFSET\s+/i, '').replace(/[\[\]]/g, '').trim().toUpperCase();
          if (vars[cleanSrc]) {
            currentDXVar = cleanSrc;
          } else {
            currentDXVar = null;
          }
        }
      } else if (op === 'LEA' && args.length === 2) {
        const dst = args[0].toUpperCase();
        const src = args[1];
        if (dst === 'DX') {
          const cleanSrc = src.replace(/[\[\]]/g, '').trim().toUpperCase();
          if (vars[cleanSrc]) {
            currentDXVar = cleanSrc;
          } else {
            currentDXVar = null;
          }
        }
      } else if (op === 'INT') {
        const intNum = args[0] ? args[0].trim().toUpperCase() : '';
        const is21h = intNum === '21H' || intNum === '21' || intNum === '33';
        if (is21h && (currentAH === 0x09 || currentAH === 9)) {
          if (currentDXVar && vars[currentDXVar]) {
            const v = vars[currentDXVar];
            const bytes = v.bytes || (v.value !== undefined ? [v.value] : []);
            const hasDollar = bytes.includes(0x24);
            if (!hasDollar) {
              const friendly = `String '${currentDXVar}' printed via INT 21h AH=09h is missing a '$' terminator.`;
              lints.push({
                line: ins.lineNum ?? null,
                original: ins.raw || 'INT 21h',
                friendly,
                hint: `DOS function 09h requires strings to end with '$' (e.g. DB 'Hello$', 0Dh, 0Ah). Without '$', DOS prints memory garbage until it crashes.`,
                message: friendly
              });
            }
          }
        }
      }
    }

    return lints;
  }

  getParseErrors(): { cellId: string | null; line: number | null; message: string }[] {
    return (this.parsed?.errors || []).map((e: any) => ({
      cellId: e.lineNum ? this.lineOwner[e.lineNum - 1] ?? null : null,
      line: e.lineNum ?? null,
      message: e.message
    }));
  }

  toggleBreakpoint(cellId: string, lineInCell: number): boolean {
    const key = cellId + ':' + lineInCell;
    if (this.bpSource.has(key)) { this.bpSource.delete(key); this.resyncBreakpoints(); return false; }
    this.bpSource.add(key); this.resyncBreakpoints(); return true;
  }

  private resyncBreakpoints(parserLine?: number) {
    this.breakpoints.clear();
    if (!this.parsed) return;
    for (const key of this.bpSource) {
      const [cid, ln] = key.split(':');
      const startLine = this.cellStarts.get(cid);
      if (startLine === undefined) continue;
      const abs = startLine + Number(ln) - 1;
      let idx = -1;
      if (parserLine !== undefined) {
        // Use the mapped parser line number
        idx = this.parsed.instrs.findIndex((ins: any) => ins.lineNum === parserLine);
      } else {
        // Original behavior: match by absolute line number
        idx = this.parsed.instrs.findIndex((ins: any) => ins.lineNum === abs);
      }
      if (idx >= 0) this.breakpoints.add(idx);
    }
  }

  getBreakpointLines(cellId: string): Set<number> {
    const s = new Set<number>();
    for (const key of this.bpSource) {
      const [cid, ln] = key.split(':');
      if (cid === cellId) s.add(Number(ln));
    }
    return s;
  }

  getState(): LiveState {
    const ip = this.built ? this.cpu.ip : 0;
    const ins = this.built && ip < this.parsed!.instrs.length ? this.parsed!.instrs[ip] : null;
    const line = ins?.lineNum ?? null;
    const cellId = line ? this.lineOwner[line - 1] ?? null : null;
    return {
      regs: this.snapshotRegs(),
      flags: { ...this.cpu.flags },
      cursor: this.built ? { cellId, line, instrIndex: ip } : null,
      halted: this.lastHalted || !!this.cpu.halted,
      needsRestart: this.needsRestart,
      totalInstrs: this.built ? this.parsed!.instrs.length : 0
    };
  }

  /** Convert a global source line to a 1-based line number within a cell. */
  getCellLocalLine(cellId: string, globalLine: number): number | null {
    const cell = this.cells.find(c => c.id === cellId);
    if (!cell) return null;
    const cellLines = cell.source.split('\n').length;
    const startLine = this.cellStarts.get(cellId);
    if (startLine === undefined) return null;
    const local = globalLine - startLine + 1;
    return (local >= 1 && local <= cellLines) ? local : null;
  }

  /** Get full concatenated output from all cells. */
  getFullOutput(): string {
    let out = '';
    for (const c of this.cells) {
      const co = this.outputs.get(c.id);
      if (co) out += co.text;
    }
    return out;
  }

  /** Get the video events from the executor. */
  getVideoEvents(): { at: number; type: string; r?: number; c?: number }[] {
    return (this.ex as any).video ?? [];
  }

  getOutput(cellId: string): CellOutput | undefined { return this.outputs.get(cellId); }
  getAllOutputs(): Map<string, CellOutput> { return new Map(this.outputs); }

  /** Clear output for a specific cell. */
  clearOutput(cellId: string): void { this.outputs.delete(cellId); }

  /** Clear all outputs. */
  clearAllOutputs(): void { this.outputs.clear(); }

  memHex(linear: number, rows = 8): { addr: number; bytes: number[] }[] {
    const out: { addr: number; bytes: number[] }[] = [];
    for (let r = 0; r < rows; r++) {
      const addr = linear + r * 16;
      const bytes: number[] = [];
      for (let b = 0; b < 16; b++) bytes.push(this.cpu.memRead(addr + b, 8));
      out.push({ addr, bytes });
    }
    return out;
  }

  stackView(depth = 8): { sp: number; words: number[] } {
    const sp = this.cpu.getReg('SP');
    const linear = ((this.cpu.getReg('SS') << 4) + (sp ?? 0)) & 0xFFFFF;
    const words: number[] = [];
    for (let i = 0; i < depth; i++) words.push(this.cpu.memRead(linear + i * 2, 16));
    return { sp: sp ?? 0, words };
  }

  screenText(): { ch: string; attr: number }[][] {
    const rows: { ch: string; attr: number }[][] = [];
    for (let r = 0; r < 25; r++) {
      const row: { ch: string; attr: number }[] = [];
      for (let c = 0; c < 80; c++) {
        const off = (r * 80 + c) * 2;
        const chCode = this.cpu.memRead(0xB8000 + off, 8);
        const attr = this.cpu.memRead(0xB8000 + off + 1, 8);
        row.push({ ch: String.fromCharCode(chCode), attr });
      }
      rows.push(row);
    }
    return rows;
  }
}

function diffRegs(before: Record<string, number>, after: Record<string, number>): Record<string, [number, number]> {
  const d: Record<string, [number, number]> = {};
  for (const k of Object.keys(after)) {
    if ((before[k] ?? 0) !== (after[k] ?? 0)) d[k] = [before[k] ?? 0, after[k] ?? 0];
  }
  return d;
}
