// ================================================================
//  Instruction coverage matrix — enumerates every instruction form
//  the engine supports, for the accuracy ledger (R3).
// ================================================================

export const GPR16 = ['AX', 'CX', 'DX', 'BX', 'SP', 'BP', 'SI', 'DI'] as const;
export const GPR8 = ['AL', 'CL', 'DL', 'BL', 'AH', 'CH', 'DH', 'BH'] as const;
export const SEGREGS = ['CS', 'DS', 'ES', 'SS'] as const;
export const FLAGS = ['OF', 'DF', 'IF', 'TF', 'SF', 'ZF', 'AF', 'PF', 'CF'] as const;

export type AddressingMode =
  | 'reg,reg' | 'reg,imm' | 'reg,mem' | 'mem,reg' | 'mem,imm'
  | 'reg' | 'mem' | 'imm' | 'none';

export type VerifyClass =
  | 'MUST_MATCH'
  | 'IMPLEMENTATION_DEFINED'
  | 'UNDEFINED_DONT_COMPARE';

export type Category = 'data' | 'arith' | 'logic' | 'shift' | 'string' | 'stack' | 'flow' | 'io' | 'flag' | 'bcd' | 'seg' | 'system';

export interface InstructionForm {
  mnemonic: string;
  operands: string;
  addressing: AddressingMode;
  flagsAffected: string[];
  verify: VerifyClass;
  category: Category;
}

// ── Data movement forms ──
const DATA: InstructionForm[] = [];
for (const r of GPR16) {
  DATA.push({ mnemonic: 'MOV', operands: `${r}, r16`, addressing: 'reg,reg', flagsAffected: [], verify: 'MUST_MATCH', category: 'data' });
  DATA.push({ mnemonic: 'MOV', operands: `${r}, imm16`, addressing: 'reg,imm', flagsAffected: [], verify: 'MUST_MATCH', category: 'data' });
  DATA.push({ mnemonic: 'MOV', operands: `${r}, [mem]`, addressing: 'reg,mem', flagsAffected: [], verify: 'MUST_MATCH', category: 'data' });
}
for (const r of GPR8) {
  DATA.push({ mnemonic: 'MOV', operands: `${r}, r8`, addressing: 'reg,reg', flagsAffected: [], verify: 'MUST_MATCH', category: 'data' });
  DATA.push({ mnemonic: 'MOV', operands: `${r}, imm8`, addressing: 'reg,imm', flagsAffected: [], verify: 'MUST_MATCH', category: 'data' });
}
for (const r of GPR16) {
  DATA.push({ mnemonic: 'MOV', operands: `[mem], ${r}`, addressing: 'mem,reg', flagsAffected: [], verify: 'MUST_MATCH', category: 'data' });
}
for (const r of GPR8) {
  DATA.push({ mnemonic: 'MOV', operands: `${r}, [mem]`, addressing: 'reg,mem', flagsAffected: [], verify: 'MUST_MATCH', category: 'data' });
  DATA.push({ mnemonic: 'MOV', operands: `[mem], ${r}`, addressing: 'mem,reg', flagsAffected: [], verify: 'MUST_MATCH', category: 'data' });
}
DATA.push({ mnemonic: 'MOV', operands: '[mem], imm16', addressing: 'mem,imm', flagsAffected: [], verify: 'MUST_MATCH', category: 'data' });
DATA.push({ mnemonic: 'MOV', operands: '[mem], imm8', addressing: 'mem,imm', flagsAffected: [], verify: 'MUST_MATCH', category: 'data' });
for (const s of SEGREGS) {
  if (s !== 'CS') DATA.push({ mnemonic: 'MOV', operands: `${s}, r16`, addressing: 'reg,reg', flagsAffected: [], verify: 'MUST_MATCH', category: 'seg' });
}
for (const r of GPR16) {
  DATA.push({ mnemonic: 'XCHG', operands: `AX, ${r}`, addressing: 'reg,reg', flagsAffected: [], verify: 'MUST_MATCH', category: 'data' });
  DATA.push({ mnemonic: 'LEA', operands: `${r}, [mem]`, addressing: 'reg,mem', flagsAffected: [], verify: 'MUST_MATCH', category: 'data' });
}
DATA.push({ mnemonic: 'CBW', operands: 'none', addressing: 'none', flagsAffected: [], verify: 'MUST_MATCH', category: 'data' });
DATA.push({ mnemonic: 'CWD', operands: 'none', addressing: 'none', flagsAffected: [], verify: 'MUST_MATCH', category: 'data' });
DATA.push({ mnemonic: 'XLAT', operands: 'none', addressing: 'none', flagsAffected: [], verify: 'MUST_MATCH', category: 'data' });

// ── Arithmetic forms ──
const ARITH: InstructionForm[] = [];
const arithOps = ['ADD', 'ADC', 'SUB', 'SBB', 'CMP'] as const;
const arithFlags = ['CF', 'ZF', 'SF', 'OF', 'PF', 'AF'];
for (const op of arithOps) {
  for (const dst of GPR16) {
    for (const src of GPR16) {
      ARITH.push({ mnemonic: op, operands: `${dst}, ${src}`, addressing: 'reg,reg', flagsAffected: arithFlags, verify: 'MUST_MATCH', category: 'arith' });
    }
    ARITH.push({ mnemonic: op, operands: `${dst}, imm16`, addressing: 'reg,imm', flagsAffected: arithFlags, verify: 'MUST_MATCH', category: 'arith' });
  }
  for (const dst of GPR8) {
    ARITH.push({ mnemonic: op, operands: `${dst}, imm8`, addressing: 'reg,imm', flagsAffected: arithFlags, verify: 'MUST_MATCH', category: 'arith' });
  }
  ARITH.push({ mnemonic: op, operands: '[mem], r16', addressing: 'mem,reg', flagsAffected: arithFlags, verify: 'MUST_MATCH', category: 'arith' });
}
for (const op of ['INC', 'DEC'] as const) {
  for (const r of GPR16) {
    ARITH.push({ mnemonic: op, operands: r, addressing: 'reg', flagsAffected: ['ZF', 'SF', 'OF', 'PF', 'AF'], verify: 'MUST_MATCH', category: 'arith' });
  }
}
for (const r of GPR16) {
  ARITH.push({ mnemonic: 'NEG', operands: r, addressing: 'reg', flagsAffected: ['CF', 'ZF', 'SF', 'OF', 'PF', 'AF'], verify: 'MUST_MATCH', category: 'arith' });
}
for (const op of ['MUL', 'IMUL', 'DIV', 'IDIV'] as const) {
  for (const r of GPR16) {
    ARITH.push({ mnemonic: op, operands: r, addressing: 'reg', flagsAffected: op === 'MUL' || op === 'IMUL' ? ['CF', 'OF'] : [], verify: op === 'DIV' || op === 'IDIV' ? 'IMPLEMENTATION_DEFINED' : 'MUST_MATCH', category: 'arith' });
  }
}

// ── Logic forms ──
const LOGIC: InstructionForm[] = [];
const logicFlags = ['CF', 'ZF', 'SF', 'PF', 'OF'];
for (const op of ['AND', 'OR', 'XOR', 'TEST'] as const) {
  for (const dst of GPR16) {
    for (const src of GPR16) {
      LOGIC.push({ mnemonic: op, operands: `${dst}, ${src}`, addressing: 'reg,reg', flagsAffected: logicFlags, verify: 'MUST_MATCH', category: 'logic' });
    }
    LOGIC.push({ mnemonic: op, operands: `${dst}, imm16`, addressing: 'reg,imm', flagsAffected: logicFlags, verify: 'MUST_MATCH', category: 'logic' });
  }
}
for (const r of GPR16) {
  LOGIC.push({ mnemonic: 'NOT', operands: r, addressing: 'reg', flagsAffected: [], verify: 'MUST_MATCH', category: 'logic' });
}

// ── Shift / rotate forms ──
const SHIFT: InstructionForm[] = [];
for (const op of ['SHL', 'SAL', 'SHR', 'SAR', 'ROL', 'ROR', 'RCL', 'RCR'] as const) {
  for (const r of GPR16) {
    SHIFT.push({ mnemonic: op, operands: `${r}, 1`, addressing: 'reg,imm', flagsAffected: ['CF', 'OF'], verify: 'MUST_MATCH', category: 'shift' });
    SHIFT.push({ mnemonic: op, operands: `${r}, CL`, addressing: 'reg,reg', flagsAffected: ['CF'], verify: 'MUST_MATCH', category: 'shift' });
  }
}

// ── Stack forms ──
const STACK: InstructionForm[] = [];
for (const r of GPR16) {
  STACK.push({ mnemonic: 'PUSH', operands: r, addressing: 'reg', flagsAffected: [], verify: 'MUST_MATCH', category: 'stack' });
  STACK.push({ mnemonic: 'POP', operands: r, addressing: 'reg', flagsAffected: [], verify: 'MUST_MATCH', category: 'stack' });
}
STACK.push({ mnemonic: 'PUSHF', operands: 'none', addressing: 'none', flagsAffected: [], verify: 'MUST_MATCH', category: 'stack' });
STACK.push({ mnemonic: 'POPF', operands: 'none', addressing: 'none', flagsAffected: ['CF','PF','AF','ZF','SF','IF','DF','OF'], verify: 'MUST_MATCH', category: 'stack' });
STACK.push({ mnemonic: 'PUSHA', operands: 'none', addressing: 'none', flagsAffected: [], verify: 'MUST_MATCH', category: 'stack' });
STACK.push({ mnemonic: 'POPA', operands: 'none', addressing: 'none', flagsAffected: [], verify: 'MUST_MATCH', category: 'stack' });

// ── Flow control forms ──
const FLOW: InstructionForm[] = [
  { mnemonic: 'JMP', operands: 'label', addressing: 'none', flagsAffected: [], verify: 'MUST_MATCH', category: 'flow' },
  { mnemonic: 'CALL', operands: 'label', addressing: 'none', flagsAffected: [], verify: 'MUST_MATCH', category: 'flow' },
  { mnemonic: 'RET', operands: 'none', addressing: 'none', flagsAffected: [], verify: 'MUST_MATCH', category: 'flow' },
  { mnemonic: 'RET', operands: 'imm16', addressing: 'imm', flagsAffected: [], verify: 'MUST_MATCH', category: 'flow' },
  { mnemonic: 'JMP', operands: 'r16', addressing: 'reg', flagsAffected: [], verify: 'MUST_MATCH', category: 'flow' },
];
const jccList = ['JE','JZ','JNE','JNZ','JL','JNGE','JLE','JNG','JG','JNLE','JGE','JNL','JA','JNBE','JAE','JNB','JNC','JB','JNAE','JC','JBE','JNA','JS','JNS','JO','JNO','JP','JPE','JNP','JPO','JCXZ'];
for (const j of jccList) {
  FLOW.push({ mnemonic: j, operands: 'label', addressing: 'none', flagsAffected: [], verify: 'MUST_MATCH', category: 'flow' });
}
FLOW.push({ mnemonic: 'LOOP', operands: 'label', addressing: 'none', flagsAffected: ['CX'], verify: 'MUST_MATCH', category: 'flow' });
FLOW.push({ mnemonic: 'LOOPE', operands: 'label', addressing: 'none', flagsAffected: ['CX'], verify: 'MUST_MATCH', category: 'flow' });
FLOW.push({ mnemonic: 'LOOPNE', operands: 'label', addressing: 'none', flagsAffected: ['CX'], verify: 'MUST_MATCH', category: 'flow' });


// ── Flag manipulation forms ──
const FLAG_OPS: InstructionForm[] = [
  { mnemonic: 'CLC', operands: 'none', addressing: 'none', flagsAffected: ['CF'], verify: 'MUST_MATCH', category: 'flag' },
  { mnemonic: 'STC', operands: 'none', addressing: 'none', flagsAffected: ['CF'], verify: 'MUST_MATCH', category: 'flag' },
  { mnemonic: 'CMC', operands: 'none', addressing: 'none', flagsAffected: ['CF'], verify: 'MUST_MATCH', category: 'flag' },
  { mnemonic: 'CLD', operands: 'none', addressing: 'none', flagsAffected: ['DF'], verify: 'MUST_MATCH', category: 'flag' },
  { mnemonic: 'STD', operands: 'none', addressing: 'none', flagsAffected: ['DF'], verify: 'MUST_MATCH', category: 'flag' },
  { mnemonic: 'CLI', operands: 'none', addressing: 'none', flagsAffected: ['IF'], verify: 'MUST_MATCH', category: 'flag' },
  { mnemonic: 'STI', operands: 'none', addressing: 'none', flagsAffected: ['IF'], verify: 'MUST_MATCH', category: 'flag' },
  { mnemonic: 'LAHF', operands: 'none', addressing: 'none', flagsAffected: [], verify: 'MUST_MATCH', category: 'flag' },
  { mnemonic: 'SAHF', operands: 'none', addressing: 'none', flagsAffected: ['SF','ZF','AF','PF','CF'], verify: 'MUST_MATCH', category: 'flag' },
];

// ── String instruction forms ──
const STRING: InstructionForm[] = [
  { mnemonic: 'MOVSB', operands: 'none', addressing: 'none', flagsAffected: ['SI','DI'], verify: 'MUST_MATCH', category: 'string' },
  { mnemonic: 'MOVSW', operands: 'none', addressing: 'none', flagsAffected: ['SI','DI'], verify: 'MUST_MATCH', category: 'string' },
  { mnemonic: 'STOSB', operands: 'none', addressing: 'none', flagsAffected: ['DI'], verify: 'MUST_MATCH', category: 'string' },
  { mnemonic: 'STOSW', operands: 'none', addressing: 'none', flagsAffected: ['DI'], verify: 'MUST_MATCH', category: 'string' },
  { mnemonic: 'LODSB', operands: 'none', addressing: 'none', flagsAffected: ['SI','AX'], verify: 'MUST_MATCH', category: 'string' },
  { mnemonic: 'LODSW', operands: 'none', addressing: 'none', flagsAffected: ['SI','AX'], verify: 'MUST_MATCH', category: 'string' },
  { mnemonic: 'SCASB', operands: 'none', addressing: 'none', flagsAffected: ['DI','ZF','CF','SF','OF','PF','AF'], verify: 'MUST_MATCH', category: 'string' },
  { mnemonic: 'CMPSB', operands: 'none', addressing: 'none', flagsAffected: ['SI','DI','ZF','CF','SF','OF','PF','AF'], verify: 'MUST_MATCH', category: 'string' },
  { mnemonic: 'REP', operands: 'MOVSB', addressing: 'none', flagsAffected: ['CX','SI','DI'], verify: 'MUST_MATCH', category: 'string' },
  { mnemonic: 'REP', operands: 'STOSB', addressing: 'none', flagsAffected: ['CX','DI'], verify: 'MUST_MATCH', category: 'string' },
  { mnemonic: 'REPE', operands: 'CMPSB', addressing: 'none', flagsAffected: ['CX','SI','DI','ZF'], verify: 'MUST_MATCH', category: 'string' },
  { mnemonic: 'REPNE', operands: 'SCASB', addressing: 'none', flagsAffected: ['CX','DI','ZF'], verify: 'MUST_MATCH', category: 'string' },
];

// ── BCD forms ──
const BCD: InstructionForm[] = [
  { mnemonic: 'DAA', operands: 'none', addressing: 'none', flagsAffected: ['AF','CF','PF','SF','ZF'], verify: 'MUST_MATCH', category: 'bcd' },
  { mnemonic: 'DAS', operands: 'none', addressing: 'none', flagsAffected: ['AF','CF','PF','SF','ZF'], verify: 'MUST_MATCH', category: 'bcd' },
  { mnemonic: 'AAA', operands: 'none', addressing: 'none', flagsAffected: ['AF','CF'], verify: 'MUST_MATCH', category: 'bcd' },
  { mnemonic: 'AAS', operands: 'none', addressing: 'none', flagsAffected: ['AF','CF'], verify: 'MUST_MATCH', category: 'bcd' },
  { mnemonic: 'AAM', operands: 'none', addressing: 'none', flagsAffected: ['PF','SF','ZF'], verify: 'MUST_MATCH', category: 'bcd' },
  { mnemonic: 'AAD', operands: 'none', addressing: 'none', flagsAffected: ['PF','SF','ZF'], verify: 'MUST_MATCH', category: 'bcd' },
];

// ── System / misc forms ──
const SYSTEM: InstructionForm[] = [
  { mnemonic: 'NOP', operands: 'none', addressing: 'none', flagsAffected: [], verify: 'MUST_MATCH', category: 'system' },
  { mnemonic: 'HLT', operands: 'none', addressing: 'none', flagsAffected: [], verify: 'MUST_MATCH', category: 'system' },
];

/** The complete instruction coverage matrix. */
export const COVERAGE_MATRIX: InstructionForm[] = [
  ...DATA, ...ARITH, ...LOGIC, ...SHIFT, ...STACK, ...FLOW, ...FLAG_OPS, ...STRING, ...BCD, ...SYSTEM,
];

/** Count unique mnemonics. */
export function uniqueMnemonicCount(): number {
  return new Set(COVERAGE_MATRIX.map(f => f.mnemonic)).size;
}

/** Coverage by category. */
export function coverageByCategory(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of COVERAGE_MATRIX) out[f.category] = (out[f.category] ?? 0) + 1;
  return out;
}

/** Coverage by verification class. */
export function coverageByVerify(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of COVERAGE_MATRIX) out[f.verify] = (out[f.verify] ?? 0) + 1;
  return out;
}

/** Total forms. */
export function totalForms(): number { return COVERAGE_MATRIX.length; }
