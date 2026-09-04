import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { LiveSession, type Cell } from '../src/kernel/session.js';

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
      const raw = readFileSync(`./public/lessons/${name}.asmnb`, 'utf8');
      const data = JSON.parse(raw);
      expect(data.version).toBe(1);
      expect(Array.isArray(data.cells)).toBe(true);

      const s = new LiveSession();
      s.setCells(data.cells as Cell[]);

      // Run all code cells
      for (const c of data.cells) {
        if (c.kind === 'code') {
          const res = s.runCell(c.id);
          if (res.reason === 'error') {
            console.log(`  ERROR in ${name}/${c.id}: ${res.error}`);
          }
          expect(res.reason).not.toBe('error');
        }
      }
    });
  }
});
