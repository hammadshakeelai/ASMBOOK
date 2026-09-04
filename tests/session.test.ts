// ================================================================
//  LiveSession semantics tests — pins docs/NOTEBOOK_SEMANTICS.md
//  Run: npm run test:kernel
// ================================================================
import { describe, it, expect } from 'vitest';
import { LiveSession, type Cell } from '../src/kernel/session.js';

const cell = (id: string, source: string): Cell => ({ id, kind: 'code', source });

describe('LiveSession — one live machine', () => {
  it('state persists across cell runs (Jupyter-style)', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', 'MOV AX, 5\nHLT'),
      cell('b', 'ADD AX, 3\nHLT'),
    ]);
    // run cell a only
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(5);
    // machine keeps running cell b from that state
    const res = s.runCell('b');
    expect(res.regDiff['AX']).toEqual([5, 8]);
    expect(s.getState().regs.AX).toBe(8);
  });

  it('captures flag mutations in regDiff', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', 'STC\nHLT'),
    ]);
    const res = s.runCell('a');
    expect(res.regDiff['FLAG_CF']).toEqual([0, 1]);
  });

  it('re-running the same cell repeatedly accumulates values (Jupyter-style)', () => {
    const s = new LiveSession();
    s.setCells([
      { id: 'intro', kind: 'markdown', source: '# Intro\nExplaining registers' },
      cell('a', 'MOV AX, 0\nHLT'),
      cell('b', 'ADD AX, 5\nHLT'),
    ]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0);
    expect(s.getExecCount('a')).toBe(1);

    // Run cell b first time: 0 + 5 = 5
    const r1 = s.runCell('b');
    expect(r1.regDiff['AX']).toEqual([0, 5]);
    expect(s.getState().regs.AX).toBe(5);
    expect(s.getExecCount('b')).toBe(2);

    // Run cell b second time: 5 + 5 = 10
    const r2 = s.runCell('b');
    expect(r2.regDiff['AX']).toEqual([5, 10]);
    expect(s.getState().regs.AX).toBe(10);
    expect(s.getExecCount('b')).toBe(3);

    // Run cell b third time: 10 + 5 = 15
    const r3 = s.runCell('b');
    expect(r3.regDiff['AX']).toEqual([10, 15]);
    expect(s.getState().regs.AX).toBe(15);
    expect(s.getExecCount('b')).toBe(4);
    expect(s.currentExecCount).toBe(4);
  });

  it('markdown cells do not disrupt line mapping or execution', () => {
    const s = new LiveSession();
    s.setCells([
      { id: 'md1', kind: 'markdown', source: '# Header 1\nSome notes\nAnother note' },
      cell('c1', 'MOV AX, 10\nHLT'),
      { id: 'md2', kind: 'markdown', source: '## Step 2' },
      cell('c2', 'ADD AX, 20\nHLT'),
    ]);
    s.runCell('c1');
    expect(s.getState().regs.AX).toBe(10);
    s.runCell('c2');
    expect(s.getState().regs.AX).toBe(30);

    // Check local line mapping for cell c2
    expect(s.getCellLocalLine('c2', 3)).toBe(1);
    expect(s.getCellLocalLine('c2', 4)).toBe(2);
  });

  it('runUpTo executes the prefix from a clean machine', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', 'MOV AX, 1\nMOV BX, 2\nHLT'),
      cell('b', 'ADD AX, BX\nHLT'),
    ]);
    const res = s.runUpTo('b');
    expect(res.regDiff['AX']).toEqual([0, 3]);   // diff vs the fresh machine
    expect(s.getState().regs.BX).toBe(2);
  });

  it('editing a cell after running others keeps the machine live (RAM-patch)', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', 'MOV AX, 5\nHLT'),
      cell('b', 'ADD AX, 3\nHLT'),
      cell('c', 'MOV CX, 9\nHLT'),
    ]);
    s.runCell('a');           // AX=5
    s.runCell('b');           // AX=8
    // edit cell c *below* the cursor — machine state must survive
    const r = s.setCells([
      cell('a', 'MOV AX, 5\nHLT'),
      cell('b', 'ADD AX, 3\nHLT'),
      cell('c', 'MOV CX, 99\nHLT'),
    ]);
    expect(r.needsRestart).toBe(false);
    expect(s.getState().regs.AX).toBe(8);
    // re-running edited cell applies it on live state
    s.runCell('c');
    expect(s.getState().regs.CX).toBe(99);
  });

  it('editing the instruction at the cursor applies on next run — RAM-patch power', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nADD AX, 1\nHLT')]);
    s.step();                  // cursor now at the ADD; AX=5
    const r = s.setCells([cell('a', 'MOV AX, 5\nADD AX, 7\nHLT')]);
    expect(r.needsRestart).toBe(false);   // live state survives the edit
    s.step();                  // executes the NEW instruction on live state
    expect(s.getState().regs.AX).toBe(12);
  });

  it('out-of-order re-run applies with current state, like Python', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', 'MOV AX, 5\nHLT'),
      cell('b', 'MOV BX, AX\nADD BX, 1\nHLT'),
    ]);
    s.runCell('a');           // AX=5
    s.runCell('b');           // BX=6
    // re-run cell a with a new value; BX keeps its old value (like Python)
    s.runCell('a');
    expect(s.getState().regs.BX).toBe(6);
  });

  it('cross-cell labels resolve (one program)', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', 'JMP skip\nMOV AX, 111h\nHLT'),
      cell('b', 'skip:\nMOV AX, 222h\nHLT'),
    ]);
    s.runUpTo('b');
    expect(s.getState().regs.AX).toBe(0x222);
  });

  it('breakpoints stop execution', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1\nADD AX, 1\nADD AX, 1\nHLT')]);
    s.toggleBreakpoint('a', 3);          // before the second ADD
    s.resetMachine();
    s.continueRun();
    expect(s.getState().regs.AX).toBe(2);
  });

  it('INT 21h output is captured per cell', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', "MOV AH, 02h\nMOV DL, 'H'\nINT 21h\nMOV DL, 'i'\nINT 21h\nHLT"),
    ]);
    const res = s.runCell('a');
    expect(res.output).toBe('Hi');
  });

  it('step executes exactly one instruction', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nADD AX, 2\nHLT')]);
    s.step();
    expect(s.getState().regs.AX).toBe(5);
    s.step();
    expect(s.getState().regs.AX).toBe(7);
  });

  it('infinite loop hits the step cap without hanging', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'top:\nJMP top\nHLT')]);
    const res = s.runCell('a');
    expect(res.reason).toBe('cap');
  });

  it('var edits shift addresses → restart-needed (never silently wrong)', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', 'MOV AX, 5\nHLT'),
      cell('d', '.DATA\nx dw 1\n.CODE'),
    ]);
    s.runCell('a');
    const r = s.setCells([
      cell('a', 'MOV AX, 5\nHLT'),
      cell('d', '.DATA\nx dw 1\ny dw 2\n.CODE'),
    ]);
    expect(r.needsRestart).toBe(true);
  });
});

describe('LiveSession — @expect (R2)', () => {
  it('evaluates @expect clauses against live machine state', () => {
    const s = new LiveSession();
    s.setCells([cell('a', '; @expect AX=0005\nMOV AX, 5\n; @expect ZF=0\nHLT')]);
    const res = s.runCell('a');
    expect(res.expectResults.length).toBe(2);
    expect(res.allPassed).toBe(true);
    expect(res.expectResults[0].passed).toBe(true);
    expect(res.expectResults[1].passed).toBe(true);
  });

  it('fails when expectation does not hold', () => {
    const s = new LiveSession();
    s.setCells([cell('a', '; @expect AX=0007\nMOV AX, 5\nHLT')]);
    const res = s.runCell('a');
    expect(res.allPassed).toBe(false);
    expect(res.expectResults[0].passed).toBe(false);
    expect(res.expectResults[0].actual).toBe(5);
  });

  it('checks flag expectations', () => {
    const s = new LiveSession();
    s.setCells([cell('a', '; @expect CF=1\nSTC\nHLT')]);
    const res = s.runCell('a');
    expect(res.allPassed).toBe(true);
  });

  it('checks memory expectations', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 42\nMOV [0x0], AX\n; @expect [0x0]=42\nHLT')]);
    const res = s.runCell('a');
    expect(res.allPassed).toBe(true);
  });

  it('caches expect results in output', () => {
    const s = new LiveSession();
    s.setCells([cell('a', '; @expect AX=0005\nMOV AX, 5\nHLT')]);
    s.runCell('a');
    const out = s.getOutput('a');
    expect(out).toBeDefined();
    expect(out!.expectResults.length).toBe(1);
    expect(out!.allPassed).toBe(true);
  });
});

describe('LiveSession — friendly errors (R2)', () => {
  it('translates NASM errors into plain English', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'FOO BAR\nHLT')]);
    const friendly = s.getFriendlyErrors();
    expect(friendly.length).toBeGreaterThan(0);
    expect(friendly[0].friendly.length).toBeGreaterThan(0);
    expect(friendly[0].hint.length).toBeGreaterThan(0);
  });

  it('returns empty array when there are no errors', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nHLT')]);
    expect(s.getFriendlyErrors().length).toBe(0);
  });
});

describe('LiveSession — output management', () => {
  it('clearOutput removes output for one cell', () => {
    const s = new LiveSession();
    s.setCells([cell('a', "MOV AH, 02h\nMOV DL, 'X'\nINT 21h\nHLT")]);
    s.runCell('a');
    expect(s.getOutput('a')).toBeDefined();
    expect(s.getOutput('a')!.text).toBe('X');
    s.clearOutput('a');
    expect(s.getOutput('a')).toBeUndefined();
  });

  it('clearAllOutputs removes all outputs', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', "MOV AH, 02h\nMOV DL, 'A'\nINT 21h\nHLT"),
      cell('b', "MOV AH, 02h\nMOV DL, 'B'\nINT 21h\nHLT"),
    ]);
    s.runCell('a');
    s.runCell('b');
    expect(s.getOutput('a')).toBeDefined();
    expect(s.getOutput('b')).toBeDefined();
    s.clearAllOutputs();
    expect(s.getOutput('a')).toBeUndefined();
    expect(s.getOutput('b')).toBeUndefined();
  });

  it('getAllOutputs returns a copy', () => {
    const s = new LiveSession();
    s.setCells([cell('a', "MOV AH, 02h\nMOV DL, 'Z'\nINT 21h\nHLT")]);
    s.runCell('a');
    const all = s.getAllOutputs();
    expect(all.size).toBe(1);
    all.delete('a');
    expect(s.getOutput('a')).toBeDefined();
  });
});
