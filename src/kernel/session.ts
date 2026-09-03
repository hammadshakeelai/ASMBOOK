// ================================================================
//  LiveSession — the notebook's "one live machine" (R1)
//
//  Implements docs/NOTEBOOK_SEMANTICS.md:
//   - one machine per notebook, state persists across cell runs
//   - cells are source regions of ONE assembled program
//   - ▶ on a cell = bring the CPU to the cell start, execute through
//     the cell end, leave the machine live at the cursor
//   - edits re-assemble; the machine continues when provably safe,
//     otherwise it is visibly marked `restart-needed` (never silently
//     inconsistent)
//
//  DOM-free and Node-testable (tests/session.test.ts).
// ================================================================
import { CPU, Parser, Executor } from './engine.mjs';

export type CellKind = 'code' | 'markdown';

export interface Cell {
  id: string;
  kind: CellKind;
  source: string;
}

export interface RunResult {
  reason: 'cell-end' | 'halted' | 'breakpoint' | 'cap' | 'left-cell' | 'reached' | 'end' | 'restart-needed' | 'error';
  error?: string;
  steps: number;
  output: string;                    // text produced by THIS run
  regDiff: Record<string, [number, number]>; // name: [before, after]
  halted: boolean;
}

export interface CellOutput {
  text: string;
  regDiff: Record<string, [number, number]>;
  steps: number;
  reason: RunResult['reason'];
  stale: boolean;
}

export interface LiveState {
  regs: Record<string, number>;
  flags: Record<string, number>;
  cursor: { cellId: string | null; line: number | null; instrIndex: number } | null;
  halted: boolean;
  needsRestart: boolean;
  totalInstrs: number;
}

const REG_LIST = ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP'];
export const FLAG_LIST = ['OF', 'DF', 'IF', 'TF', 'SF', 'ZF', 'AF', 'PF', 'CF'];
const STEP_CAP = 500_000;

export class LiveSession {
  private cpu: any = new CPU();
  private cells: Cell[] = [];
  private starts: number[] = [];        // start line (1-based) of each cell in concat source
  private ranges: { cellId: string; start: number; end: number }[] = []; // instr-index ranges
  private lineOwner: (string | null)[] = []; // concat line → cellId
  private breakpoints = new Set<number>();           // instruction indices
  private bpSource = new Set<string>();              // "cellId:line"
  private outputs = new Map<string, CellOutput>();
  private needsRestart = false;
  private built = false;
  private ex: any = null;
  private parsed: any = null;

  // ── build ──
  setCells(cells: Cell[]): { needsRestart: boolean } {
    const hadMachine = this.built;
    const prevCursor = this.captureCursor();
    const prevVars = this.serializeVars();
    this.cells = cells.filter(c => c.kind === 'code');
    this.rebuild();

    const varsChanged = this.serializeVars() !== prevVars;
    const reanchored = prevCursor ? this.reanchor(prevCursor) : 'ok';
    // A variable-layout change invalidates initialized memory → restart.
    // An instruction-array interpreter + dynamic label/var resolution means
    // a content edit never corrupts live state: new code simply executes on
    // the next run (like re-running an edited Python cell). A vanished
    // cursor instruction (cell shrank) also needs no restart — it just has
    // nowhere to be re-anchored.
    this.needsRestart = hadMachine && (varsChanged || (!!prevCursor && reanchored !== 'ok'));
    // any edit marks prior outputs stale (they came from an older lineage)
    for (const out of this.outputs.values()) out.stale = true;
    return { needsRestart: this.needsRestart };
  }

  private rebuild() {
    const codeLines: string[] = [];
    this.starts = [];
    this.lineOwner = [];
    for (const c of this.cells) {
      this.starts.push(codeLines.length + 1);
      const lines = c.source.split('\n');
      for (const l of lines) { codeLines.push(l); this.lineOwner.push(c.id); }
    }
    const source = codeLines.join('\n');
    const parser = new Parser();
    this.parsed = parser.parse(source);
    this.built = true;

    // instruction ranges per cell (via each instruction's lineNum)
    this.ranges = this.cells.map(c => ({ cellId: c.id, start: Infinity, end: 0 }));
    const owner = (line: number): string | null => this.lineOwner[line - 1] ?? null;
    for (let i = 0; i < this.parsed.instrs.length; i++) {
      const ins = this.parsed.instrs[i];
      const r = this.ranges.find(x => x.cellId === owner(ins.lineNum));
      if (r) { r.start = Math.min(r.start, i); r.end = Math.max(r.end, i + 1); }
    }

    // executor: preserve machine state across rebuilds (recreated only on reset)
    if (!this.ex) {
      this.ex = new Executor(this.cpu, this.parsed);
    } else {
      this.ex.instrs = this.parsed.instrs;
      this.ex.labels = this.parsed.labels;
      this.ex.vars = this.parsed.vars;
      this.ex.errors = [...this.parsed.errors];
    }
  }

  // cursor = next instruction to execute, identified by (cellId, index-in-cell)
  private captureCursor(): { cellId: string; indexInCell: number } | null {
    if (!this.ex || !this.built) return null;
    const ip = this.cpu.ip;
    const r = this.ranges.find(x => ip >= x.start && ip < x.end);
    if (!r) return null; // cursor at program end or outside — nothing to preserve
    return { cellId: r.cellId, indexInCell: ip - r.start };
  }

  private reanchor(prev: { cellId: string; indexInCell: number }): 'ok' | 'gone' {
    // Instruction-array interpreter + dynamic label/var resolution means a
    // content edit never corrupts live state: the new code simply executes
    // on the next run (like re-running an edited Python cell). Only the
    // *existence* of the cursor's instruction matters; a vanished one
    // (cell shrank) can't be re-anchored → restart.
    const r = this.ranges.find(x => x.cellId === prev.cellId);
    if (!r || r.end === 0) return 'gone';
    const newIdx = r.start + prev.indexInCell;
    if (newIdx >= r.end) return 'gone';
    this.cpu.ip = newIdx;
    return 'ok';
  }

  private serializeVars(): string {
    if (!this.ex) return '';
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this.ex.vars || {})) {
      const vv = v as any;
      out[k] = { addr: vv.addr, size: vv.size, value: vv.value, values: vv.values, bytes: vv.bytes, count: vv.count };
    }
    return JSON.stringify(out);
  }

  // ── execution ──
  private snapshotRegs(): Record<string, number> {
    const o: Record<string, number> = {};
    for (const r of REG_LIST) o[r] = this.cpu.getReg(r);
    return o;
  }

  private diffRegs(before: Record<string, number>): Record<string, [number, number]> {
    const d: Record<string, [number, number]> = {};
    for (const r of REG_LIST) if (before[r] !== this.cpu.getReg(r)) d[r] = [before[r], this.cpu.getReg(r)];
    return d;
  }

  private runLoop(stopAt: number | null, stopOutsideRange: { start: number; end: number } | null, skipHalt = false): RunResult {
    if (this.needsRestart) {
      return { reason: 'restart-needed', steps: 0, output: '', regDiff: {}, halted: !!this.cpu.halted };
    }
    const before = this.snapshotRegs();
    const outStart = this.ex.output.length;
    let steps = 0;
    let reason: RunResult['reason'] = 'end';
    try {
      while (steps < STEP_CAP) {
        if (this.breakpoints.has(this.cpu.ip)) { reason = 'breakpoint'; break; }
        if (stopAt !== null && this.cpu.ip >= stopAt) { reason = 'end'; break; }
        if (stopOutsideRange && (this.cpu.ip < stopOutsideRange.start || this.cpu.ip >= stopOutsideRange.end)) {
          reason = 'left-cell'; break;
        }
        if (this.cpu.halted) {
          // In a prefix run (runUpTo), an HLT belonging to an *earlier* cell
          // means "stop this cell" — the notebook continues to the target.
          // In a plain cell run / continue, HLT stops the machine.
          if (skipHalt && stopAt !== null) { this.cpu.halted = false; }
          else { reason = 'halted'; break; }
        }
        this.ex.step();
        steps++;
      }
      if (steps >= STEP_CAP) reason = 'cap';
      else if (this.cpu.halted && reason !== 'breakpoint' && reason !== 'end') reason = 'halted';
    } catch (e) {
      return {
        reason: 'error', error: e instanceof Error ? e.message : String(e),
        steps, output: this.ex.output.slice(outStart).join(''),
        regDiff: this.diffRegs(before), halted: !!this.cpu.halted
      };
    }
    return {
      reason, steps,
      output: this.ex.output.slice(outStart).join(''),
      regDiff: this.diffRegs(before),
      halted: !!this.cpu.halted
    };
  }

  /** ▶ on a cell: execute from the cell start through the cell end.
      Repositioning the cursor explicitly wakes a halted machine. */
  runCell(cellId: string): RunResult {
    const r = this.ranges.find(x => x.cellId === cellId);
    if (!r || r.end === 0) return { reason: 'end', steps: 0, output: '', regDiff: {}, halted: !!this.cpu.halted };
    this.cpu.ip = r.start;             // bring the CPU to the cell
    this.cpu.halted = false;           // the user asked to run — wake up
    const res = this.runLoop(r.end, { start: r.start, end: r.end }, false);
    this.outputs.set(cellId, { text: res.output, regDiff: res.regDiff, steps: res.steps, reason: res.reason, stale: false });
    return res;
  }

  /** ▶⇥ run from a clean machine through the end of this cell
      (intermediate HLTs in earlier cells are skipped). */
  runUpTo(cellId: string): RunResult {
    const r = this.ranges.find(x => x.cellId === cellId);
    if (!r || r.end === 0) return { reason: 'end', steps: 0, output: '', regDiff: {}, halted: !!this.cpu.halted };
    this.resetMachine(false);
    this.cpu.ip = 0;
    const res = this.runLoop(r.end, null, true);
    this.outputs.set(cellId, { text: res.output, regDiff: res.regDiff, steps: res.steps, reason: res.reason, stale: false });
    return res;
  }

  /** Run from current cursor until halt / breakpoint / program end. */
  continueRun(): RunResult {
    return this.runLoop(null, null);
  }

  /** Execute exactly one instruction at the cursor. */
  step(): RunResult {
    if (this.needsRestart) return { reason: 'restart-needed', steps: 0, output: '', regDiff: {}, halted: !!this.cpu.halted };
    const before = this.snapshotRegs();
    const outStart = this.ex.output.length;
    try { this.ex.step(); } catch (e) {
      return { reason: 'error', error: e instanceof Error ? e.message : String(e), steps: 0, output: '', regDiff: {}, halted: !!this.cpu.halted };
    }
    return { reason: this.cpu.halted ? 'halted' : 'end', steps: 1, output: this.ex.output.slice(outStart).join(''), regDiff: this.diffRegs(before), halted: !!this.cpu.halted };
  }

  /** Fresh machine; optionally clears cell outputs. */
  resetMachine(clearOutputs = true): void {
    this.cpu = new CPU();
    this.ex = new Executor(this.cpu, this.parsed);
    this.needsRestart = false;
    if (clearOutputs) this.outputs.clear();
  }

  // ── breakpoints ──
  toggleBreakpoint(cellId: string, lineInCell: number): boolean {
    const key = `${cellId}:${lineInCell}`;
    if (this.bpSource.has(key)) { this.bpSource.delete(key); this.resyncBreakpoints(); return false; }
    this.bpSource.add(key); this.resyncBreakpoints(); return true;
  }
  private resyncBreakpoints() {
    this.breakpoints.clear();
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

  // ── inspection ──
  getState(): LiveState {
    const ip = this.built ? this.cpu.ip : 0;
    const ins = this.built ? this.parsed.instrs[ip] : null;
    const line = ins ? ins.lineNum : null;
    const cellId = line ? this.lineOwner[line - 1] ?? null : null;
    return {
      regs: this.snapshotRegs(),
      flags: { ...this.cpu.flags },
      cursor: this.built ? { cellId, line, instrIndex: ip } : null,
      halted: !!this.cpu.halted,
      needsRestart: this.needsRestart,
      totalInstrs: this.built ? this.parsed.instrs.length : 0
    };
  }
  getOutput(cellId: string): CellOutput | undefined { return this.outputs.get(cellId); }
  getAllOutputs(): Map<string, CellOutput> { return new Map(this.outputs); }

  /** 1-based concat line where this cell's source begins (or null). */
  cellLineOffset(cellId: string): number | null {
    const ci = this.cells.findIndex(c => c.id === cellId);
    if (ci < 0) return null;
    return this.starts[ci];
  }
  getParseErrors(): { cellId: string | null; line: number | null; message: string }[] {
    return (this.parsed?.errors || []).map((e: any) => ({
      cellId: e.lineNum ? this.lineOwner[e.lineNum - 1] ?? null : null,
      line: e.lineNum ?? null,
      message: e.message
    }));
  }
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
    const linear = ((this.cpu.getReg('SS') << 4) + sp) & 0xFFFFF;
    const words: number[] = [];
    for (let i = 0; i < depth; i++) words.push(this.cpu.memRead(linear + i * 2, 16));
    return { sp, words };
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