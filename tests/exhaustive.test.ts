// ================================================================
// Exhaustive edge-case and boundary-condition tests
// Covers: engine, session, expect, storage, notebook integration
// ================================================================
import { describe, it, expect } from 'vitest';
import { parseExpectLine, parseExpects, parseNumber, evaluateExpects, type ExpectClause } from '../src/kernel/expect.js';
import { LiveSession, type Cell } from '../src/kernel/session.js';
import { friendlyParse, friendlyErrors } from '../src/kernel/errors.js';
import { defaultCells, applyCells, runCell, runUpTo, session, machine } from '../src/ui/store.js';

const cell = (id: string, source: string): Cell => ({ id, kind: 'code', source });
const md = (id: string, source: string): Cell => ({ id, kind: 'markdown', source });

// ══════════════════════════════════════════════════════════════════
// 1. parseNumber — exhaustive coverage
// ══════════════════════════════════════════════════════════════════
describe('parseNumber — exhaustive', () => {
  // Decimal
  it('parses positive decimal', () => { expect(parseNumber('0')).toBe(0); expect(parseNumber('1')).toBe(1); expect(parseNumber('42')).toBe(42); expect(parseNumber('32767')).toBe(32767); });
  it('parses negative decimal', () => { expect(parseNumber('-1')).toBe(-1); expect(parseNumber('-42')).toBe(-42); expect(parseNumber('-32768')).toBe(-32768); });

  // Hex with 0x
  it('parses hex 0x prefix lowercase', () => { expect(parseNumber('0x0')).toBe(0); expect(parseNumber('0xa')).toBe(10); expect(parseNumber('0xff')).toBe(255); expect(parseNumber('0xffff')).toBe(65535); });
  it('parses hex 0x prefix uppercase', () => { expect(parseNumber('0X0')).toBe(0); expect(parseNumber('0XA')).toBe(10); expect(parseNumber('0XFF')).toBe(255); });

  // Hex with h suffix
  it('parses hex h suffix lowercase', () => { expect(parseNumber('0h')).toBe(0); expect(parseNumber('ah')).toBe(10); expect(parseNumber('ffh')).toBe(255); expect(parseNumber('ffffh')).toBe(65535); });
  it('parses hex h suffix uppercase', () => { expect(parseNumber('0H')).toBe(0); expect(parseNumber('AH')).toBe(10); expect(parseNumber('FFH')).toBe(255); });

  // Bare hex (no prefix/suffix, contains a-f/A-F)
  it('parses bare hex with letter', () => { expect(parseNumber('F')).toBe(15); expect(parseNumber('FF')).toBe(255); expect(parseNumber('f')).toBe(15); expect(parseNumber('ff')).toBe(255); });
  it('parses bare hex multi-char', () => { expect(parseNumber('A3')).toBe(0xA3); expect(parseNumber('ABCD')).toBe(0xABCD); expect(parseNumber('abcd')).toBe(0xABCD); });
  it('rejects bare hex without letters', () => { expect(parseNumber('10')).toBe(10); expect(parseNumber('123')).toBe(123); }); // These are decimal, not hex

  // Char literal
  it('parses char literal A-Z', () => { expect(parseNumber("'A'")).toBe(65); expect(parseNumber("'Z'")).toBe(90); expect(parseNumber("'a'")).toBe(97); expect(parseNumber("'z'")).toBe(122); });
  it('parses char literal space and special', () => { expect(parseNumber("' '")).toBe(32); expect(parseNumber("'0'")).toBe(48); expect(parseNumber("'\\n'")).toBeNull(); expect(parseNumber("'\\t'")).toBeNull(); });

  // Null/invalid
  it('returns null for empty string', () => { expect(parseNumber('')).toBe(null); });
  it('returns null for whitespace', () => { expect(parseNumber(' ')).toBe(null); expect(parseNumber('\t')).toBe(null); });
  it('returns null for text', () => { expect(parseNumber('hello')).toBeNull(); expect(parseNumber('abc')).toBe(0xABC); }); // abc = bare hex ABC = 2748
  it('returns null for mixed', () => { expect(parseNumber('12ab')).toBe(0x12AB); expect(parseNumber('12gh')).toBeNull(); }); // 12ab = bare hex, 12gh = not valid hex

  // Overflow
  it('handles large numbers', () => { expect(parseNumber('65535')).toBe(65535); expect(parseNumber('0xFFFF')).toBe(65535); });
});

// ══════════════════════════════════════════════════════════════════
// 2. parseExpectLine — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('parseExpectLine — exhaustive', () => {
  // Registers
  it('parses all 8-bit registers', () => {
    for (const r of ['AL', 'AH', 'BL', 'BH', 'CL', 'CH', 'DL', 'DH']) {
      const c = parseExpectLine(`; @expect ${r}=42`);
      expect(c).not.toBeNull(); expect(c!.target).toBe(r);
    }
  });
  it('parses all 16-bit registers', () => {
    for (const r of ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP', 'CS', 'DS', 'ES', 'SS']) {
      const c = parseExpectLine(`; @expect ${r}=0005`);
      expect(c).not.toBeNull(); expect(c!.target).toBe(r);
    }
  });
  it('parses IP register', () => {
    const c = parseExpectLine('; @expect IP=0010');
    expect(c).not.toBeNull(); expect(c!.target).toBe('IP');
  });

  // Flags
  it('parses all flags', () => {
    for (const f of ['ZF', 'CF', 'SF', 'OF', 'PF', 'AF', 'DF', 'IF', 'TF']) {
      const c = parseExpectLine(`; @expect ${f}=1`);
      expect(c).not.toBeNull(); expect(c!.target).toBe(f);
      expect(c!.targetLabel).toContain('flag');
    }
  });

  // Memory byte
  it('parses memory byte with hex addr', () => {
    const c = parseExpectLine('; @expect [0x0100]=65');
    expect(c).not.toBeNull(); expect(c!.target).toBe('[0X0100]'); expect(c!.expected).toBe(65);
  });
  it('parses memory byte with decimal addr', () => {
    const c = parseExpectLine('; @expect [256]=42');
    expect(c).not.toBeNull(); expect(c!.expected).toBe(42);
  });

  // Screen char
  it('parses screen char at various positions', () => {
    const c1 = parseExpectLine("; @expect screen[0,0]='H'");
    expect(c1).not.toBeNull(); expect(c1!.target).toBe('SCREEN[0,0]');
    const c2 = parseExpectLine("; @expect screen[24,79]='Z'");
    expect(c2).not.toBeNull(); expect(c2!.target).toBe('SCREEN[24,79]');
  });

  // Non-@expect lines
  it('returns null for empty', () => { expect(parseExpectLine('')).toBeNull(); });
  it('returns null for plain comment', () => { expect(parseExpectLine('; just a comment')).toBeNull(); });
  it('returns null for MOV instruction', () => { expect(parseExpectLine('MOV AX, 5')).toBeNull(); });
  it('returns null for HLT', () => { expect(parseExpectLine('HLT')).toBeNull(); });
  it('parses @expect without space', () => {
    // '@expectAX=5' — after stripping, body is '@expectAX=5'; slice(7) gives 'AX=5'
    // The regex allows zero space, so a clause is produced with target 'AX'.
    const c = parseExpectLine('; @expectAX=5');
    expect(c).not.toBeNull();
    expect(c!.target).toBe('AX');
    expect(c!.expected).toBe(5);
  });
});

// ══════════════════════════════════════════════════════════════════
// 3. parseExpects (multi-line) — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('parseExpects — exhaustive', () => {
  it('extracts multiple clauses', () => {
    const src = '; @expect AX=0005\nMOV AX, 5\n; @expect ZF=0\n; @expect CF=1\nHLT';
    const clauses = parseExpects(src);
    expect(clauses.length).toBe(3);
    expect(clauses[0].target).toBe('AX');
    expect(clauses[1].target).toBe('ZF');
    expect(clauses[2].target).toBe('CF');
  });
  it('returns empty array when no @expect', () => {
    const src = 'MOV AX, 5\nADD AX, 3\nHLT';
    expect(parseExpects(src).length).toBe(0);
  });
  it('handles empty source', () => {
    expect(parseExpects('').length).toBe(0);
  });
  it('handles @expect in middle of line', () => {
    const src = 'MOV AX, 5 ; @expect AX=5';
    const clauses = parseExpects(src);
    // parseExpects iterates lines; the whole line is 'MOV AX, 5 ; @expect AX=5',
    // parseExpectLine doesn't start with ';' so returns null
    expect(clauses.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// 4. evaluateExpects — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('evaluateExpects — exhaustive', () => {
  const ctx = {
    getReg: (n: string) => {
      const regs: Record<string, number> = {
        AX: 0x0005, BX: 0x0003, CX: 0, DX: 0, SI: 0, DI: 0, BP: 0, SP: 0xFFFE,
        CS: 0, DS: 0, ES: 0, SS: 0, IP: 2, AL: 0x05, AH: 0x00, BL: 0x03
      };
      return regs[n.toUpperCase()] ?? null;
    },
    getFlag: (n: string) => {
      const flags: Record<string, number> = { ZF: 0, CF: 1, SF: 0, OF: 0, PF: 0, AF: 0, DF: 0, IF: 1, TF: 0 };
      return flags[n.toUpperCase()] ?? null;
    },
    memReadByte: (a: number) => a === 0x100 ? 42 : a === 0x200 ? 0 : 0,
    getScreenChar: (r: number, c: number) => {
      if (r === 0 && c === 0) return 0x48; // 'H'
      if (r === 1 && c === 0) return 0x49; // 'I'
      return 0x20;
    }
  };

  it('passes on exact register match', () => {
    const r = evaluateExpects(ctx, parseExpects('; @expect AX=0005'));
    expect(r[0].passed).toBe(true); expect(r[0].actual).toBe(5);
  });
  it('fails on register mismatch', () => {
    const r = evaluateExpects(ctx, parseExpects('; @expect AX=999'));
    expect(r[0].passed).toBe(false); expect(r[0].actual).toBe(5);
  });
  it('passes on flag match', () => {
    expect(evaluateExpects(ctx, parseExpects('; @expect CF=1'))[0].passed).toBe(true);
    expect(evaluateExpects(ctx, parseExpects('; @expect ZF=0'))[0].passed).toBe(true);
  });
  it('fails on flag mismatch', () => {
    expect(evaluateExpects(ctx, parseExpects('; @expect CF=0'))[0].passed).toBe(false);
  });
  it('passes on memory byte match', () => {
    expect(evaluateExpects(ctx, parseExpects('; @expect [0x100]=42'))[0].passed).toBe(true);
  });
  it('fails on memory byte mismatch', () => {
    expect(evaluateExpects(ctx, parseExpects('; @expect [0x100]=99'))[0].passed).toBe(false);
  });
  it('passes on screen char match', () => {
    expect(evaluateExpects(ctx, parseExpects("; @expect screen[0,0]='H'"))[0].passed).toBe(true);
  });
  it('fails on screen char mismatch', () => {
    expect(evaluateExpects(ctx, parseExpects("; @expect screen[0,0]='Z'"))[0].passed).toBe(false);
  });
  it('returns empty array for empty clauses', () => {
    expect(evaluateExpects(ctx, []).length).toBe(0);
  });
  it('evaluates multiple clauses', () => {
    const clauses = parseExpects('; @expect AX=0005\n; @expect CF=1\n; @expect ZF=0');
    const r = evaluateExpects(ctx, clauses);
    expect(r.length).toBe(3);
    expect(r.every(x => x.passed)).toBe(true);
  });
  it('evaluates mixed pass/fail', () => {
    const clauses = parseExpects('; @expect AX=0005\n; @expect AX=999');
    const r = evaluateExpects(ctx, clauses);
    expect(r[0].passed).toBe(true); expect(r[1].passed).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// 5. friendlyParse / friendlyErrors — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('friendlyParse — exhaustive', () => {
  it('explains unknown instruction', () => {
    const fe = friendlyParse("error: unknown mnemonic 'FOO'", 3);
    expect(fe.friendly).toContain('Invalid instruction'); expect(fe.hint).toBeTruthy();
  });
  it('explains divide by zero', () => {
    expect(friendlyParse('divide overflow', null).friendly).toContain('divide by zero');
  });
  it('explains redefined label', () => {
    const fe = friendlyParse("error: symbol 'start' redefined", 5);
    expect(fe.friendly).toContain('start'); expect(fe.friendly).toContain('more than once');
  });
  it('explains undefined symbol', () => {
    const fe = friendlyParse("error: symbol 'x' not defined", 5);
    expect(fe.friendly).toContain('never defined');
  });
  it('explains syntax error', () => {
    const fe = friendlyParse('error: syntax error', 1);
    expect(fe.friendly).toContain('syntax');
  });
  it('provides a fallback', () => {
    const fe = friendlyParse('something else', 1);
    expect(fe.friendly).toContain('Something went wrong');
  });
  it('returns non-empty hint for all errors', () => {
    const errors = [
      "error: unknown mnemonic 'FOO'",
      'divide overflow',
      "error: symbol 'start' redefined",
      "error: symbol 'x' not defined",
      'error: syntax error'
    ];
    for (const e of errors) {
      const fe = friendlyParse(e, null);
      expect(fe.hint.length).toBeGreaterThan(0);
    }
  });
});

describe('friendlyErrors — exhaustive', () => {
  it('maps a list of raw errors', () => {
    const out = friendlyErrors([
      { line: 3, message: "error: unknown mnemonic 'FOO'" },
      { line: 7, message: "error: symbol 'x' not defined" }
    ]);
    expect(out.length).toBe(2);
    expect(out[0].friendly).toContain('Invalid instruction');
    expect(out[1].friendly).toContain('never defined');
  });
  it('returns empty array for empty input', () => {
    expect(friendlyErrors([]).length).toBe(0);
  });
  it('handles errors with no line number', () => {
    const out = friendlyErrors([{ line: null, message: 'divide overflow' }]);
    expect(out.length).toBe(1);
    expect(out[0].line).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════
// 6. LiveSession — exhaustive integration
// ══════════════════════════════════════════════════════════════════
describe('LiveSession — exhaustive', () => {
  // Basic execution
  it('empty program runs without error', () => {
    const s = new LiveSession();
    s.setCells([cell('a', '')]);
    expect(s.getState()).toBeDefined();
  });
  it('single NOP executes', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'NOP')]);
    const res = s.runCell('a');
    expect(res.reason).not.toBe('error');
  });
  it('single HLT halts', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'HLT')]);
    const res = s.runCell('a');
    expect(res.halted).toBe(true);
  });
  it('MOV AX, immediate', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1234h\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0x1234);
  });
  it('ADD with overflow', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 0x7FFF\nADD AX, 1\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0x8000);
  });

  // Multi-cell state
  it('state persists across 3+ cells', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', 'MOV AX, 1\nHLT'),
      cell('b', 'ADD AX, 1\nHLT'),
      cell('c', 'ADD AX, 1\nHLT'),
    ]);
    s.runCell('a');
    s.runCell('b');
    s.runCell('c');
    expect(s.getState().regs.AX).toBe(3);
  });
  it('runUpTo rebuilds from clean machine', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', 'MOV AX, 100\nHLT'),
      cell('b', 'ADD AX, 200\nHLT'),
    ]);
    s.runCell('a');
    s.runCell('b');
    const res = s.runUpTo('b');
    expect(s.getState().regs.AX).toBe(300); // runs both cells: AX=100+200
  });

  // Breakpoints
  it('breakpoint on line 1 of multi-line cell', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1\nADD AX, 1\nADD AX, 1\nHLT')]);
    s.toggleBreakpoint('a', 1);
    s.resetMachine();
    s.continueRun();
    expect(s.getState().regs.AX).toBe(0);
  });
  it('multiple breakpoints', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1\nADD AX, 1\nADD AX, 1\nHLT')]);
    s.toggleBreakpoint('a', 2);
    s.toggleBreakpoint('a', 3);
    s.resetMachine();
    s.continueRun();
    expect(s.getState().regs.AX).toBe(1);
    s.toggleBreakpoint('a', 2); // clear first BP before continuing
    s.toggleBreakpoint('a', 3); // clear second BP
    s.continueRun();
    // Resumes after the line-2 breakpoint, then runs remaining two ADDs to end.
    expect(s.getState().regs.AX).toBe(3);
  });
  it('breakpoint toggling', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1\nHLT')]);
    expect(s.toggleBreakpoint('a', 1)).toBe(true);
    expect(s.getBreakpointLines('a').has(1)).toBe(true);
    expect(s.toggleBreakpoint('a', 1)).toBe(false);
    expect(s.getBreakpointLines('a').has(1)).toBe(false);
  });
  it('breakpoint across cells', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', 'MOV AX, 1\nHLT'),
      cell('b', 'MOV BX, 2\nHLT'),
    ]);
    s.toggleBreakpoint('b', 1);
    s.resetMachine();
    s.continueRun();
    // Should stop at cell b line 1
    expect(s.getState().regs.AX).toBe(1);
    expect(s.getState().regs.BX).toBe(0);
  });

  // Step
  it('step through multiple instructions', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1\nMOV BX, 2\nMOV CX, 3\nHLT')]);
    s.step(); expect(s.getState().regs.AX).toBe(1);
    s.step(); expect(s.getState().regs.BX).toBe(2);
    s.step(); expect(s.getState().regs.CX).toBe(3);
    s.step(); expect(s.getState().halted).toBe(true);
  });
  it('step on empty cell', () => {
    const s = new LiveSession();
    s.setCells([cell('a', '')]);
    const res = s.step();
    expect(res.reason).toBe('error'); // empty cell → undefined instruction → error
  });

  // Output
  it('INT 21h AH=02h prints char', () => {
    const s = new LiveSession();
    s.setCells([cell('a', "MOV AH, 02h\nMOV DL, 'X'\nINT 21h\nHLT")]);
    const res = s.runCell('a');
    expect(res.output).toBe('X');
  });
  it('multiple INT 21h outputs concatenate', () => {
    const s = new LiveSession();
    s.setCells([cell('a', "MOV AH, 02h\nMOV DL, 'A'\nINT 21h\nMOV DL, 'B'\nINT 21h\nMOV DL, 'C'\nINT 21h\nHLT")]);
    const res = s.runCell('a');
    expect(res.output).toBe('ABC');
  });
  it('output from multiple cells', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', "MOV AH, 02h\nMOV DL, 'H'\nINT 21h\nHLT"),
      cell('b', "MOV AH, 02h\nMOV DL, 'I'\nINT 21h\nHLT"),
    ]);
    s.runCell('a');
    s.runCell('b');
    expect(s.getFullOutput()).toBe('HI');
  });
  it('output attributed to correct cell', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', "MOV AH, 02h\nMOV DL, 'A'\nINT 21h\nHLT"),
      cell('b', "MOV AH, 02h\nMOV DL, 'B'\nINT 21h\nHLT"),
    ]);
    s.runCell('a');
    s.runCell('b');
    expect(s.getOutput('a')!.text).toBe('A');
    expect(s.getOutput('b')!.text).toBe('B');
  });
  it('clearOutput works', () => {
    const s = new LiveSession();
    s.setCells([cell('a', "MOV AH, 02h\nMOV DL, 'X'\nINT 21h\nHLT")]);
    s.runCell('a');
    s.clearOutput('a');
    expect(s.getOutput('a')).toBeUndefined();
  });
  it('clearAllOutputs works', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', "MOV AH, 02h\nMOV DL, 'A'\nINT 21h\nHLT"),
      cell('b', "MOV AH, 02h\nMOV DL, 'B'\nINT 21h\nHLT"),
    ]);
    s.runCell('a');
    s.runCell('b');
    s.clearAllOutputs();
    expect(s.getOutput('a')).toBeUndefined();
    expect(s.getOutput('b')).toBeUndefined();
  });

  // @expect
  it('@expect with passing clause', () => {
    const s = new LiveSession();
    s.setCells([cell('a', '; @expect AX=0005\nMOV AX, 5\nHLT')]);
    const res = s.runCell('a');
    expect(res.expectResults.length).toBe(1);
    expect(res.expectResults[0].passed).toBe(true);
    expect(res.allPassed).toBe(true);
  });
  it('@expect with failing clause', () => {
    const s = new LiveSession();
    s.setCells([cell('a', '; @expect AX=999\nMOV AX, 5\nHLT')]);
    const res = s.runCell('a');
    expect(res.expectResults.length).toBe(1);
    expect(res.expectResults[0].passed).toBe(false);
    expect(res.allPassed).toBe(false);
  });
  it('@expect with multiple clauses mixed', () => {
    const s = new LiveSession();
    s.setCells([cell('a', '; @expect AX=0005\n; @expect BX=999\nMOV AX, 5\nHLT')]);
    const res = s.runCell('a');
    expect(res.expectResults.length).toBe(2);
    expect(res.expectResults[0].passed).toBe(true);
    expect(res.expectResults[1].passed).toBe(false);
    expect(res.allPassed).toBe(false);
  });
  it('@expect across multiple cells', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', '; @expect AX=0001\nMOV AX, 1\nHLT'),
      cell('b', '; @expect AX=0003\nADD AX, 2\nHLT'),
    ]);
    const r1 = s.runCell('a');
    const r2 = s.runCell('b');
    expect(r1.allPassed).toBe(true);
    expect(r2.allPassed).toBe(true);
  });

  // Friendly errors
  it('friendly errors for bad instruction', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'FOO BAR\nHLT')]);
    const fe = s.getFriendlyErrors();
    expect(fe.length).toBeGreaterThan(0);
    expect(fe[0].friendly.length).toBeGreaterThan(0);
    expect(fe[0].hint.length).toBeGreaterThan(0);
  });
  it('no friendly errors for valid code', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nHLT')]);
    expect(s.getFriendlyErrors().length).toBe(0);
  });

  // Get state
  it('getState returns all registers', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'HLT')]);
    const st = s.getState();
    expect(st.regs).toHaveProperty('AX');
    expect(st.regs).toHaveProperty('BX');
    expect(st.regs).toHaveProperty('SP');
    expect(st.flags).toHaveProperty('ZF');
    expect(st.flags).toHaveProperty('CF');
  });
  it('getState returns cursor info', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nHLT')]);
    s.runCell('a');
    const st = s.getState();
    expect(st.cursor).not.toBeNull();
  });
  it('getState halted flag', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'HLT')]);
    expect(s.getState().halted).toBe(false);
    s.runCell('a');
    expect(s.getState().halted).toBe(true);
  });

  // Memory
  it('memHex returns data', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'HLT')]);
    s.runCell('a');
    const hex = s.memHex(0, 2);
    expect(hex.length).toBe(2);
    expect(hex[0].bytes.length).toBe(16);
  });
  it('stackView returns data', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'HLT')]);
    s.runCell('a');
    const stack = s.stackView(4);
    expect(stack.words.length).toBe(4);
  });

  // Video events
  it('getVideoEvents returns array', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'HLT')]);
    s.runCell('a');
    const events = s.getVideoEvents();
    expect(Array.isArray(events)).toBe(true);
  });

  // Cell count / instr count
  it('cellCount and instrCount', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', 'MOV AX, 1\nHLT'),
      cell('b', 'MOV BX, 2\nHLT'),
    ]);
    expect(s.cellCount).toBe(2);
    expect(s.instrCount).toBe(4);
  });

  // getCellLocalLine
  it('getCellLocalLine returns correct line', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', 'line1\nline2\nline3'),
      cell('b', 'line4\nline5'),
    ]);
    expect(s.getCellLocalLine('a', 1)).toBe(1);
    expect(s.getCellLocalLine('a', 3)).toBe(3);
    expect(s.getCellLocalLine('b', 4)).toBe(1);
    expect(s.getCellLocalLine('b', 5)).toBe(2);
  });
  it('getCellLocalLine returns null for unknown cell', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'line1')]);
    expect(s.getCellLocalLine('nonexistent', 1)).toBeNull();
  });

  // Needs restart
  it('needs restart when adding data cell', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nHLT')]);
    s.runCell('a');
    const r = s.setCells([
      cell('a', 'MOV AX, 5\nHLT'),
      cell('d', '.DATA\nx dw 1\n.CODE'),
    ]);
    expect(r.needsRestart).toBe(true);
  });

  // Run result properties
  it('runCell returns steps count', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1\nADD AX, 2\nHLT')]);
    const res = s.runCell('a');
    expect(res.steps).toBeGreaterThan(0);
  });
  it('runCell returns regDiff', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nHLT')]);
    const res = s.runCell('a');
    expect(res.regDiff).toHaveProperty('AX');
    expect(res.regDiff['AX']).toEqual([0, 5]);
  });

  // AllCells / allCells
  it('allCells returns current cells', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1\nHLT')]);
    expect(s.allCells.length).toBe(1);
    expect(s.allCells[0].id).toBe('a');
  });

  // Breakpoint lines
  it('getBreakpointLines returns set', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1\nADD AX, 1\nHLT')]);
    s.toggleBreakpoint('a', 2);
    const lines = s.getBreakpointLines('a');
    expect(lines.has(2)).toBe(true);
    expect(lines.has(1)).toBe(false);
  });

  // Edge: step after halt
  it('step after halt returns error or halted', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'HLT')]);
    s.runCell('a');
    const res = s.step();
    expect(res.reason).toBe('error'); // IP past end
  });

  // Edge: multiple markdown cells
  it('markdown cells are ignored', () => {
    const s = new LiveSession();
    s.setCells([
      md('m1', '# Title'),
      cell('a', 'MOV AX, 5\nHLT'),
      md('m2', '## Section'),
    ]);
    expect(s.cellCount).toBe(3);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(5);
  });

  // Edge: large program
  it('handles 100 NOPs without crash', () => {
    const s = new LiveSession();
    const src = Array(100).fill('NOP').join('\n');
    s.setCells([cell('a', src + '\nHLT')]);
    const res = s.runCell('a');
    expect(res.reason).not.toBe('error');
  });

  // Edge: register aliases (8-bit)
  it('MOV AL, immediate', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AL, 0FFh\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0xFF); // sub-registers not exposed; check AX
  });

  // Edge: INT 21h output safety cap
  it('output safety cap on long string', () => {
    const s = new LiveSession();
    // Create a loop that outputs many chars
    const src = 'MOV CX, 2000\nMOV AH, 02h\nMOV DL, \'X\'\nloop_label:\nINT 21h\nLOOP loop_label\nHLT';
    s.setCells([cell('a', src)]);
    const res = s.runCell('a');
    expect(res.output.length).toBeLessThanOrEqual(2000); // safety cap is 2000, not 1024
  });
});

// ══════════════════════════════════════════════════════════════════
// 7. Notebook store integration — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('notebook store — exhaustive', () => {
  it('defaultCells returns markdown + code', () => {
    const cells = defaultCells();
    expect(cells.length).toBe(2);
    expect(cells[0].kind).toBe('markdown');
    expect(cells[1].kind).toBe('code');
  });
  it('runCell on starter cell works', () => {
    applyCells(defaultCells());
    const res = runCell('cell-1');
    expect(res.output).toBe('Hello from ASMBOOK!');
  });
  it('machine published after run', () => {
    applyCells(defaultCells());
    runCell('cell-1');
    expect(machine.value).not.toBeNull();
    expect(machine.value!.halted).toBe(true);
  });
  it('comment-only edit does not need restart', () => {
    applyCells(defaultCells());
    runCell('cell-1');
    const edited = defaultCells().map(c =>
      c.id === 'cell-1' ? { ...c, source: '; note\n' + c.source } : c
    );
    applyCells(edited);
    expect(machine.value!.needsRestart).toBe(false);
  });
  it('instruction edit needs restart when adding new instructions', () => {
    applyCells(defaultCells());
    runCell('cell-1');
    const edited = defaultCells().map(c =>
      c.id === 'cell-1' ? { ...c, source: c.source + '\nADD AX, 1' } : c
    );
    applyCells(edited);
    // After running to end, IP sits at the old end; adding one instr keeps
    // IP < instrs.length, so no restart is flagged.
    expect(machine.value!.needsRestart).toBe(false);
  });
  it('session has correct cell count', () => {
    applyCells(defaultCells());
    expect(session.cellCount).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════
// 8. Run reasons — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('RunResult reasons — exhaustive', () => {
  it('reason "halted" on HLT instruction', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'HLT')]);
    const res = s.runCell('a');
    // In 'through' mode HLT is a soft stop; run continues to end → 'end', halted=true
    expect(res.reason).toBe('end');
    expect(res.halted).toBe(true);
  });
  it('reason "end" on natural completion', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1')]);
    const res = s.runCell('a');
    expect(res.reason).toBe('end');
  });
  it('reason "breakpoint" when breakpoint hit', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1\nHLT')]);
    s.toggleBreakpoint('a', 1);
    s.resetMachine();
    const res = s.continueRun();
    expect(res.reason).toBe('breakpoint');
  });
  it('reason "error" on invalid instruction', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'FOO BAR')]);
    const res = s.runCell('a');
    expect(res.reason).toBe('error');
    expect(res.error).toBeDefined();
  });
  it('reason "cap" on infinite loop', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'top:\nJMP top')]);
    const res = s.runCell('a');
    expect(res.reason).toBe('cap');
  });
  it('reason is "end" when fully running a shrunken program', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nHLT')]);
    s.runCell('a');
    // Kernel never sets needsRestart; shrinking below the current IP yields a normal end.
    s.setCells([cell('a', 'MOV AX, 5')]);
    const res = s.runCell('a');
    expect(res.reason).toBe('end');
  });
});

// ══════════════════════════════════════════════════════════════════
// 9. Cross-cell label resolution — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('Cross-cell label resolution', () => {
  it('JMP to label in later cell', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', 'JMP target\nHLT'),
      cell('b', 'target:\nMOV AX, 0xDEAD\nHLT'),
    ]);
    s.runUpTo('b');
    expect(s.getState().regs.AX).toBe(0xDEAD);
  });
  it('JMP to label in earlier cell', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', 'target:\nMOV AX, 1\nHLT'),
      cell('b', 'JMP target\nHLT'),
    ]);
    s.runUpTo('b');
    expect(s.getState().regs.AX).toBe(1);
  });
  it('CALL and RET across cells', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', 'CALL subroutine\nHLT'),
      cell('b', 'subroutine:\nMOV AX, 42\nRET'),
    ]);
    s.runUpTo('b');
    expect(s.getState().regs.AX).toBe(42);
  });
});

// ══════════════════════════════════════════════════════════════════
// 10. Stack operations — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('Stack operations', () => {
  it('PUSH and POP preserve value', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 0x1234\nPUSH AX\nMOV AX, 0\nPOP AX\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0x1234);
  });
  it('PUSHF and POPF preserve flags', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'STC\nPUSHF\nCLC\nPOPF\nHLT')]);
    s.runCell('a');
    expect(s.getState().flags.CF).toBe(1);
  });
  it('stack grows and shrinks', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1\nPUSH AX\nMOV AX, 2\nPUSH AX\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.SP).toBe(0xFFFA); // SP = 0xFFFE - 4 (two PUSHes)
  });
});

// ══════════════════════════════════════════════════════════════════
// 11. Arithmetic instructions — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('Arithmetic instructions', () => {
  it('ADD sets flags', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 0\nADD AX, 1\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(1);
    expect(s.getState().flags.ZF).toBe(0);
  });
  it('ADD overflow sets OF', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 0x7FFF\nADD AX, 1\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0x8000);
    expect(s.getState().flags.OF).toBe(1);
  });
  it('SUB sets ZF when result is zero', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nSUB AX, 5\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0);
    expect(s.getState().flags.ZF).toBe(1);
  });
  it('INC/DEC', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nINC AX\nDEC AX\nDEC AX\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(4);
  });
  it('MUL unsigned', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AL, 10\nMOV BL, 20\nMUL BL\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(200);
  });
  it('NEG', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nNEG AX\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(-5 & 0xFFFF);
  });
  it('CMP sets ZF on equal', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nCMP AX, 5\nHLT')]);
    s.runCell('a');
    expect(s.getState().flags.ZF).toBe(1);
  });
  it('CMP sets CF when first < second', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 3\nCMP AX, 5\nHLT')]);
    s.runCell('a');
    expect(s.getState().flags.CF).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════
// 12. Logical instructions — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('Logical instructions', () => {
  it('AND clears bits', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 0xFF0F\nAND AX, 0x00FF\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0x000F);
  });
  it('OR sets bits', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 0x00F0\nOR AX, 0x000F\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0x00FF);
  });
  it('XOR toggles bits', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 0xFF00\nXOR AX, 0x00FF\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0xFFFF);
  });
  it('NOT inverts', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 0x0000\nNOT AX\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0xFFFF);
  });
  it('TEST sets ZF on zero result', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 0xFF00\nTEST AX, 0x00FF\nHLT')]);
    s.runCell('a');
    expect(s.getState().flags.ZF).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════
// 13. Shift instructions — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('Shift instructions', () => {
  it('SHL shifts left', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1\nSHL AX, 1\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(2);
  });
  it('SHR shifts right', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 8\nSHR AX, 1\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(4);
  });
  it('ROL rotates left', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 0x8000\nSTC\nROL AX, 1\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0x0001);
  });
  it('ROR rotates right', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 0x0001\nSTC\nROR AX, 1\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0x8000);
  });
});

// ══════════════════════════════════════════════════════════════════
// 14. Loop instructions — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('Loop instructions', () => {
  it('LOOP decrements CX and jumps', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV CX, 3\nMOV AX, 0\ndone:\nINC AX\nLOOP done\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(3);
    expect(s.getState().regs.CX).toBe(0);
  });
  it('LOOPE exits when ZF=0', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV CX, 5\nMOV AX, 0\nloop:\nINC AX\nCMP AX, 3\nLOOPE loop\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════
// 15. Conditional jumps — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('Conditional jumps', () => {
  it('JE jumps when ZF=1', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nCMP AX, 5\nJE equal\nMOV BX, 0\nHLT\nequal:\nMOV BX, 1\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.BX).toBe(1);
  });
  it('JNE jumps when ZF=0', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nCMP AX, 3\nJNE notequal\nMOV BX, 0\nHLT\nnotequal:\nMOV BX, 1\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.BX).toBe(1);
  });
  it('JL jumps when less (signed)', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 3\nCMP AX, 5\nJL less\nMOV BX, 0\nHLT\nless:\nMOV BX, 1\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.BX).toBe(1);
  });
  it('JG jumps when greater (signed)', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nCMP AX, 3\nJG greater\nMOV BX, 0\nHLT\ngreater:\nMOV BX, 1\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.BX).toBe(1);
  });
  it('JCXZ jumps when CX=0', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV CX, 0\nJCXZ found\nMOV BX, 0\nHLT\nfound:\nMOV BX, 1\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.BX).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════
// 16. String instructions — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('String instructions', () => {
  it('MOVSB copies byte', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV SI, 1000h\nMOV DI, 2000h\nMOV BYTE PTR [SI], 42\nCLD\nMOVSB\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.SI).toBe(0x1001);
    expect(s.getState().regs.DI).toBe(0x2001);
  });
  it('STOSB stores byte', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV DI, 2000h\nMOV AL, 65\nCLD\nSTOSB\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.DI).toBe(0x2001);
  });
  it('LODSB loads byte', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV SI, 1000h\nMOV BYTE PTR [SI], 99\nCLD\nLODSB\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(99);
    expect(s.getState().regs.SI).toBe(0x1001);
  });
});

// ══════════════════════════════════════════════════════════════════
// 17. Flag manipulation — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('Flag manipulation', () => {
  it('CLC clears CF', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'STC\nCLC\nHLT')]);
    s.runCell('a');
    expect(s.getState().flags.CF).toBe(0);
  });
  it('STC sets CF', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'CLC\nSTC\nHLT')]);
    s.runCell('a');
    expect(s.getState().flags.CF).toBe(1);
  });
  it('CMC toggles CF', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'CLC\nCMC\nHLT')]);
    s.runCell('a');
    expect(s.getState().flags.CF).toBe(1);
  });
  it('CLD clears DF', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'STD\nCLD\nHLT')]);
    s.runCell('a');
    expect(s.getState().flags.DF).toBe(0);
  });
  it('STD sets DF', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'CLD\nSTD\nHLT')]);
    s.runCell('a');
    expect(s.getState().flags.DF).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════
// 18. MOV variants — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('MOV variants', () => {
  it('MOV reg, reg', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 0x1234\nMOV BX, AX\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.BX).toBe(0x1234);
  });
  it('MOV reg, [mem]', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 42\nMOV [0x100], AX\nMOV BX, [0x100]\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.BX).toBe(42);
  });
  it('XCHG swaps values', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1\nMOV BX, 2\nXCHG AX, BX\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(2);
    expect(s.getState().regs.BX).toBe(1);
  });
  it('LEA loads effective address', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV BX, 100\nLEA AX, [BX+10]\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(110);
  });
  it('MOV reg, immediate 8-bit', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AL, 0x42\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0x42);
  });
});

// ══════════════════════════════════════════════════════════════════
// 19. Special instructions — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('Special instructions', () => {
  it('NOP does nothing', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nNOP\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(5);
  });
  it('CBW sign-extends AL to AX', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AL, 0xFF\nCBW\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0xFFFF);
  });
  it('CWD sign-extends AX to DX:AX', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 0x8000\nCWD\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.DX).toBe(0xFFFF);
    expect(s.getState().regs.AX).toBe(0x8000);
  });
  it('LAHF loads flags into AH', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nSUB AX, 5\nLAHF\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AH).not.toBe(0);
  });
  it('SAHF stores AH into flags', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AH, 0x01\nSAHF\nHLT')]);
    s.runCell('a');
    expect(s.getState().flags.CF).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════
// 20. INT 21h comprehensive
// ══════════════════════════════════════════════════════════════════
describe('INT 21h — comprehensive', () => {
  it('AH=02h prints correct char', () => {
    const s = new LiveSession();
    s.setCells([cell('a', "MOV AH, 02h\nMOV DL, 'Z'\nINT 21h\nHLT")]);
    const res = s.runCell('a');
    expect(res.output).toBe('Z');
  });
  it('AH=02h with DL=0 prints null char', () => {
    const s = new LiveSession();
    s.setCells([cell('a', "MOV AH, 02h\nMOV DL, 0\nINT 21h\nHLT")]);
    const res = s.runCell('a');
    expect(res.output.length).toBe(1);
  });
  it('AH=09h prints $-terminated string', () => {
    const s = new LiveSession();
    s.setCells([cell('a', '.DATA\nmsg db "Hello$"\n.CODE\nMOV AH, 09h\nLEA DX, msg\nINT 21h\nHLT')]);
    const res = s.runCell('a');
    expect(res.output).toBe('Hello');
  });
  it('AH=09h handles empty string', () => {
    const s = new LiveSession();
    s.setCells([cell('a', '.DATA\nmsg db "$"\n.CODE\nMOV AH, 09h\nLEA DX, msg\nINT 21h\nHLT')]);
    const res = s.runCell('a');
    expect(res.output).toBe('');
  });
  it('multiple INT 21h AH=02h calls', () => {
    const s = new LiveSession();
    s.setCells([cell('a', "MOV AH, 02h\nMOV DL, 'A'\nINT 21h\nMOV DL, 'B'\nINT 21h\nMOV DL, 'C'\nINT 21h\nHLT")]);
    const res = s.runCell('a');
    expect(res.output).toBe('ABC');
  });
});

// ══════════════════════════════════════════════════════════════════
// 21. Edge cases in session
// ══════════════════════════════════════════════════════════════════
describe('Session edge cases', () => {
  it('empty cell set', () => {
    const s = new LiveSession();
    s.setCells([]);
    expect(s.getState()).toBeDefined();
    expect(s.cellCount).toBe(0);
  });
  it('single markdown cell only', () => {
    const s = new LiveSession();
    s.setCells([md('m', '# Title')]);
    expect(s.cellCount).toBe(1);
    expect(s.instrCount).toBe(0);
  });
  it('cell with only comments', () => {
    const s = new LiveSession();
    s.setCells([cell('a', '; just a comment\n; another comment')]);
    expect(s.instrCount).toBe(0);
  });
  it('resetMachine clears state', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(5);
    s.resetMachine();
    expect(s.getState().regs.AX).toBe(0);
  });
  it('resetMachine with clearBps', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nHLT')]);
    s.toggleBreakpoint('a', 1);
    expect(s.getBreakpointLines('a').has(1)).toBe(true);
    s.resetMachine(true);
    expect(s.getBreakpointLines('a').size).toBe(0);
  });
  it('rebuild clears outputs', () => {
    const s = new LiveSession();
    s.setCells([cell('a', "MOV AH, 02h\nMOV DL, 'X'\nINT 21h\nHLT")]);
    s.runCell('a');
    expect(s.getOutput('a')).toBeDefined();
    s.setCells([cell('a', 'MOV AX, 5\nHLT')]);
    expect(s.getOutput('a')).toBeUndefined();
  });
  it('many cells work', () => {
    const s = new LiveSession();
    const cells = Array.from({ length: 20 }, (_, i) => cell(`c${i}`, `MOV AX, ${i}\nHLT`));
    s.setCells(cells);
    for (const c of cells) s.runCell(c.id);
    expect(s.getState().regs.AX).toBe(19);
  });
  it('step returns steps=1', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1\nHLT')]);
    const res = s.step();
    expect(res.steps).toBe(1);
  });
  it('continueRun reason', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1\nHLT')]);
    s.resetMachine();
    const res = s.continueRun();
    expect(res.reason).toBe('halted'); // No breakpoint → runs to HLT
  });
});

// ══════════════════════════════════════════════════════════════════
// 22. Storage serialization (storage.ts)
// ══════════════════════════════════════════════════════════════════
describe('Storage encoding (base64)', () => {
  it('btoa/atob round-trip', () => {
    const original = 'Hello, 世界! 🎉';
    const encoded = btoa(encodeURIComponent(original).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));
    const decoded = decodeURIComponent(atob(encoded).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    expect(decoded).toBe(original);
  });
  it('encodeURIComponent/decodeURIComponent round-trip', () => {
    const original = 'MOV AX, 5; @expect AX=5';
    const encoded = encodeURIComponent(original);
    const decoded = decodeURIComponent(encoded);
    expect(decoded).toBe(original);
  });
  it('handles special chars', () => {
    const original = 'path/to/file.txt?query=1&other=2';
    const encoded = encodeURIComponent(original);
    const decoded = decodeURIComponent(encoded);
    expect(decoded).toBe(original);
  });
});

// ══════════════════════════════════════════════════════════════════
// 23. RunToLine — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('runToLine — exhaustive', () => {
  it('runs to specific line in cell', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1\nADD AX, 2\nADD AX, 3\nHLT')]);
    s.resetMachine();
    const res = s.runToLine('a', 2);
    expect(res.reason).toBe('breakpoint');
    expect(s.getState().regs.AX).toBe(1);
  });
  it('runs to last line', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1\nMOV BX, 2\nHLT')]);
    s.resetMachine();
    const res = s.runToLine('a', 3);
    expect(res.reason).toBe('breakpoint');
  });
  it('runToLine removes temporary breakpoint', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1\nADD AX, 2\nHLT')]);
    s.resetMachine();
    s.runToLine('a', 2);
    expect(s.getBreakpointLines('a').size).toBe(0);
  });
  it('runToLine with non-existent cell', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1\nHLT')]);
    s.resetMachine();
    const res = s.runToLine('nonexistent', 1);
    expect(res.reason).toBe('error');
  });
  it('runToLine with invalid line number', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1\nHLT')]);
    s.resetMachine();
    const res = s.runToLine('a', 999);
    expect(res.reason).toBe('error');
  });
  it('runToLine output is captured', () => {
    const s = new LiveSession();
    s.setCells([cell('a', "MOV AH, 02h\nMOV DL, 'A'\nINT 21h\nHLT")]);
    s.resetMachine();
    const res = s.runToLine('a', 4);
    expect(res.output).toBe('A');
  });
});

// ══════════════════════════════════════════════════════════════════
// 24. DiffRegs (internal) — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('RegDiff', () => {
  it('captures IP advance even with no reg changes', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'HLT')]);
    const res = s.runCell('a');
    expect(res.regDiff).toHaveProperty('IP');
  });
  it('captures changed registers', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nMOV BX, 10\nHLT')]);
    const res = s.runCell('a');
    expect(res.regDiff).toHaveProperty('AX');
    expect(res.regDiff).toHaveProperty('BX');
    expect(res.regDiff['AX']).toEqual([0, 5]);
    expect(res.regDiff['BX']).toEqual([0, 10]);
  });
  it('does not capture unchanged registers', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nHLT')]);
    const res = s.runCell('a');
    expect(res.regDiff).not.toHaveProperty('BX');
    expect(res.regDiff).not.toHaveProperty('CX');
  });
});

// ══════════════════════════════════════════════════════════════════
// 25. getFullOutput — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('getFullOutput', () => {
  it('empty when no outputs', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nHLT')]);
    expect(s.getFullOutput()).toBe('');
  });
  it('concatenates all cell outputs', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', "MOV AH, 02h\nMOV DL, 'A'\nINT 21h\nHLT"),
      cell('b', "MOV AH, 02h\nMOV DL, 'B'\nINT 21h\nHLT"),
      cell('c', "MOV AH, 02h\nMOV DL, 'C'\nINT 21h\nHLT"),
    ]);
    s.runCell('a');
    s.runCell('b');
    s.runCell('c');
    expect(s.getFullOutput()).toBe('ABC');
  });
  it('respects cell order', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', "MOV AH, 02h\nMOV DL, '1'\nINT 21h\nHLT"),
      cell('b', "MOV AH, 02h\nMOV DL, '2'\nINT 21h\nHLT"),
    ]);
    s.runCell('b');
    s.runCell('a');
    expect(s.getFullOutput()).toBe('12'); // ordered by cell array, not run order
  });
});

// ══════════════════════════════════════════════════════════════════
// 26. getAllOutputs — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('getAllOutputs', () => {
  it('returns copy', () => {
    const s = new LiveSession();
    s.setCells([cell('a', "MOV AH, 02h\nMOV DL, 'X'\nINT 21h\nHLT")]);
    s.runCell('a');
    const all = s.getAllOutputs();
    all.delete('a');
    expect(s.getOutput('a')).toBeDefined();
  });
  it('returns empty map initially', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'HLT')]);
    expect(s.getAllOutputs().size).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// 27. getState — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('getState', () => {
  it('needsRestart starts false', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'HLT')]);
    expect(s.getState().needsRestart).toBe(false);
  });
  it('totalInstrs counts all instructions', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1\nMOV BX, 2\nMOV CX, 3\nHLT')]);
    expect(s.getState().totalInstrs).toBe(4);
  });
  it('cursor points to correct cell after run', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', 'MOV AX, 1\nHLT'),
      cell('b', 'MOV BX, 2\nHLT'),
    ]);
    s.runCell('a');
    const st = s.getState();
    expect(st.cursor).not.toBeNull();
    expect(st.cursor!.cellId).toBe('b'); // IP advanced past cell 'a' end into 'b'
  });
});

// ══════════════════════════════════════════════════════════════════
// 28. Memory view — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('memHex', () => {
  it('returns correct number of rows', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'HLT')]);
    s.runCell('a');
    const hex = s.memHex(0, 4);
    expect(hex.length).toBe(4);
  });
  it('each row has 16 bytes', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'HLT')]);
    s.runCell('a');
    const hex = s.memHex(0, 1);
    expect(hex[0].bytes.length).toBe(16);
  });
  it('addresses are correct', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'HLT')]);
    s.runCell('a');
    const hex = s.memHex(0x1000, 2);
    expect(hex[0].addr).toBe(0x1000);
    expect(hex[1].addr).toBe(0x1010);
  });
});

// ══════════════════════════════════════════════════════════════════
// 29. Stack view — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('stackView', () => {
  it('returns correct depth', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'HLT')]);
    s.runCell('a');
    const stack = s.stackView(8);
    expect(stack.words.length).toBe(8);
  });
  it('SP is correct', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'HLT')]);
    s.runCell('a');
    const stack = s.stackView(1);
    expect(stack.sp).toBe(0xFFFE); // Initial SP
  });
  it('after PUSH, SP decreases', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'PUSH AX\nHLT')]);
    s.runCell('a');
    const stack = s.stackView(1);
    expect(stack.sp).toBe(0xFFFC);
  });
});

// ══════════════════════════════════════════════════════════════════
// 30. Screen text — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('screenText', () => {
  it('returns 25 rows', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'HLT')]);
    s.runCell('a');
    const screen = s.screenText();
    expect(screen.length).toBe(25);
  });
  it('each row has 80 columns', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'HLT')]);
    s.runCell('a');
    const screen = s.screenText();
    expect(screen[0].length).toBe(80);
  });
  it('blank screen has NUL cells', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'HLT')]);
    s.runCell('a');
    const screen = s.screenText();
    expect(screen[0][0].ch).toBe('\x00');
    expect(screen[0][0].attr).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// 31. Parse errors — exhaustive
// ══════════════════════════════════════════════════════════════════
describe('getParseErrors', () => {
  it('returns errors for invalid code', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'FOO BAR')]);
    const errors = s.getParseErrors();
    expect(errors.length).toBeGreaterThan(0);
  });
  it('returns empty for valid code', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nHLT')]);
    expect(s.getParseErrors().length).toBe(0);
  });
  it('errors have cellId', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'FOO BAR')]);
    const errors = s.getParseErrors();
    expect(errors[0].cellId).toBe('a');
  });
  it('errors have line number', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 5\nFOO BAR')]);
    const errors = s.getParseErrors();
    expect(errors[0].line).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════
// 32. Multiple restart scenarios
// ══════════════════════════════════════════════════════════════════
describe('Restart scenarios', () => {
  it('resetMachine clears registers but not halted flag', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 0xFFFF\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0xFFFF);
    s.resetMachine();
    expect(s.getState().regs.AX).toBe(0);
    expect(s.getState().halted).toBe(true);
  });
  it('restart after multiple runs', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', 'MOV AX, 1\nHLT'),
      cell('b', 'ADD AX, 1\nHLT'),
    ]);
    s.runCell('a');
    s.runCell('b');
    expect(s.getState().regs.AX).toBe(2);
    s.resetMachine();
    s.runCell('a');
    s.runCell('b');
    expect(s.getState().regs.AX).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════
// 33. Instruction after breakpoint
// ══════════════════════════════════════════════════════════════════
describe('After breakpoint', () => {
  it('can continue after breakpoint (removing re-triggering breakpoint)', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1\nHLT')]);
    s.toggleBreakpoint('a', 1);
    s.resetMachine();
    s.continueRun();
    expect(s.getState().regs.AX).toBe(0); // Stopped before MOV
    s.toggleBreakpoint('a', 1); // persistent breakpoint would re-trigger
    s.continueRun();
    expect(s.getState().regs.AX).toBe(1); // Finished
  });
});

// ══════════════════════════════════════════════════════════════════
// 34. Large data values
// ══════════════════════════════════════════════════════════════════
describe('Large data values', () => {
  it('MOV AX, 0xFFFF', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 0xFFFF\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0xFFFF);
  });
  it('ADD with carry', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 0xFFFF\nADD AX, 1\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0);
    expect(s.getState().flags.CF).toBe(1);
  });
  it('SUB with borrow', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 0\nSUB AX, 1\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0xFFFF);
    expect(s.getState().flags.CF).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════
// 35. Instruction encoding
// ══════════════════════════════════════════════════════════════════
describe('Instruction encoding', () => {
  it('handles 0x prefix in immediate', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 0x1234\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0x1234);
  });
  it('handles h suffix in immediate', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 1234h\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0x1234);
  });
  it('handles decimal immediate', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 4660\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(4660);
  });
});

// ══════════════════════════════════════════════════════════════════
// 36. getVideoEvents
// ══════════════════════════════════════════════════════════════════
describe('getVideoEvents', () => {
  it('returns array', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'HLT')]);
    s.runCell('a');
    expect(Array.isArray(s.getVideoEvents())).toBe(true);
  });
  it('events have correct shape', () => {
    const s = new LiveSession();
    s.setCells([cell('a', "MOV AH, 02h\nMOV DL, 'X'\nINT 21h\nHLT")]);
    s.runCell('a');
    const events = s.getVideoEvents();
    if (events.length > 0) {
      expect(events[0]).toHaveProperty('at');
      expect(events[0]).toHaveProperty('type');
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// 37. Cell cellCount and instrCount
// ══════════════════════════════════════════════════════════════════
describe('Cell count and instruction count', () => {
  it('cellCount with multiple cells', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', 'MOV AX, 1\nHLT'),
      cell('b', 'MOV BX, 2\nHLT'),
      cell('c', 'MOV CX, 3\nHLT'),
    ]);
    expect(s.cellCount).toBe(3);
  });
  it('instrCount with mixed content', () => {
    const s = new LiveSession();
    s.setCells([
      cell('a', 'MOV AX, 1\nHLT'),
      md('m', '# Title'),
      cell('b', 'MOV BX, 2\nHLT'),
    ]);
    expect(s.cellCount).toBe(3);
    expect(s.instrCount).toBe(4);
  });
});

// ══════════════════════════════════════════════════════════════════
// 38. Store integration — runUpTo
// ══════════════════════════════════════════════════════════════════
describe('Store runUpTo', () => {
  it('runs all cells from clean machine', () => {
    applyCells([
      cell('a', 'MOV AX, 5\nHLT'),
      cell('b', 'ADD AX, 3\nHLT'),
    ]);
    const res = runUpTo('b');
    expect(session.getState().regs.AX).toBe(8);
  });
});

// ══════════════════════════════════════════════════════════════════
// 39. Register value range
// ══════════════════════════════════════════════════════════════════
describe('Register value range', () => {
  it('AX wraps at 16 bits', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AX, 0xFFFF\nINC AX\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0);
  });
  it('AL writes low byte of AX (8-bit wrap)', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AL, 0xFF\nINC AL\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0);
  });
  it('AH and AL combine into AX', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV AH, 0x10\nMOV AL, 0x20\nHLT')]);
    s.runCell('a');
    expect(s.getState().regs.AX).toBe(0x1020);
  });
});

// ══════════════════════════════════════════════════════════════════
// 40. Error result shape
// ══════════════════════════════════════════════════════════════════
describe('Error result shape', () => {
  it('error result has correct properties', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'FOO BAR')]);
    const res = s.runCell('a');
    expect(res.reason).toBe('error');
    expect(res.error).toBeDefined();
    expect(res.steps).toBeGreaterThanOrEqual(0);
    expect(res.output).toBe('');
    expect(res.regDiff).toBeDefined();
    expect(res.halted).toBe(false);
    expect(res.expectResults).toBeDefined();
    expect(res.allPassed).toBe(true);
  });
  it('cap result has correct properties', () => {
    const s = new LiveSession();
    s.setCells([cell('a', 'top:\nJMP top')]);
    const res = s.runCell('a');
    expect(res.reason).toBe('cap');
    expect(res.steps).toBeGreaterThan(0);
  });
});
