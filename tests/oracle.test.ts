// ================================================================
//  Independent 8086 architectural oracle — exhaustive verification
//  --------------------------------------------------------------
//  Contains a *second*, from-scratch reference model of 8086 flag
//  logic (derived from the Intel SDM textbook definitions, NOT
//  copied from engine.mjs) and drives the LIVE engine (CPU +
//  Parser + Executor) over dense Cartesian sweeps, diffing the
//  engine's produced flags/registers against the reference.
//
//  Run: npm run test:kernel -- oracle.test.ts
// ================================================================
import { describe, it, expect } from 'vitest';
import { CPU, Parser, Executor } from '../src/kernel/engine.mjs';

// ── tiny deterministic PRNG (reproducible "random" sweep) ──
let _seed = 0x2a4f_5317;
function lcg() { _seed = (_seed * 1664525 + 1013904223) & 0xffffffff; return (_seed >>> 8) & 0xffff; }
const rnd = (n: number) => (lcg() % n) >>> 0;

// ── run a program on the live engine, return final CPU snapshot ──
function run(code: string, max = 200000): { regs: Record<string, number>; flags: Record<string, number>; err: string | null } {
  const cpu = new CPU();
  const parsed: any = new Parser().parse(code);
  if (parsed.errors.length) return { regs: {}, flags: {}, err: 'parse: ' + parsed.errors.map((e: { message: string }) => e.message).join(' | ') };
  const ex = new Executor(cpu, parsed);
  let err: string | null = null;
  try {
    let steps = 0;
    while (!cpu.halted && cpu.ip < parsed.instrs.length && steps++ < max) ex.step();
    if (steps >= max) err = 'step cap exceeded (possible infinite loop)';
  } catch (e: any) { err = e.message; }
  const regs: Record<string, number> = {};
  for (const k of ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP', 'AL', 'AH', 'BL', 'BH', 'CL', 'CH', 'DL', 'DH']) regs[k] = cpu.getReg(k);
  const flags: Record<string, number> = { CF: 0, PF: 0, AF: 0, ZF: 0, SF: 0, OF: 0 };
  for (const f of ['CF', 'PF', 'AF', 'ZF', 'SF', 'OF']) flags[f] = cpu.flags[f];
  return { regs, flags, err };
}

// ── independent reference model (Intel SDM textbook, not engine) ──
const parity = (v: number) => { let p = v & 0xff; p ^= p >> 4; p ^= p >> 2; p ^= p >> 1; return (p & 1) === 0 ? 1 : 0; };
const sbit = (size: 8 | 16) => (size === 8 ? 0x80 : 0x8000);

function refArith(a: number, b: number, cin: number, size: 8 | 16, kind: 'ADD' | 'SUB') {
  const mask = size === 8 ? 0xff : 0xffff;
  const hi = size === 8 ? 0x100 : 0x10000;
  const r = kind === 'ADD' ? (a + b + cin) : (a - b - cin);
  const res = ((r % hi) + hi) % hi & mask;
  if (kind === 'ADD') {
    const cf = r > mask ? 1 : 0;
    const af = ((a ^ b ^ res) & 0x10) ? 1 : 0;
    const sa = a & sbit(size), sb = b & sbit(size), sr = res & sbit(size);
    const of = (sa === sb && sr !== sa) ? 1 : 0;
    return { res, cf, af, of };
  }
  const cf = (a < (b + cin)) ? 1 : 0;
  const af = ((a ^ b ^ res) & 0x10) ? 1 : 0;
  const sa = a & sbit(size), sb = (b + cin) & sbit(size), sr = res & sbit(size);
  const of = (sa !== sb && sr !== sa) ? 1 : 0;
  return { res, cf, af, of };
}
function refLogic(a: number, b: number, size: 8 | 16, op: 'AND' | 'OR' | 'XOR') {
  const mask = size === 8 ? 0xff : 0xffff;
  const res = op === 'AND' ? a & b : op === 'OR' ? a | b : a ^ b;
  return (res & mask) >>> 0;
}

const BOUND8  = [0, 1, 2, 3, 0x0f, 0x10, 0x11, 0x7e, 0x7f, 0x80, 0x81, 0xee, 0xef, 0xf0, 0xfe, 0xff];
const BOUND16 = [0, 1, 2, 0x7fff, 0x8000, 0x8001, 0xfffe, 0xffff, 0x00ff, 0xff00, 0x1234, 0xabcd];

// ── Jcc reference conditions (Intel SDM), independent of engine ──
function jccTaken(mn: string, f: { CF: number; ZF: number; SF: number; OF: number; PF: number }) {
  const { CF, ZF, SF, OF, PF } = f;
  switch (mn) {
    case 'JE':  case 'JZ':   return !!ZF;
    case 'JNE': case 'JNZ':  return !ZF;
    case 'JB':  case 'JNAE': case 'JC':        return !!CF;
    case 'JAE': case 'JNB':  case 'JNC':       return !CF;
    case 'JBE': case 'JNA':                   return !!CF || !!ZF;
    case 'JA':  case 'JNBE':                  return !CF && !ZF;
    case 'JS':                                return !!SF;
    case 'JNS':                               return !SF;
    case 'JO':                                return !!OF;
    case 'JNO':                               return !OF;
    case 'JP':  case 'JPE':                   return !!PF;
    case 'JNP': case 'JPO':                   return !PF;
    case 'JL':  case 'JNGE':                  return SF !== OF;
    case 'JGE': case 'JNL':                   return SF === OF;
    case 'JLE': case 'JNG':                   return !!ZF || (SF !== OF);
    case 'JG':  case 'JNLE':                  return !ZF && (SF === OF);
    default: throw new Error('unknown jcc ' + mn);
  }
}
const JCC_MNEMONICS = ['JE', 'JZ', 'JNE', 'JNZ', 'JB', 'JNAE', 'JC', 'JAE', 'JNB', 'JNC',
                       'JBE', 'JNA', 'JA', 'JNBE', 'JS', 'JNS', 'JO', 'JNO',
                       'JP', 'JPE', 'JNP', 'JPO', 'JL', 'JNGE', 'JGE', 'JNL',                        'JLE', 'JNG', 'JG', 'JNLE'];

// ── shift/rotate reference (Intel SDM textbook, count masked to 5 bits) ──
function refShift(v: number, cnt: number, size: 8 | 16, op: 'SHL' | 'SHR' | 'SAR' | 'ROL' | 'ROR' | 'RCL' | 'RCR', cfIn: number) {
  const M = size === 8 ? 0xff : 0xffff; const bits = size;
  const cnt5 = cnt & 0x1f;            // 8086 masks count to 5 bits
  if (cnt5 === 0) return { res: v & M, cf: cfIn, of: undefined as number | undefined };
  let res: number;
  let cfVal: number;
  if (op === 'SHL') {
    res = (v << cnt5) & M;
    cfVal = cnt5 > bits ? 0 : (v >> (bits - cnt5)) & 1;
    return { res, cf: cfVal, of: cnt5 === 1 ? (((res >> (bits - 1)) & 1) ^ cfVal) : undefined };
  }
  if (op === 'SHR') {
    res = v >>> cnt5;
    cfVal = cnt5 > bits ? 0 : (v >> (cnt5 - 1)) & 1;
    return { res, cf: cfVal, of: cnt5 === 1 ? ((v >> (bits - 1)) & 1) : undefined };
  }
  if (op === 'SAR') {
    const signed = v > (M >> 1) ? v - (M + 1) : v;
    res = (signed >> cnt5) & M;
    cfVal = cnt5 >= bits ? (signed < 0 ? 1 : 0) : (v >> (cnt5 - 1)) & 1;
    return { res, cf: cfVal, of: cnt5 === 1 ? 0 : undefined };
  }
  if (op === 'ROL') {
    const c = cnt5 % bits;
    res = c === 0 ? (v & M) : (((v << c) | (v >>> (bits - c))) & M);
    cfVal = (v >> (c === 0 ? bits - 1 : bits - c)) & 1;
    return { res, cf: cfVal, of: cnt5 === 1 ? (((res >> (bits - 1)) & 1) ^ (res & 1)) : undefined };
  }
    if (op === 'ROR') {
    const c = cnt5 % bits;
    res = c === 0 ? (v & M) : (((v >>> c) | (v << (bits - c))) & M);
    cfVal = (v >> (c === 0 ? 0 : c - 1)) & 1;
    return { res, cf: cfVal, of: cnt5 === 1 ? (((res >> (bits - 1)) & 1) ^ ((res >> (bits - 2)) & 1)) : undefined };
  }
  // RCL / RCR : rotate through carry, iterative (matches engine)
  const sz = size, width = sz + 1;
  const c = cnt5 % width;
  // Engine computes RCR OF before rotate: OF = MSB(v) ^ cfIn (for cnt5==1)
  const rcrOf = cnt5 === 1 ? (((v >> (sz - 1)) & 1) ^ cfIn) : undefined;
  let cf2 = cfIn, val = v & M;
  if (op === 'RCL') {
    for (let i = 0; i < c; i++) { const nc = (val >> (sz - 1)) & 1; val = ((val << 1) | cf2) & M; cf2 = nc; }
  } else {
    for (let i = 0; i < c; i++) { const nc = val & 1; val = ((val >>> 1) | (cf2 << (sz - 1))) & M; cf2 = nc; }
  }
  res = val;
  return { res, cf: cf2, of: op === 'RCL' ? (cnt5 === 1 ? (((res >> (sz - 1)) & 1) ^ cf2) : undefined) : rcrOf };
}


const ALL_REGS16 = ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP'];

// ================================================================
// 1. ADD / SUB / ADC / SBB — boundary × boundary + random sample
// ================================================================
describe('Oracle: ADD/SUB/ADC/SBB flag matrix', () => {
  const specs = [
    { mn: 'ADD', kind: 'ADD' as const, cin: 0, pre: '' },
    { mn: 'ADC', kind: 'ADD' as const, cin: 1, pre: 'STC\n' },
    { mn: 'SUB', kind: 'SUB' as const, bin: 0, pre: '' },
        { mn: 'SBB', kind: 'SUB' as const, bin: 1, pre: 'STC\n' },
  ];
  for (const { mn, kind, cin: cinN, pre } of specs) {
    it(`${mn}8 flags match reference on bound × bound (${BOUND8.length * BOUND8.length} pairs)`, () => {
      let fails = 0;
      for (const a of BOUND8) for (const b of BOUND8) {
        const code = `${pre}MOV AL, ${a}\n${mn} AL, ${b}\nHLT`;
        const { flags, err } = run(code);
        if (err) { fails++; continue; }
                const cin = mn === 'ADC' || mn === 'SBB' ? 1 : 0;
        const ref = refArith(a, b, cin, 8, kind);
        if (flags.CF !== ref.cf || flags.AF !== ref.af || flags.OF !== ref.of) { fails++; continue; }
        const res = ref.res & 0xff;
        if (flags.SF !== ((res & 0x80) ? 1 : 0) || flags.ZF !== (res === 0 ? 1 : 0) || flags.PF !== parity(res)) fails++;
      }
      expect(fails, `${mn}8 mismatch count`).toBe(0);
    });
    it(`${mn}16 flags match reference on bound × bound (${BOUND16.length * BOUND16.length} pairs)`, () => {
      let fails = 0;
      for (const a of BOUND16) for (const b of BOUND16) {
        const code = `${pre}MOV AX, ${a}\n${mn} AX, ${b}\nHLT`;
        const { flags, err } = run(code);
        if (err) { fails++; continue; }
                const cin = mn === 'ADC' || mn === 'SBB' ? 1 : 0;
        const ref = refArith(a, b, cin, 16, kind);
        if (flags.CF !== ref.cf || flags.AF !== ref.af || flags.OF !== ref.of) { fails++; continue; }
        const res = ref.res & 0xffff;
        if (flags.SF !== ((res & 0x8000) ? 1 : 0) || flags.ZF !== (res === 0 ? 1 : 0) || flags.PF !== parity(res)) fails++;
      }
      expect(fails, `${mn}16 mismatch count`).toBe(0);
    });
  }

  it('ADD8 matches reference on a randomised sample of 600 pairs', () => {
    _seed = 0x2a4f_5317; let fails = 0;
    for (let i = 0; i < 600; i++) {
      const a = rnd(256), b = rnd(256);
      const { flags } = run(`MOV AL, ${a}\nADD AL, ${b}\nHLT`);
      const ref = refArith(a, b, 0, 8, 'ADD');
      if (flags.CF !== ref.cf || flags.AF !== ref.af || flags.OF !== ref.of) fails++;
      const res = ref.res & 0xff;
      if (flags.SF !== ((res & 0x80) ? 1 : 0) || flags.ZF !== (res === 0 ? 1 : 0) || flags.PF !== parity(res)) fails++;
    }
    expect(fails, 'ADD8 random mismatches').toBe(0);
  });
});

// ================================================================
// 2. INC / DEC — every byte value, all flags (CF preserved)
// ================================================================
describe('Oracle: INC/DEC over all 256 byte values', () => {
  it('INC8 flags match reference for all 256 inputs (CF preserved=1)', () => {
    let fails = 0;
    for (let v = 0; v < 256; v++) {
      const { flags } = run(`STC\nMOV AL, ${v}\nINC AL\nHLT`);
      const ref = refArith(v, 1, 0, 8, 'ADD');
      if (flags.CF !== 1) fails++;                                    // CF untouched
      else if (flags.AF !== ref.af || flags.OF !== ref.of) fails++;
      else if (flags.SF !== ((ref.res & 0x80) ? 1 : 0)) fails++;
      else if (flags.ZF !== (ref.res === 0 ? 1 : 0)) fails++;
      else if (flags.PF !== parity(ref.res)) fails++;
    }
    expect(fails, 'INC8 mismatch count').toBe(0);
  });
  it('DEC8 flags match reference for all 256 inputs (CF preserved=1)', () => {
    let fails = 0;
    for (let v = 0; v < 256; v++) {
      const { flags } = run(`STC\nMOV AL, ${v}\nDEC AL\nHLT`);
      if (flags.CF !== 1) fails++;
      else {
        const res = (v - 1) & 0xff;
        const of = v === 0x80 ? 1 : 0;              // DEC 0x80 → 0x7F crosses sign
        if (flags.ZF !== (res === 0 ? 1 : 0)) fails++;
        else if (flags.SF !== ((res & 0x80) ? 1 : 0)) fails++;
        else if (flags.PF !== parity(res)) fails++;
        else if (flags.OF !== of) fails++;
        // AF: borrow from bit 3 when low nibble of v < 1
        const af = (v & 0xf) < 1 ? 1 : 0;
        if (flags.AF !== af) fails++;
      }
    }
        expect(fails, 'DEC8 mismatch count').toBe(0);
  });
});

// ================================================================
// 3. Logic ops (AND/OR/XOR/TEST) — CF=OF=0, SZP from result
// ================================================================
describe('Oracle: AND/OR/XOR/TEST flags', () => {
  for (const op of ['AND', 'OR', 'XOR', 'TEST'] as ('AND' | 'OR' | 'XOR' | 'TEST')[]) {
    it(`${op}8 flags match reference on bound × bound`, () => {
      let fails = 0;
      for (const a of BOUND8) for (const b of BOUND8) {
        const { flags, err } = run(`MOV AL, ${a}\n${op} AL, ${b}\nHLT`);
        if (err) { fails++; continue; }
        if (flags.CF !== 0 || flags.OF !== 0) { fails++; continue; }
        const res = refLogic(a, b, 8, op === 'TEST' ? 'AND' : op) & 0xff;
        if (flags.SF !== ((res & 0x80) ? 1 : 0) || flags.ZF !== (res === 0 ? 1 : 0) || flags.PF !== parity(res)) fails++;
      }
      expect(fails, `${op}8 mismatch count`).toBe(0);
    });
    it(`${op}16 flags match reference on bound × bound`, () => {
      let fails = 0;
      for (const a of BOUND16) for (const b of BOUND16) {
        const { flags, err } = run(`MOV AX, ${a}\n${op} AX, ${b}\nHLT`);
        if (err) { fails++; continue; }
        if (flags.CF !== 0 || flags.OF !== 0) { fails++; continue; }
        const res = refLogic(a, b, 16, op === 'TEST' ? 'AND' : op) & 0xffff;
        if (flags.SF !== ((res & 0x8000) ? 1 : 0) || flags.ZF !== (res === 0 ? 1 : 0) || flags.PF !== parity(res)) fails++;
      }
          expect(fails, `${op}16 mismatch count`).toBe(0);
    });
  }
});

// ================================================================
// 4. Shifts & rotates — operand sweep × count 0..size+1, CF/OF
// ================================================================
describe('Oracle: shift/rotate flag + result matrix', () => {
  const rops: ('SHL' | 'SHR' | 'SAR' | 'ROL' | 'ROR' | 'RCL' | 'RCR')[] =
    ['SHL', 'SHR', 'SAR', 'ROL', 'ROR', 'RCL', 'RCR'];
  for (const op of rops) {
    it(`${op}8 result+CF+OF match textbook across operand×count`, () => {
      let fails = 0, checked = 0;
      for (const cfIn of [0, 1] as const) {
        for (const v of BOUND8) for (let c = 0; c <= 9; c++) {
          checked++;
          const pre = cfIn === 1 ? 'STC\n' : 'CLC\n';
          const { regs, flags, err } = run(`${pre}MOV AL, ${v}\n${op} AL, ${c}\nHLT`);
          if (err) { fails++; continue; }
          const ref = refShift(v, c, 8, op, cfIn);
          if ((regs.AL & 0xff) !== ref.res) fails++;
          else if (flags.CF !== ref.cf) fails++;
          else if (ref.of !== undefined && flags.OF !== ref.of) fails++;
        }
      }
            expect(fails, `${op}8: ${fails}/${checked} mismatches`).toBe(0);
    });
    it(`${op}16 result+CF+OF match textbook across operand×count`, () => {
      let fails = 0, checked = 0;
      for (const cfIn of [0, 1] as const) {
        for (const v of BOUND16) for (let c = 0; c <= 17; c++) {
          checked++;
          const pre = cfIn === 1 ? 'STC\n' : 'CLC\n';
          const { regs, flags, err } = run(`${pre}MOV AX, ${v}\n${op} AX, ${c}\nHLT`);
          if (err) { fails++; continue; }
          const ref = refShift(v, c, 16, op, cfIn);
          if ((regs.AX & 0xffff) !== ref.res) fails++;
          else if (flags.CF !== ref.cf) fails++;
          else if (ref.of !== undefined && flags.OF !== ref.of) fails++;
        }
      }
      expect(fails, `${op}16: ${fails}/${checked} mismatches`).toBe(0);
    });
  }
});

// ================================================================
// 5. Jcc truth table — 64 flag combos × 30 flag-based mnemonics
// ================================================================
const FLAG_NAMES = ['CF', 'PF', 'AF', 'ZF', 'SF', 'OF'] as const;
describe('Oracle: full Jcc truth table (64 combos × 30 mnemonics)', () => {
  let checked = 0, mismatches = 0;
  for (let combo = 0; combo < 64; combo++) {
    const f: { CF: number; ZF: number; SF: number; OF: number; PF: number } =
      { CF: 0, ZF: 0, SF: 0, OF: 0, PF: 0 };
    f.CF = (combo >> 0) & 1; f.PF = (combo >> 1) & 1; f.ZF = (combo >> 3) & 1;
    f.SF = (combo >> 4) & 1; f.OF = (combo >> 5) & 1;
    for (const mn of JCC_MNEMONICS) {
      checked++;
      const expected = jccTaken(mn, f) ? 1 : 0;
      const cpu = new CPU();
      cpu.flags.CF = f.CF; cpu.flags.PF = f.PF; cpu.flags.ZF = f.ZF;
      cpu.flags.SF = f.SF; cpu.flags.OF = f.OF;
      const code = `${mn} taken\nMOV BX, 0\nJMP done\ntaken:\nMOV BX, 1\ndone:\nHLT`;
      const parsed: any = new Parser().parse(code);
      const ex = new Executor(cpu, parsed);
      let steps = 0, err: string | null = null;
      try { while (!cpu.halted && cpu.ip < parsed.instrs.length && steps++ < 50) ex.step(); }
      catch (e: any) { err = e.message; }
      const got = cpu.getReg('BX');
      if (err || got !== expected) mismatches++;
    }
  }
  it(`checked ${64 * JCC_MNEMONICS.length} cases`, () => { expect(checked).toBe(64 * JCC_MNEMONICS.length); });
  it('every Jcc agrees with textbook (0 mismatches)', () => {
    expect(mismatches, `${mismatches} Jcc truth-table mismatches out of ${checked}`).toBe(0);
  });
});

// ================================================================
// 6. MUL / IMUL / DIV / IDIV — boundary + overflow
// ================================================================
describe('Oracle: MUL/IMUL/DIV/IDIV boundaries', () => {
  it('MUL8 0xFF*0xFF=0xFE01, CF=OF=1', () => {
    const { regs, flags } = run('MOV AL, 0FFh\nMOV BL, 0FFh\nMUL BL\nHLT');
    expect(regs.AX).toBe(0xfe01); expect(flags.CF).toBe(1); expect(flags.OF).toBe(1);
  });
  it('MUL8 0*0xFF=0, CF=OF=0', () => {
    const { regs, flags } = run('MOV AL, 0\nMOV BL, 0FFh\nMUL BL\nHLT');
    expect(regs.AX).toBe(0); expect(flags.CF).toBe(0); expect(flags.OF).toBe(0);
  });
  it('MUL16 0xFFFF*0xFFFF=0xFFFE:0x0001, CF=OF=1', () => {
    const { regs, flags } = run('MOV AX, 0FFFFh\nMOV BX, 0FFFFh\nMUL BX\nHLT');
    expect(regs.AX).toBe(0x0001); expect(regs.DX).toBe(0xfffe); expect(flags.CF).toBe(1); expect(flags.OF).toBe(1);
  });
  it('MUL8 128*2=256 → AX=0x0100, CF=OF=1', () => {
    const { regs, flags } = run('MOV AL, 80h\nMOV BL, 2\nMUL BL\nHLT');
    expect(regs.AX).toBe(0x0100); expect(flags.CF).toBe(1); expect(flags.OF).toBe(1);
  });
  it('IMUL8 -1*-1=1, CF=OF=0', () => {
    const { regs, flags } = run('MOV AL, 0FFh\nMOV BL, 0FFh\nIMUL BL\nHLT');
    expect(regs.AX).toBe(1); expect(flags.CF).toBe(0); expect(flags.OF).toBe(0);
  });
  it('IMUL8 -128*-128=0x4000, CF=OF=1', () => {
    const { regs, flags } = run('MOV AL, 80h\nMOV BL, 80h\nIMUL BL\nHLT');
    expect(regs.AX).toBe(0x4000); expect(flags.CF).toBe(1); expect(flags.OF).toBe(1);
  });
  it('IMUL16 -2*3=-6 → DX:AX=0xFFFF:0xFFFA, CF=OF=0', () => {
    const { regs, flags } = run('MOV AX, 0FFFEh\nMOV BX, 3\nIMUL BX\nHLT');
    expect(regs.AX).toBe(0xfffa); expect(regs.DX).toBe(0xffff); expect(flags.CF).toBe(0); expect(flags.OF).toBe(0);
  });
  it('DIV8 0x0100/2 → AL=0x80, AH=0', () => {
    const { regs } = run('MOV AX, 0100h\nMOV BL, 2\nDIV BL\nHLT');
    expect(regs.AL).toBe(0x80); expect(regs.AH).toBe(0);
  });
    it('IDIV8 -10/3 → AL=0xFD, AH=0xFF', () => {
    const { regs, err } = run('MOV AX, 0FFF6h\nMOV BL, 3\nIDIV BL\nHLT');
    expect(err).toBeNull();
    expect(regs.AL).toBe(0xfd); expect(regs.AH).toBe(0xff);
  });
  it('IDIV8 -1/-1 overflow (0x8000/-1) → error', () => {
    const { err } = run('MOV AX, 8000h\nMOV BL, 0FFh\nIDIV BL\nHLT');
        expect(err).toMatch(/overflow|Divide/i);
  });
});

// ================================================================
// 7. String ops — MOVS/REP + SCAS/CMPS termination, DF ±
// ================================================================
describe('Oracle: string instructions', () => {
  it('REP MOVSB copies CX bytes forward, clears CX', () => {
    const code =
      'MOV SI, 1000h\nMOV DI, 2000h\nMOV CX, 3\n' +
      'MOV BYTE PTR [SI], 41h\nMOV BYTE PTR [SI+1], 42h\nMOV BYTE PTR [SI+2], 43h\n' +
      'CLD\nREP MOVSB\nHLT';
    const { regs, err } = run(code);
    expect(err).toBeNull();
    expect(regs.CX).toBe(0);
        expect(regs.SI).toBe(0x1003);
    expect(regs.DI).toBe(0x2003);
  });
    it('MOVSB single step copies byte SI→DI, then SEGS stays at source', () => {
    const code = 'MOV SI, 1000h\nMOV DI, 2000h\nMOV BYTE PTR [SI], 55h\nCLD\nMOVSB\nMOV AL, [DI-1]\nHLT';
    const { regs, err } = run(code);
    expect(err).toBeNull();
    expect(regs.AL).toBe(0x55);    // byte copied to ES:DI-1 (now 0x55 since DI was incremented)
  });
  it('REP MOVSB backward (DF=1) copies and decrements', () => {
    const code =
      'MOV SI, 1002h\nMOV DI, 2002h\nMOV CX, 3\n' +
      'MOV BYTE PTR [SI], 43h\nMOV BYTE PTR [SI-1], 42h\nMOV BYTE PTR [SI-2], 41h\n' +
      'STD\nREP MOVSB\nHLT';
    const { regs, err } = run(code);
    expect(err).toBeNull();
    expect(regs.SI).toBe(0x0fff);
    expect(regs.DI).toBe(0x1fff);
  });
  it('SCASB forward sets CF from CMP (0x61 - 0x62 → borrow)', () => {
    const { flags, err } = run('MOV DI, 3000h\nMOV AL, 61h\nMOV BYTE PTR [DI], 62h\nCLD\nSCASB\nHLT');
    expect(err).toBeNull();
    expect(flags.CF).toBe(1);           // 97 < 98 unsigned
    expect(flags.ZF).toBe(0);
    expect(flags.PF).toBe(parity(0xff));
  });
  it('REPE SCASB stops at first mismatch (CX 3→2)', () => {
    const code =
      'MOV DI, 4000h\nMOV AL, 71h\nMOV BYTE PTR [DI], 72h\n' +
      'MOV BYTE PTR [DI+1], 71h\nMOV BYTE PTR [DI+2], 71h\nMOV CX, 3\nCLD\nREPE SCASB\nHLT';
    const { regs, err } = run(code);
    expect(err).toBeNull();
    expect(regs.CX).toBe(2);            // one scan consumed the mismatch
    expect(regs.DI).toBe(0x4001);
  });
});

// ================================================================
// 8. Stack — PUSH/POP LIFO over all regs + CALL/RET balance
// ================================================================
describe('Oracle: stack LIFO + CALL/RET balance', () => {
  it('PUSH/POP round-trips every 16-bit GPR', () => {
    for (const reg of ALL_REGS16) {
      const { regs } = run(`MOV ${reg}, 1234h\nPUSH ${reg}\nPOP AX\nHLT`);
      expect(regs.AX).toBe(0x1234);
    }
  });
  it('PUSH AX/BX/CX/DX then POP reverse → values swap (LIFO)', () => {
    const { regs } = run(
      'MOV AX, 1111h\nMOV BX, 2222h\nMOV CX, 3333h\nMOV DX, 4444h\n' +
      'PUSH AX\nPUSH BX\nPUSH CX\nPUSH DX\n' +
      'POP AX\nPOP BX\nPOP CX\nPOP DX\nHLT');
    expect(regs.AX).toBe(0x4444); expect(regs.BX).toBe(0x3333);
    expect(regs.CX).toBe(0x2222); expect(regs.DX).toBe(0x1111);
  });
  it('PUSH/POP byte registers via MOV into AX (AL/AH distinct)', () => {
    const { regs } = run('MOV AL, 11h\nMOV AH, 22h\nMOV BL, 33h\nMOV BH, 44h\nPUSH AX\nPUSH BX\nPOP CX\nPOP DX\nHLT');
    // LIFO: last pushed BX→CX, first pushed AX→DX
    expect(regs.CX).toBe(0x4433); expect(regs.DX).toBe(0x2211);
  });
  it('CALL/RET balanced across 3 nested levels → SP restored, AX accumulated', () => {
    const code =
      'MOV SP, 0FFFEh\nXOR AX, AX\nCALL l1\nHLT\n' +
      'l1:\nADD AX, 1\nCALL l2\nRET\nl2:\nADD AX, 10\nCALL l3\nRET\nl3:\nADD AX, 100\nRET\nHLT';
    const { regs, err } = run(code);
    expect(err).toBeNull();
    expect(regs.SP).toBe(0xfffe);
    expect(regs.AX).toBe(111);
  });
  it('RET n (callee-pops) restores SP + n after CALL', () => {
    // SP=FFF6, CALL pushes 2 → SP=FFF4, RET 4 pops 2 + adds 4 → SP = FFF4+2+4 = FFFA
    const code =
      'MOV SP, 0FFF6h\nCALL sub\nJMP hang\nsub:\nRET 4\nhang:\nHLT';
    const { regs, err } = run(code);
    expect(err).toBeNull();
    expect(regs.SP).toBe(0xfffa);
  });
});





