// ================================================================
//  store/notebook integration — the actual user flow the UI drives:
//  default starter notebook → run cell → printed output.
// ================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { defaultCells, applyCells, runCell, runUpTo, session, machine } from '../src/ui/store.js';

describe('starter notebook user flow', () => {
  beforeEach(() => {
    applyCells(defaultCells());
  });

  it('defaults to an intro cell + one code cell', () => {
    const cells = defaultCells();
    expect(cells.map(c => c.kind)).toEqual(['markdown', 'code']);
  });

  it('▶ on the starter code cell prints the greeting', () => {
    const res = runCell('cell-1');
    expect(res.output).toBe('Hello from ASMBOOK!');
  });

  it('machine state is published after a run', () => {
    runCell('cell-1');
    const st = machine.value!;
    expect(st.halted).toBe(true);
    expect(st.totalInstrs).toBeGreaterThan(0);
    expect(typeof st.regs.AX).toBe('number');
  });

  it('a comment-only edit does not demand a machine restart', () => {
    runCell('cell-1');
    const edited = defaultCells().map(c =>
      c.id === 'cell-1' ? { ...c, source: '; just a note\n' + c.source } : c
    );
    applyCells(edited);
    expect(machine.value!.needsRestart).toBe(false);
  });
});