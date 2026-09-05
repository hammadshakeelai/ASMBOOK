import { CPU, Executor, Parser } from '../src/kernel/engine.mjs';

const findings = [];
function record(category, testName, pass, details = '') {
  if (pass) {
    console.log(`  [PASS] ${category}: ${testName}`);
  } else {
    console.error(`  [FAIL] ${category}: ${testName} -> ${details}`);
    findings.push({ category, testName, details });
  }
}

function runCode(src, maxSteps = 50000) {
  const parser = new Parser();
  const parsed = parser.parse(src);
  const cpu = new CPU();
  const ex = new Executor(cpu, parsed);
  let steps = 0;
  let error = null;
  while (steps < maxSteps && !cpu.halted && cpu.ip < parsed.instrs.length) {
    try {
      ex.step();
      steps++;
    } catch (e) {
      error = e;
      break;
    }
  }
  return { cpu, parsed, ex, steps, error };
}

console.log('=== [RED TEAM 1] Engine & CPU Stress / Fuzzing ===\n');

// 1. Divide by Zero (DIV BL with BL=0)
{
  const res = runCode('MOV AL, 10\nMOV BL, 0\nDIV BL\nHLT');
  record('ALU', 'Division by zero (8-bit) caught gracefully', res.error !== null && /divi(de|sion) by zero/i.test(res.error.message), res.error ? res.error.message : 'No error thrown!');
}

// 2. 16-bit Divide by Zero (DIV BX with BX=0)
{
  const res = runCode('MOV AX, 1000h\nMOV BX, 0\nDIV BX\nHLT');
  record('ALU', 'Division by zero (16-bit) caught gracefully', res.error !== null && /divi(de|sion) by zero/i.test(res.error.message), res.error ? res.error.message : 'No error thrown!');
}

// 3. 8-bit IDIV overflow (quotient doesn't fit in AL)
{
  // 300 / 1 -> AL cannot hold 300
  const res = runCode('MOV AX, 012Ch\nMOV BL, 1\nIDIV BL\nHLT');
  record('ALU', 'IDIV overflow handled gracefully', res.error !== null, res.error ? res.error.message : 'Overflow not caught');
}

// 4. Stack underflow / overflow boundary (SP wrap-around)
{
  const res = runCode('MOV SP, 0\nPOP AX\nHLT');
  // In 8086, POP with SP=0 wraps SP to 2 and reads from SS:0000. Should not crash host JS!
  record('Stack', 'Stack underflow/wrap-around does not crash host JS', res.error === null && res.cpu.regs.SP === 2, `SP=${res.cpu?.regs?.SP}, error=${res.error}`);
}

// 5. Huge stack push exhaustion
{
  let pushCode = 'MOV CX, 500\npush_loop:\nPUSH CX\nLOOP push_loop\nHLT';
  const res = runCode(pushCode);
  record('Stack', '500 PUSH operations succeed and decrement SP', res.error === null && res.cpu.regs.SP === (0xFFFE - 1000), `SP=${res.cpu?.regs?.SP}`);
}

// 6. Memory boundary at 1MB (0xFFFFF)
{
  // Seg F000h, off FFFFh -> linear = F0000 + FFFF = FFFFF
  const res = runCode('MOV AX, 0F000h\nMOV DS, AX\nMOV BX, 0FFFFh\nMOV BYTE [BX], 42h\nMOV AL, BYTE [BX]\nHLT');
  record('Memory', 'Write/Read at physical address 0xFFFFF succeeds without out-of-bounds crash', res.error === null && res.cpu.getReg('AL') === 0x42, `AL=${res.cpu?.getReg('AL')}`);
}

// 7. 20-bit address wrap-around past 1MB (A20 disabled in real 8086)
{
  // FFFF:0010h -> linear (FFFF << 4) + 10 = FFFF0 + 10 = 100000h -> wraps to 00000h
  const res = runCode('MOV AX, 0FFFFh\nMOV DS, AX\nMOV BX, 0010h\nMOV BYTE [BX], 99h\nMOV AL, BYTE [BX]\nHLT');
  record('Memory', 'Address past 1MB wraps modulo 2^20 (1MB boundary)', res.error === null && res.cpu.getReg('AL') === 0x99, `AL=${res.cpu?.getReg('AL')}`);
}

// 8. Effective address complex calculations [BP + SI - disp]
{
  const res = runCode(`
    MOV BP, 100h
    MOV SI, 50h
    MOV BYTE [BP+SI-10h], 77h
    MOV AL, BYTE [BP+SI-10h]
    HLT
  `);
  record('Addressing', '[BP+SI-disp] computes correct offset 140h', res.error === null && res.cpu.getReg('AL') === 0x77, `AL=${res.cpu?.getReg('AL')}`);
}

// 9. Effective address [BX + DI + disp]
{
  const res = runCode(`
    MOV BX, 200h
    MOV DI, 30h
    MOV BYTE [BX+DI+0Ah], 88h
    MOV AL, BYTE [BX+DI+0Ah]
    HLT
  `);
  record('Addressing', '[BX+DI+disp] computes correct offset 23Ah', res.error === null && res.cpu.getReg('AL') === 0x88, `AL=${res.cpu?.getReg('AL')}`);
}

// 10. String instruction with REP and CX=0
{
  const res = runCode(`
    MOV CX, 0
    MOV SI, 100h
    MOV DI, 200h
    REP MOVSB
    HLT
  `);
  record('String Ops', 'REP MOVSB with CX=0 executes 0 times and does not hang', res.error === null && res.steps <= 5, `steps=${res.steps}`);
}

// 11. String instruction backwards with STD
{
  const res = runCode(`
    CLD
    MOV BYTE [200h], 11h
    MOV BYTE [201h], 22h
    STD
    MOV SI, 201h
    LODSB
    MOV BL, AL
    LODSB
    MOV BH, AL
    HLT
  `);
  record('String Ops', 'STD causes LODSB to decrement SI', res.error === null && res.cpu.regs.BX === 0x1122, `BX=${res.cpu?.regs?.BX?.toString(16)}`);
}

// 12. BCD Adjustments: DAA, DAS, AAA, AAS, AAM, AAD
{
  const res = runCode(`
    ; Test AAM
    MOV AL, 35
    AAM
    ; AH should be 3, AL should be 5 -> AX = 0305h
    MOV BX, AX
    ; Test AAD
    AAD
    ; AL should be 35 (23h)
    MOV CL, AL
    HLT
  `);
  record('BCD', 'AAM and AAD work correctly', res.error === null && res.cpu.regs.BX === 0x0305 && res.cpu.regs.CX === 35, `BX=${res.cpu?.regs?.BX?.toString(16)}, CL=${res.cpu?.regs?.CX}`);
}

// 13. Shift by CL where CL = 0
{
  const res = runCode(`
    MOV AX, 1234h
    MOV CL, 0
    SHL AX, CL
    HLT
  `);
  record('Shifts', 'SHL AX, CL where CL=0 leaves AX unchanged', res.error === null && res.cpu.regs.AX === 0x1234, `AX=${res.cpu?.regs?.AX?.toString(16)}`);
}

// 14. Shift count greater than 16 (8086 masks count mod 32 on 186+, or executes count times on 8086)
{
  const res = runCode(`
    MOV AX, 0FFFFh
    MOV CL, 16
    SHL AX, CL
    HLT
  `);
  record('Shifts', 'SHL AX, 16 shifts all bits out to 0', res.error === null && res.cpu.regs.AX === 0, `AX=${res.cpu?.regs?.AX?.toString(16)}`);
}

// 15. Infinite loop execution step cap
{
  const res = runCode('loop:\nJMP loop', 5000);
  record('Control Flow', 'Infinite JMP yields at step limit', res.steps === 5000, `steps=${res.steps}`);
}

console.log(`\n=== Engine Fuzz Results: ${findings.length === 0 ? 'ALL PASSED' : findings.length + ' ISSUES FOUND'} ===\n`);
if (findings.length > 0) {
  console.log(JSON.stringify(findings, null, 2));
}
