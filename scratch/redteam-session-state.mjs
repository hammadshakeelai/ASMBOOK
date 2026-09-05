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

console.log('=== [RED TEAM 3] Multi-Cell State & RAM-Patch Testing ===\n');

// 1. Forward symbol resolution across 5+ cells
{
  const s = new LiveSession();
  s.setCells([
    { id: 'c1', kind: 'code', source: ".DATA\nval DW 01234h\nmsg DB 'OK$'" },
    { id: 'c2', kind: 'code', source: "JMP main_start" },
    { id: 'c3', kind: 'code', source: "sub_add:\nADD AX, BX\nRET" },
    { id: 'c4', kind: 'code', source: "sub_mul:\nMOV CX, 2\nMUL CX\nRET" },
    { id: 'c5', kind: 'code', source: "main_start:\nMOV AX, [val]\nMOV BX, 2\nCALL sub_add\nCALL sub_mul\nHLT" }
  ]);

  const r = s.runCell('c5');
  const expected = (0x1234 + 2) * 2;
  record('Multi-Cell', 'Forward symbol resolution across 5 cells', s.getState().regs.AX === expected, `AX=${s.getState().regs.AX?.toString(16)} expected=${expected.toString(16)}`);
}

// 2. Out-of-order cell execution & stale state detection
{
  const s = new LiveSession();
  s.setCells([
    { id: 'c1', kind: 'code', source: "MOV AX, 100\nHLT" },
    { id: 'c2', kind: 'code', source: "MOV BX, AX\nADD BX, 50\nHLT" },
    { id: 'c3', kind: 'code', source: "MOV CX, BX\nADD CX, 25\nHLT" }
  ]);

  // Run c2 before c1 was run
  s.runCell('c2');
  // In unrun c1, AX was 0, so BX becomes 0 + 50 = 50
  record('Multi-Cell', 'Running cell 2 without cell 1 executes with default CPU state', s.getState().regs.BX === 50, `BX=${s.getState().regs.BX}`);

  // Now run c1, AX becomes 100
  s.runCell('c1');
  record('Multi-Cell', 'Running cell 1 sets AX', s.getState().regs.AX === 100, `AX=${s.getState().regs.AX}`);

  // Re-run c2, now BX should become 100 + 50 = 150
  s.runCell('c2');
  record('Multi-Cell', 'Re-running cell 2 picks up updated AX from cell 1', s.getState().regs.BX === 150, `BX=${s.getState().regs.BX}`);
}

// 3. Live RAM update & patch reactivity
{
  const s = new LiveSession();
  s.setCells([
    { id: 'c1', kind: 'code', source: ".DATA\nnum DW 42h\n.CODE\nMOV AX, [num]\nHLT" }
  ]);
  s.runCell('c1');
  const initialAX = s.getState().regs.AX;

  // Now update .DATA in cell 1
  s.setCells([
    { id: 'c1', kind: 'code', source: ".DATA\nnum DW 999h\n.CODE\nMOV AX, [num]\nHLT" }
  ]);
  s.runCell('c1');
  const updatedAX = s.getState().regs.AX;
  record('RAM Patch', 'Updating .DATA reflects immediately in memory on re-run', initialAX === 0x42 && updatedAX === 0x999, `initial=${initialAX} updated=${updatedAX}`);
}

// 4. Breakpoint stability across cell insertion
{
  const s = new LiveSession();
  s.setCells([
    { id: 'c1', kind: 'code', source: "MOV AX, 1\nMOV BX, 2" },
    { id: 'c2', kind: 'code', source: "MOV CX, 3\nMOV DX, 4\nHLT" }
  ]);
  // Set breakpoint on cell 'c2', line 2 (MOV DX, 4)
  s.toggleBreakpoint('c2', 2);
  const bpsBefore = s.getBreakpointLines('c2');

  // Insert a new cell between c1 and c2
  s.setCells([
    { id: 'c1', kind: 'code', source: "MOV AX, 1\nMOV BX, 2" },
    { id: 'c_mid', kind: 'code', source: "NOP\nNOP" },
    { id: 'c2', kind: 'code', source: "MOV CX, 3\nMOV DX, 4\nHLT" }
  ]);

  const bpsAfter = s.getBreakpointLines('c2');
  // Breakpoint should still be on cell 'c2', line 2
  record('Breakpoints', 'Breakpoints remain anchored to cell and line after middle insertion', bpsAfter.has(2) && bpsAfter.size === 1, `bpsAfter: ${Array.from(bpsAfter)}`);

  // Run and verify that breakpoint in c2 hits
  s.reset();
  const runRes = s.continueRun();
  // Should stop at breakpoint
  record('Breakpoints', 'Execution pauses at cell breakpoint after structural edit', runRes.reason === 'breakpoint', `runRes reason: ${runRes.reason}`);
}

// 5. Reset cleans all memory, registers, stack, and text buffer
{
  const s = new LiveSession();
  s.setCells([
    {
      id: 'c1',
      kind: 'code',
      source: "MOV AX, 1234h\nMOV BX, 5678h\nPUSH AX\nPUSH BX\nMOV AH, 02h\nMOV DL, 'Z'\nINT 21h\nHLT"
    }
  ]);
  s.runCell('c1');

  // Reset
  s.reset();

  const stateAfter = s.getState();
  const screenAfter = s.screenText();
  const hasZAfter = screenAfter.some(row => row.some(cell => cell.ch === 'Z'));

  const regsClean = Object.entries(stateAfter.regs).every(([k, v]) => {
    if (k === 'SP') return v === 0xFFFE; // default SP
    if (k === 'SS' || k === 'CS' || k === 'DS' || k === 'ES') return true;
    if (k === 'FLAG_IF') return v === 1; // 8086 default IF=1
    return v === 0;
  });

  record('Reset', 'Reset clears registers, stack, and video buffer', regsClean && !hasZAfter && s.getFullOutput() === '', `regsClean=${regsClean}, hasZAfter=${hasZAfter}, output="${s.getFullOutput()}"`);
}

// 6. NeedsRestart flag behavior
{
  const s = new LiveSession();
  s.setCells([
    { id: 'c1', kind: 'code', source: "MOV AX, 10\nMOV BX, 20\nHLT" },
    { id: 'c2', kind: 'code', source: "ADD AX, BX\nHLT" }
  ]);
  s.runCell('c1');
  s.step(); // step into c2

  // Modify cell 1 while cursor is in cell 2
  s.setCells([
    { id: 'c1', kind: 'code', source: "MOV AX, 99\nHLT" },
    { id: 'c2', kind: 'code', source: "ADD AX, BX\nHLT" }
  ]);

  record('Lifecycle', 'Cell modification updates machine safely without crashing', s.getState().cursor !== undefined);
}

console.log(`\n=== Suite 3 Results: ${findings.length === 0 ? 'ALL PASSED' : findings.length + ' ISSUES FOUND'} ===\n`);
if (findings.length > 0) {
  console.log(JSON.stringify(findings, null, 2));
}
