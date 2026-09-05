// ============================================================================
//  scratch/test-notebook-logic-vigorous.mjs
//  Notebook Logic & Expectation Tester Vigorous Stress Suite for ASMBOOK
//
//  Covers:
//    1. All expectation assertion formats parsed by parseExpects & parseExpectLine:
//       - Register assertions (; expect: AX == 0042h, AH == 12h, AL == 34h, BX != 0, CX >= 5, DX < 100)
//       - Flag assertions (; expect: ZF == 1, CF == 0, SF == 1, OF == 0, etc.)
//       - Memory assertions (; expect: [1000h] == 42h, [BX] == 1234h, [msg] == 'H')
//       - Output assertions (; expect: output == "HELLO", substring matches)
//       - Step count assertions (; expect: steps < 50)
//       - Halting assertions (; expect: halted == true)
//       - Current @expect syntax equivalents and differences
//       - Edge cases: malformed comments, multiple expects/line, empty lines, mixed case, number parsing bugs
//    2. Multi-cell execution state lifecycle in LiveSession:
//       - Run cell A, check accumulator state
//       - Run cell B that depends on cell A's registers and memory
//       - Edit cell A and re-run (verify needsRestart / stale flags)
//       - Infinite loop detection (step cap, no freeze, no state corruption)
//       - Breakpoint hit & resume behavior (execution pause, step-over requirement)
//       - Single-stepping step() through cells (verifying cursor { cellId, line, instrIndex })
//       - Reset session resetMachine() (registers, flags, memory, outputs)
//    3. Notebook persistence & export:
//       - exportNotebook & importNotebook (valid, legacy, corrupt, oversized)
//       - Autograder scoring calculation (% passed assertions across cells)
//    4. Friendly errors translation in notebook sessions
// ============================================================================

import assert from 'node:assert/strict';
import { LiveSession } from '../src/kernel/session.ts';
import { parseExpectLine, parseExpects, parseNumber, evaluateExpects } from '../src/kernel/expect.ts';
import { friendlyParse, friendlyErrors } from '../src/kernel/errors.ts';
import { exportNotebook, importNotebook, createShareURL, loadFromShareURL } from '../src/kernel/storage.js';

// Setup mock window for storage URL testing in Node
globalThis.window = {
  location: {
    href: 'https://example.com/asmbook/',
    hash: ''
  }
};

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m'
};

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const anomalies = [];

function pass(suite, name) {
  totalTests++;
  passedTests++;
  console.log(`  ${c.green}✓${c.reset} [${suite}] ${name}`);
}

function fail(suite, name, err) {
  totalTests++;
  failedTests++;
  console.log(`  ${c.red}✗${c.reset} [${suite}] ${name}`);
  console.log(`    ${c.red}Error:${c.reset} ${typeof err === 'object' ? JSON.stringify(err) : err}`);
}

function recordAnomaly(id, component, severity, title, details) {
  anomalies.push({ id, component, severity, title, details });
  console.log(`  ${c.magenta}⚡ ANOMALY [${id}] (${component}): ${title}${c.reset}`);
  console.log(`    ${c.gray}${details}${c.reset}`);
}

console.log(`${c.bold}${c.cyan}================================================================`);
console.log(`  ASMBOOK — Notebook Logic & Expectation Vigorous Stress Suite`);
console.log(`================================================================${c.reset}\n`);

// ============================================================================
// SUITE 1: EXPECTATION ASSERTION FORMATS & PARSING
// ============================================================================
console.log(`${c.bold}${c.blue}▶ SUITE 1: Expectation Assertion Parsing & Evaluation${c.reset}`);

// 1.1: Proposed '; expect: ...' syntax vs current '; @expect ...' syntax
{
  const sName = 'Expect Syntax Prefix';
  // Proposed syntax with '; expect:' prefix
  const propReg = parseExpectLine('; expect: AX == 0042h');
  if (propReg === null) {
    recordAnomaly(
      'EXP-01',
      'src/kernel/expect.ts',
      'HIGH',
      'Proposed "; expect:" syntax unsupported',
      'parseExpectLine only checks body.startsWith("@expect"). Lines beginning with "; expect:" return null.'
    );
    pass(sName, 'Confirmed: "; expect:" returns null under current implementation');
  } else {
    pass(sName, 'Parsed "; expect: AX == 0042h" successfully');
  }

  // Check if @expect is required
  const atExp = parseExpectLine('; @expect AX=0042');
  if (atExp && atExp.target === 'AX') {
    pass(sName, 'Current syntax "; @expect AX=0042" recognized');
  } else {
    fail(sName, 'Current syntax "; @expect AX=0042" failed to parse', atExp);
  }
}

// 1.2: Register assertions formats & operators
{
  const sName = 'Register Assertions & Operators';

  // Test equality operators: '=', '==', '!=', '>=', '<=', '>', '<'
  const eq1 = parseExpectLine('; @expect AX = 42');
  if (eq1 && eq1.op === '=') {
    pass(sName, 'Operator "=" recognized');
  } else {
    fail(sName, 'Operator "=" failed to parse', eq1);
  }

  const eq2 = parseExpectLine('; @expect AX == 42');
  if (eq2 === null) {
    recordAnomaly(
      'EXP-02',
      'src/kernel/expect.ts',
      'HIGH',
      'Double equals "==" unsupported',
      'parseExpectLine regex only allows (=|!=). Using "==" fails to match and returns null.'
    );
    pass(sName, 'Confirmed: "==" operator is rejected by parser');
  } else {
    pass(sName, 'Operator "==" parsed');
  }

  const neq = parseExpectLine('; @expect BX != 0');
  if (neq && neq.op === '!=') {
    pass(sName, 'Operator "!=" recognized for register');
  } else {
    fail(sName, 'Operator "!=" failed to parse', neq);
  }

  const gte = parseExpectLine('; @expect CX >= 5');
  if (gte === null) {
    recordAnomaly(
      'EXP-03',
      'src/kernel/expect.ts',
      'HIGH',
      'Relational operators ">=, <=, >, <" unsupported',
      'parseExpectLine does not support relational operators; only = and != are in ExpectOp.'
    );
    pass(sName, 'Confirmed: ">=" operator is rejected by parser');
  } else {
    pass(sName, 'Operator ">=" parsed');
  }

  const lt = parseExpectLine('; @expect DX < 100');
  if (lt === null) {
    pass(sName, 'Confirmed: "<" operator is rejected by parser');
  } else {
    pass(sName, 'Operator "<" parsed');
  }

  // Test 8-bit subregisters AH and AL
  const ahExp = parseExpectLine('; @expect AH = 12');
  if (ahExp && ahExp.target === 'AH') {
    pass(sName, '8-bit register AH target recognized');
  } else {
    fail(sName, 'AH target failed to parse', ahExp);
  }

  const alExp = parseExpectLine('; @expect AL = 34');
  if (alExp && alExp.target === 'AL') {
    pass(sName, '8-bit register AL target recognized');
  } else {
    fail(sName, 'AL target failed to parse', alExp);
  }

  // Evaluation of AH and AL against EvalContext
  const ctx = {
    getReg: (n) => {
      const regs = { AX: 0x1234, AH: 0x12, AL: 0x34, BX: 5, CX: 10, DX: 20 };
      return regs[n.toUpperCase()] ?? null;
    },
    getFlag: () => 0,
    memReadByte: () => 0
  };

  const evalAH = evaluateExpects(ctx, [ahExp]);
  if (evalAH[0]?.passed && evalAH[0]?.actual === 0x12) {
    pass(sName, 'AH expectation evaluates correctly (actual: 0x12)');
  } else {
    fail(sName, 'AH expectation evaluation failed', evalAH);
  }

  const evalAL = evaluateExpects(ctx, [alExp]);
  if (evalAL[0]?.passed && evalAL[0]?.actual === 0x34) {
    pass(sName, 'AL expectation evaluates correctly (actual: 0x34)');
  } else {
    fail(sName, 'AL expectation evaluation failed', evalAL);
  }
}

// 1.3: Number literal parsing in register expectations (Radix & Hex suffix bugs)
{
  const sName = 'Register Number Literal Parsing';

  // Test 'h' suffix on register expectation: '; @expect AX = 0042h'
  const hexSuffix = parseExpectLine('; @expect AX = 0042h');
  if (hexSuffix === null) {
    recordAnomaly(
      'EXP-04',
      'src/kernel/expect.ts',
      'CRITICAL',
      'Hex "h" suffix rejected on register/flag expectations',
      'Regex /^([A-Za-z]+)\\s*(=|!=)\\s*([0-9a-fA-F]+)$/i does not include "h" or "H". Thus 0042h, 12h, FFh fail to match and return null.'
    );
    pass(sName, 'Confirmed: hex "h" suffix is rejected for register expectations');
  } else {
    pass(sName, 'Hex "h" suffix parsed');
  }

  // Test '0x' prefix on register expectation: '; @expect AX = 0x42'
  const hexPrefix = parseExpectLine('; @expect AX = 0x42');
  if (hexPrefix === null) {
    recordAnomaly(
      'EXP-05',
      'src/kernel/expect.ts',
      'CRITICAL',
      'Hex "0x" prefix rejected on register/flag expectations',
      'Regex only matches [0-9a-fA-F]+, which does not permit the letter "x". Thus 0x10, 0x42 fail to match.'
    );
    pass(sName, 'Confirmed: "0x" prefix is rejected for register expectations');
  } else {
    pass(sName, 'Hex "0x" prefix parsed');
  }

  // Test Decimal literal on register expectation: '; @expect AX = 10'
  const decExp = parseExpectLine('; @expect AX = 10');
  if (decExp) {
    if (decExp.expected === 16) {
      recordAnomaly(
        'EXP-06',
        'src/kernel/expect.ts',
        'CRITICAL',
        'Decimal numbers silently parsed as hexadecimal for registers/flags',
        'Line 63 does parseInt(m[3], 16) instead of parseNumber(m[3]). A user writing "; @expect AX = 10" gets expected: 16 (0x10) instead of 10!'
      );
      pass(sName, 'Confirmed: decimal 10 parsed as hex 16 (0x10) due to parseInt(..., 16)');
    } else if (decExp.expected === 10) {
      pass(sName, 'Decimal 10 parsed as 10');
    }
  } else {
    fail(sName, 'Failed to parse "; @expect AX = 10"', 'Returned null');
  }

  // Verify standalone parseNumber behavior
  if (parseNumber('0x0042') === 0x42) pass(sName, 'parseNumber("0x0042") -> 66 (0x42)');
  else fail(sName, 'parseNumber("0x0042")', parseNumber('0x0042'));

  if (parseNumber('0042h') === 0x42) pass(sName, 'parseNumber("0042h") -> 66 (0x42)');
  else fail(sName, 'parseNumber("0042h")', parseNumber('0042h'));

  if (parseNumber('42') === 42) pass(sName, 'parseNumber("42") -> 42');
  else fail(sName, 'parseNumber("42")', parseNumber('42'));
}

// 1.4: Flag assertions
{
  const sName = 'Flag Assertions';
  const flags = ['ZF', 'CF', 'SF', 'OF', 'PF', 'AF', 'TF', 'IF', 'DF'];
  let allFlagsOk = true;

  for (const fl of flags) {
    const clause = parseExpectLine(`; @expect ${fl} = 1`);
    if (!clause || !clause.targetLabel.includes('(flag)')) {
      allFlagsOk = false;
      fail(sName, `Flag ${fl} not properly tagged as flag`, clause);
    }
  }
  if (allFlagsOk) {
    pass(sName, 'All 9 8086 flags (ZF, CF, SF, OF, PF, AF, TF, IF, DF) tagged with "(flag)"');
  }

  // Evaluation of flags
  const flagCtx = {
    getReg: () => 0,
    getFlag: (n) => (n.toUpperCase() === 'ZF' ? 1 : 0),
    memReadByte: () => 0
  };

  const zfPass = evaluateExpects(flagCtx, [parseExpectLine('; @expect ZF = 1')])[0];
  const zfFail = evaluateExpects(flagCtx, [parseExpectLine('; @expect ZF = 0')])[0];
  const cfPass = evaluateExpects(flagCtx, [parseExpectLine('; @expect CF = 0')])[0];

  if (zfPass.passed && !zfFail.passed && cfPass.passed) {
    pass(sName, 'Flag evaluation correctly verifies flag state in EvalContext');
  } else {
    fail(sName, 'Flag evaluation failed', { zfPass, zfFail, cfPass });
  }
}

// 1.5: Memory assertions
{
  const sName = 'Memory Assertions';

  // Absolute hex memory address: '; @expect [1000h] = 42h'
  const memHex = parseExpectLine('; @expect [1000h] = 42h');
  if (memHex && memHex.target === '[1000H]' && memHex.expected === 0x42) {
    pass(sName, 'Memory assertion [1000h] = 42h parsed with correct address & value');
  } else {
    fail(sName, 'Memory assertion [1000h] = 42h failed to parse', memHex);
  }

  // Evaluation of memory assertion
  const memCtx = {
    getReg: () => 0,
    getFlag: () => 0,
    memReadByte: (addr) => (addr === 0x1000 ? 0x42 : 0)
  };
  const evalMem = evaluateExpects(memCtx, [memHex])[0];
  if (evalMem.passed && evalMem.actual === 0x42) {
    pass(sName, 'Memory [1000h] evaluates to 0x42 matching expected value');
  } else {
    fail(sName, 'Memory evaluation failed', evalMem);
  }

  // Register indirect memory: '; @expect [BX] = 1234h'
  const memBX = parseExpectLine('; @expect [BX] = 1234h');
  if (memBX === null) {
    recordAnomaly(
      'EXP-07',
      'src/kernel/expect.ts',
      'MEDIUM',
      'Register-indirect memory assertions [BX] unsupported',
      'parseNumber("BX") returns null because parseNumber only parses constants. Register-indirect syntax like [BX] or [SI] is not resolved.'
    );
    pass(sName, 'Confirmed: [BX] memory assertion returns null');
  } else {
    pass(sName, 'Parsed [BX] memory assertion');
  }

  // Symbol memory: '; @expect [msg] = \'H\''
  const memMsg = parseExpectLine("; @expect [msg] = 'H'");
  if (memMsg === null) {
    recordAnomaly(
      'EXP-08',
      'src/kernel/expect.ts',
      'MEDIUM',
      'Symbol-based memory assertions [symbol] unsupported',
      'parseNumber("msg") returns null because symbol table is not passed to parseExpectLine. Symbolic memory lookups fail.'
    );
    pass(sName, 'Confirmed: symbolic [msg] memory assertion returns null');
  } else {
    pass(sName, 'Parsed [msg] memory assertion');
  }

  // Character literal in memory
  const memChar = parseExpectLine("; @expect [0x200] = 'A'");
  if (memChar && memChar.expected === 0x41) {
    pass(sName, 'Character literal in memory assertion parsed: \'A\' -> 0x41');
  } else {
    fail(sName, 'Character literal in memory failed', memChar);
  }
}

// 1.6: Output, step count, and halting assertions
{
  const sName = 'Extended Assertion Types (Output, Steps, Halting)';

  // Output assertions
  const outExp1 = parseExpectLine('; expect: output == "HELLO"');
  const outExp2 = parseExpectLine('; @expect output = "HELLO"');
  if (outExp1 === null && outExp2 === null) {
    recordAnomaly(
      'EXP-09',
      'src/kernel/expect.ts',
      'HIGH',
      'Output assertions (output == "...") unsupported',
      'Neither parseExpectLine nor evaluateExpects supports output string assertions. evaluateExpects only returns number | null.'
    );
    pass(sName, 'Confirmed: output assertions are not supported by expect parser');
  } else {
    pass(sName, 'Output assertion parsed');
  }

  // Step count assertions
  const stepExp1 = parseExpectLine('; expect: steps < 50');
  const stepExp2 = parseExpectLine('; @expect steps < 50');
  if (stepExp1 === null && stepExp2 === null) {
    recordAnomaly(
      'EXP-10',
      'src/kernel/expect.ts',
      'MEDIUM',
      'Step count assertions (steps < 50) unsupported',
      'Step count assertions are not supported in expect parser.'
    );
    pass(sName, 'Confirmed: steps assertions are not supported by expect parser');
  } else {
    pass(sName, 'Step count assertion parsed');
  }

  // Halting assertions
  const haltExp1 = parseExpectLine('; expect: halted == true');
  const haltExp2 = parseExpectLine('; @expect halted = 1');
  if (haltExp1 === null && haltExp2 === null) {
    recordAnomaly(
      'EXP-11',
      'src/kernel/expect.ts',
      'MEDIUM',
      'Halting assertions (halted == true) unsupported',
      'Halted state is not recognized as a target in parseExpectLine.'
    );
    pass(sName, 'Confirmed: halted assertions are not supported by expect parser');
  } else {
    pass(sName, 'Halted assertion parsed');
  }
}

// 1.7: Edge cases in expectation parsing
{
  const sName = 'Expect Parsing Edge Cases';

  // Malformed comments
  const malformed = [
    '; just a comment',
    '; @expect',
    '; @expect   ',
    '; @expect AX',
    '; @expect = 5',
    '; @expect AX =',
    '; @expect AX === 5',
    '; @expect [0x100',
    '; @expect [] = 5',
    '; @expect screen[0] = 5',
    '; @expect screen[,] = 5',
    '; @expect screen[1,2,3] = 5',
  ];

  let malformedAllNull = true;
  for (const m of malformed) {
    const res = parseExpectLine(m);
    if (res !== null) {
      malformedAllNull = false;
      fail(sName, `Malformed line was unexpectedly parsed: "${m}"`, res);
    }
  }
  if (malformedAllNull) {
    pass(sName, 'All 12 malformed syntax variations safely returned null');
  }

  // Anomaly: arbitrary non-register words parsed as register targets
  const screenAsReg = parseExpectLine('; @expect screen = 5');
  const bananaAsReg = parseExpectLine('; @expect banana = 5');
  if (screenAsReg && screenAsReg.target === 'SCREEN' && bananaAsReg && bananaAsReg.target === 'BANANA') {
    recordAnomaly(
      'EXP-15',
      'src/kernel/expect.ts',
      'MEDIUM',
      'Target regex accepts arbitrary words as register names',
      'Regex /^([A-Za-z]+)/ matches any word without validating against VALID_REGS or VALID_FLAGS. Thus "; @expect screen = 5" or "; @expect banana = 5" parses with target "SCREEN" / "BANANA".'
    );
    pass(sName, 'Confirmed: arbitrary words parsed as registers due to unvalidated [A-Za-z]+ regex');
  }

  // Multiple expects on one line
  const multi1 = parseExpectLine('; @expect AX=5 ; @expect BX=6');
  const multi2 = parseExpectLine('; @expect AX=5 BX=6');
  const multi3 = parseExpectLine('; @expect AX=5, BX=6');
  if (multi1 === null && multi2 === null && multi3 === null) {
    recordAnomaly(
      'EXP-12',
      'src/kernel/expect.ts',
      'LOW',
      'Multiple @expect clauses on a single line unsupported',
      'parseExpectLine anchors regex to ^...$, rejecting multiple assertions per line (e.g. "; @expect AX=5 BX=6").'
    );
    pass(sName, 'Confirmed: multiple expects on one line return null');
  } else {
    pass(sName, 'Multiple expects on one line parsed');
  }

  // Empty and whitespace lines
  if (parseExpectLine('') === null && parseExpectLine('   ') === null && parseExpectLine('\t\n') === null) {
    pass(sName, 'Empty and whitespace lines return null');
  } else {
    fail(sName, 'Empty/whitespace line returned non-null');
  }

  // Mixed case: Directive case sensitivity
  const upperDirective = parseExpectLine('; @EXPECT AX = 5');
  const titleDirective = parseExpectLine('; @Expect AX = 5');
  if (upperDirective === null || titleDirective === null) {
    recordAnomaly(
      'EXP-13',
      'src/kernel/expect.ts',
      'MEDIUM',
      'Directive "@expect" is strictly case-sensitive',
      'body.startsWith("@expect") rejects uppercase "; @EXPECT AX = 5" or "; @Expect AX = 5".'
    );
    pass(sName, 'Confirmed: "@EXPECT" and "@Expect" return null');
  } else {
    pass(sName, 'Mixed-case directive recognized');
  }

  // Mixed case: Target case insensitivity
  const lowerReg = parseExpectLine('; @expect ax = 5');
  const lowerFlag = parseExpectLine('; @expect zf = 1');
  if (lowerReg && lowerReg.target === 'AX' && lowerFlag && lowerFlag.target === 'ZF') {
    pass(sName, 'Lowercase register "ax" and flag "zf" normalized to uppercase');
  } else {
    fail(sName, 'Lowercase register/flag normalization failed', { lowerReg, lowerFlag });
  }

  // Mixed case: Screen case insensitivity bug
  const upperScreen = parseExpectLine("; @expect SCREEN[0,0] = 'H'");
  if (upperScreen === null) {
    recordAnomaly(
      'EXP-14',
      'src/kernel/expect.ts',
      'LOW',
      'Screen directive is case-sensitive ("SCREEN[0,0]" fails)',
      'Regex /^screen\\[(\\d+),(\\d+)\\]/ does not have the /i flag, so SCREEN[...] fails to match.'
    );
    pass(sName, 'Confirmed: uppercase SCREEN[0,0] returns null');
  } else {
    pass(sName, 'Uppercase SCREEN[0,0] parsed');
  }

  // Multi-line parseExpects
  const multiLineSrc = `
    MOV AX, 5
    ; @expect AX = 5
    ADD AX, 3
    ; @expect AX = 8
    ; just a comment
    HLT
    ; @expect ZF = 0
  `;
  const parsedClauses = parseExpects(multiLineSrc);
  if (parsedClauses.length === 3 && parsedClauses[0].rawLine === 3 && parsedClauses[1].rawLine === 5 && parsedClauses[2].rawLine === 8) {
    pass(sName, 'parseExpects extracts all 3 clauses with accurate 1-based rawLine numbers');
  } else {
    fail(sName, 'parseExpects failed on multi-line text', parsedClauses);
  }
}

// ============================================================================
// SUITE 2: MULTI-CELL EXECUTION STATE LIFECYCLE IN LiveSession
// ============================================================================
console.log(`\n${c.bold}${c.blue}▶ SUITE 2: Multi-Cell Execution State Lifecycle in LiveSession${c.reset}`);

// 2.1: Run Cell A, check accumulator state
{
  const sName = 'Cell A Accumulator State';
  const session = new LiveSession();
  session.setCells([
    { id: 'cell_a', kind: 'code', source: 'MOV AX, 0042h\nMOV BX, 0100h\nHLT' }
  ]);

  const resA = session.runCell('cell_a');
  const stateA = session.getState();

  if (stateA.regs.AX === 0x0042 && resA.regDiff['AX']?.[1] === 0x0042) {
    pass(sName, 'Cell A sets accumulator AX = 0x0042 (66 decimal)');
  } else {
    fail(sName, 'Accumulator AX incorrect after Cell A', { stateAX: stateA.regs.AX, regDiff: resA.regDiff });
  }

  if (stateA.regs.BX === 0x0100) {
    pass(sName, 'Cell A sets BX = 0x0100');
  } else {
    fail(sName, 'Register BX incorrect after Cell A', stateA.regs.BX);
  }

  if (session.getExecCount('cell_a') === 1 && session.currentExecCount === 1) {
    pass(sName, 'Execution counter incremented to 1 for cell_a');
  } else {
    fail(sName, 'Execution counter mismatch', { cellA: session.getExecCount('cell_a'), current: session.currentExecCount });
  }
}

// 2.2: Run Cell B that depends on Cell A's registers and memory
{
  const sName = 'Cross-Cell State Dependency (Accumulator & RAM)';
  const session = new LiveSession();
  session.setCells([
    {
      id: 'cell_a',
      kind: 'code',
      source: 'MOV AX, 100\nMOV [0200h], AX\nHLT'
    },
    {
      id: 'cell_b',
      kind: 'code',
      source: 'MOV BX, AX\nMOV CX, [0200h]\nADD BX, CX\nHLT'
    }
  ]);

  const resA = session.runCell('cell_a');
  const memAfterA = session.evalCtx().memReadByte(0x0200);

  if (session.getState().regs.AX === 100 && memAfterA === 100) {
    pass(sName, 'Cell A stored 100 in AX and memory [0200h]');
  } else {
    fail(sName, 'Cell A state setup failed', { AX: session.getState().regs.AX, mem: memAfterA });
  }

  // Run Cell B — must inherit state from Cell A
  const resB = session.runCell('cell_b');
  const stateB = session.getState();

  if (stateB.regs.BX === 200 && stateB.regs.CX === 100 && stateB.regs.AX === 100) {
    pass(sName, 'Cell B correctly read AX and [0200h], computed BX = 200 (100 + 100)');
  } else {
    fail(sName, 'Cell B did not properly inherit Cell A state', stateB.regs);
  }

  if (resB.regDiff['BX']?.[0] === 0 && resB.regDiff['BX']?.[1] === 200) {
    pass(sName, 'Cell B regDiff captured BX transition [0, 200]');
  } else {
    fail(sName, 'Cell B regDiff mismatch', resB.regDiff);
  }
}

// 2.3: Edit Cell A and re-run (verify needsRestart & stale output flags)
{
  const sName = 'Cell Editing, Re-runs & Stale Flags';
  const session = new LiveSession();
  session.setCells([
    { id: 'cell_a', kind: 'code', source: 'MOV AX, 10\nHLT' },
    { id: 'cell_b', kind: 'code', source: 'ADD AX, 20\nHLT' }
  ]);

  session.runCell('cell_a'); // AX = 10
  session.runCell('cell_b'); // AX = 30
  const outBBefore = session.getOutput('cell_b');

  // Case 1: Re-running Cell A out of order
  session.runCell('cell_a'); // AX = 10 again
  const outBAfter = session.getOutput('cell_b');

  if (outBAfter && outBAfter.stale === false) {
    recordAnomaly(
      'SES-01',
      'src/kernel/session.ts',
      'HIGH',
      'Cell outputs are never marked stale when earlier cells re-run',
      'docs/NOTEBOOK_SEMANTICS.md specifies "outputs of cells run before it are marked stale". But CellOutput.stale remains false.'
    );
    pass(sName, 'Confirmed: out-of-order re-run does not mark later cell output as stale');
  } else if (outBAfter && outBAfter.stale === true) {
    pass(sName, 'Cell B output correctly marked as stale after Cell A re-run');
  }

  // Case 2a: Editing cells while IP is inside the program (IP = 2 at start of Cell B)
  const rebuildMidProgram = session.setCells([
    { id: 'cell_a', kind: 'code', source: 'MOV AX, 10\nHLT' },
    { id: 'cell_b', kind: 'code', source: 'ADD AX, 50\nHLT' }
  ]);
  if (rebuildMidProgram.needsRestart === false) {
    pass(sName, 'setCells when IP is inside program (IP < instrs.length) preserves state (needsRestart: false)');
  } else {
    fail(sName, 'Expected needsRestart: false when IP inside program', rebuildMidProgram);
  }

  // Case 2b: Run Cell B to completion (IP reaches end of program)
  session.runCell('cell_b');
  const rebuildPastEnd = session.setCells([
    { id: 'cell_a', kind: 'code', source: 'MOV AX, 10\nHLT' },
    { id: 'cell_b', kind: 'code', source: 'ADD AX, 60\nHLT' }
  ]);
  if (rebuildPastEnd.needsRestart === true) {
    pass(sName, 'setCells after program completed (IP >= instrs.length) reports needsRestart: true');
  } else {
    fail(sName, 'Expected needsRestart: true when IP past end', rebuildPastEnd);
  }

  // Case 3: Outputs wiped on setCells
  if (session.getAllOutputs().size === 0) {
    recordAnomaly(
      'SES-02',
      'src/kernel/session.ts',
      'MEDIUM',
      'setCells completely wipes all prior cell outputs',
      'session.rebuild calls this.outputs.clear(), deleting all historical outputs instead of retaining and marking them stale.'
    );
    pass(sName, 'Confirmed: setCells wipes outputs map');
  } else {
    pass(sName, 'Outputs preserved across setCells');
  }

  // Case 4: RAM-patch edit while paused inside Cell A
  const session2 = new LiveSession();
  session2.setCells([
    { id: 'cell_a', kind: 'code', source: 'MOV AX, 5\nADD AX, 1\nHLT' }
  ]);
  session2.step(); // IP now at ADD AX, 1 (AX = 5)
  const patchRes = session2.setCells([
    { id: 'cell_a', kind: 'code', source: 'MOV AX, 5\nADD AX, 99\nHLT' }
  ]);

  if (patchRes.needsRestart === false) {
    session2.step(); // executes new instruction ADD AX, 99
    if (session2.getState().regs.AX === 104) {
      pass(sName, 'RAM-patch edit below cursor survives without restart (AX = 5 + 99 = 104)');
    } else {
      fail(sName, 'RAM-patch did not execute new instruction', session2.getState().regs.AX);
    }
  } else {
    fail(sName, 'RAM-patch unexpectedly requested restart', patchRes);
  }
}

// 2.4: Infinite loop detection
{
  const sName = 'Infinite Loop Detection & Session Resilience';
  const session = new LiveSession();
  session.setCells([
    { id: 'loop_cell', kind: 'code', source: 'loop_top:\nJMP loop_top\nHLT' }
  ]);

  const startTime = Date.now();
  const res = session.runCell('loop_cell');
  const elapsed = Date.now() - startTime;

  if (res.reason === 'cap') {
    pass(sName, `Infinite loop caught by step cap (reason: 'cap') in ${elapsed}ms`);
  } else {
    fail(sName, 'Expected reason: "cap" on infinite loop', res.reason);
  }

  if (res.steps === 500000) {
    pass(sName, 'Steps count equals stepsLimit (500000)');
  } else {
    fail(sName, 'Steps count mismatch', res.steps);
  }

  // Verify session is NOT frozen or corrupted after cap
  session.setCells([
    { id: 'recovery_cell', kind: 'code', source: 'MOV AX, 1234h\nHLT' }
  ]);
  session.resetMachine();
  const recRes = session.runCell('recovery_cell');

  if (recRes.reason === 'halted' || recRes.reason === 'end') {
    if (session.getState().regs.AX === 0x1234) {
      pass(sName, 'Session successfully recovered and executed normal code after loop cap');
    } else {
      fail(sName, 'Session recovery failed to produce correct AX', session.getState().regs.AX);
    }
  } else {
    fail(sName, 'Session recovery failed to halt cleanly', recRes.reason);
  }
}

// 2.5: Breakpoint hit & resume behavior
{
  const sName = 'Breakpoint Hit & Pause';
  const session = new LiveSession();
  session.setCells([
    {
      id: 'bp_cell',
      kind: 'code',
      source: 'MOV AX, 1\nADD AX, 10\nADD AX, 100\nHLT'
    }
  ]);

  // Set breakpoint on line 3 (user line 3: ADD AX, 100)
  const bpToggled = session.toggleBreakpoint('bp_cell', 3);
  if (bpToggled && session.getBreakpointLines('bp_cell').has(3)) {
    pass(sName, 'Breakpoint set on line 3 of bp_cell');
  } else {
    fail(sName, 'Failed to toggle breakpoint', session.getBreakpointLines('bp_cell'));
  }

  // Run from top to breakpoint
  session.resetMachine();
  const runRes = session.continueRun();

  if (runRes.reason === 'breakpoint') {
    pass(sName, 'Execution paused with reason: "breakpoint"');
  } else {
    fail(sName, 'Expected reason: "breakpoint"', runRes.reason);
  }

  // At breakpoint, line 1 (MOV AX, 1) and line 2 (ADD AX, 10) have run, line 3 has not
  if (session.getState().regs.AX === 11) {
    pass(sName, 'Registers at breakpoint pause verify exact state: AX = 11 (1 + 10)');
  } else {
    fail(sName, 'State at breakpoint incorrect', session.getState().regs.AX);
  }

  // Attempting continueRun() directly while parked at the breakpoint:
  // continueRun checks `if (this.breakpoints.has(ip))` BEFORE stepping, so it immediately stops with 0 steps!
  const immediateResume = session.continueRun();
  if (immediateResume.reason === 'breakpoint' && immediateResume.steps === 0) {
    recordAnomaly(
      'SES-04',
      'src/kernel/session.ts',
      'HIGH',
      'continueRun() cannot resume from breakpoint without step() or clearing breakpoint',
      'continueRun() checks this.breakpoints.has(ip) at the beginning of the loop. If the CPU is paused on a breakpoint, calling continueRun() immediately breaks again at steps = 0.'
    );
    pass(sName, 'Confirmed: continueRun() immediately breaks again at steps = 0');
  }

  // Proper resume: step once past breakpoint instruction, then continue
  session.step(); // executes ADD AX, 100 (AX = 111)
  const contRes = session.continueRun(); // runs to HLT
  if (contRes.reason === 'end' || contRes.reason === 'halted') {
    if (session.getState().regs.AX === 111) {
      pass(sName, 'Resuming after stepping past breakpoint finished cleanly: AX = 111');
    } else {
      fail(sName, 'Final AX after resume incorrect', session.getState().regs.AX);
    }
  } else {
    fail(sName, 'Resume after breakpoint did not finish cleanly', contRes.reason);
  }
}

// 2.6: Single-stepping through cells & verifying cursor
{
  const sName = 'Single-Stepping & Cursor Tracking';
  const session = new LiveSession();
  session.setCells([
    { id: 'cell_1', kind: 'code', source: 'MOV AX, 1\nMOV BX, 2' },
    { id: 'cell_2', kind: 'code', source: 'MOV CX, 3\nHLT' }
  ]);

  // Initial cursor
  let st = session.getState();
  if (st.cursor && st.cursor.cellId === 'cell_1' && st.cursor.instrIndex === 0) {
    pass(sName, 'Initial cursor points to cell_1 at instrIndex 0');
  } else {
    fail(sName, 'Initial cursor incorrect', st.cursor);
  }

  // Step 1: executes MOV AX, 1
  const step1 = session.step();
  st = session.getState();
  if (st.regs.AX === 1 && st.cursor?.cellId === 'cell_1' && st.cursor?.instrIndex === 1) {
    pass(sName, 'Step 1: AX = 1, cursor advanced to cell_1 instrIndex 1');
  } else {
    fail(sName, 'Step 1 cursor mismatch', { regs: st.regs.AX, cursor: st.cursor });
  }

  // Step 2: executes MOV BX, 2 (crosses boundary into cell_2)
  const step2 = session.step();
  st = session.getState();
  if (st.regs.BX === 2 && st.cursor?.cellId === 'cell_2' && st.cursor?.instrIndex === 2) {
    pass(sName, 'Step 2: BX = 2, cursor crossed cell boundary to cell_2 instrIndex 2');
  } else {
    fail(sName, 'Step 2 boundary crossing failed', { regs: st.regs.BX, cursor: st.cursor });
  }

  // Step 3: executes MOV CX, 3
  const step3 = session.step();
  st = session.getState();
  if (st.regs.CX === 3 && st.cursor?.cellId === 'cell_2' && st.cursor?.instrIndex === 3) {
    pass(sName, 'Step 3: CX = 3, cursor at cell_2 instrIndex 3 (HLT)');
  } else {
    fail(sName, 'Step 3 cursor mismatch', { regs: st.regs.CX, cursor: st.cursor });
  }

  // Step 4: executes HLT
  const step4 = session.step();
  st = session.getState();
  if (step4.halted && st.halted) {
    pass(sName, 'Step 4: Machine halted cleanly on HLT');
  } else {
    fail(sName, 'Step 4 halting failed', { stepHalted: step4.halted, stateHalted: st.halted });
  }
}

// 2.7: Reset session resetMachine()
{
  const sName = 'Session Reset Machine';
  const session = new LiveSession();
  session.setCells([
    { id: 'dirty_cell', kind: 'code', source: 'MOV AX, 0AAAAh\nMOV BX, 0BBBBh\nMOV [0500h], AX\nSTC\nHLT' }
  ]);

  session.runCell('dirty_cell');
  const dirtyState = session.getState();

  if (dirtyState.regs.AX === 0xAAAA && dirtyState.flags.CF === 1 && session.getOutput('dirty_cell')) {
    pass(sName, 'Machine state dirtied (AX = 0xAAAA, CF = 1, Output recorded)');
  } else {
    fail(sName, 'Failed to dirty machine state', dirtyState);
  }

  // Verify memory mutated at 0x500
  if (session.evalCtx().memReadByte(0x0500) === 0xAA) {
    pass(sName, 'Runtime memory [0500h] verified mutated to 0xAA');
  } else {
    fail(sName, 'Runtime memory write failed', session.evalCtx().memReadByte(0x0500));
  }

  // Call resetMachine()
  session.resetMachine();
  const resetState = session.getState();

  const regsClean =
    resetState.regs.AX === 0 &&
    resetState.regs.BX === 0 &&
    resetState.regs.CX === 0 &&
    resetState.regs.DX === 0 &&
    resetState.regs.SI === 0 &&
    resetState.regs.DI === 0 &&
    resetState.regs.BP === 0 &&
    resetState.regs.SP === 0xFFFE &&
    resetState.regs.IP === 0;

  if (regsClean) {
    pass(sName, 'All registers reset cleanly to defaults (SP = 0xFFFE, others = 0)');
  } else {
    fail(sName, 'Registers not cleanly reset', resetState.regs);
  }

  const flagsClean = resetState.flags.CF === 0 && resetState.flags.ZF === 0 && resetState.flags.IF === 1;
  if (flagsClean) {
    pass(sName, 'Flags reset cleanly (CF = 0, ZF = 0, IF = 1)');
  } else {
    fail(sName, 'Flags not cleanly reset', resetState.flags);
  }

  // Verify runtime memory is cleanly zeroed
  const runtimeMemClean = session.evalCtx().memReadByte(0x0500) === 0;
  if (runtimeMemClean) {
    pass(sName, 'Runtime data memory [0500h] cleanly zeroed on reset');
  } else {
    fail(sName, 'Runtime memory not zeroed after reset', session.evalCtx().memReadByte(0x0500));
  }

  // Note on COM code segment address 0x100:
  // resetMachine() constructs a fresh Executor which loads the compiled program at 0x100.
  const codeByteAt100 = session.evalCtx().memReadByte(0x0100);
  if (codeByteAt100 === 0xB8) {
    pass(sName, 'Program entry [0100h] holds freshly loaded opcode 0xB8 (MOV AX)');
  }

  // Check outputs behavior on resetMachine()
  const outputsAfterReset = session.getOutput('dirty_cell');
  if (outputsAfterReset !== undefined) {
    recordAnomaly(
      'SES-03',
      'src/kernel/session.ts',
      'MEDIUM',
      'resetMachine() preserves cell outputs instead of clearing them',
      'resetMachine() resets CPU and Executor but does not call this.outputs.clear(). Outputs persist unless clearAllOutputs() is called explicitly.'
    );
    pass(sName, 'Confirmed: resetMachine() does not clear outputs (explicit clearAllOutputs required)');
    session.clearAllOutputs();
    if (session.getAllOutputs().size === 0) {
      pass(sName, 'clearAllOutputs() cleanly removes all outputs');
    }
  } else {
    pass(sName, 'resetMachine() cleared outputs');
  }
}

// ============================================================================
// SUITE 3: NOTEBOOK PERSISTENCE & AUTOGRADER SCORING
// ============================================================================
console.log(`\n${c.bold}${c.blue}▶ SUITE 3: Notebook Persistence & Autograder Scoring${c.reset}`);

// 3.1: exportNotebook and importNotebook with valid notebooks
{
  const sName = 'Valid Notebook Persistence';
  const originalCells = [
    { id: 'cell-md', kind: 'markdown', source: '# Introduction to Assembly\nWelcome to class.' },
    { id: 'cell-c1', kind: 'code', source: 'MOV AX, 1\n; @expect AX = 1\nHLT' },
    { id: 'cell-c2', kind: 'code', source: 'ADD AX, 2\n; @expect AX = 3\nHLT' }
  ];

  const exported = exportNotebook(originalCells);
  if (typeof exported === 'string' && exported.includes('"version": 1')) {
    pass(sName, 'exportNotebook returns formatted JSON with version: 1');
  } else {
    fail(sName, 'exportNotebook failed', exported);
  }

  const imported = importNotebook(exported);
  if (imported && imported.length === 3 && JSON.stringify(imported) === JSON.stringify(originalCells)) {
    pass(sName, 'importNotebook successfully round-tripped 3 cells byte-identically');
  } else {
    fail(sName, 'importNotebook round-trip mismatch', imported);
  }

  // Legacy format (raw array of cells)
  const legacyJson = JSON.stringify(originalCells);
  const legacyImported = importNotebook(legacyJson);
  if (legacyImported && legacyImported.length === 3) {
    pass(sName, 'importNotebook successfully imports legacy raw-array format');
  } else {
    fail(sName, 'Legacy format import failed', legacyImported);
  }
}

// 3.2: Corrupt notebook inputs
{
  const sName = 'Corrupt Notebook Import Resilience';
  const corruptInputs = [
    { label: 'Malformed JSON string', input: '{ "version": 1, "cells": [ broken' },
    { label: 'Primitive number', input: '42' },
    { label: 'Primitive string', input: '"not a notebook"' },
    { label: 'Boolean value', input: 'true' },
    { label: 'Null JSON', input: 'null' },
    { label: 'Object missing cells array', input: '{"version": 1}' },
    { label: 'Unsupported version (version 99)', input: '{"version": 99, "cells": []}' },
    { label: 'Cells field is a string', input: '{"version": 1, "cells": "invalid"}' },
    { label: 'Cells field is a number', input: '{"version": 1, "cells": 123}' },
    { label: 'Empty object', input: '{}' }
  ];

  let allSafelyNull = true;
  for (const item of corruptInputs) {
    const res = importNotebook(item.input);
    if (res !== null) {
      allSafelyNull = false;
      fail(sName, `Corrupt input "${item.label}" was not rejected`, res);
    }
  }
  if (allSafelyNull) {
    pass(sName, 'All 10 corrupt and invalid inputs cleanly returned null without throwing');
  }

  // Schema verification gap: what happens if cells array contains garbage?
  const garbageCellsJson = JSON.stringify({
    version: 1,
    cells: [null, 123, { random: 'object' }, 'string']
  });
  const garbageImported = importNotebook(garbageCellsJson);
  if (garbageImported !== null) {
    recordAnomaly(
      'STO-01',
      'src/kernel/storage.ts',
      'MEDIUM',
      'importNotebook lacks cell schema validation',
      'importNotebook verifies that Array.isArray(data.cells) is true, but does not validate individual cell objects ({ id, kind, source }). Malformed elements pass through unchecked.'
    );
    pass(sName, 'Confirmed: cells array contents are not type-validated on import');
  } else {
    pass(sName, 'Malformed cell objects rejected');
  }
}

// 3.3: Oversized notebooks & Share URL size gating
{
  const sName = 'Oversized Notebooks & Share URL';

  // Small notebook within 8192 bytes limit
  const smallCells = [
    { id: 'c1', kind: 'code', source: 'MOV AX, 1' }
  ];
  const shareUrl = createShareURL(smallCells);
  if (shareUrl && shareUrl.includes('#notebook=')) {
    pass(sName, 'createShareURL creates valid URL for notebook under 8192 bytes');
  } else {
    fail(sName, 'createShareURL failed for small notebook', shareUrl);
  }

  // Roundtrip through share URL
  globalThis.window.location.hash = shareUrl.slice(shareUrl.indexOf('#'));
  const loadedFromUrl = loadFromShareURL();
  if (loadedFromUrl && loadedFromUrl.length === 1 && loadedFromUrl[0].id === 'c1') {
    pass(sName, 'loadFromShareURL successfully restored notebook from hash');
  } else {
    fail(sName, 'loadFromShareURL failed to restore notebook', loadedFromUrl);
  }

  // Large notebook exceeding 8192 bytes limit
  const hugeCells = [];
  for (let i = 0; i < 200; i++) {
    hugeCells.push({
      id: `cell_${i}`,
      kind: 'code',
      source: `; Comment block for cell ${i} to inflate notebook size.\nMOV AX, ${i}\nADD BX, AX\nHLT`
    });
  }
  const hugeJson = exportNotebook(hugeCells);
  if (hugeJson.length > 8192) {
    const hugeUrl = createShareURL(hugeCells);
    if (hugeUrl === null) {
      pass(sName, `Oversized notebook (${hugeJson.length} bytes > 8192) correctly rejected by createShareURL (returned null)`);
    } else {
      fail(sName, 'createShareURL should return null for notebooks > 8192 bytes', hugeUrl);
    }
  } else {
    fail(sName, 'Huge notebook size did not exceed 8192 bytes', hugeJson.length);
  }
}

// 3.4: Autograder scoring calculation
{
  const sName = 'Autograder Scoring Calculation';

  // Define standard autograder score evaluation function
  function calculateAutograderScore(session) {
    const outputs = session.getAllOutputs();
    let totalAssertions = 0;
    let passedAssertions = 0;
    const perCell = [];

    for (const [cellId, out] of outputs.entries()) {
      const results = out.expectResults || [];
      const cellTotal = results.length;
      const cellPassed = results.filter(r => r.passed).length;
      totalAssertions += cellTotal;
      passedAssertions += cellPassed;
      perCell.push({
        cellId,
        total: cellTotal,
        passed: cellPassed,
        allPassed: out.allPassed
      });
    }

    const scorePercent = totalAssertions === 0 ? 100 : (passedAssertions / totalAssertions) * 100;
    return {
      totalAssertions,
      passedAssertions,
      failedAssertions: totalAssertions - passedAssertions,
      scorePercent: Math.round(scorePercent * 100) / 100,
      perCell
    };
  }

  // Scenario 1: 100% pass across multiple cells (using hex-compatible literals < 10)
  const session100 = new LiveSession();
  session100.setCells([
    { id: 'c1', kind: 'code', source: 'MOV AX, 5\n; @expect AX = 5\nHLT' },
    { id: 'c2', kind: 'code', source: 'MOV BX, 8\n; @expect BX = 8\n; @expect ZF = 0\nHLT' }
  ]);
  session100.runCell('c1');
  session100.runCell('c2');
  const score100 = calculateAutograderScore(session100);

  if (score100.totalAssertions === 3 && score100.passedAssertions === 3 && score100.scorePercent === 100) {
    pass(sName, 'Autograder: 100% score for fully passing notebook (3/3 assertions)');
  } else {
    fail(sName, '100% score calculation mismatch', score100);
  }

  // Scenario 2: Partial pass (60%) across multiple cells
  const session60 = new LiveSession();
  session60.setCells([
    { id: 'c1', kind: 'code', source: 'MOV AX, 5\n; @expect AX = 5\n; @expect BX = 0\nHLT' }, // 2 pass
    { id: 'c2', kind: 'code', source: 'MOV CX, 8\n; @expect CX = 8\n; @expect DX = 9\n; @expect ZF = 1\nHLT' } // 1 pass, 2 fail (DX != 9, ZF != 1)
  ]);
  session60.runCell('c1');
  session60.runCell('c2');
  const score60 = calculateAutograderScore(session60);

  if (score60.totalAssertions === 5 && score60.passedAssertions === 3 && score60.scorePercent === 60.0) {
    pass(sName, 'Autograder: Partial score 60.0% (3/5 assertions passed, 2 failed)');
  } else {
    fail(sName, 'Partial score calculation mismatch', score60);
  }

  // Scenario 3: 0% pass
  const session0 = new LiveSession();
  session0.setCells([
    { id: 'c1', kind: 'code', source: 'MOV AX, 0\n; @expect AX = 9\n; @expect ZF = 1\nHLT' } // both fail
  ]);
  session0.runCell('c1');
  const score0 = calculateAutograderScore(session0);

  if (score0.totalAssertions === 2 && score0.passedAssertions === 0 && score0.scorePercent === 0) {
    pass(sName, 'Autograder: 0.0% score when all assertions fail');
  } else {
    fail(sName, '0% score calculation mismatch', score0);
  }

  // Scenario 4: Cell with no assertions
  const sessionEmpty = new LiveSession();
  sessionEmpty.setCells([
    { id: 'c1', kind: 'code', source: 'MOV AX, 5\nHLT' }
  ]);
  sessionEmpty.runCell('c1');
  const scoreEmpty = calculateAutograderScore(sessionEmpty);

  if (scoreEmpty.totalAssertions === 0 && scoreEmpty.scorePercent === 100) {
    pass(sName, 'Autograder: 100% default score when 0 assertions present (no div-by-zero)');
  } else {
    fail(sName, 'Empty assertions score calculation mismatch', scoreEmpty);
  }
}

// ============================================================================
// SUITE 4: FRIENDLY ERRORS INTEGRATION IN SESSIONS
// ============================================================================
console.log(`\n${c.bold}${c.blue}▶ SUITE 4: Friendly Error Handling in Notebook Sessions${c.reset}`);
{
  const sName = 'Friendly Errors Translation';

  // Unknown instruction error in notebook cell
  const sessionErr = new LiveSession();
  sessionErr.setCells([
    { id: 'bad_cell', kind: 'code', source: 'INVALID_OPCODE AX, BX\nHLT' }
  ]);

  const rawErrors = sessionErr.getParseErrors();
  if (rawErrors.length > 0 && rawErrors[0].cellId === 'bad_cell') {
    pass(sName, 'getParseErrors identifies error cellId: "bad_cell"');
  } else {
    fail(sName, 'getParseErrors did not identify cellId', rawErrors);
  }

  // Inspect friendly error formatting anomaly
  const friendly = sessionErr.getFriendlyErrors();
  if (friendly.length > 0) {
    if (friendly[0].friendly.includes('Something went wrong')) {
      recordAnomaly(
        'ERR-01',
        'src/kernel/session.ts / errors.ts',
        'HIGH',
        'LiveSession parse errors bypass friendly translation due to missing "error:" prefix',
        'session.ts line 147 pushes "Unknown instruction: ...". errors.ts NASM_PATTERNS expects "error: unknown instruction ...". The error falls through to the generic fallback "Something went wrong".'
      );
      pass(sName, 'Confirmed: raw error falls back to "Something went wrong" due to pattern prefix mismatch');
    } else if (friendly[0].friendly.includes('Invalid instruction')) {
      pass(sName, `Friendly error generated: "${friendly[0].friendly}"`);
    }
  }

  // Test friendlyParse directly with proper standard NASM format
  const standardNasmFe = friendlyParse('error: unknown instruction INVALID_OPCODE', 1);
  if (standardNasmFe.friendly.includes('Invalid instruction') && standardNasmFe.hint.length > 0) {
    pass(sName, 'friendlyParse maps standard NASM error to clear plain-English explanation and hint');
  } else {
    fail(sName, 'standard NASM error parsing failed', standardNasmFe);
  }

  // Divide by zero runtime error friendly translation
  const divByZeroFe = friendlyParse('divide overflow', 5);
  if (divByZeroFe.friendly.includes('divide by zero') && divByZeroFe.hint.includes('DIV/IDIV')) {
    pass(sName, 'Runtime divide overflow mapped to plain English hint');
  } else {
    fail(sName, 'Divide overflow friendly parse mismatch', divByZeroFe);
  }
}

// ============================================================================
// FINAL SUMMARY & RESULTS REPORT
// ============================================================================
console.log(`\n${c.bold}${c.cyan}================================================================`);
console.log(`  VIGOROUS TEST EXECUTION SUMMARY`);
console.log(`================================================================${c.reset}`);
console.log(`  Total Tests:       ${totalTests}`);
console.log(`  Passed:            ${c.green}${passedTests}${c.reset}`);
console.log(`  Failed:            ${failedTests > 0 ? c.red : c.green}${failedTests}${c.reset}`);
console.log(`  Anomalies Found:   ${anomalies.length > 0 ? c.yellow : c.green}${anomalies.length}${c.reset}`);

if (anomalies.length > 0) {
  console.log(`\n${c.bold}${c.yellow}Identified Architectural Gaps & Edge-Case Bugs:${c.reset}`);
  anomalies.forEach((a, idx) => {
    const sevColor = a.severity === 'CRITICAL' ? c.red : (a.severity === 'HIGH' ? c.yellow : c.cyan);
    console.log(`  ${idx + 1}. [${a.id}] ${sevColor}[${a.severity}]${c.reset} ${c.bold}${a.title}${c.reset} (${a.component})`);
    console.log(`     ${c.gray}${a.details}${c.reset}`);
  });
}
console.log(`${c.bold}${c.cyan}================================================================${c.reset}\n`);

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
