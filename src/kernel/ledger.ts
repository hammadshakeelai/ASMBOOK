// ================================================================
//  Accuracy ledger (R3) — runs every instruction form in the
//  coverage matrix through a real LiveSession and records whether
//  the engine assembles + executes it without error.
//  The ledger is written to docs/accuracy-ledger.json by the test
//  suite on every run (public accuracy ledger, per VALIDATION plan).
// ================================================================
import { LiveSession, type Cell } from './session.js';
import { COVERAGE_MATRIX, type InstructionForm } from './coverage.js';

export type LedgerStatus = 'PASS' | 'FAIL' | 'UNVERIFIED';

export interface LedgerEntry {
  mnemonic: string;
  operands: string;
  addressing: string;
  category: string;
  verify: string;
  flagsAffected: string[];
  status: LedgerStatus;
  snippet: string;
  detail?: string;
}

/** Register prologue needed before an instruction form can execute. */
function prologue(mnemonic: string, operands: string): string[] {
  const p: string[] = [];
  if (/\[mem\]/.test(operands) || mnemonic === 'XLAT') p.push('MOV BX, 1000h');
  if (/, CL$/.test(operands)) p.push('MOV CL, 1');
  if (mnemonic === 'DIV' || mnemonic === 'IDIV') {
    p.push('MOV DX, 0', 'MOV AX, 12');
    // operand is the divisor register (unary form, e.g. 'CX')
    if (operands !== 'AX') p.push(`MOV ${operands}, 3`);
  }
  if (mnemonic === 'IMUL') p.push('MOV DX, 0');
  if (mnemonic === 'CWD') p.push('MOV AX, 5');
  if (mnemonic === 'CBW') p.push('MOV AL, 7');
  if (mnemonic === 'MOV' && /^(DS|ES|SS),/.test(operands)) p.push('MOV AX, 1000h');
  if (mnemonic === 'XCHG' && operands === 'AX, AX') p.push('MOV AX, 1234h');
  // string ops need SI/DI; SCAS/CMPS also need AL
  if (/^((REPE|REPNE|REP|REPNZ|REPZ)\s+)?(MOVSW?|STOSW?|LODSW?|SCASB|CMPSB)$/.test(mnemonic + ' ' + operands.replace(/r16|r8|\[mem\]|imm\d+/g, 'X')) || ['MOVSB','MOVSW','STOSB','STOSW','LODSB','LODSW','SCASB','CMPSB'].includes(mnemonic) || /^(REP|REPE|REPNE)$/.test(mnemonic)) {
    p.push('CLD', 'MOV SI, 1000h', 'MOV DI, 2000h');
    if (/SCAS|CMPS/.test(mnemonic + ' ' + operands)) p.push('MOV AL, 41h');
    if (/^(REP|REPE|REPNE)$/.test(mnemonic)) p.push('MOV CX, 2');
  }
  return p;
}

/** Build a concrete program that exercises one instruction form. */
export function buildSnippet(form: InstructionForm): string {
  const body0 = form.operands
    .replace(/imm16/g, '1234h')
    .replace(/imm8/g, '42h')
    .replace(/\[mem\]/g, '[BX]')
    .replace(/r16/g, 'AX')
    .replace(/r8/g, 'AL')
    .replace(/label/g, 'target');

  const m = form.mnemonic;
  // Bare mnemonics take no operands; RET imm16 uses a sane word count.
  const body = form.operands === 'none'
    ? m
    : (m === 'RET' && form.operands === 'imm16') ? 'RET 2' : `${m} ${body0}`.trim();

  const pre = prologue(m, form.operands);

  // Control-flow forms need a target label
  if (m === 'JMP' && form.operands === 'label') {
    return [...pre, 'JMP target', 'HLT', 'target:', 'NOP'].join('\n');
  }
  if (m === 'CALL' || (m === 'RET' && form.operands !== 'imm16' && form.operands !== 'r16')) {
    return [...pre, 'CALL target', 'HLT', 'target:', 'RET'].join('\n');
  }
  if (m === 'JMP' && form.operands === 'r16') {
    return [...pre, 'MOV AX, target', 'JMP AX', 'HLT', 'target:', 'NOP'].join('\n');
  }
  if (/^J/.test(m) || /^LOOP/.test(m)) {
    const setup: string[] = [];
    if (/^LOOP/.test(m)) { setup.push('MOV CX, 2'); }
    if (m === 'LOOPE' || m === 'LOOPZ') setup.push('XOR AX, AX'); // ZF=1
    if (m === 'LOOPNE' || m === 'LOOPNZ') setup.push('CMP AX, AX'); // ZF=1 -> exits
    return [...pre, ...setup, `${m} target`, 'HLT', 'target:', 'NOP'].join('\n');
  }
  return [...pre, body, 'HLT'].join('\n');
}

/** Run one instruction form and record the outcome. */
export function runForm(form: InstructionForm): LedgerEntry {
  const snippet = buildSnippet(form);
  const cell: Cell = { id: 'a', kind: 'code', source: snippet };
  const s = new LiveSession();
  let res;
  try {
    s.setCells([cell]);
    res = s.runCell('a');
  } catch (e: any) {
    return { ...form, status: 'FAIL', snippet, detail: 'threw: ' + (e?.message ?? String(e)) };
  }
  const errs = s.getFriendlyErrors();
  if (res.error || res.reason === 'error' || errs.length > 0) {
    const detail = res.error ?? errs.map(e2 => e2.friendly ?? String(e2)).join('; ');
    return { ...form, status: 'FAIL', snippet, detail };
  }
  return { ...form, status: 'PASS', snippet };
}

/** Run every form in the coverage matrix. */
export function buildLedger(): LedgerEntry[] {
  return COVERAGE_MATRIX.map(runForm);
}

export interface LedgerSummary {
  total: number;
  pass: number;
  fail: number;
  unverified: number;
  byCategory: Record<string, { total: number; pass: number; fail: number }>;
  passRate: string;
}

export function ledgerSummary(entries: LedgerEntry[]): LedgerSummary {
  const byCategory: LedgerSummary['byCategory'] = {};
  let pass = 0, fail = 0, unverified = 0;
  for (const e of entries) {
    if (!byCategory[e.category]) byCategory[e.category] = { total: 0, pass: 0, fail: 0 };
    byCategory[e.category].total++;
    if (e.status === 'PASS') { pass++; byCategory[e.category].pass++; }
    else { fail++; byCategory[e.category].fail++; }
  }
  unverified = entries.length - pass - fail;
  return {
    total: entries.length, pass, fail, unverified, byCategory,
    passRate: entries.length ? (pass / entries.length * 100).toFixed(1) + '%' : '0%'
  };
}
