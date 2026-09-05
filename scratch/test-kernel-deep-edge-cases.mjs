// ============================================================================
//  scratch/test-kernel-deep-edge-cases.mjs
//  ASMBOOK Deep Edge Case Test Suite
//  Comprehensive verification of:
//    1. Complex Memory Addressing & Segment Overrides ([BX+SI], [BX+DI+4], [BP+SI-2], [BP+DI+10h], CS/ES/SS/DS overrides)
//    2. String Instructions & Repeat Prefixes (MOVSB/W, STOSB/W, LODSB/W, CMPSB/W, SCASB/W with CLD/STD, REP/REPE/REPNE/REPZ/REPNZ)
//    3. Full Shifts and Rotates (SHL, SHR, SAR, ROL, ROR, RCL, RCR with count 1 & CL, CF and OF behavior)
//    4. BCD Adjustments (DAA, DAS, AAA, AAS, AAM, AAD)
//    5. Stack Frame & Calling Conventions (PUSH/POP, PUSHA/POPA, PUSHF/POPF, ENTER/LEAVE, CALL/RET, RET n, RETF)
//    6. Conditional Jumps & Loops (16 Jcc types + all synonyms, JCXZ, LOOP, LOOPE/LOOPZ, LOOPNE/LOOPNZ)
//    7. Boundary Conditions (16-bit wrap, negative arithmetic, div by zero, IDIV overflow, HLT)
//    8. LiveSession Integration Edge Cases (multi-cell, regDiff, left-cell, error containment, @expect, breakpoints)
// ============================================================================

import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Ensure TS resolution loader is registered ─────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const loaderPath = path.resolve(__dirname, 'ts-loader.mjs');
if (!fs.existsSync(loaderPath)) {
  fs.writeFileSync(loaderPath, `export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.endsWith('.js')) {
      return await nextResolve(specifier.slice(0, -3) + '.ts', context);
    }
    throw err;
  }
}`);
}
register('./ts-loader.mjs', import.meta.url);

// ── Dynamic imports ─────────────────────────────────────────────────────────
const { CPU, Parser, Executor, hex } = await import('../src/kernel/engine.mjs');
const { LiveSession } = await import('../src/kernel/session.ts');

// ── Test Runner Harness ─────────────────────────────────────────────────────
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];
let currentSuite = '';

function suite(name) {
  currentSuite = name;
  console.log(`\n\x1b[1m\x1b[36m=== ${name} ===\x1b[0m`);
}

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failedTests++;
    const failInfo = {
      suite: currentSuite,
      name,
      message: err.message,
      stack: err.stack,
    };
    failures.push(failInfo);
    console.log(`  \x1b[31m✗\x1b[0m ${name}: \x1b[31m${err.message}\x1b[0m`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    const actHex = typeof actual === 'number' ? ` (0x${actual.toString(16).toUpperCase()})` : '';
    const expHex = typeof expected === 'number' ? ` (0x${expected.toString(16).toUpperCase()})` : '';
    throw new Error(`${message ? message + ' -> ' : ''}Expected ${expected}${expHex}, got ${actual}${actHex}`);
  }
}

function executeAsm(code, options = {}) {
  const cpu = new CPU();
  if (options.regs) {
    for (const [r, v] of Object.entries(options.regs)) {
      cpu.setReg(r, v);
    }
  }
  if (options.flags) {
    for (const [f, v] of Object.entries(options.flags)) {
      cpu.flags[f] = v;
    }
  }
  if (options.mem) {
    for (const m of options.mem) {
      cpu.memWrite(m.addr, m.val, m.size || 16);
    }
  }
  if (options.input) {
    cpu.inputBuffer = [...options.input].map(c => c.charCodeAt(0));
  }

  const parser = new Parser();
  const parsed = parser.parse(code);
  if (parsed.errors.length) {
    throw new Error('Parse error: ' + parsed.errors.map(e => e.message).join(' | '));
  }

  const ex = new Executor(cpu, parsed);
  let steps = 0;
  const maxSteps = options.maxSteps || 100000;
  let error = null;

  try {
    while (!cpu.halted && cpu.ip < ex.instrs.length && steps++ < maxSteps) {
      ex.step();
    }
    if (steps >= maxSteps) {
      error = new Error('Step cap exceeded');
    }
  } catch (e) {
    error = e;
  }

  return { cpu, ex, parsed, steps, error };
}

// ═══════════════════════════════════════════════════════════════════════════
//  SUITE 1: Complex Memory Addressing & Segment Overrides
// ═══════════════════════════════════════════════════════════════════════════
suite('1. Complex Memory Addressing & Segment Overrides');

test('Base + Index: [BX+SI] read and write word', () => {
  const code = `
    MOV BX, 200h
    MOV SI, 50h
    MOV WORD PTR [BX+SI], 0FACEh
    MOV AX, [BX+SI]
    HLT
  `;
  const res = executeAsm(code);
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('AX'), 0xFACE, 'AX must equal 0xFACE');
  assertEqual(res.cpu.memRead(res.cpu.linear('DS', 0x250), 16), 0xFACE, 'Linear memory at DS:0250h must match');
});

test('Base + Index: [BX+SI] read and write byte', () => {
  const code = `
    MOV BX, 100h
    MOV SI, 20h
    MOV BYTE PTR [BX+SI], 7Ah
    MOV AL, [BX+SI]
    HLT
  `;
  const res = executeAsm(code);
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('AL'), 0x7A, 'AL must equal 0x7A');
  assertEqual(res.cpu.memRead(res.cpu.linear('DS', 0x120), 8), 0x7A, 'Linear memory at DS:0120h must match');
});

test('Base + Index + Displacement: [BX+DI+4] read and write', () => {
  const code = `
    MOV BX, 100h
    MOV DI, 20h
    MOV WORD PTR [BX+DI+4], 4321h
    MOV DX, [BX+DI+4]
    HLT
  `;
  const res = executeAsm(code);
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('DX'), 0x4321, 'DX must equal 0x4321');
  assertEqual(res.cpu.memRead(res.cpu.linear('DS', 0x124), 16), 0x4321, 'Linear memory at DS:0124h');
});

test('Base + Index + Negative Displacement: [BP+SI-2] defaults to SS segment', () => {
  const code = `
    MOV AX, 4000h
    MOV SS, AX
    MOV BP, 300h
    MOV SI, 10h
    MOV WORD PTR [BP+SI-2], 9876h
    MOV CX, [BP+SI-2]
    HLT
  `;
  const res = executeAsm(code);
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('CX'), 0x9876, 'CX must equal 0x9876');
  // Target offset: 0x300 + 0x10 - 2 = 0x30E. Segment SS (4000h) -> Linear = 4030Eh
  assertEqual(res.cpu.memRead(0x4030E, 16), 0x9876, 'Memory at SS:030Eh (linear 4030Eh)');
});

test('Base + Index + Hex Displacement: [BP+DI+10h] defaults to SS segment', () => {
  const code = `
    MOV AX, 5000h
    MOV SS, AX
    MOV BP, 100h
    MOV DI, 20h
    MOV WORD PTR [BP+DI+10h], 0BA98h
    MOV BX, [BP+DI+10h]
    HLT
  `;
  const res = executeAsm(code);
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('BX'), 0xBA98, 'BX must equal 0xBA98');
  // Target offset: 0x100 + 0x20 + 0x10 = 0x130. SS=5000h -> Linear = 50130h
  assertEqual(res.cpu.memRead(0x50130, 16), 0xBA98, 'Memory at SS:0130h (linear 50130h)');
});

test('Default Segment Selection: BX, SI, DI default to DS; BP defaults to SS', () => {
  const code = `
    MOV AX, 1000h
    MOV DS, AX
    MOV AX, 2000h
    MOV SS, AX
    MOV BX, 10h
    MOV SI, 20h
    MOV DI, 30h
    MOV BP, 40h
    MOV WORD PTR [BX], 0AAAAh
    MOV WORD PTR [SI], 0BBBBh
    MOV WORD PTR [DI], 0CCCCh
    MOV WORD PTR [BP], 0DDDDh
    HLT
  `;
  const res = executeAsm(code);
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.memRead(0x10010, 16), 0xAAAA, '[BX] wrote to DS');
  assertEqual(res.cpu.memRead(0x10020, 16), 0xBBBB, '[SI] wrote to DS');
  assertEqual(res.cpu.memRead(0x10030, 16), 0xCCCC, '[DI] wrote to DS');
  assertEqual(res.cpu.memRead(0x20040, 16), 0xDDDD, '[BP] wrote to SS');
});

test('Segment Overrides: CS:[SI] reads from code segment', () => {
  const code = `
    MOV SI, 50h
    MOV AX, CS:[SI]
    HLT
  `;
  const res = executeAsm(code, {
    mem: [{ addr: 0x00050, size: 16, val: 0x1122 }]
  });
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('AX'), 0x1122, 'AX should read 0x1122 from CS:[SI]');
});

test('Segment Overrides: ES:[DI] writes to extra segment', () => {
  const code = `
    MOV AX, 7000h
    MOV ES, AX
    MOV DI, 80h
    MOV WORD PTR ES:[DI], 0CAFEh
    MOV AX, ES:[DI]
    HLT
  `;
  const res = executeAsm(code);
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('AX'), 0xCAFE, 'AX should read 0xCAFE from ES:[DI]');
  assertEqual(res.cpu.memRead(0x70080, 16), 0xCAFE, 'Linear memory at 70080h');
});

test('Segment Overrides: Explicit SS:[BP] vs explicit DS:[BP]', () => {
  const code = `
    MOV AX, 1000h
    MOV SS, AX
    MOV AX, 2000h
    MOV DS, AX
    MOV BP, 100h
    MOV WORD PTR SS:[BP], 1111h
    MOV WORD PTR DS:[BP], 2222h
    MOV AX, [BP]       ; defaults to SS
    MOV BX, DS:[BP]    ; explicit override to DS
    MOV CX, SS:[BP]    ; explicit override to SS
    HLT
  `;
  const res = executeAsm(code);
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('AX'), 0x1111, '[BP] should default to SS');
  assertEqual(res.cpu.getReg('BX'), 0x2222, 'DS:[BP] should read DS');
  assertEqual(res.cpu.getReg('CX'), 0x1111, 'SS:[BP] should read SS');
});

test('NASM Bracketed Segment Override: [ES:DI] and [CS:SI]', () => {
  const code = `
    MOV AX, 3000h
    MOV ES, AX
    MOV DI, 0Ah
    MOV WORD PTR [ES:DI], 55AAh
    MOV DX, [ES:DI]
    HLT
  `;
  const res = executeAsm(code);
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('DX'), 0x55AA, 'DX should read 0x55AA from [ES:DI]');
});

test('16-bit offset wrap-around in effective address', () => {
  // BX = 0xFFFF, displacement 2 -> (0xFFFF + 2) & 0xFFFF = 0x0001
  const code = `
    MOV BX, 0FFFFh
    MOV WORD PTR [BX+2], 7788h
    MOV AX, [1]
    HLT
  `;
  const res = executeAsm(code);
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('AX'), 0x7788, 'AX should read 0x7788 from wrapped offset 1');
});

test('20-bit address space wrap-around at 1MB boundary', () => {
  // Segment 0xFFFF, offset 0x0020 -> Linear: (0xFFFF << 4) + 0x0020 = 0xFFFF0 + 0x0020 = 0x100010 & 0xFFFFF = 0x00010
  const cpu = new CPU();
  const lin = cpu.linear(0xFFFF, 0x0020);
  assertEqual(lin, 0x00010, 'Linear address should wrap to 0x00010 in 20-bit space');
});

// ═══════════════════════════════════════════════════════════════════════════
//  SUITE 2: String Instructions & Repeat Prefixes
// ═══════════════════════════════════════════════════════════════════════════
suite('2. String Instructions & Repeat Prefixes');

test('MOVSB and MOVSW with CLD (increment)', () => {
  const code = `
    MOV AX, 1000h
    MOV DS, AX
    MOV AX, 2000h
    MOV ES, AX
    MOV SI, 100h
    MOV DI, 200h
    CLD
    MOVSB
    MOVSW
    HLT
  `;
  const res = executeAsm(code, {
    mem: [
      { addr: 0x10100, size: 8, val: 0x42 },
      { addr: 0x10101, size: 16, val: 0x8899 }
    ]
  });
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('SI'), 0x103, 'SI should advance by 1 + 2 = 3');
  assertEqual(res.cpu.getReg('DI'), 0x203, 'DI should advance by 1 + 2 = 3');
  assertEqual(res.cpu.memRead(0x20200, 8), 0x42, 'ES:200h byte must match MOVSB');
  assertEqual(res.cpu.memRead(0x20201, 16), 0x8899, 'ES:201h word must match MOVSW');
});

test('MOVSB and MOVSW with STD (decrement)', () => {
  const code = `
    MOV AX, 1000h
    MOV DS, AX
    MOV AX, 2000h
    MOV ES, AX
    MOV SI, 103h
    MOV DI, 203h
    STD
    MOVSW
    MOVSB
    HLT
  `;
  const res = executeAsm(code, {
    mem: [
      { addr: 0x10103, size: 16, val: 0x1234 },
      { addr: 0x10101, size: 8, val: 0x77 }
    ]
  });
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('SI'), 0x100, 'SI should decrement by 2 + 1 = 3');
  assertEqual(res.cpu.getReg('DI'), 0x200, 'DI should decrement by 2 + 1 = 3');
  assertEqual(res.cpu.memRead(0x20203, 16), 0x1234, 'ES:203h word copied with STD');
  assertEqual(res.cpu.memRead(0x20201, 8), 0x77, 'ES:201h byte copied with STD');
});

test('STOSB and STOSW with CLD and STD', () => {
  // STOS writes to [ES:DI] then updates DI by +size (CLD) or -size (STD)
  const code = `
    MOV AX, 3000h
    MOV ES, AX
    MOV DI, 50h
    CLD
    MOV AL, 0AAh
    STOSB          ; writes 0xAA at 30050h, DI becomes 51h
    MOV AX, 0BBBBh
    STOSW          ; writes 0xBBBB at 30051h, DI becomes 53h
    STD
    MOV AX, 0CCCCh
    STOSW          ; writes 0xCCCC at 30053h, DI decrements to 51h
    HLT
  `;
  const res = executeAsm(code);
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('DI'), 0x51, 'DI should end at 51h');
  assertEqual(res.cpu.memRead(0x30050, 8), 0xAA, 'STOSB written to 30050h');
  assertEqual(res.cpu.memRead(0x30051, 16), 0xBBBB, 'STOSW forward written to 30051h');
  assertEqual(res.cpu.memRead(0x30053, 16), 0xCCCC, 'STOSW backward written to 30053h');
});

test('LODSB and LODSW with CLD and STD', () => {
  const code = `
    MOV AX, 1000h
    MOV DS, AX
    MOV SI, 20h
    CLD
    LODSB
    MOV BL, AL
    LODSW
    MOV CX, AX
    STD
    LODSB
    MOV DL, AL
    HLT
  `;
  const res = executeAsm(code, {
    mem: [
      { addr: 0x10020, size: 8, val: 0x11 },
      { addr: 0x10021, size: 16, val: 0x3322 },
      { addr: 0x10023, size: 8, val: 0x44 }
    ]
  });
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('BL'), 0x11, 'BL should hold first byte 0x11');
  assertEqual(res.cpu.getReg('CX'), 0x3322, 'CX should hold word 0x3322');
  assertEqual(res.cpu.getReg('DL'), 0x44, 'DL should hold byte 0x44 read at SI=23h');
  assertEqual(res.cpu.getReg('SI'), 0x22, 'SI should decrement from 23h to 22h');
});

test('REP MOVSB copies block and zeros CX', () => {
  const code = `
    MOV AX, 1000h
    MOV DS, AX
    MOV AX, 2000h
    MOV ES, AX
    MOV SI, 10h
    MOV DI, 20h
    MOV CX, 5
    CLD
    REP MOVSB
    HLT
  `;
  const res = executeAsm(code, {
    mem: [
      { addr: 0x10010, size: 8, val: 1 },
      { addr: 0x10011, size: 8, val: 2 },
      { addr: 0x10012, size: 8, val: 3 },
      { addr: 0x10013, size: 8, val: 4 },
      { addr: 0x10014, size: 8, val: 5 }
    ]
  });
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('CX'), 0, 'CX must be 0 after REP');
  assertEqual(res.cpu.getReg('SI'), 0x15, 'SI advanced by 5');
  assertEqual(res.cpu.getReg('DI'), 0x25, 'DI advanced by 5');
  for (let i = 0; i < 5; i++) {
    assertEqual(res.cpu.memRead(0x20020 + i, 8), i + 1, `ES:[20h+${i}] matches`);
  }
});

test('REP STOSW fills word buffer with pattern', () => {
  const code = `
    MOV AX, 3000h
    MOV ES, AX
    MOV DI, 0
    MOV AX, 0A5A5h
    MOV CX, 4
    CLD
    REP STOSW
    HLT
  `;
  const res = executeAsm(code);
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('CX'), 0, 'CX = 0 after REP STOSW');
  assertEqual(res.cpu.getReg('DI'), 8, 'DI advanced by 4 * 2 = 8');
  for (let i = 0; i < 4; i++) {
    assertEqual(res.cpu.memRead(0x30000 + i * 2, 16), 0xA5A5, `Word ${i} filled with 0xA5A5`);
  }
});

test('REP MOVSB with CX=0 does nothing', () => {
  const code = `
    MOV SI, 10h
    MOV DI, 20h
    MOV CX, 0
    REP MOVSB
    HLT
  `;
  const res = executeAsm(code);
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('CX'), 0, 'CX remains 0');
  assertEqual(res.cpu.getReg('SI'), 0x10, 'SI unchanged');
  assertEqual(res.cpu.getReg('DI'), 0x20, 'DI unchanged');
});

test('REPE/REPZ CMPSB stops at first mismatch', () => {
  const code = `
    MOV AX, 1000h
    MOV DS, AX
    MOV AX, 2000h
    MOV ES, AX
    MOV SI, 0
    MOV DI, 0
    MOV CX, 5
    CLD
    REPE CMPSB
    HLT
  `;
  const res = executeAsm(code, {
    mem: [
      { addr: 0x10000, size: 8, val: 0x48 }, // H
      { addr: 0x10001, size: 8, val: 0x45 }, // E
      { addr: 0x10002, size: 8, val: 0x58 }, // X (mismatch)
      { addr: 0x10003, size: 8, val: 0x4C }, // L
      { addr: 0x10004, size: 8, val: 0x4F }, // O

      { addr: 0x20000, size: 8, val: 0x48 }, // H
      { addr: 0x20001, size: 8, val: 0x45 }, // E
      { addr: 0x20002, size: 8, val: 0x4C }, // L
      { addr: 0x20003, size: 8, val: 0x4C }, // L
      { addr: 0x20004, size: 8, val: 0x4F }, // O
    ]
  });
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.flags.ZF, 0, 'ZF must be 0 on mismatch');
  assertEqual(res.cpu.getReg('SI'), 3, 'SI points past mismatched character');
  assertEqual(res.cpu.getReg('DI'), 3, 'DI points past mismatched character');
  assertEqual(res.cpu.getReg('CX'), 2, 'CX should have 2 remaining iterations');
});

test('REPNE/REPNZ SCASB finds character in buffer', () => {
  const code = `
    MOV AX, 3000h
    MOV ES, AX
    MOV DI, 0
    MOV AL, 21h
    MOV CX, 10
    CLD
    REPNE SCASB
    HLT
  `;
  const res = executeAsm(code, {
    mem: [
      { addr: 0x30000, size: 8, val: 0x41 },
      { addr: 0x30001, size: 8, val: 0x42 },
      { addr: 0x30002, size: 8, val: 0x21 }, // match!
      { addr: 0x30003, size: 8, val: 0x44 }
    ]
  });
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.flags.ZF, 1, 'ZF must be 1 on match');
  assertEqual(res.cpu.getReg('DI'), 3, 'DI points right after matching byte');
  assertEqual(res.cpu.getReg('CX'), 7, 'CX decremented 3 times (10 - 3 = 7)');
});

test('REPE SCASW scans word buffer until mismatch', () => {
  const code = `
    MOV AX, 4000h
    MOV ES, AX
    MOV DI, 0
    MOV AX, 1234h
    MOV CX, 3
    CLD
    REPE SCASW
    HLT
  `;
  const res = executeAsm(code, {
    mem: [
      { addr: 0x40000, size: 16, val: 0x1234 },
      { addr: 0x40002, size: 16, val: 0x1234 },
      { addr: 0x40004, size: 16, val: 0x9999 }
    ]
  });
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.flags.ZF, 0, 'ZF must be 0 after mismatch');
  assertEqual(res.cpu.getReg('DI'), 6, 'DI advances past 3rd word (3 * 2 = 6)');
  assertEqual(res.cpu.getReg('CX'), 0, 'CX reaches 0');
});

// ═══════════════════════════════════════════════════════════════════════════
//  SUITE 3: Shifts & Rotates (Count 1, CL, Count > 1, CF & OF)
// ═══════════════════════════════════════════════════════════════════════════
suite('3. Shifts & Rotates');

test('SHL/SAL 1: CF = MSB, OF = MSB ^ CF (word)', () => {
  // Word: 8000h << 1 -> 0000h, CF=1, OF = 0 ^ 1 = 1 (sign changed from negative to 0)
  const code1 = `
    MOV AX, 8000h
    SHL AX, 1
    HLT
  `;
  const r1 = executeAsm(code1);
  assertEqual(r1.cpu.getReg('AX'), 0, '8000h << 1 = 0');
  assertEqual(r1.cpu.flags.CF, 1, 'CF=1 (MSB was 1)');
  assertEqual(r1.cpu.flags.OF, 1, 'OF=1 (sign changed)');
  assertEqual(r1.cpu.flags.ZF, 1, 'ZF=1');

  // Word: 4000h << 1 -> 8000h, CF=0, OF = 1 ^ 0 = 1
  const code2 = `
    MOV AX, 4000h
    SHL AX, 1
    HLT
  `;
  const r2 = executeAsm(code2);
  assertEqual(r2.cpu.getReg('AX'), 0x8000, '4000h << 1 = 8000h');
  assertEqual(r2.cpu.flags.CF, 0, 'CF=0');
  assertEqual(r2.cpu.flags.OF, 1, 'OF=1 (sign changed from positive to negative)');
  assertEqual(r2.cpu.flags.SF, 1, 'SF=1');
});

test('SHL/SAL 1: CF = MSB, OF = MSB ^ CF (byte)', () => {
  // Byte: 80h << 1 -> 00h, CF=1, OF=1
  const code1 = `
    MOV AL, 80h
    SHL AL, 1
    HLT
  `;
  const r1 = executeAsm(code1);
  assertEqual(r1.cpu.getReg('AL'), 0, '80h << 1 = 0');
  assertEqual(r1.cpu.flags.CF, 1, 'CF=1');
  assertEqual(r1.cpu.flags.OF, 1, 'OF=1');
});

test('SHR 1: CF = LSB, OF = original MSB (word and byte)', () => {
  // Negative word: 8001h >> 1 -> 4000h, CF=1, OF=1 (original MSB was 1)
  const code1 = `
    MOV AX, 8001h
    SHR AX, 1
    HLT
  `;
  const r1 = executeAsm(code1);
  assertEqual(r1.cpu.getReg('AX'), 0x4000, '8001h >> 1 = 4000h');
  assertEqual(r1.cpu.flags.CF, 1, 'CF=1');
  assertEqual(r1.cpu.flags.OF, 1, 'OF=1 (original MSB was 1)');

  // Positive word: 0002h >> 1 -> 0001h, CF=0, OF=0
  const code2 = `
    MOV AX, 0002h
    SHR AX, 1
    HLT
  `;
  const r2 = executeAsm(code2);
  assertEqual(r2.cpu.getReg('AX'), 1, '0002h >> 1 = 1');
  assertEqual(r2.cpu.flags.CF, 0, 'CF=0');
  assertEqual(r2.cpu.flags.OF, 0, 'OF=0');

  // Byte: 03h >> 1 -> 01h, CF=1, OF=0
  const code3 = `
    MOV BL, 3
    SHR BL, 1
    HLT
  `;
  const r3 = executeAsm(code3);
  assertEqual(r3.cpu.getReg('BL'), 1, '3 SHR 1 = 1');
  assertEqual(r3.cpu.flags.CF, 1, 'CF=1');
  assertEqual(r3.cpu.flags.OF, 0, 'OF=0');
});

test('SAR 1: sign preserved, CF = LSB, OF = 0 always (word and byte)', () => {
  // Negative byte: 80h (-128) SAR 1 -> C0h (-64), CF=0, OF=0
  const code1 = `
    MOV AL, 80h
    SAR AL, 1
    HLT
  `;
  const r1 = executeAsm(code1);
  assertEqual(r1.cpu.getReg('AL'), 0xC0, '80h SAR 1 = C0h');
  assertEqual(r1.cpu.flags.CF, 0, 'CF=0');
  assertEqual(r1.cpu.flags.OF, 0, 'OF=0 always for SAR 1');
  assertEqual(r1.cpu.flags.SF, 1, 'SF=1');

  // Negative word odd: 0FFF1h (-15) SAR 1 -> 0FFF8h (-8), CF=1
  const code2 = `
    MOV AX, 0FFF1h
    SAR AX, 1
    HLT
  `;
  const r2 = executeAsm(code2);
  assertEqual(r2.cpu.getReg('AX'), 0xFFF8, 'FFF1h SAR 1 = FFF8h');
  assertEqual(r2.cpu.flags.CF, 1, 'CF=1');
  assertEqual(r2.cpu.flags.OF, 0, 'OF=0');
});

test('ROL 1: CF = MSB, OF = MSB ^ LSB of result (word and byte)', () => {
  // 8000h ROL 1 -> 0001h, CF=1, OF = MSB(0) ^ LSB(1) = 1
  const code1 = `
    MOV AX, 8000h
    ROL AX, 1
    HLT
  `;
  const r1 = executeAsm(code1);
  assertEqual(r1.cpu.getReg('AX'), 1, '8000h ROL 1 = 1');
  assertEqual(r1.cpu.flags.CF, 1, 'CF=1');
  assertEqual(r1.cpu.flags.OF, 1, 'OF=1');

  // Byte: 0C0h ROL 1 -> 81h, CF=1, OF = MSB(1) ^ LSB(1) = 0
  const code2 = `
    MOV DL, 0C0h
    ROL DL, 1
    HLT
  `;
  const r2 = executeAsm(code2);
  assertEqual(r2.cpu.getReg('DL'), 0x81, 'C0h ROL 1 = 81h');
  assertEqual(r2.cpu.flags.CF, 1, 'CF=1');
  assertEqual(r2.cpu.flags.OF, 0, 'OF=0');
});

test('ROR 1: CF = LSB, OF = MSB ^ bit(sz-2) of result (word and byte)', () => {
  // 0001h ROR 1 -> 8000h, CF=1, OF = bit15(1) ^ bit14(0) = 1
  const code1 = `
    MOV AX, 1
    ROR AX, 1
    HLT
  `;
  const r1 = executeAsm(code1);
  assertEqual(r1.cpu.getReg('AX'), 0x8000, '1 ROR 1 = 8000h');
  assertEqual(r1.cpu.flags.CF, 1, 'CF=1');
  assertEqual(r1.cpu.flags.OF, 1, 'OF=1');

  // Word 0003h ROR 1 -> 8001h, CF=1, OF = bit15(1) ^ bit14(0) = 1
  const code2 = `
    MOV AX, 3
    ROR AX, 1
    HLT
  `;
  const r2 = executeAsm(code2);
  assertEqual(r2.cpu.getReg('AX'), 0x8001, '3 ROR 1 = 8001h');
  assertEqual(r2.cpu.flags.CF, 1, 'CF=1');
  assertEqual(r2.cpu.flags.OF, 1, 'OF=1');

  // Byte 01h ROR 1 -> 80h, CF=1, OF = bit7(1) ^ bit6(0) = 1
  const code3 = `
    MOV AL, 1
    ROR AL, 1
    HLT
  `;
  const r3 = executeAsm(code3);
  assertEqual(r3.cpu.getReg('AL'), 0x80, '1 ROR 1 byte = 80h');
  assertEqual(r3.cpu.flags.CF, 1, 'CF=1');
  assertEqual(r3.cpu.flags.OF, 1, 'OF=1');
});

test('RCL 1 and RCR 1 through carry (word and byte)', () => {
  // RCL 1: 9-bit rotate byte through CF
  // AL = 80h, CF = 0 -> AL = 00h, CF = 1
  const code1 = `
    CLC
    MOV AL, 80h
    RCL AL, 1
    HLT
  `;
  const r1 = executeAsm(code1);
  assertEqual(r1.cpu.getReg('AL'), 0, '80h RCL 1 (CF=0) -> 0');
  assertEqual(r1.cpu.flags.CF, 1, 'CF=1');
  assertEqual(r1.cpu.flags.OF, 1, 'OF = MSB(0) ^ CF(1) = 1');

  // RCR 1: 9-bit rotate byte through CF
  // AL = 01h, CF = 1 -> AL = 80h, CF = 1
  const code2 = `
    STC
    MOV AL, 01h
    RCR AL, 1
    HLT
  `;
  const r2 = executeAsm(code2);
  assertEqual(r2.cpu.getReg('AL'), 0x80, '01h RCR 1 (CF=1) -> 80h');
  assertEqual(r2.cpu.flags.CF, 1, 'CF=1');
  assertEqual(r2.cpu.flags.OF, 1, 'OF = oldCF(1) ^ oldMSB(0) = 1');

  // Word RCL 1: AX = 8000h, CF = 1 -> AX = 0001h, CF = 1
  const code3 = `
    STC
    MOV AX, 8000h
    RCL AX, 1
    HLT
  `;
  const r3 = executeAsm(code3);
  assertEqual(r3.cpu.getReg('AX'), 1, '8000h RCL 1 (CF=1) -> 1');
  assertEqual(r3.cpu.flags.CF, 1, 'CF=1');
});

test('Shifts and Rotates with count in CL (including CL=0 unchanged flags)', () => {
  // Shift by 0 in CL leaves flags and value completely untouched
  const code0 = `
    STC
    MOV AL, 42h
    MOV CL, 0
    SHL AL, CL
    HLT
  `;
  const r0 = executeAsm(code0);
  assertEqual(r0.cpu.getReg('AL'), 0x42, 'AL unchanged when CL=0');
  assertEqual(r0.cpu.flags.CF, 1, 'CF untouched when CL=0');

  // Shift by 4 in CL: 0Fh << 4 -> F0h, CF = bit shifted out (0)
  const code1 = `
    MOV AL, 0Fh
    MOV CL, 4
    SHL AL, CL
    HLT
  `;
  const r1 = executeAsm(code1);
  assertEqual(r1.cpu.getReg('AL'), 0xF0, '0Fh << 4 = F0h');
  assertEqual(r1.cpu.flags.CF, 0, 'CF=0');
  assertEqual(r1.cpu.flags.SF, 1, 'SF=1');

  // SAR word by 3: 0FFF0h (-16) >> 3 -> 0FFFEh (-2), CF=0
  const code2 = `
    MOV AX, 0FFF0h
    MOV CL, 3
    SAR AX, CL
    HLT
  `;
  const r2 = executeAsm(code2);
  assertEqual(r2.cpu.getReg('AX'), 0xFFFE, 'SAR -16 by 3 = -2');
  assertEqual(r2.cpu.flags.CF, 0, 'CF=0');

  // ROL word by 4 in CL: 1234h -> 2341h
  const code3 = `
    MOV AX, 1234h
    MOV CL, 4
    ROL AX, CL
    HLT
  `;
  const r3 = executeAsm(code3);
  assertEqual(r3.cpu.getReg('AX'), 0x2341, '1234h ROL 4 = 2341h');

  // ROR word by 4 in CL: 1234h -> 4123h
  const code4 = `
    MOV AX, 1234h
    MOV CL, 4
    ROR AX, CL
    HLT
  `;
  const r4 = executeAsm(code4);
  assertEqual(r4.cpu.getReg('AX'), 0x4123, '1234h ROR 4 = 4123h');
});

// ═══════════════════════════════════════════════════════════════════════════
//  SUITE 4: BCD Adjustments (DAA, DAS, AAA, AAS, AAM, AAD)
// ═══════════════════════════════════════════════════════════════════════════
suite('4. BCD Adjustments');

test('DAA: packed BCD addition adjustments', () => {
  // Case A: 35h + 48h = 7Dh -> 83h, AF=1, CF=0
  const r1 = executeAsm('MOV AL, 35h\nADD AL, 48h\nDAA\nHLT');
  assertEqual(r1.cpu.getReg('AL'), 0x83, '35h + 48h DAA = 83h');
  assertEqual(r1.cpu.flags.AF, 1, 'AF=1');
  assertEqual(r1.cpu.flags.CF, 0, 'CF=0');

  // Case B: 79h + 35h = 0AEh -> 14h with CF=1, AF=1
  const r2 = executeAsm('MOV AL, 79h\nADD AL, 35h\nDAA\nHLT');
  assertEqual(r2.cpu.getReg('AL'), 0x14, '79h + 35h DAA = 14h');
  assertEqual(r2.cpu.flags.CF, 1, 'CF=1');
  assertEqual(r2.cpu.flags.AF, 1, 'AF=1');

  // Case C: DAA producing 0 -> sets ZF=1, PF=1
  const r3 = executeAsm('MOV AL, 0\nDAA\nHLT');
  assertEqual(r3.cpu.getReg('AL'), 0, 'DAA on 0 = 0');
  assertEqual(r3.cpu.flags.ZF, 1, 'ZF=1');
  assertEqual(r3.cpu.flags.PF, 1, 'PF=1');
});

test('DAS: packed BCD subtraction adjustments', () => {
  // Case A: 35h - 18h = 1Dh -> 17h, AF=1, CF=0
  const r1 = executeAsm('MOV AL, 35h\nSUB AL, 18h\nDAS\nHLT');
  assertEqual(r1.cpu.getReg('AL'), 0x17, '35h - 18h DAS = 17h');
  assertEqual(r1.cpu.flags.AF, 1, 'AF=1');
  assertEqual(r1.cpu.flags.CF, 0, 'CF=0');

  // Case B: 12h - 29h = E9h -> 83h with borrow CF=1, AF=1
  const r2 = executeAsm('MOV AL, 12h\nSUB AL, 29h\nDAS\nHLT');
  assertEqual(r2.cpu.getReg('AL'), 0x83, '12h - 29h DAS = 83h');
  assertEqual(r2.cpu.flags.CF, 1, 'CF=1');
  assertEqual(r2.cpu.flags.AF, 1, 'AF=1');
});

test('AAA and AAS: unpacked ASCII/BCD adjust', () => {
  // AAA: 9 + 8 = 11h -> AH=1, AL=7, CF=1, AF=1
  const r1 = executeAsm('MOV AX, 0009h\nADD AL, 8\nAAA\nHLT');
  assertEqual(r1.cpu.getReg('AH'), 1, 'AAA AH=1');
  assertEqual(r1.cpu.getReg('AL'), 7, 'AAA AL=7');
  assertEqual(r1.cpu.flags.CF, 1, 'AAA CF=1');
  assertEqual(r1.cpu.flags.AF, 1, 'AAA AF=1');

  // AAS: AX=020Bh -> AH=1, AL=5, CF=1, AF=1
  const r2 = executeAsm('MOV AX, 020Bh\nAAS\nHLT');
  assertEqual(r2.cpu.getReg('AH'), 1, 'AAS AH=1');
  assertEqual(r2.cpu.getReg('AL'), 5, 'AAS AL=5');
  assertEqual(r2.cpu.flags.CF, 1, 'AAS CF=1');
  assertEqual(r2.cpu.flags.AF, 1, 'AAS AF=1');
});

test('AAM and AAD: base 10, custom immediate base, zero edge cases', () => {
  // AAM default base 10: AL=63h (99 dec) -> AH=9, AL=9
  const r1 = executeAsm('MOV AL, 63h\nAAM\nHLT');
  assertEqual(r1.cpu.getReg('AH'), 9, 'AAM base 10 AH=9');
  assertEqual(r1.cpu.getReg('AL'), 9, 'AAM base 10 AL=9');

  // AAM custom base 16: AL=25 (19h) -> AH=1, AL=9
  const r2 = executeAsm('MOV AL, 25\nAAM 16\nHLT');
  assertEqual(r2.cpu.getReg('AH'), 1, 'AAM 16 AH=1');
  assertEqual(r2.cpu.getReg('AL'), 9, 'AAM 16 AL=9');

  // AAD default base 10: AH=3, AL=7 -> AL=37 (25h), AH=0
  const r3 = executeAsm('MOV AH, 3\nMOV AL, 7\nAAD\nHLT');
  assertEqual(r3.cpu.getReg('AH'), 0, 'AAD AH=0');
  assertEqual(r3.cpu.getReg('AL'), 37, 'AAD AL=37');

  // AAD custom base 16: AH=2, AL=5 -> AL=37 (25h), AH=0
  const r4 = executeAsm('MOV AH, 2\nMOV AL, 5\nAAD 16\nHLT');
  assertEqual(r4.cpu.getReg('AH'), 0, 'AAD 16 AH=0');
  assertEqual(r4.cpu.getReg('AL'), 37, 'AAD 16 AL=37');

  // AAM with AL=0 -> sets ZF=1, PF=1
  const r5 = executeAsm('MOV AL, 0\nAAM\nHLT');
  assertEqual(r5.cpu.getReg('AX'), 0, 'AAM with 0 = 0');
  assertEqual(r5.cpu.flags.ZF, 1, 'ZF=1 for AAM 0');
  assertEqual(r5.cpu.flags.PF, 1, 'PF=1 for AAM 0');
});

// ═══════════════════════════════════════════════════════════════════════════
//  SUITE 5: Stack Frame & Calling Conventions
// ═══════════════════════════════════════════════════════════════════════════
suite('5. Stack Frame & Calling Conventions');

test('PUSH/POP registers, immediates, and memory', () => {
  const code = `
    MOV SP, 1000h
    MOV AX, 1234h
    PUSH AX
    PUSH 5678h
    POP BX
    POP CX
    HLT
  `;
  const res = executeAsm(code);
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('BX'), 0x5678, 'BX popped immediate');
  assertEqual(res.cpu.getReg('CX'), 0x1234, 'CX popped AX');
  assertEqual(res.cpu.getReg('SP'), 0x1000, 'SP balanced');
});

test('PUSHA/POPA pushes 8 words and restores original SP', () => {
  const code = `
    MOV AX, 1
    MOV CX, 2
    MOV DX, 3
    MOV BX, 4
    MOV SP, 800h
    MOV BP, 6
    MOV SI, 7
    MOV DI, 8
    PUSHA
    ; Scramble registers
    MOV AX, 0FFh
    MOV BX, 0FFh
    MOV CX, 0FFh
    MOV DX, 0FFh
    MOV BP, 0FFh
    MOV SI, 0FFh
    MOV DI, 0FFh
    POPA
    HLT
  `;
  const res = executeAsm(code);
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('AX'), 1, 'AX restored');
  assertEqual(res.cpu.getReg('CX'), 2, 'CX restored');
  assertEqual(res.cpu.getReg('DX'), 3, 'DX restored');
  assertEqual(res.cpu.getReg('BX'), 4, 'BX restored');
  assertEqual(res.cpu.getReg('SP'), 0x800, 'SP restored');
  assertEqual(res.cpu.getReg('BP'), 6, 'BP restored');
  assertEqual(res.cpu.getReg('SI'), 7, 'SI restored');
  assertEqual(res.cpu.getReg('DI'), 8, 'DI restored');
});

test('PUSHF/POPF preserves and restores all CPU flags', () => {
  const code = `
    STC
    STD
    MOV AX, 0
    SUB AX, 1   ; sets CF=1, SF=1, AF=1, ZF=0
    PUSHF
    ; Clear flags
    CLC
    CLD
    XOR AX, AX  ; sets ZF=1, CF=0, SF=0
    POPF
    HLT
  `;
  const res = executeAsm(code);
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.flags.CF, 1, 'CF restored');
  assertEqual(res.cpu.flags.DF, 1, 'DF restored');
  assertEqual(res.cpu.flags.SF, 1, 'SF restored');
  assertEqual(res.cpu.flags.ZF, 0, 'ZF restored');
});

test('ENTER/LEAVE stack frame creation and teardown', () => {
  const code = `
    MOV SP, 1000h
    MOV BP, 2000h
    ENTER 8, 0     ; allocates 8 bytes on stack
    MOV WORD PTR [BP-2], 1111h
    MOV WORD PTR [BP-4], 2222h
    MOV AX, [BP-2]
    MOV BX, [BP-4]
    LEAVE
    HLT
  `;
  const res = executeAsm(code);
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('AX'), 0x1111, 'Local var [BP-2]');
  assertEqual(res.cpu.getReg('BX'), 0x2222, 'Local var [BP-4]');
  assertEqual(res.cpu.getReg('SP'), 0x1000, 'SP restored by LEAVE');
  assertEqual(res.cpu.getReg('BP'), 0x2000, 'BP restored by LEAVE');
});

test('CALL and RET (nested subroutines)', () => {
  const code = `
    MOV AX, 0
    CALL sub1
    ADD AX, 100
    HLT

  sub1:
    ADD AX, 10
    CALL sub2
    ADD AX, 1
    RET

  sub2:
    ADD AX, 5
    RET
  `;
  const res = executeAsm(code);
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('AX'), 116, 'AX = 10 + 5 + 1 + 100 = 116');
});

test('RET n cleans caller arguments off stack', () => {
  const code = `
    MOV SP, 500h
    PUSH 1111h     ; param 1 (at [BP+6])
    PUSH 2222h     ; param 2 (at [BP+4])
    CALL add_params
    HLT

  add_params:
    ENTER 0, 0
    MOV AX, [BP+4]
    ADD AX, [BP+6]
    LEAVE
    RET 4          ; pop IP and pop 4 bytes of params
  `;
  const res = executeAsm(code);
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('AX'), 0x3333, 'AX = 1111h + 2222h = 3333h');
  assertEqual(res.cpu.getReg('SP'), 0x500, 'Caller SP cleanly restored to 500h');
});

test('RETF restores CS and IP from the stack (far return)', () => {
  const code = `
    PUSH 0ABCDh    ; Target CS
    PUSH 5         ; Target IP instruction index (line 5: MOV BX, 22h)
    RETF
    MOV BX, 11h    ; Index 3
    HLT            ; Index 4
    MOV BX, 22h    ; Index 5
    HLT            ; Index 6
  `;
  const res = executeAsm(code);
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('BX'), 0x22, 'Landed at target instruction');
  assertEqual(res.cpu.getReg('CS'), 0xABCD, 'CS restored to 0xABCD');
});

// ═══════════════════════════════════════════════════════════════════════════
//  SUITE 6: Conditional Jumps Under All 16 Flag Permutations & Loops
// ═══════════════════════════════════════════════════════════════════════════
suite('6. Conditional Jumps & Loops');

function testJump(jcc, flagSetup, shouldJump, desc) {
  const code = `
    MOV BX, 0
    ${flagSetup}
    ${jcc} target
    MOV BX, 100
    JMP done
  target:
    MOV BX, 200
  done:
    HLT
  `;
  const res = executeAsm(code);
  const expectedBX = shouldJump ? 200 : 100;
  assertEqual(res.cpu.getReg('BX'), expectedBX, `${jcc} (${desc}): expected ${shouldJump ? 'TAKEN' : 'NOT TAKEN'}`);
}

// 1. JO / JNO (OF)
test('JO / JNO under OF=1 and OF=0', () => {
  testJump('JO', 'MOV AL, 7Fh\nADD AL, 1', true, 'OF=1');
  testJump('JO', 'MOV AL, 1\nADD AL, 1', false, 'OF=0');
  testJump('JNO', 'MOV AL, 1\nADD AL, 1', true, 'OF=0');
  testJump('JNO', 'MOV AL, 7Fh\nADD AL, 1', false, 'OF=1');
});

// 2. JS / JNS (SF)
test('JS / JNS under SF=1 and SF=0', () => {
  testJump('JS', 'MOV AL, 0\nSUB AL, 1', true, 'SF=1');
  testJump('JS', 'MOV AL, 1\nADD AL, 1', false, 'SF=0');
  testJump('JNS', 'MOV AL, 1\nADD AL, 1', true, 'SF=0');
  testJump('JNS', 'MOV AL, 0\nSUB AL, 1', false, 'SF=1');
});

// 3. JE/JZ / JNE/JNZ (ZF)
test('JE/JZ and JNE/JNZ under ZF=1 and ZF=0', () => {
  testJump('JE', 'XOR AX, AX', true, 'ZF=1');
  testJump('JE', 'MOV AX, 1\nCMP AX, 0', false, 'ZF=0');
  testJump('JZ', 'XOR AX, AX', true, 'ZF=1');
  testJump('JNE', 'MOV AX, 1\nCMP AX, 0', true, 'ZF=0');
  testJump('JNZ', 'XOR AX, AX', false, 'ZF=1');
});

// 4. JB/JC/JNAE and JAE/JNC/JNB (CF)
test('JB/JC/JNAE and JAE/JNC/JNB under CF=1 and CF=0', () => {
  testJump('JB', 'STC', true, 'CF=1');
  testJump('JB', 'CLC', false, 'CF=0');
  testJump('JC', 'STC', true, 'CF=1');
  testJump('JNAE', 'STC', true, 'CF=1');
  testJump('JAE', 'CLC', true, 'CF=0');
  testJump('JAE', 'STC', false, 'CF=1');
  testJump('JNC', 'CLC', true, 'CF=0');
  testJump('JNB', 'CLC', true, 'CF=0');
});

// 5. JBE/JNA and JA/JNBE (CF | ZF)
test('JBE/JNA and JA/JNBE permutations', () => {
  // JBE: CF=1 or ZF=1
  testJump('JBE', 'MOV AL, 1\nCMP AL, 2', true, 'CF=1, ZF=0');
  testJump('JBE', 'MOV AL, 2\nCMP AL, 2', true, 'CF=0, ZF=1');
  testJump('JBE', 'MOV AL, 3\nCMP AL, 2', false, 'CF=0, ZF=0');

  // JA: CF=0 and ZF=0
  testJump('JA', 'MOV AL, 3\nCMP AL, 2', true, 'CF=0, ZF=0');
  testJump('JA', 'MOV AL, 1\nCMP AL, 2', false, 'CF=1, ZF=0');
  testJump('JA', 'MOV AL, 2\nCMP AL, 2', false, 'CF=0, ZF=1');
  testJump('JNBE', 'MOV AL, 3\nCMP AL, 2', true, 'CF=0, ZF=0');
  testJump('JNA', 'MOV AL, 2\nCMP AL, 2', true, 'CF=0, ZF=1');
});

// 6. JL/JNGE and JGE/JNL (SF ^ OF)
test('JL/JNGE and JGE/JNL permutations', () => {
  // JL: SF != OF
  testJump('JL', 'MOV AL, 80h\nCMP AL, 1', true, 'SF=0, OF=1 -> SF!=OF');
  testJump('JL', 'MOV AX, 2\nCMP AX, 3', true, 'SF=1, OF=0 -> SF!=OF');
  testJump('JL', 'MOV AX, 3\nCMP AX, 2', false, 'SF=0, OF=0 -> SF==OF');
  testJump('JNGE', 'MOV AX, 2\nCMP AX, 3', true, 'SF=1, OF=0');

  // JGE: SF == OF
  testJump('JGE', 'MOV AX, 3\nCMP AX, 2', true, 'SF=0, OF=0');
  testJump('JGE', 'MOV AX, 2\nCMP AX, 3', false, 'SF=1, OF=0');
  testJump('JNL', 'MOV AX, 3\nCMP AX, 2', true, 'SF=0, OF=0');
});

// 7. JLE/JNG and JG/JNLE (ZF | (SF ^ OF))
test('JLE/JNG and JG/JNLE permutations', () => {
  // JLE: ZF=1 or SF!=OF
  testJump('JLE', 'MOV AX, 5\nCMP AX, 5', true, 'ZF=1');
  testJump('JLE', 'MOV AX, 2\nCMP AX, 5', true, 'SF!=OF');
  testJump('JLE', 'MOV AX, 5\nCMP AX, 2', false, 'ZF=0 and SF==OF');
  testJump('JNG', 'MOV AX, 5\nCMP AX, 5', true, 'ZF=1');

  // JG: ZF=0 and SF==OF
  testJump('JG', 'MOV AX, 5\nCMP AX, 2', true, 'ZF=0 and SF==OF');
  testJump('JG', 'MOV AX, 5\nCMP AX, 5', false, 'ZF=1');
  testJump('JG', 'MOV AX, 2\nCMP AX, 5', false, 'SF!=OF');
  testJump('JNLE', 'MOV AX, 5\nCMP AX, 2', true, 'ZF=0 and SF==OF');
});

// 8. JP/JPE and JNP/JPO (PF)
test('JP/JPE and JNP/JPO parity checks', () => {
  // AL = 03h (two 1s -> even parity -> PF=1)
  testJump('JP', 'MOV AL, 3\nOR AL, AL', true, 'PF=1 (even)');
  testJump('JPE', 'MOV AL, 3\nOR AL, AL', true, 'PF=1');
  testJump('JNP', 'MOV AL, 3\nOR AL, AL', false, 'PF=1');

  // AL = 01h (one 1 -> odd parity -> PF=0)
  testJump('JP', 'MOV AL, 1\nOR AL, AL', false, 'PF=0 (odd)');
  testJump('JNP', 'MOV AL, 1\nOR AL, AL', true, 'PF=0 (odd)');
  testJump('JPO', 'MOV AL, 1\nOR AL, AL', true, 'PF=0 (odd)');
});

// 9. JCXZ and LOOP variants
test('JCXZ, LOOP, LOOPE/LOOPZ, LOOPNE/LOOPNZ behavior', () => {
  // JCXZ
  testJump('JCXZ', 'MOV CX, 0', true, 'CX=0');
  testJump('JCXZ', 'MOV CX, 1', false, 'CX=1');

  // LOOP: 3 iterations
  const loopCode = `
    MOV AX, 0
    MOV CX, 3
  top:
    ADD AX, 10
    LOOP top
    HLT
  `;
  const rLoop = executeAsm(loopCode);
  assertEqual(rLoop.cpu.getReg('AX'), 30, 'LOOP 3 times -> AX=30');
  assertEqual(rLoop.cpu.getReg('CX'), 0, 'CX=0 after loop');

  // LOOPE / LOOPZ: loops while ZF=1
  const loopeCode = `
    MOV CX, 5
    MOV AX, 0
  top:
    ADD AX, 1
    XOR BX, BX  ; sets ZF=1 every iteration so LOOPE continues
    LOOPE top
    HLT
  `;
  const rLoope = executeAsm(loopeCode);
  assertEqual(rLoope.cpu.getReg('CX'), 0, 'LOOPE ran all 5 iterations');

  const loopzCode = `
    MOV CX, 4
  top2:
    XOR DX, DX
    LOOPZ top2
    HLT
  `;
  const rLoopz = executeAsm(loopzCode);
  assertEqual(rLoopz.cpu.getReg('CX'), 0, 'LOOPZ ran all 4 iterations');

  // LOOPNE / LOOPNZ: loops while ZF=0, breaks when ZF=1
  const loopneCode = `
    MOV CX, 5
    MOV AX, 0
  top:
    INC AX
    CMP AX, 3   ; ZF=1 when AX==3 -> breaks out of LOOPNE!
    LOOPNE top
    HLT
  `;
  const rLoopne = executeAsm(loopneCode);
  assertEqual(rLoopne.cpu.getReg('AX'), 3, 'LOOPNE stopped at AX=3');
  assertEqual(rLoopne.cpu.getReg('CX'), 2, 'CX decremented 3 times (5 - 3 = 2)');

  const loopnzCode = `
    MOV CX, 5
    MOV AX, 0
  top3:
    INC AX
    CMP AX, 2
    LOOPNZ top3
    HLT
  `;
  const rLoopnz = executeAsm(loopnzCode);
  assertEqual(rLoopnz.cpu.getReg('AX'), 2, 'LOOPNZ stopped at AX=2');
  assertEqual(rLoopnz.cpu.getReg('CX'), 3, 'CX decremented 2 times (5 - 2 = 3)');
});

// ═══════════════════════════════════════════════════════════════════════════
//  SUITE 7: Boundary Conditions
// ═══════════════════════════════════════════════════════════════════════════
suite('7. Boundary Conditions');

test('16-bit word overflow & wrap-around at FFFFh', () => {
  // ADD FFFFh + 1 = 0000h, CF=1, ZF=1, AF=1, OF=0
  const rAdd = executeAsm('MOV AX, 0FFFFh\nADD AX, 1\nHLT');
  assertEqual(rAdd.cpu.getReg('AX'), 0, 'FFFFh + 1 = 0');
  assertEqual(rAdd.cpu.flags.CF, 1, 'CF=1');
  assertEqual(rAdd.cpu.flags.ZF, 1, 'ZF=1');

  // SUB 0000h - 1 = FFFFh, CF=1, SF=1, AF=1, OF=0
  const rSub = executeAsm('MOV AX, 0\nSUB AX, 1\nHLT');
  assertEqual(rSub.cpu.getReg('AX'), 0xFFFF, '0 - 1 = FFFFh');
  assertEqual(rSub.cpu.flags.CF, 1, 'CF=1');
  assertEqual(rSub.cpu.flags.SF, 1, 'SF=1');

  // INC at FFFFh wraps to 0, ZF=1, AF=1, CF is UNCHANGED
  const rInc = executeAsm('STC\nMOV AX, 0FFFFh\nINC AX\nHLT');
  assertEqual(rInc.cpu.getReg('AX'), 0, 'INC FFFFh = 0');
  assertEqual(rInc.cpu.flags.CF, 1, 'CF unchanged by INC');
  assertEqual(rInc.cpu.flags.ZF, 1, 'ZF=1');

  // DEC at 0 wraps to FFFFh, SF=1, CF is UNCHANGED
  const rDec = executeAsm('CLC\nMOV AX, 0\nDEC AX\nHLT');
  assertEqual(rDec.cpu.getReg('AX'), 0xFFFF, 'DEC 0 = FFFFh');
  assertEqual(rDec.cpu.flags.CF, 0, 'CF unchanged by DEC');
  assertEqual(rDec.cpu.flags.SF, 1, 'SF=1');
});

test('Stack wrap-around: SP underflow wraps at 0x0000', () => {
  // SP = 0000h -> PUSH AX -> SP = FFFEh
  const code = `
    MOV SP, 0
    MOV AX, 1234h
    PUSH AX
    POP BX
    HLT
  `;
  const res = executeAsm(code);
  assert(!res.error, res.error?.message);
  assertEqual(res.cpu.getReg('BX'), 0x1234, 'BX popped');
  assertEqual(res.cpu.getReg('SP'), 0, 'SP wrapped back to 0');
});

test('Negative values in arithmetic and signed sign extensions', () => {
  // NEG 80h (-128 byte) cannot be represented as +128 in 8 bits -> OF=1, CF=1, AL=80h
  const rNeg80 = executeAsm('MOV AL, 80h\nNEG AL\nHLT');
  assertEqual(rNeg80.cpu.getReg('AL'), 0x80, 'NEG 80h = 80h');
  assertEqual(rNeg80.cpu.flags.OF, 1, 'OF=1 on NEG -128');
  assertEqual(rNeg80.cpu.flags.CF, 1, 'CF=1 on NEG non-zero');

  // NEG 0 -> 0, CF=0, OF=0, ZF=1
  const rNeg0 = executeAsm('MOV AL, 0\nNEG AL\nHLT');
  assertEqual(rNeg0.cpu.getReg('AL'), 0, 'NEG 0 = 0');
  assertEqual(rNeg0.cpu.flags.CF, 0, 'CF=0 on NEG 0');
  assertEqual(rNeg0.cpu.flags.OF, 0, 'OF=0 on NEG 0');
  assertEqual(rNeg0.cpu.flags.ZF, 1, 'ZF=1 on NEG 0');

  // CBW: negative AL=0FEh (-2) -> AX=0FFFEh (-2)
  const rCbw = executeAsm('MOV AL, 0FEh\nCBW\nHLT');
  assertEqual(rCbw.cpu.getReg('AX'), 0xFFFE, 'CBW sign-extends negative');

  // CWD: negative AX=8000h -> DX=0FFFFh, AX=8000h
  const rCwd = executeAsm('MOV AX, 8000h\nCWD\nHLT');
  assertEqual(rCwd.cpu.getReg('DX'), 0xFFFF, 'CWD DX=FFFFh');
  assertEqual(rCwd.cpu.getReg('AX'), 0x8000, 'CWD AX=8000h');

  // IMUL negative: (-3) * 4 = -12 (0xFFF4), sign-extends into AH -> CF=OF=0
  const rImul1 = executeAsm('MOV AL, -3\nMOV BL, 4\nIMUL BL\nHLT');
  assertEqual(rImul1.cpu.getReg('AX'), 0xFFF4, 'IMUL -3 * 4 = -12');
  assertEqual(rImul1.cpu.flags.CF, 0, 'CF=0');
  assertEqual(rImul1.cpu.flags.OF, 0, 'OF=0');

  // IMUL negative overflow: (-128) * (-128) = +16384 (4000h) -> does not fit in AL, CF=OF=1
  const rImul2 = executeAsm('MOV AL, 80h\nMOV BL, 80h\nIMUL BL\nHLT');
  assertEqual(rImul2.cpu.getReg('AX'), 0x4000, 'IMUL -128 * -128 = 4000h');
  assertEqual(rImul2.cpu.flags.CF, 1, 'CF=1');
  assertEqual(rImul2.cpu.flags.OF, 1, 'OF=1');
});

test('Divide by zero and divide overflow error detection', () => {
  function testDivError(code, expectedSubstr) {
    const res = executeAsm(code);
    assert(res.error, `Expected error containing "${expectedSubstr}", but execution succeeded`);
    assert(
      res.error.message.includes(expectedSubstr),
      `Expected error to include "${expectedSubstr}", got "${res.error.message}"`
    );
  }

  // DIV 8-bit by zero
  testDivError('MOV AX, 100\nMOV BL, 0\nDIV BL\nHLT', 'Division by zero');

  // IDIV 8-bit by zero
  testDivError('MOV AX, 100\nMOV BL, 0\nIDIV BL\nHLT', 'Division by zero');

  // DIV 16-bit by zero
  testDivError('MOV DX, 0\nMOV AX, 100\nMOV CX, 0\nDIV CX\nHLT', 'Division by zero');

  // DIV 8-bit quotient overflow (AX=1000 / 2 = 500 > 255)
  testDivError('MOV AX, 1000\nMOV BL, 2\nDIV BL\nHLT', 'Divide overflow');

  // DIV 16-bit quotient overflow (DX:AX = 100000 / 1 = 100000 > 65535)
  testDivError('MOV DX, 1\nMOV AX, 86A0h\nMOV CX, 1\nDIV CX\nHLT', 'Divide overflow');

  // IDIV 8-bit quotient overflow (-128 / -1 = +128 > 127)
  testDivError('MOV AX, 0FF80h\nMOV BL, -1\nIDIV BL\nHLT', 'Divide overflow');
});

test('HLT halting behavior', () => {
  const code = `
    MOV AX, 42
    HLT
    MOV AX, 99
  `;
  const res = executeAsm(code);
  assertEqual(res.cpu.getReg('AX'), 42, 'AX must be 42, code after HLT not executed');
  assertEqual(res.cpu.halted, true, 'CPU must be in halted state');
});

// ═══════════════════════════════════════════════════════════════════════════
//  SUITE 8: LiveSession Integration Edge Cases
// ═══════════════════════════════════════════════════════════════════════════
suite('8. LiveSession Integration Edge Cases');

test('LiveSession: Multi-cell state persistence & complex addressing', () => {
  const s = new LiveSession();
  s.setCells([
    { id: 'c1', kind: 'code', source: 'MOV BX, 100h\nMOV SI, 20h\nMOV WORD PTR [BX+SI], 0BEEFh\nHLT' },
    { id: 'c2', kind: 'code', source: 'MOV AX, [BX+SI]\nADD AX, 1\nHLT' },
  ]);

  const r1 = s.runCell('c1');
  assert(!r1.error, r1.error);
  assertEqual(s.getState().regs.BX, 0x100, 'Cell 1 set BX');

  const r2 = s.runCell('c2');
  assert(!r2.error, r2.error);
  assertEqual(s.getState().regs.AX, 0xBEF0, 'Cell 2 read and modified [BX+SI] (0xBEEF + 1 = 0xBEF0)');
  assertEqual(r2.regDiff['AX']?.[1], 0xBEF0, 'regDiff captured AX transition');
});

test('LiveSession: Repeated cell execution accumulates state (Jupyter-style)', () => {
  const s = new LiveSession();
  s.setCells([
    { id: 'init', kind: 'code', source: 'MOV AX, 0\nHLT' },
    { id: 'add', kind: 'code', source: 'ADD AX, 10\nHLT' },
  ]);

  s.runCell('init');
  assertEqual(s.getState().regs.AX, 0, 'Initialized AX=0');

  // Run 1: 0 + 10 = 10
  s.runCell('add');
  assertEqual(s.getState().regs.AX, 10, 'Run 1: AX=10');

  // Run 2: 10 + 10 = 20
  s.runCell('add');
  assertEqual(s.getState().regs.AX, 20, 'Run 2: AX=20');

  // Run 3: 20 + 10 = 30
  s.runCell('add');
  assertEqual(s.getState().regs.AX, 30, 'Run 3: AX=30');
  assertEqual(s.getExecCount('add'), 4, 'Execution counter incremented');
});

test('LiveSession: Calling subroutines defined across cells (left-cell semantics)', () => {
  const s = new LiveSession();
  s.setCells([
    { id: 'caller', kind: 'code', source: 'MOV AX, 10\nCALL my_func\nHLT' },
    { id: 'callee', kind: 'code', source: 'my_func:\nSHL AX, 1\nRET\nHLT' },
  ]);

  // runCell('caller') stops with reason 'left-cell' when jumping into callee cell
  const r1 = s.runCell('caller');
  assert(!r1.error, r1.error);
  assertEqual(r1.reason, 'left-cell', 'Jumping across cells triggers left-cell reason');

  // continueRun continues execution through callee and back
  const r2 = s.continueRun();
  assert(!r2.error, r2.error);
  assertEqual(s.getState().regs.AX, 20, 'AX doubled in callee cell and returned');
});

test('LiveSession: Error containment on division by zero', () => {
  const s = new LiveSession();
  s.setCells([
    { id: 'c1', kind: 'code', source: 'MOV AX, 50\nMOV BL, 0\nDIV BL\nHLT' },
    { id: 'c2', kind: 'code', source: 'MOV AX, 999\nHLT' },
  ]);

  const r1 = s.runCell('c1');
  assertEqual(r1.reason, 'error', 'Cell 1 must fail with error reason');
  assert(r1.error?.includes('Division by zero'), 'Error message must specify Division by zero');

  // LiveSession remains functional for cell 2
  const r2 = s.runCell('c2');
  assert(r2.reason === 'end' || r2.reason === 'cell-end', `Expected clean end reason, got ${r2.reason}`);
  assert(!r2.error, r2.error);
  assertEqual(s.getState().regs.AX, 999, 'AX set in cell 2');
});

test('LiveSession: Breakpoints stop execution at target line', () => {
  const s = new LiveSession();
  s.setCells([
    { id: 'c1', kind: 'code', source: 'MOV AX, 1\nADD AX, 10\nADD AX, 100\nHLT' }
  ]);

  // Set breakpoint before the second ADD
  s.toggleBreakpoint('c1', 3);
  s.resetMachine();
  const res = s.continueRun();
  assertEqual(res.reason, 'breakpoint', 'Stopped at breakpoint');
  assertEqual(s.getState().regs.AX, 11, 'AX=11 (only first ADD ran)');
});

test('LiveSession: @expect assertion clauses in cells', () => {
  const s = new LiveSession();
  s.setCells([
    {
      id: 'c1',
      kind: 'code',
      source: `
        ; @expect AX = 1234
        ; @expect BX = 5678
        ; @expect ZF = 0
        ; @expect CF = 0
        MOV AX, 1234h
        MOV BX, 5678h
        HLT
      `
    }
  ]);

  const res = s.runCell('c1');
  assert(!res.error, res.error);
  assertEqual(res.allPassed, true, 'All @expect clauses should pass');
  assertEqual(res.expectResults.length, 4, 'Four @expect results evaluated');
  assertEqual(res.expectResults[0].passed, true, '@expect AX passed');
  assertEqual(res.expectResults[1].passed, true, '@expect BX passed');
  assertEqual(res.expectResults[2].passed, true, '@expect ZF passed');
  assertEqual(res.expectResults[3].passed, true, '@expect CF passed');
});

test('LiveSession: Soft HLT handling allows continuation', () => {
  const s = new LiveSession();
  s.setCells([
    { id: 'c1', kind: 'code', source: 'MOV CX, 5\nHLT' },
    { id: 'c2', kind: 'code', source: 'INC CX\nHLT' },
  ]);

  s.runCell('c1');
  assertEqual(s.getState().regs.CX, 5, 'Cell 1 set CX=5');

  s.runCell('c2');
  assertEqual(s.getState().regs.CX, 6, 'Cell 2 incremented CX past Cell 1 HLT');
});

// ═══════════════════════════════════════════════════════════════════════════
//  FINAL SUMMARY
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═════════════════════════════════════════════════════════════');
console.log(`TOTAL TESTS:  ${totalTests}`);
console.log(`PASSED:       \x1b[32m${passedTests}\x1b[0m`);
console.log(`FAILED:       ${failedTests > 0 ? `\x1b[31m${failedTests}\x1b[0m` : '0'}`);
console.log(`PASS RATE:    ${((passedTests / totalTests) * 100).toFixed(1)}%`);
console.log('═════════════════════════════════════════════════════════════');

if (failedTests > 0) {
  console.log('\n\x1b[31mFAILURES BREAKDOWN:\x1b[0m');
  for (const f of failures) {
    console.log(`\n  [${f.suite}] ${f.name}`);
    console.log(`    Message: ${f.message}`);
  }
  process.exit(1);
} else {
  console.log('\n\x1b[32m✓ All deep edge cases passed successfully!\x1b[0m\n');
  process.exit(0);
}
