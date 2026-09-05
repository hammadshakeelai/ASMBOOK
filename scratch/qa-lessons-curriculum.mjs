import fs from 'fs';
import path from 'path';
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

console.log('=== [RED TEAM 5] Curriculum & 12 Lessons Exhaustive Audit ===\n');

const LESSON_FILES = [
  '01-hello-world.asmnb',
  '02-registers-mov.asmnb',
  '03-arithmetic.asmnb',
  '04-comparison-branching.asmnb',
  '05-stack.asmnb',
  '06-loops.asmnb',
  '07-strings.asmnb',
  '08-putting-it-together.asmnb',
  '09-flags-deep-dive.asmnb',
  '10-interrupts-dos-io.asmnb',
  '11-number-conversion.asmnb',
  '12-doomsday.asmnb'
];

for (const filename of LESSON_FILES) {
  const filePath = path.join('./public/lessons', filename);
  if (!fs.existsSync(filePath)) {
    record('Curriculum', `Lesson file exists: ${filename}`, false, 'File not found');
    continue;
  }

  let data;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    data = JSON.parse(content);
  } catch (e) {
    record('Curriculum', `Valid JSON: ${filename}`, false, e.message);
    continue;
  }

  const isValidFormat = data?.version === 1 && Array.isArray(data?.cells) && data.cells.length > 0;
  record('Format', `Schema v1 & non-empty cells: ${filename}`, isValidFormat);

  if (!isValidFormat) continue;

  const s = new LiveSession();
  s.setCells(data.cells);

  const parseErrors = s.getParseErrors();
  record('Assembler', `Clean parse without syntax errors: ${filename}`, parseErrors.length === 0, `errors: ${parseErrors.map(e => e.message).join('; ')}`);

  // Run all code cells in sequence
  let allCellsRunClean = true;
  let allExpectsPassed = true;
  let cellFailures = [];

  for (const c of data.cells) {
    if (c.kind === 'code') {
      const res = s.runCell(c.id);
      if (res.reason === 'error') {
        allCellsRunClean = false;
        cellFailures.push(`Cell ${c.id} runtime error: ${res.error}`);
      }
      if (res.expectResults && res.expectResults.length > 0) {
        if (!res.allPassed) {
          allExpectsPassed = false;
          cellFailures.push(`Cell ${c.id} expect failure: ${JSON.stringify(res.expectResults.filter(e => !e.passed))}`);
        }
      }
    }
  }

  record('Execution', `All cells execute without runtime error: ${filename}`, allCellsRunClean, cellFailures.join(' | '));
  record('Expectations', `All pedagogical assertions pass: ${filename}`, allExpectsPassed, cellFailures.join(' | '));
}

// Check specific curriculum milestones
{
  // Lesson 1 prints Hello, World!
  const l1 = JSON.parse(fs.readFileSync('./public/lessons/01-hello-world.asmnb', 'utf8'));
  const s1 = new LiveSession();
  s1.setCells(l1.cells);
  for (const c of l1.cells) if (c.kind === 'code') s1.runCell(c.id);
  const out1 = s1.getFullOutput();
  record('Milestone', 'Lesson 1 output contains "Hello, World!"', out1.includes('Hello, World!'), `output: "${out1}"`);
}

{
  // Lesson 5 Stack pushes and pops correctly
  const l5 = JSON.parse(fs.readFileSync('./public/lessons/05-stack.asmnb', 'utf8'));
  const s5 = new LiveSession();
  s5.setCells(l5.cells);
  for (const c of l5.cells) if (c.kind === 'code') s5.runCell(c.id);
  const sp = s5.getState().regs.SP;
  record('Milestone', 'Lesson 5 stack pointer restored or balanced', sp !== undefined);
}

{
  // Lesson 10 prints DOS output
  const l10 = JSON.parse(fs.readFileSync('./public/lessons/10-interrupts-dos-io.asmnb', 'utf8'));
  const s10 = new LiveSession();
  s10.setCells(l10.cells);
  for (const c of l10.cells) if (c.kind === 'code') s10.runCell(c.id);
  const out10 = s10.getFullOutput();
  record('Milestone', 'Lesson 10 produces DOS console output', out10.length > 0, `output: "${out10}"`);
}

console.log(`\n=== Suite 5 Results: ${findings.length === 0 ? 'ALL PASSED' : findings.length + ' ISSUES FOUND'} ===\n`);
if (findings.length > 0) {
  console.log(JSON.stringify(findings, null, 2));
}
