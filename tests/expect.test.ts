// ================================================================
//  @expect + friendly-errors tests (R2)
//  Run: npm run test:kernel
// ================================================================
import { describe, it, expect } from 'vitest';
import { parseExpectLine, parseExpects, parseNumber, evaluateExpects } from '../src/kernel/expect.js';
import { friendlyParse, friendlyErrors } from '../src/kernel/errors.js';

describe('parseNumber', () => {
  it('parses hex with 0x prefix', () => { expect(parseNumber('0x0005')).toBe(5); expect(parseNumber('0xFF')).toBe(255); });
  it('parses hex with h suffix', () => { expect(parseNumber('0005h')).toBe(5); expect(parseNumber('FFh')).toBe(255); });
  it('parses decimal', () => { expect(parseNumber('42')).toBe(42); expect(parseNumber('0')).toBe(0); });
  it('parses single-char literal', () => { expect(parseNumber("'H'")).toBe(0x48); });
  it('returns null for garbage', () => { expect(parseNumber('notanumber')).toBe(null); });
});

describe('parseExpectLine', () => {
  it('parses register expectations', () => {
    const c = parseExpectLine('; @expect AX=0005');
    expect(c).not.toBeNull(); expect(c!.target).toBe('AX'); expect(c!.expected).toBe(5);
  });
  it('parses flag expectations', () => {
    const c = parseExpectLine('; @expect ZF=1');
    expect(c).not.toBeNull(); expect(c!.target).toBe('ZF'); expect(c!.targetLabel).toBe('ZF (flag)');
  });
  it('parses memory byte', () => {
    const c = parseExpectLine('; @expect [0x100]=42');
    expect(c).not.toBeNull(); expect(c!.expected).toBe(42);
  });
  it('parses screen char', () => {
    const c = parseExpectLine("; @expect screen[0,0]='H'");
    expect(c).not.toBeNull(); expect(c!.target).toBe('SCREEN[0,0]'); expect(c!.expected).toBe(0x48);
  });
  it('returns null for non-@expect lines', () => {
    expect(parseExpectLine('; just a comment')).toBeNull();
    expect(parseExpectLine('MOV AX, 5')).toBeNull();
  });
});

describe('parseExpects (multi-line)', () => {
  it('extracts all @expect clauses', () => {
    const src = '; @expect AX=0005\nMOV AX, 5\n; @expect ZF=0\nHLT';
    const clauses = parseExpects(src);
    expect(clauses.length).toBe(2);
    expect(clauses[0].target).toBe('AX');
    expect(clauses[1].target).toBe('ZF');
  });
});

describe('evaluateExpects', () => {
  const ctx = {
    getReg: (n: string) => ({ AX: 5, BX: 0, CX: 0, DX: 0, SI: 0, DI: 0, BP: 0, SP: 0, CS: 0, DS: 0, ES: 0, SS: 0, IP: 2 }[n.toUpperCase()] ?? null),
    getFlag: (n: string) => ({ ZF: 0, CF: 1, SF: 0, OF: 0, PF: 0, AF: 0, DF: 0, IF: 0, TF: 0 }[n.toUpperCase()] ?? null),
    memReadByte: (a: number) => a === 0x100 ? 42 : 0,
    getScreenChar: (r: number, c: number) => r === 0 && c === 0 ? 0x48 : 0
  };
  it('passes when register matches', () => {
    const r = evaluateExpects(ctx, parseExpects('; @expect AX=0005'));
    expect(r[0].passed).toBe(true); expect(r[0].actual).toBe(5);
  });
  it('fails when register differs', () => {
    const r = evaluateExpects(ctx, parseExpects('; @expect AX=0007'));
    expect(r[0].passed).toBe(false); expect(r[0].actual).toBe(5);
  });
  it('passes on flag value', () => {
    expect(evaluateExpects(ctx, parseExpects('; @expect CF=1'))[0].passed).toBe(true);
  });
  it('evaluates memory byte', () => {
    expect(evaluateExpects(ctx, parseExpects('; @expect [0x100]=42'))[0].passed).toBe(true);
  });
  it('evaluates screen char', () => {
    expect(evaluateExpects(ctx, parseExpects("; @expect screen[0,0]='H'"))[0].passed).toBe(true);
  });
});

describe('friendlyParse', () => {
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
  it('provides a fallback', () => {
    const fe = friendlyParse('something else', 1);
    expect(fe.friendly).toContain('Something went wrong');
  });
});

describe('friendlyErrors (plural)', () => {
  it('maps a list of raw errors', () => {
    const out = friendlyErrors([
      { line: 3, message: "error: unknown mnemonic 'FOO'" },
      { line: 7, message: "error: symbol 'x' not defined" }
    ]);
    expect(out.length).toBe(2);
    expect(out[0].friendly).toContain('Invalid instruction');
    expect(out[1].friendly).toContain('never defined');
  });
});
