// ============================================================================
//  scratch/test-real-world-programs.mjs
//  Real-World 8086 Program Suite Tester for ASMBOOK
//
//  Compiles and runs 8 canonical 8086 assembly curriculum programs:
//    1. Euclidean GCD algorithm (48, 18 -> 6)
//    2. Bubble Sort on 6-element array in .DATA
//    3. Fibonacci sequence (first 8 numbers in memory: 0,1,1,2,3,5,8,13)
//    4. Palindrome / string reverse check using string instructions + INT 21h AH=09h
//    5. Factorial calculation (5! = 120 / 78h) via subroutines with CALL/RET
//    6. Binary search on sorted array in memory (match and miss)
//    7. String character counter / frequency table
//    8. Sum of 16-bit array with 32-bit accumulated sum in DX:AX
//
//  Tests each program through both:
//    - LiveSession (notebook multi-cell kernel, @expect directives, live memory)
//    - Raw engine (CPU, Parser, Executor from engine.mjs)
//  Asserts final register states, memory bytes, and output console strings.
// ============================================================================

import assert from 'node:assert/strict';
import { LiveSession } from '../src/kernel/session.ts';
import { CPU, Parser, Executor, hex, hex2 } from '../src/kernel/engine.mjs';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m',
};

let totalSuites = 0;
let passedSuites = 0;
let totalAssertions = 0;
let passedAssertions = 0;
const resultsLog = [];

function check(desc, actual, expected) {
  totalAssertions++;
  try {
    assert.deepStrictEqual(actual, expected);
    passedAssertions++;
    return { ok: true, desc };
  } catch (err) {
    return { ok: false, desc, actual, expected, err: err.message };
  }
}

console.log(`${colors.bold}${colors.cyan}================================================================`);
console.log(`  ASMBOOK — Real-World 8086 Curriculum Verification Suite`);
console.log(`================================================================${colors.reset}\n`);

// ----------------------------------------------------------------------------
// PROGRAM 1: Euclidean GCD Algorithm (gcd of 48 and 18 -> 6)
// ----------------------------------------------------------------------------
{
  totalSuites++;
  const progName = 'Program 1: Euclidean GCD Algorithm';
  console.log(`${colors.bold}${colors.yellow}[${totalSuites}/8] Testing ${progName}...${colors.reset}`);

  // Multi-cell LiveSession test
  const session = new LiveSession();
  session.setCells([
    {
      id: 'doc',
      kind: 'markdown',
      source: '# Euclidean GCD\nCalculates greatest common divisor of 48 and 18 using modulo division.',
    },
    {
      id: 'data',
      kind: 'code',
      source: `.DATA
    num1 DW 48
    num2 DW 18
    gcd_res DW 0
    msg DB 'GCD(48,18) = 6$', 0`,
    },
    {
      id: 'code',
      kind: 'code',
      source: `.CODE
    MOV AX, [num1]
    MOV BX, [num2]

gcd_loop:
    CMP BX, 0
    JE gcd_done
    XOR DX, DX
    DIV BX          ; DX:AX / BX -> quotient in AX, remainder in DX
    MOV AX, BX      ; AX = old divisor
    MOV BX, DX      ; BX = remainder
    JMP gcd_loop

gcd_done:
    MOV [gcd_res], AX

    ; Preserve AX and DX across INT 21h print call
    PUSH AX
    PUSH DX
    MOV DX, msg
    MOV AH, 09h
    INT 21h
    POP DX
    POP AX

    ; @expect AX = 6
    ; @expect BX = 0
    ; @expect DX = 0
    HLT`,
    },
  ]);

  const runRes = session.runUpTo('code');
  const state = session.getState();
  const gcdAddr = session.parsed.vars['GCD_RES'].addr;
  const memGcd = session.evalCtx().memReadByte(gcdAddr) | (session.evalCtx().memReadByte(gcdAddr + 1) << 8);

  const checks = [
    check('Session ran to completion (end/halted)', ['end', 'halted'].includes(runRes.reason), true),
    check('All @expect directives passed', runRes.allPassed, true),
    check('Register AX == 6 (GCD result)', state.regs.AX, 6),
    check('Register BX == 0 (final remainder)', state.regs.BX, 0),
    check('Register DX == 0 (cleared remainder)', state.regs.DX, 0),
    check('Memory [gcd_res] == 6', memGcd, 6),
    check('Console output matched', runRes.output, 'GCD(48,18) = 6'),
  ];

  // Headless raw engine parity test with another number pair: gcd(270, 192) -> 6
  const rawCode = `
.DATA
a DW 270
b DW 192
.CODE
MOV AX, [a]
MOV BX, [b]
loop:
CMP BX, 0
JE done
XOR DX, DX
DIV BX
MOV AX, BX
MOV BX, DX
JMP loop
done:
HLT`;
  const cpu = new CPU();
  const parsed = new Parser().parse(rawCode);
  const ex = new Executor(cpu, parsed);
  while (!cpu.halted && cpu.ip < ex.instrs.length) ex.step();
  checks.push(check('Raw engine parity: gcd(270, 192) == 6 in AX', cpu.getReg('AX'), 6));

  const suitePass = checks.every(c => c.ok);
  if (suitePass) passedSuites++;
  resultsLog.push({ name: progName, ok: suitePass, checks, steps: runRes.steps });
}

// ----------------------------------------------------------------------------
// PROGRAM 2: Bubble Sort on an array of 6 numbers in .DATA
// ----------------------------------------------------------------------------
{
  totalSuites++;
  const progName = 'Program 2: Bubble Sort on Array of 6 Numbers';
  console.log(`${colors.bold}${colors.yellow}[${totalSuites}/8] Testing ${progName}...${colors.reset}`);

  const initialArray = [50, 12, 85, 3, 99, 21];
  const expectedSorted = [3, 12, 21, 50, 85, 99];

  const session = new LiveSession();
  session.setCells([
    {
      id: 'doc',
      kind: 'markdown',
      source: '# Bubble Sort\nSorts 6 16-bit words ascending in .DATA.',
    },
    {
      id: 'data',
      kind: 'code',
      source: `.DATA
    arr DW 50, 12, 85, 3, 99, 21
    msg DB 'SORTED ASCENDING$', 0`,
    },
    {
      id: 'code',
      kind: 'code',
      source: `.CODE
    MOV CX, 5              ; 6 elements -> 5 outer passes
outer_loop:
    PUSH CX
    MOV BX, arr
    MOV SI, 0
inner_loop:
    MOV AX, [BX+SI]
    MOV DX, [BX+SI+2]
    CMP AX, DX
    JLE no_swap
    MOV [BX+SI], DX
    MOV [BX+SI+2], AX
no_swap:
    ADD SI, 2
    LOOP inner_loop        ; inner loop runs CX times

    POP CX
    LOOP outer_loop

    ; Print success notification
    PUSH DX
    MOV DX, msg
    MOV AH, 09h
    INT 21h
    POP DX

    ; @expect CX = 0
    HLT`,
    },
  ]);

  const runRes = session.runUpTo('code');
  const arrAddr = session.parsed.vars['ARR'].addr;
  const actualSorted = [];
  for (let i = 0; i < 6; i++) {
    const lo = session.evalCtx().memReadByte(arrAddr + i * 2);
    const hi = session.evalCtx().memReadByte(arrAddr + i * 2 + 1);
    actualSorted.push(lo | (hi << 8));
  }

  const checks = [
    check('Session ran to completion', ['end', 'halted'].includes(runRes.reason), true),
    check('Outer loop counter CX reached 0', session.getState().regs.CX, 0),
    check('Memory array sorted ascending [3, 12, 21, 50, 85, 99]', actualSorted, expectedSorted),
    check('Console output matched', runRes.output, 'SORTED ASCENDING'),
    check('All @expect passed', runRes.allPassed, true),
  ];

  const suitePass = checks.every(c => c.ok);
  if (suitePass) passedSuites++;
  resultsLog.push({ name: progName, ok: suitePass, checks, steps: runRes.steps });
}

// ----------------------------------------------------------------------------
// PROGRAM 3: Fibonacci sequence (first 8 numbers in memory: 0,1,1,2,3,5,8,13)
// ----------------------------------------------------------------------------
{
  totalSuites++;
  const progName = 'Program 3: Fibonacci Sequence Generator (8 numbers)';
  console.log(`${colors.bold}${colors.yellow}[${totalSuites}/8] Testing ${progName}...${colors.reset}`);

  const expectedFib = [0, 1, 1, 2, 3, 5, 8, 13];

  const session = new LiveSession();
  session.setCells([
    {
      id: 'doc',
      kind: 'markdown',
      source: '# Fibonacci Sequence\nGenerates first 8 Fibonacci numbers in memory.',
    },
    {
      id: 'data',
      kind: 'code',
      source: `.DATA
    fib DB 8 DUP(0)
    msg DB 'FIB8: 0,1,1,2,3,5,8,13$', 0`,
    },
    {
      id: 'code',
      kind: 'code',
      source: `.CODE
    MOV BX, fib
    MOV BYTE [BX], 0          ; F(0) = 0
    MOV BYTE [BX+1], 1        ; F(1) = 1
    MOV SI, 2                 ; index for F(2)
    MOV CX, 6                 ; generate 6 more terms (F(2)..F(7))

fib_loop:
    MOV AL, [BX+SI-1]         ; F(n-1)
    ADD AL, [BX+SI-2]         ; + F(n-2)
    MOV [BX+SI], AL           ; F(n) = AL
    INC SI
    LOOP fib_loop

    ; Print message while preserving AL and DX
    PUSH AX
    PUSH DX
    MOV DX, msg
    MOV AH, 09h
    INT 21h
    POP DX
    POP AX

    ; In @expect, values are parsed as hex: 13 decimal = 0D hex
    ; @expect AL = 0D
    ; @expect CX = 0
    HLT`,
    },
  ]);

  const runRes = session.runUpTo('code');
  const state = session.getState();
  const fibAddr = session.parsed.vars['FIB'].addr;
  const actualFib = [];
  for (let i = 0; i < 8; i++) {
    actualFib.push(session.evalCtx().memReadByte(fibAddr + i));
  }

  const checks = [
    check('Session ran to completion', ['end', 'halted'].includes(runRes.reason), true),
    check('Last Fibonacci number in AL == 13 (0x0D)', state.regs.AX & 0xFF, 13),
    check('Loop counter CX == 0', state.regs.CX, 0),
    check('Memory bytes match Fibonacci [0, 1, 1, 2, 3, 5, 8, 13]', actualFib, expectedFib),
    check('Console output matched', runRes.output, 'FIB8: 0,1,1,2,3,5,8,13'),
    check('All @expect passed', runRes.allPassed, true),
  ];

  const suitePass = checks.every(c => c.ok);
  if (suitePass) passedSuites++;
  resultsLog.push({ name: progName, ok: suitePass, checks, steps: runRes.steps });
}

// ----------------------------------------------------------------------------
// PROGRAM 4: Palindrome / string reverse check using string instructions + INT 21h
// ----------------------------------------------------------------------------
{
  totalSuites++;
  const progName = 'Program 4: Palindrome & String Reverse via String Instructions';
  console.log(`${colors.bold}${colors.yellow}[${totalSuites}/8] Testing ${progName}...${colors.reset}`);

  // Test Case A: Positive Palindrome ('RADAR')
  const sessionPos = new LiveSession();
  sessionPos.setCells([
    {
      id: 'data',
      kind: 'code',
      source: `.DATA
    orig DB 'RADAR', '$'
    rev DB 5 DUP(0), '$'
    msg_pal DB 'RADAR IS PALINDROME$', 0
    msg_not DB 'NOT PALINDROME$', 0`,
    },
    {
      id: 'code',
      kind: 'code',
      source: `.CODE
    ; Reverse orig into rev using LODSB (with STD) and STOSB (with CLD)
    MOV CX, 5
    MOV SI, orig
    ADD SI, 4               ; SI points to last char of orig
    MOV DI, rev             ; DI points to start of rev
rev_loop:
    STD                     ; DF=1: LODSB decrements SI
    LODSB
    CLD                     ; DF=0: STOSB increments DI
    STOSB
    LOOP rev_loop

    ; Compare orig and rev using REPE CMPSB
    MOV SI, orig
    MOV DI, rev
    MOV CX, 5
    CLD
    REPE CMPSB
    JNE is_not_pal

    MOV DX, msg_pal
    MOV AH, 09h
    INT 21h
    JMP check_done

is_not_pal:
    MOV DX, msg_not
    MOV AH, 09h
    INT 21h

check_done:
    ; @expect ZF = 1
    HLT`,
    },
  ]);

  const resPos = sessionPos.runUpTo('code');
  const revAddrPos = sessionPos.parsed.vars['REV'].addr;
  let revStrPos = '';
  for (let i = 0; i < 5; i++) {
    revStrPos += String.fromCharCode(sessionPos.evalCtx().memReadByte(revAddrPos + i));
  }

  // Test Case B: Negative Non-Palindrome ('HELLO' -> 'OLLEH')
  const sessionNeg = new LiveSession();
  sessionNeg.setCells([
    {
      id: 'data',
      kind: 'code',
      source: `.DATA
    orig DB 'HELLO', '$'
    rev DB 5 DUP(0), '$'
    msg_pal DB 'IS PALINDROME$', 0
    msg_not DB 'HELLO IS NOT PALINDROME$', 0`,
    },
    {
      id: 'code',
      kind: 'code',
      source: `.CODE
    MOV CX, 5
    MOV SI, orig
    ADD SI, 4
    MOV DI, rev
rev_loop:
    STD
    LODSB
    CLD
    STOSB
    LOOP rev_loop

    MOV SI, orig
    MOV DI, rev
    MOV CX, 5
    CLD
    REPE CMPSB
    JNE is_not_pal

    MOV DX, msg_pal
    MOV AH, 09h
    INT 21h
    JMP check_done

is_not_pal:
    MOV DX, msg_not
    MOV AH, 09h
    INT 21h

check_done:
    ; @expect ZF = 0
    HLT`,
    },
  ]);

  const resNeg = sessionNeg.runUpTo('code');
  const revAddrNeg = sessionNeg.parsed.vars['REV'].addr;
  let revStrNeg = '';
  for (let i = 0; i < 5; i++) {
    revStrNeg += String.fromCharCode(sessionNeg.evalCtx().memReadByte(revAddrNeg + i));
  }

  const checks = [
    check('Palindrome test ran to completion', ['end', 'halted'].includes(resPos.reason), true),
    check('Memory contains reversed string "RADAR"', revStrPos, 'RADAR'),
    check('Zero flag ZF == 1 after matching REPE CMPSB', sessionPos.getState().flags.ZF, 1),
    check('Console output for palindrome', resPos.output, 'RADAR IS PALINDROME'),
    check('All @expect passed for positive case', resPos.allPassed, true),

    check('Non-palindrome test ran to completion', ['end', 'halted'].includes(resNeg.reason), true),
    check('Memory contains reversed string "OLLEH"', revStrNeg, 'OLLEH'),
    check('Zero flag ZF == 0 after mismatching REPE CMPSB', sessionNeg.getState().flags.ZF, 0),
    check('Console output for non-palindrome', resNeg.output, 'HELLO IS NOT PALINDROME'),
    check('All @expect passed for negative case', resNeg.allPassed, true),
  ];

  const suitePass = checks.every(c => c.ok);
  if (suitePass) passedSuites++;
  resultsLog.push({ name: progName, ok: suitePass, checks, steps: resPos.steps + resNeg.steps });
}

// ----------------------------------------------------------------------------
// PROGRAM 5: Factorial calculation (5! = 120 / 78h) via subroutines with CALL/RET
// ----------------------------------------------------------------------------
{
  totalSuites++;
  const progName = 'Program 5: Factorial (5! = 120) via Recursive CALL/RET';
  console.log(`${colors.bold}${colors.yellow}[${totalSuites}/8] Testing ${progName}...${colors.reset}`);

  const session = new LiveSession();
  session.setCells([
    {
      id: 'doc',
      kind: 'markdown',
      source: '# Recursive Factorial\nComputes 5! = 120 via subroutines with CALL, RET, PUSH, and POP.',
    },
    {
      id: 'data',
      kind: 'code',
      source: `.DATA
    n DW 5
    result DW 0
    msg DB '5! = 120$', 0`,
    },
    {
      id: 'code',
      kind: 'code',
      source: `.CODE
    MOV AX, [n]
    CALL fact
    MOV [result], AX

    ; Output formatted string while preserving registers
    PUSH AX
    PUSH DX
    MOV DX, msg
    MOV AH, 09h
    INT 21h
    POP DX
    POP AX

    JMP prog_end

fact:
    CMP AX, 1
    JLE base_case
    PUSH AX               ; save n
    DEC AX                ; n - 1
    CALL fact             ; recursive call: returns (n-1)! in AX
    POP BX                ; restore n into BX
    MUL BX                ; AX = AX * BX = (n-1)! * n
    RET
base_case:
    MOV AX, 1
    RET

prog_end:
    ; 120 decimal = 0078 hex
    ; @expect AX = 78
    ; @expect SP = FFFE
    HLT`,
    },
  ]);

  const runRes = session.runUpTo('code');
  const state = session.getState();
  const resAddr = session.parsed.vars['RESULT'].addr;
  const memResult = session.evalCtx().memReadByte(resAddr) | (session.evalCtx().memReadByte(resAddr + 1) << 8);

  const checks = [
    check('Session ran to completion', ['end', 'halted'].includes(runRes.reason), true),
    check('Register AX == 120 (0x78)', state.regs.AX, 120),
    check('Register DX == 0 (upper 16 bits of 16-bit MUL)', state.regs.DX, 0),
    check('Stack balanced: SP == 0xFFFE (65534)', state.regs.SP, 0xFFFE),
    check('Memory [result] == 120', memResult, 120),
    check('Console output matched', runRes.output, '5! = 120'),
    check('All @expect passed', runRes.allPassed, true),
  ];

  const suitePass = checks.every(c => c.ok);
  if (suitePass) passedSuites++;
  resultsLog.push({ name: progName, ok: suitePass, checks, steps: runRes.steps });
}

// ----------------------------------------------------------------------------
// PROGRAM 6: Binary search on a sorted array in memory
// ----------------------------------------------------------------------------
{
  totalSuites++;
  const progName = 'Program 6: Binary Search on Sorted Array';
  console.log(`${colors.bold}${colors.yellow}[${totalSuites}/8] Testing ${progName}...${colors.reset}`);

  // Array: [10, 25, 33, 47, 52, 68, 79, 91]
  // Target 52 -> found at index 4
  const sessionHit = new LiveSession();
  sessionHit.setCells([
    {
      id: 'data',
      kind: 'code',
      source: `.DATA
    arr DW 10, 25, 33, 47, 52, 68, 79, 91
    target DW 52
    found_idx DW 0
    msg_hit DB 'FOUND AT 4$', 0
    msg_miss DB 'NOT FOUND$', 0`,
    },
    {
      id: 'code',
      kind: 'code',
      source: `.CODE
    MOV SI, 0              ; low = 0
    MOV DI, 7              ; high = 7
    MOV DX, [target]       ; search key

bs_loop:
    CMP SI, DI
    JG not_found

    ; mid = (low + high) / 2
    MOV AX, SI
    ADD AX, DI
    SHR AX, 1              ; AX = mid
    MOV BX, AX

    ; word offset = mid * 2
    SHL BX, 1
    MOV CX, [arr+BX]

    CMP CX, DX
    JE found
    JL search_right

    ; search left: high = mid - 1
    DEC AX
    MOV DI, AX
    JMP bs_loop

search_right:
    INC AX
    MOV SI, AX
    JMP bs_loop

found:
    MOV [found_idx], AX
    PUSH AX
    MOV DX, msg_hit
    MOV AH, 09h
    INT 21h
    POP AX
    JMP bs_done

not_found:
    MOV AX, 0FFFFh
    MOV [found_idx], AX
    PUSH AX
    MOV DX, msg_miss
    MOV AH, 09h
    INT 21h
    POP AX

bs_done:
    ; @expect AX = 4
    HLT`,
    },
  ]);

  const resHit = sessionHit.runUpTo('code');
  const hitAddr = sessionHit.parsed.vars['FOUND_IDX'].addr;
  const memHit = sessionHit.evalCtx().memReadByte(hitAddr) | (sessionHit.evalCtx().memReadByte(hitAddr + 1) << 8);

  // Search for absent target 88 -> not found (index -1 / 0xFFFF)
  const sessionMiss = new LiveSession();
  sessionMiss.setCells([
    {
      id: 'data',
      kind: 'code',
      source: `.DATA
    arr DW 10, 25, 33, 47, 52, 68, 79, 91
    target DW 88
    found_idx DW 0
    msg_hit DB 'FOUND$', 0
    msg_miss DB 'NOT FOUND$', 0`,
    },
    {
      id: 'code',
      kind: 'code',
      source: `.CODE
    MOV SI, 0
    MOV DI, 7
    MOV DX, [target]

bs_loop:
    CMP SI, DI
    JG not_found

    MOV AX, SI
    ADD AX, DI
    SHR AX, 1
    MOV BX, AX

    SHL BX, 1
    MOV CX, [arr+BX]

    CMP CX, DX
    JE found
    JL search_right

    DEC AX
    MOV DI, AX
    JMP bs_loop

search_right:
    INC AX
    MOV SI, AX
    JMP bs_loop

found:
    MOV [found_idx], AX
    PUSH AX
    MOV DX, msg_hit
    MOV AH, 09h
    INT 21h
    POP AX
    JMP bs_done

not_found:
    MOV AX, 0FFFFh
    MOV [found_idx], AX
    PUSH AX
    MOV DX, msg_miss
    MOV AH, 09h
    INT 21h
    POP AX

bs_done:
    ; In @expect, hex FFFF = 65535
    ; @expect AX = FFFF
    HLT`,
    },
  ]);

  const resMiss = sessionMiss.runUpTo('code');
  const missAddr = sessionMiss.parsed.vars['FOUND_IDX'].addr;
  const memMiss = sessionMiss.evalCtx().memReadByte(missAddr) | (sessionMiss.evalCtx().memReadByte(missAddr + 1) << 8);

  const checks = [
    check('Hit search ran to completion', ['end', 'halted'].includes(resHit.reason), true),
    check('Index for key 52 in AX == 4', sessionHit.getState().regs.AX, 4),
    check('Memory [found_idx] == 4', memHit, 4),
    check('Console output on hit', resHit.output, 'FOUND AT 4'),
    check('All @expect passed on hit', resHit.allPassed, true),

    check('Miss search ran to completion', ['end', 'halted'].includes(resMiss.reason), true),
    check('Index for absent key 88 in AX == 0xFFFF (65535)', sessionMiss.getState().regs.AX, 0xFFFF),
    check('Memory [found_idx] == 0xFFFF', memMiss, 0xFFFF),
    check('Console output on miss', resMiss.output, 'NOT FOUND'),
    check('All @expect passed on miss', resMiss.allPassed, true),
  ];

  const suitePass = checks.every(c => c.ok);
  if (suitePass) passedSuites++;
  resultsLog.push({ name: progName, ok: suitePass, checks, steps: resHit.steps + resMiss.steps });
}

// ----------------------------------------------------------------------------
// PROGRAM 7: String character counter / frequency table
// ----------------------------------------------------------------------------
{
  totalSuites++;
  const progName = 'Program 7: String Character Counter & Frequency Table';
  console.log(`${colors.bold}${colors.yellow}[${totalSuites}/8] Testing ${progName}...${colors.reset}`);

  // String: 'ABRACADABRA'
  // Counts: A:5, B:2, C:1, D:1, R:2. Total: 11 characters.
  const session = new LiveSession();
  session.setCells([
    {
      id: 'doc',
      kind: 'markdown',
      source: '# Character Frequency\nScans string and builds a 26-entry histogram table in .DATA.',
    },
    {
      id: 'data',
      kind: 'code',
      source: `.DATA
    text DB 'ABRACADABRA', 0
    freq DB 26 DUP(0)
    total DW 0
    msg DB 'FREQ TABLE READY$', 0`,
    },
    {
      id: 'code',
      kind: 'code',
      source: `.CODE
    MOV SI, text
    MOV BX, freq
    XOR CX, CX              ; total character count

count_loop:
    MOV AL, [SI]
    CMP AL, 0
    JE count_done
    INC SI
    INC CX

    ; Map 'A'-'Z' to index 0-25
    SUB AL, 'A'
    XOR AH, AH
    MOV DI, AX
    MOV DL, [BX+DI]
    INC DL
    MOV [BX+DI], DL
    JMP count_loop

count_done:
    MOV [total], CX

    ; Output status message while preserving CX
    PUSH CX
    MOV DX, msg
    MOV AH, 09h
    INT 21h
    POP CX

    ; 11 decimal = 0B hex in @expect
    ; @expect CX = 0B
    HLT`,
    },
  ]);

  const runRes = session.runUpTo('code');
  const state = session.getState();
  const freqAddr = session.parsed.vars['FREQ'].addr;
  const totalAddr = session.parsed.vars['TOTAL'].addr;

  const actualFreqs = {};
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    actualFreqs[letter] = session.evalCtx().memReadByte(freqAddr + i);
  }
  const actualTotal = session.evalCtx().memReadByte(totalAddr) | (session.evalCtx().memReadByte(totalAddr + 1) << 8);

  const checks = [
    check('Session ran to completion', ['end', 'halted'].includes(runRes.reason), true),
    check('Total characters in CX == 11', state.regs.CX, 11),
    check('Memory [total] == 11', actualTotal, 11),
    check("Frequency of 'A' == 5", actualFreqs['A'], 5),
    check("Frequency of 'B' == 2", actualFreqs['B'], 2),
    check("Frequency of 'C' == 1", actualFreqs['C'], 1),
    check("Frequency of 'D' == 1", actualFreqs['D'], 1),
    check("Frequency of 'R' == 2", actualFreqs['R'], 2),
    check("Frequency of non-present letter 'E' == 0", actualFreqs['E'], 0),
    check("Frequency of non-present letter 'Z' == 0", actualFreqs['Z'], 0),
    check('Console output matched', runRes.output, 'FREQ TABLE READY'),
    check('All @expect passed', runRes.allPassed, true),
  ];

  const suitePass = checks.every(c => c.ok);
  if (suitePass) passedSuites++;
  resultsLog.push({ name: progName, ok: suitePass, checks, steps: runRes.steps });
}

// ----------------------------------------------------------------------------
// PROGRAM 8: Sum of 16-bit array with 32-bit accumulated sum in DX:AX
// ----------------------------------------------------------------------------
{
  totalSuites++;
  const progName = 'Program 8: 16-bit Array Sum with 32-bit Accumulator DX:AX';
  console.log(`${colors.bold}${colors.yellow}[${totalSuites}/8] Testing ${progName}...${colors.reset}`);

  // Array values: 35000, 42000, 28000, 51000, 16000, 60000
  // Mathematical Sum = 232,000 = 0x00038A40
  // DX (high 16 bits) = 0x0003 = 3
  // AX (low 16 bits)  = 0x8A40 = 35392
  const session = new LiveSession();
  session.setCells([
    {
      id: 'doc',
      kind: 'markdown',
      source: '# 32-bit Array Sum\nSums 16-bit values with multi-word precision using ADD and ADC.',
    },
    {
      id: 'data',
      kind: 'code',
      source: `.DATA
    arr DW 35000, 42000, 28000, 51000, 16000, 60000
    sum_lo DW 0
    sum_hi DW 0
    msg DB 'SUM = 232000 OK$', 0`,
    },
    {
      id: 'code',
      kind: 'code',
      source: `.CODE
    MOV SI, arr
    MOV CX, 6
    XOR AX, AX              ; low 16 bits accumulator
    XOR DX, DX              ; high 16 bits accumulator

sum_loop:
    ADD AX, [SI]
    ADC DX, 0               ; carry propagates to DX
    ADD SI, 2
    LOOP sum_loop

    MOV [sum_lo], AX
    MOV [sum_hi], DX

    ; Print confirmation message while preserving DX and AX
    PUSH AX
    PUSH DX
    MOV DX, msg
    MOV AH, 09h
    INT 21h
    POP DX
    POP AX

    ; @expect DX = 3
    ; 35392 decimal = 8A40 hex in @expect
    ; @expect AX = 8A40
    HLT`,
    },
  ]);

  const runRes = session.runUpTo('code');
  const state = session.getState();
  const loAddr = session.parsed.vars['SUM_LO'].addr;
  const hiAddr = session.parsed.vars['SUM_HI'].addr;

  const memLo = session.evalCtx().memReadByte(loAddr) | (session.evalCtx().memReadByte(loAddr + 1) << 8);
  const memHi = session.evalCtx().memReadByte(hiAddr) | (session.evalCtx().memReadByte(hiAddr + 1) << 8);
  const full32BitSum = (memHi * 65536) + memLo;

  const checks = [
    check('Session ran to completion', ['end', 'halted'].includes(runRes.reason), true),
    check('High word DX == 3 (0x0003)', state.regs.DX, 3),
    check('Low word AX == 35392 (0x8A40)', state.regs.AX, 35392),
    check('Memory [sum_hi] == 3', memHi, 3),
    check('Memory [sum_lo] == 35392 (0x8A40)', memLo, 35392),
    check('Reconstructed 32-bit sum == 232000', full32BitSum, 232000),
    check('Console output matched', runRes.output, 'SUM = 232000 OK'),
    check('All @expect passed', runRes.allPassed, true),
  ];

  const suitePass = checks.every(c => c.ok);
  if (suitePass) passedSuites++;
  resultsLog.push({ name: progName, ok: suitePass, checks, steps: runRes.steps });
}

// ----------------------------------------------------------------------------
// RESULTS REPORT
// ----------------------------------------------------------------------------
console.log(`\n${colors.bold}${colors.cyan}================================================================`);
console.log(`  VERIFICATION RESULTS SUMMARY`);
console.log(`================================================================${colors.reset}\n`);

for (const res of resultsLog) {
  const symbol = res.ok ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
  console.log(`${symbol} ${colors.bold}${res.name}${colors.reset} (${res.steps} steps)`);
  for (const c of res.checks) {
    if (c.ok) {
      console.log(`    ${colors.green}✓${colors.reset} ${colors.gray}${c.desc}${colors.reset}`);
    } else {
      console.log(`    ${colors.red}✗ ${c.desc}${colors.reset}`);
      console.log(`        Expected: ${JSON.stringify(c.expected)}`);
      console.log(`        Got:      ${JSON.stringify(c.actual)}`);
    }
  }
}

const allPassed = passedSuites === totalSuites && passedAssertions === totalAssertions;
console.log(`\n----------------------------------------------------------------`);
if (allPassed) {
  console.log(`${colors.green}${colors.bold}ALL ${totalSuites} CANONICAL REAL-WORLD PROGRAMS PASSED!${colors.reset}`);
  console.log(`${colors.green}Suites:      ${passedSuites} / ${totalSuites} passed (100%)${colors.reset}`);
  console.log(`${colors.green}Assertions:  ${passedAssertions} / ${totalAssertions} passed (100%)${colors.reset}`);
} else {
  console.log(`${colors.red}${colors.bold}SOME PROGRAMS FAILED!${colors.reset}`);
  console.log(`${colors.red}Suites:      ${passedSuites} / ${totalSuites} passed${colors.reset}`);
  console.log(`${colors.red}Assertions:  ${passedAssertions} / ${totalAssertions} passed${colors.reset}`);
}
console.log(`----------------------------------------------------------------\n`);

process.exit(allPassed ? 0 : 1);
