import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { LiveSession, type Cell } from '../src/kernel/session.js';

function loadLesson(name: string) {
  const raw = readFileSync(`./public/lessons/${name}.asmnb`, 'utf8');
  const data = JSON.parse(raw);
  return data as { version: number; cells: Cell[] };
}

function runAllCells(s: LiveSession, cells: Cell[]) {
  s.setCells(cells);
  for (const c of cells) {
    if (c.kind === 'code') {
      const res = s.runCell(c.id);
      if (res.reason === 'error') {
        console.log(`  ERROR in ${c.id}: ${res.error}`);
      }
      expect(res.reason).not.toBe('error');
    }
  }
}

describe('Lesson smoke tests', () => {
  const lessons = [
    '01-hello-world',
    '02-registers-mov',
    '03-arithmetic',
    '04-comparison-branching',
    '05-stack',
    '06-loops',
    '07-strings',
    '08-putting-it-together',
    '09-flags-deep-dive',
    '10-interrupts-dos-io',
    '11-number-conversion',
    '12-doomsday',
  ];

  for (const name of lessons) {
    it(`loads and runs ${name}`, () => {
      const { version, cells } = loadLesson(name);
      expect(version).toBe(1);
      expect(Array.isArray(cells)).toBe(true);

      const s = new LiveSession();
      runAllCells(s, cells);
    });
  }
});

describe('Lesson output validation', () => {
  it('01-hello-world prints Hello, World!', () => {
    const { cells } = loadLesson('01-hello-world');
    const s = new LiveSession();
    runAllCells(s, cells);
    expect(s.getFullOutput()).toContain('Hello, World!');
  });

  it('02-registers-mov sets AL to 0xFF in final cell', () => {
    const { cells } = loadLesson('02-registers-mov');
    const s = new LiveSession();
    runAllCells(s, cells);
    const state = s.getState();
    // Last code cell: MOV AX, 0; MOV AL, 0FFh → AX = 0x00FF
    expect(state.regs.AX).toBe(0x00FF);
  });

  it('03-arithmetic produces expected result', () => {
    const { cells } = loadLesson('03-arithmetic');
    const s = new LiveSession();
    runAllCells(s, cells);
    const state = s.getState();
    // Last code cell does MOV AX, 0; DEC AX → AX = 0xFFFF
    expect(state.regs.AX).toBe(0xFFFF);
  });

  it('04-comparison-branching runs without error', () => {
    const { cells } = loadLesson('04-comparison-branching');
    const s = new LiveSession();
    runAllCells(s, cells);
    // Just verify it completed without error
    expect(s.getState()).toBeDefined();
  });

  it('05-stack runs without error', () => {
    const { cells } = loadLesson('05-stack');
    const s = new LiveSession();
    runAllCells(s, cells);
    expect(s.getState()).toBeDefined();
  });

  it('06-loops runs without error', () => {
    const { cells } = loadLesson('06-loops');
    const s = new LiveSession();
    runAllCells(s, cells);
    expect(s.getState()).toBeDefined();
  });

  it('07-strings runs without error', () => {
    const { cells } = loadLesson('07-strings');
    const s = new LiveSession();
    runAllCells(s, cells);
    expect(s.getState()).toBeDefined();
  });

  it('08-putting-it-together completes all cells without error', () => {
    const { cells } = loadLesson('08-putting-it-together');
    const s = new LiveSession();
    runAllCells(s, cells);
    expect(s.getState()).toBeDefined();
  });

  it('09-flags-deep-dive completes all cells without error', () => {
    const { cells } = loadLesson('09-flags-deep-dive');
    const s = new LiveSession();
    runAllCells(s, cells);
    expect(s.getState()).toBeDefined();
  });

  it('10-interrupts-dos-io produces output', () => {
    const { cells } = loadLesson('10-interrupts-dos-io');
    const s = new LiveSession();
    runAllCells(s, cells);
    // This lesson uses INT 21h which produces text screen output
    expect(s.getFullOutput()).not.toBe('');
  });

  it('11-number-conversion completes without error', () => {
    const { cells } = loadLesson('11-number-conversion');
    const s = new LiveSession();
    runAllCells(s, cells);
    expect(s.getState()).toBeDefined();
  });

  it('12-doomsday completes without error', () => {
    const { cells } = loadLesson('12-doomsday');
    const s = new LiveSession();
    runAllCells(s, cells);
    expect(s.getState()).toBeDefined();
  });
});
