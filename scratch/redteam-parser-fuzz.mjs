import { Parser, Executor, CPU } from '../src/kernel/engine.mjs';
import { LiveSession } from '../src/kernel/session.js';

const findings = [];
function record(category, testName, pass, details = '') {
  if (pass) {
    console.log(`  [PASS] ${category}: ${testName}`);
  } else {
    console.error(`  [FAIL] ${category}: ${testName} -> ${details}`);
    findings.push({ category, testName, details });
  }
}

console.log('=== [RED TEAM 2] Assembler & Parser Adversarial Fuzzing ===\n');

// 1. Empty and whitespace-only source
{
  const p = new Parser();
  let res;
  try {
    res = p.parse('   \n\n\t   \n  ; just a comment\n');
    record('Parser', 'Empty / whitespace input parses without crash', res.errors.length === 0 && res.instrs.length === 0);
  } catch (e) {
    record('Parser', 'Empty input parses without crash', false, e.message);
  }
}

// 2. Semicolon inside a quoted string literal: DB 'Hello; World$'
{
  const p = new Parser();
  const res = p.parse(".DATA\nmsg DB 'Hello; World$'\n.CODE\nMOV DX, msg\nHLT");
  const msgVar = res.vars['MSG'];
  const bytes = msgVar?.bytes || [];
  const str = String.fromCharCode(...bytes);
  record('Parser', 'Semicolon inside string is preserved (not stripped as comment)', str === 'Hello; World$', `parsed str: "${str}"`);
}

// 3. String with escaped or alternating quotes
{
  const p = new Parser();
  const res = p.parse(`.DATA\nmsg1 DB "It's fine$"\nmsg2 DB 'Double "quote" here$'\n.CODE\nHLT`);
  const v1 = String.fromCharCode(...(res.vars['MSG1']?.bytes || []));
  const v2 = String.fromCharCode(...(res.vars['MSG2']?.bytes || []));
  record('Parser', 'Alternating quotes supported correctly', v1 === "It's fine$" && v2 === 'Double "quote" here$', `v1="${v1}", v2="${v2}"`);
}

// 4. Unknown opcode in LiveSession
{
  const s = new LiveSession();
  s.setCells([{ id: 'c1', kind: 'code', source: 'FOOBAR AX, 1234h\nHLT' }]);
  const errors = s.getParseErrors();
  record('Parser', 'Unknown instruction produces clear parse error', errors.length > 0 && /unknown instruction/i.test(errors[0].message), `errors: ${JSON.stringify(errors)}`);
}

// 5. Missing operands: MOV without 2nd operand
{
  const s = new LiveSession();
  s.setCells([{ id: 'c1', kind: 'code', source: 'MOV AX\nHLT' }]);
  const errors = s.getParseErrors();
  record('Parser', 'Missing operand produces clear parse error', errors.length > 0 && /expects 2 operands/i.test(errors[0].message), `errors: ${JSON.stringify(errors)}`);
}

// 6. Size mismatch: MOV 16-bit reg, 8-bit reg (MOV AX, CL)
{
  const s = new LiveSession();
  s.setCells([{ id: 'c1', kind: 'code', source: 'MOV AX, CL\nHLT' }]);
  // Run cell to verify error or parse error
  const r = s.runCell('c1');
  record('Assembler', 'Size mismatch (MOV AX, CL) flagged or rejected', r.reason === 'error' || s.getParseErrors().length > 0, `run reason: ${r.reason}, error: ${r.error}`);
}

// 7. JMP to non-existent label
{
  const s = new LiveSession();
  s.setCells([{ id: 'c1', kind: 'code', source: 'JMP nonexistent_target\nHLT' }]);
  const r = s.runCell('c1');
  record('Assembler', 'JMP to non-existent label caught with error', r.reason === 'error' && /label|target/i.test(r.error || ''), `error: ${r.error}`);
}

// 8. INT 21h AH=09h missing '$' terminator check
{
  const s = new LiveSession();
  s.setCells([{
    id: 'c1',
    kind: 'code',
    source: ".DATA\nbad_str DB 'No dollar sign here'\n.CODE\nMOV DX, bad_str\nMOV AH, 09h\nINT 21h\nHLT"
  }]);
  // Check friendly errors or session output behavior
  const fe = s.getFriendlyErrors();
  const hasDollarWarning = fe.some(e => /dollar|terminator|\$/i.test(e.message + ' ' + e.hint));
  record('Pedagogy Lint', "Missing '$' terminator lint warning detected on INT 21h AH=09h", hasDollarWarning, `errors found: ${fe.map(e => e.message).join('; ') || 'None'}`);
}

// 9. Case insensitivity for hex numbers, registers, and instructions
{
  const s = new LiveSession();
  s.setCells([{ id: 'c1', kind: 'code', source: 'mov ax, 0abch\nadd Ax, 0DEFh\nhlt' }]);
  const r = s.runCell('c1');
  const expected = 0x0ABC + 0x0DEF;
  record('Parser', 'Mixed-case instructions, registers, and hex parsed accurately', s.getState().regs.AX === expected, `AX=${s.getState().regs.AX?.toString(16)} expected=${expected.toString(16)}`);
}

// 10. EQU directive evaluation (symbolic constants)
{
  const s = new LiveSession();
  s.setCells([{
    id: 'c1',
    kind: 'code',
    source: "MAX EQU 100\nMOV AX, MAX\nHLT"
  }]);
  s.runCell('c1');
  record('Parser', 'EQU constant evaluates properly in MOV immediate', s.getState().regs.AX === 100, `AX=${s.getState().regs.AX}`);
}

// 11. Large input fuzzing: 500 instructions
{
  const instrs = [];
  for (let i = 0; i < 500; i++) {
    instrs.push(`MOV AX, ${i}`);
  }
  instrs.push('HLT');
  const t0 = performance.now();
  const s = new LiveSession();
  s.setCells([{ id: 'c1', kind: 'code', source: instrs.join('\n') }]);
  s.runCell('c1');
  const duration = performance.now() - t0;
  record('Performance', '500 instructions assemble and execute in < 200ms', duration < 200 && s.getState().regs.AX === 499, `duration=${Math.round(duration)}ms, AX=${s.getState().regs.AX}`);
}

console.log(`\n=== Parser Fuzz Results: ${findings.length === 0 ? 'ALL PASSED' : findings.length + ' ISSUES FOUND'} ===\n`);
if (findings.length > 0) {
  console.log(JSON.stringify(findings, null, 2));
}
