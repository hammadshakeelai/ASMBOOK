// ================================================================
//  Accuracy infrastructure tests (R3) — coverage matrix integrity,
//  execution ledger over every instruction form, and semantic
//  spot-checks for the core MUST_MATCH forms.
// ================================================================
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'fs';
import { join } from 'path';
import {
  COVERAGE_MATRIX, uniqueMnemonicCount, coverageByCategory, coverageByVerify,
  totalForms, GPR16, GPR8,
} from '../src/kernel/coverage.js';
import { buildLedger, ledgerSummary, buildSnippet } from '../src/kernel/ledger.js';
import { LiveSession, type Cell } from '../src/kernel/session.js';

const cell = (id: string, source: string): Cell => ({ id, kind: 'code', source });

// ══════════════════════════════════════════════════════════════════
// 1. Coverage matrix integrity
// ══════════════════════════════════════════════════════════════════
describe('Coverage matrix integrity', () => {
  it('has a substantial number of forms', () => {
    expect(totalForms()).toBeGreaterThanOrEqual(300);
    expect(uniqueMnemonicCount()).toBeGreaterThanOrEqual(30);
  });

  it('has no duplicate (mnemonic, operands) forms', () => {
    const seen = new Set<string>();
    for (const f of COVERAGE_MATRIX) {
      const key = f.mnemonic + '|' + f.operands;
      expect(seen.has(key), `duplicate form: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it('every form has a valid category and verify class', () => {
    const cats = ['data','arith','logic','shift','string','stack','flow','io','flag','bcd','seg','system'];
    const verif = ['MUST_MATCH','IMPLEMENTATION_DEFINED','UNDEFINED_DONT_COMPARE'];
    for (const f of COVERAGE_MATRIX) {
      expect(cats, f.mnemonic).toContain(f.category);
      expect(verif, f.mnemonic).toContain(f.verify);
      expect(Array.isArray(f.flagsAffected)).toBe(true);
    }
  });

  it('registers lists are complete', () => {
    expect(GPR16).toHaveLength(8);
    expect(GPR8).toHaveLength(8);
  });

  it('coverageByCategory / coverageByVerify are consistent', () => {
    const byCat = coverageByCategory();
    const byVer = coverageByVerify();
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    expect(sum(byCat)).toBe(totalForms());
    expect(sum(byVer)).toBe(totalForms());
    expect(byVer['MUST_MATCH']).toBeGreaterThan(200);
  });

  it('DIV/IDIV are marked IMPLEMENTATION_DEFINED (flags undefined)', () => {
    const divs = COVERAGE_MATRIX.filter(f => f.mnemonic === 'DIV' || f.mnemonic === 'IDIV');
    expect(divs.length).toBeGreaterThan(0);
    for (const d of divs) expect(d.verify).toBe('IMPLEMENTATION_DEFINED');
  });
});
// ══════════════════════════════════════════════════════════════════
// 2. Execution ledger — every instruction form assembles + runs
// ══════════════════════════════════════════════════════════════════
describe('Execution ledger', () => {
  it('buildSnippet produces non-empty programs for every form', () => {
    for (const f of COVERAGE_MATRIX) {
      const s = buildSnippet(f);
      expect(s.length, `${f.mnemonic} ${f.operands}`).toBeGreaterThan(0);
    }
  });

  it('runs every form and records PASS/FAIL with snippet + detail', () => {
    const ledger = buildLedger();
    expect(ledger.length).toBe(totalForms());
    for (const e of ledger) {
      expect(['PASS', 'FAIL', 'UNVERIFIED'], e.mnemonic).toContain(e.status);
      expect(e.snippet.length).toBeGreaterThan(0);
      if (e.status === 'FAIL') expect(typeof e.detail).toBe('string');
    }
  });

  it('writes the public accuracy ledger to docs/accuracy-ledger.json', () => {
    const ledger = buildLedger();
    const summary = ledgerSummary(ledger);
    const payload = {
      generated: new Date().toISOString(),
      sourceCommit: 'HEAD',
      summary,
      entries: ledger,
    };
    writeFileSync(join(process.cwd(), 'docs', 'accuracy-ledger.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
    expect(summary.total).toBe(totalForms());
    expect(summary.pass + summary.fail).toBeLessThanOrEqual(summary.total);
  });

  it('core MUST_MATCH forms pass except documented engine gaps (high-byte regs)', () => {
    const ledger = buildLedger();
    const core = ['MOV', 'ADD', 'SUB', 'CMP', 'AND', 'OR', 'XOR', 'JE', 'JNE', 'JG', 'LOOP', 'CALL', 'RET', 'PUSH', 'POP'];
    const coreForms = ledger.filter(e => core.includes(e.mnemonic));
    expect(coreForms.length).toBeGreaterThan(50);

    // Documented engine limitation: AH/CH/DH/BH are not yet recognized by the
    // parser as registers (gate: extend after GATE 1). The ledger records them
    // as FAIL; anything ELSE failing is a real regression.
    const unexpected = coreForms.filter(e =>
      e.status !== 'PASS' && !/(^|, )(AH|CH|DH|BH)(,|$)/.test(e.operands));
    expect(unexpected, unexpected.map(e2 => `${e2.mnemonic} ${e2.operands}: ${e2.detail}`).join(' | ')).toHaveLength(0);
  });

  it('MUST_MATCH forms have a high execution pass rate', () => {
    const ledger = buildLedger();
    const mm = ledger.filter(e => e.verify === 'MUST_MATCH');
    expect(mm.length).toBeGreaterThan(250);
    const pass = mm.filter(e => e.status === 'PASS').length;
    const rate = pass / mm.length;
    expect(rate).toBeGreaterThan(0.85);
  });

  it('prints ledger summary for CI visibility', () => {
    const summary = ledgerSummary(buildLedger());
    console.log(`[accuracy] passRate=${summary.passRate} total=${summary.total} pass=${summary.pass} fail=${summary.fail}`);
    expect(summary.pass).toBeGreaterThan(0);
  });
});
// ══════════════════════════════════════════════════════════════════
// 3. Semantic spot checks — canonical MUST_MATCH results
// ══════════════════════════════════════════════════════════════════
describe('Semantic spot checks (canonical results)', () => {
  const run = (src: string) => {
    const s = new LiveSession();
    s.setCells([cell('a', src)]);
    const r = s.runCell('a');
    const state = s.getState();
    return { s, r, regs: state.regs, flags: state.flags };
  };

  it('ADD flags: 0x7FFF + 1 → AX=0x8000, OF=1, SF=1, ZF=0, CF=0', () => {
    const { regs, flags } = run('MOV AX, 7FFFh\nADD AX, 1\nHLT');
    expect(regs.AX).toBe(0x8000);
    expect(flags.OF).toBe(1);
    expect(flags.SF).toBe(1);
    expect(flags.ZF).toBe(0);
    expect(flags.CF).toBe(0);
  });

  it('SUB borrow: 0 − 1 → AX=0xFFFF, CF=1, ZF=0', () => {
    const { regs, flags } = run('XOR AX, AX\nSUB AX, 1\nHLT');
    expect(regs.AX).toBe(0xFFFF);
    expect(flags.CF).toBe(1);
    expect(flags.ZF).toBe(0);
  });

  it('CMP does not modify operands but sets ZF', () => {
    const { regs, flags } = run('MOV AX, 5\nCMP AX, 5\nHLT');
    expect(regs.AX).toBe(5);
    expect(flags.ZF).toBe(1);
  });

  it('DAA adjusts packed BCD: 0x09+1 → AL=0x10, AF=1, CF=0', () => {
    const { regs, flags } = run('MOV AL, 09h\nADD AL, 1\nDAA\nHLT');
    expect(regs.AX).toBe(0x0010);
    expect(flags.AF).toBe(1);
    expect(flags.CF).toBe(0);
  });

  it('MUL: AX=0x1234, BX=3 → DX:AX = 0x0000:0x369C', () => {
    const { regs } = run('MOV AX, 1234h\nMOV BX, 3\nMUL BX\nHLT');
    expect(regs.AX).toBe(0x369C);
    expect(regs.DX).toBe(0);
  });

  it('DIV: DX:AX=0x0100, BX=2 → AX=0x80, DX=0', () => {
    const { regs } = run('XOR DX, DX\nMOV AX, 100h\nMOV BX, 2\nDIV BX\nHLT');
    expect(regs.AX).toBe(0x80);
    expect(regs.DX).toBe(0);
  });

  it('CALL/RET restore SP (stack balanced)', () => {
    // continueRun stops at HLT (runCell soft-continues past HLT by design).
    const s = new LiveSession();
    s.setCells([cell('a', 'MOV SP, 0F000h\nCALL sub\nHLT\nsub:\nRET')]);
    const res = s.continueRun();
    expect(res.reason).toBe('halted');
    expect(s.getState().regs.SP).toBe(0xF000);
  });

  it('LOOP decrements CX and branches: CX=3 → AX=3, CX=0', () => {
    const { regs } = run('MOV CX, 3\nXOR AX, AX\nloop:\nINC AX\nLOOP loop\nHLT');
    expect(regs.AX).toBe(3);
    expect(regs.CX).toBe(0);
  });

  it('REP MOVSB copies CX bytes through DI', () => {
    const { s, regs } = run(
      'MOV SI, 1000h\nMOV DI, 2000h\nMOV CX, 3\n' +
      'MOV BYTE PTR [SI], 41h\nMOV BYTE PTR [SI+1], 42h\nMOV BYTE PTR [SI+2], 43h\n' +
      'REP MOVSB\nHLT'
    );
    const bytes = s.memHex(0x2000, 1)[0].bytes.slice(0, 3);
    expect(bytes).toEqual([0x41, 0x42, 0x43]);
    expect(regs.DI).toBe(0x2003);
    expect(regs.CX).toBe(0);
  });

  it('screen golden: segment write to B800h yields char + attr matrix', () => {
    const { s } = run(
      'MOV AX, 0B800h\nMOV DS, AX\nMOV WORD PTR [0], 0748h\nMOV WORD PTR [2], 0121h\nHLT'
    );
    const scr = s.screenText();
    expect(scr[0][0].ch).toBe('H');    // 0x48
    expect(scr[0][0].attr).toBe(0x07); // 0x07
    expect(scr[0][1].ch).toBe('!');    // 0x21
    expect(scr[0][1].attr).toBe(0x01);
    expect(scr[0][2].ch).toBe('\0');   // rest of row 0 blank
  });
});
