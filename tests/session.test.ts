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
