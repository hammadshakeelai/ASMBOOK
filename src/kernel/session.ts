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
}

interface Parsed {
  errors: { message: string; lineNum?: number }[];
  instrs: { op: string; args: string[]; lineNum: number }[];
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
  private lineOwner: string[] = [];
  private bpSource = new Set<string>();
  private breakpoints = new Set<number>();
  private expectsByCell = new Map<string, ExpectClause[]>();
  private lastHalted = false;
  private outputs = new Map<string, CellOutput>();
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

  private rebuild(cells: Cell[]): { needsRestart: boolean } {
    this.cells = cells;
    this.outputs.clear();
    this.expectsByCell.clear();
    this.lastHalted = false;

    const codeCells = cells.filter(c => c.kind === 'code');
    const parts: string[] = [];
    this.starts = [];
    this.lineOwner = [];
    for (const c of codeCells) {
      this.starts.push(parts.length + 1);
      const lines = c.source.split('\n');
      for (const ln of lines) { this.lineOwner.push(c.id); parts.push(ln); }
    }

    const concat = parts.join('\n');
    const parsed = (new Parser().parse(concat) as unknown) as Parsed;
    this.parsed = parsed;
    this.ex = new Executor(this.cpu, parsed);

    // Validate opcodes — flag unknown instructions as parse errors
    for (const ins of parsed.instrs) {
      if (!VALID_OPS.has(ins.op)) {
        parsed.errors.push({ message: `Unknown instruction: ${ins.op}`, lineNum: ins.lineNum });
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

  /** Run from a clean machine up to the END of the given cell. */
  runUpTo(cellId: string): RunResult {
    this.resetMachine();
    return this.run(cellId, 'through');
  }

  /** Run from current state up to the END of the given cell. */
  runCell(cellId: string): RunResult {
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
    if (this.needsRestart) return this.errorResult('Machine needs restart', 'restart-needed');

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

    const targetEndLine = targetCellId !== null
      ? (() => {
          const ci = this.cells.findIndex(c => c.id === targetCellId && c.kind === 'code');
          if (ci < 0) return -1;
          return ci + 1 < this.starts.length ? this.starts[ci + 1] - 1 : Infinity;
        })()
      : -1;

    const stepsLimit = 500000;
    let steps = 0;
    let reason: RunResult['reason'] = 'end';

    while (steps < stepsLimit) {
      const ip = this.cpu.ip;
      if (ip >= this.parsed!.instrs.length) { reason = 'end'; break; }
      const ins = this.parsed!.instrs[ip];
      if (mode === 'through' && targetEndLine !== -1 && ins.lineNum > targetEndLine) {
        reason = 'left-cell'; break;
      }
      if (this.breakpoints.has(ip)) { reason = 'breakpoint'; break; }

      try { this.ex.step(); } catch (e) {
        const msg = (e as Error).message || 'Unknown execution error';
        if (mode === 'continue') { reason = 'end'; break; }
        return { reason: 'error', error: msg, steps, output: '', regDiff: {}, halted: false, expectResults: [], allPassed: true };
      }
      steps++;
      if (this.cpu.halted) {
        if (mode === 'through') {
          // HLT is a soft stop in notebook mode — un-halt and continue
          // so we can reach the end of the target cell.
          this.lastHalted = true;
          this.cpu.halted = false;
        } else {
          reason = 'halted'; break;
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
    const cellId = ins ? this.lineOwner[ins.lineNum - 1] ?? null : null;
    const expectResults = cellId ? evaluateExpects(this.evalCtx(), this.expectsByCell.get(cellId) || []) : [];

    const result: RunResult = {
      reason, steps, output, regDiff: diffRegs(before, after), halted: this.lastHalted || !!this.cpu.halted,
      expectResults, allPassed: expectResults.every(r => r.passed)
    };

    if (cellId) {
      this.outputs.set(cellId, {
        text: result.output, regDiff: result.regDiff, steps: result.steps, reason: result.reason,
        stale: false, expectResults: result.expectResults, allPassed: result.allPassed
      });
    }
    return result;
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
    if (clearBps) { this.bpSource.clear(); this.breakpoints.clear(); } else this.resyncBreakpoints();
  }

  snapshotRegs(): Record<string, number> {
    const r: Record<string, number> = {};
    for (const k of REG_LIST) { r[k] = this.cpu.getReg(k) ?? 0; }
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
      }
    };
  }

  getFriendlyErrors(): FriendlyError[] {
    return friendlyErrors(this.getParseErrors());
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

  private resyncBreakpoints() {
    this.breakpoints.clear();
    if (!this.parsed) return;
    for (const key of this.bpSource) {
      const [cid, ln] = key.split(':');
      const ci = this.cells.findIndex(c => c.id === cid);
      if (ci < 0) continue;
      const abs = this.starts[ci] + Number(ln) - 1;
      const idx = this.parsed.instrs.findIndex((ins: any) => ins.lineNum === abs);
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
    const start = this.starts.find((_, i) => this.lineOwner[i] === cellId);
    // find start offset for this cell
    let offset = 0;
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i].id === cellId) break;
      offset += this.cells[i].source.split('\n').length;
    }
    const local = globalLine - offset;
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
