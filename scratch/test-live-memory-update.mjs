import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = path.resolve('scratch/screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function setCellCode(page, selector, code) {
  const cellEditor = page.locator(selector).locator('.cell-editor');
  await cellEditor.evaluate((el, val) => {
    const view = el.__cmView;
    if (view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: val }
      });
    }
  }, code);
  await page.waitForTimeout(300);
}

async function run() {
  console.log('=== Starting Live Memory Update Browser Verification ===');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 920 });

  console.log('Navigating to http://localhost:5173 ...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForSelector('.app-header');
  await page.waitForTimeout(1000);

  // Switch to inspector tab if not already
  const inspectorBtn = page.locator('button.sidebar-tab-btn', { hasText: 'Inspector' });
  if (await inspectorBtn.count() > 0) {
    await inspectorBtn.click();
    await page.waitForTimeout(200);
  }

  // 1. Click CS:0100 quick jump button in memory panel
  console.log('Clicking CS:0100 quick jump button in memory panel...');
  const cs100Btn = page.locator('.btn-quick-mem', { hasText: 'CS:0100' });
  await cs100Btn.click();
  await page.waitForTimeout(300);

  const memInput = page.locator('.mem-addr-input');
  const inputVal1 = await memInput.inputValue();
  console.log(`Memory address input value: ${inputVal1}`);
  if (inputVal1 !== '0x0100') {
    throw new Error(`Expected input value to be 0x0100, got ${inputVal1}`);
  }

  // Read initial bytes at 0x0100
  const firstRowBytes1 = await page.locator('.mem-table tbody tr').first().locator('td.byte').allInnerTexts();
  console.log('Initial bytes at 0x0100:', firstRowBytes1.slice(0, 6).join(' '));

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'live-mem-01-initial.png') });

  // 2. Modify code in cell-1 to `MOV AX, 1234h\nHLT`
  console.log('Editing code in cell-1 to `MOV AX, 1234h`...');
  await setCellCode(page, '#cell-1', 'MOV AX, 1234h\nHLT');

  // Check live memory update without running!
  const firstRowBytes2 = await page.locator('.mem-table tbody tr').first().locator('td.byte').allInnerTexts();
  console.log('After typing `MOV AX, 1234h`, live bytes at 0x0100:', firstRowBytes2.slice(0, 6).join(' '));

  // MOV AX, 1234h must encode to B8 34 12
  const b0 = firstRowBytes2[0]?.trim();
  const b1 = firstRowBytes2[1]?.trim();
  const b2 = firstRowBytes2[2]?.trim();
  console.log(`Byte 0: ${b0}, Byte 1: ${b1}, Byte 2: ${b2}`);

  if (b0 !== '0xB8' || b1 !== '0x34' || b2 !== '0x12') {
    throw new Error(`Expected 0xB8 0x34 0x12, got ${b0} ${b1} ${b2}`);
  }
  console.log('✓ PASS: Live memory update at CS:0100 reflected MOV AX, 1234h (B8 34 12) immediately while typing!');

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'live-mem-02-typed-1234.png') });

  // 3. Edit code to `MOV BX, 5678h\nHLT`
  console.log('Editing code in cell-1 to `MOV BX, 5678h`...');
  await setCellCode(page, '#cell-1', 'MOV BX, 5678h\nHLT');

  const firstRowBytes3 = await page.locator('.mem-table tbody tr').first().locator('td.byte').allInnerTexts();
  console.log('After typing `MOV BX, 5678h`, live bytes at 0x0100:', firstRowBytes3.slice(0, 6).join(' '));

  // MOV BX, 5678h must encode to BB 78 56
  const bx0 = firstRowBytes3[0]?.trim();
  const bx1 = firstRowBytes3[1]?.trim();
  const bx2 = firstRowBytes3[2]?.trim();
  console.log(`Byte 0: ${bx0}, Byte 1: ${bx1}, Byte 2: ${bx2}`);

  if (bx0 !== '0xBB' || bx1 !== '0x78' || bx2 !== '0x56') {
    throw new Error(`Expected 0xBB 0x78 0x56, got ${bx0} ${bx1} ${bx2}`);
  }
  console.log('✓ PASS: Live memory update at CS:0100 reflected MOV BX, 5678h (BB 78 56) immediately while typing!');

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'live-mem-03-typed-5678.png') });

  // 4. Test .DATA segment live update
  console.log('Testing .DATA segment live update...');
  const dataBtn = page.locator('.btn-quick-mem', { hasText: '.DATA' });
  await dataBtn.click();
  await page.waitForTimeout(300);

  const inputValData = await memInput.inputValue();
  console.log(`Memory address input value after clicking .DATA: ${inputValData}`);
  if (inputValData !== '0x0200') {
    throw new Error(`Expected input value to be 0x0200, got ${inputValData}`);
  }

  // Type .DATA with variable in cell
  console.log('Adding .DATA msg DB "ASMBOOK", 0 in cell...');
  await setCellCode(page, '#cell-1', '.DATA\nmsg DB "ASMBOOK", 0\n.CODE\nMOV AX, 42h\nHLT');

  const dataRowBytes = await page.locator('.mem-table tbody tr').first().locator('td.byte').allInnerTexts();
  console.log('Live bytes at 0x0200 (.DATA):', dataRowBytes.slice(0, 8).join(' '));

  // 'A' = 0x41, 'S' = 0x53, 'M' = 0x4D, 'B' = 0x42, 'O' = 0x4F, 'O' = 0x4F, 'K' = 0x4B
  if (dataRowBytes[0]?.trim() !== '0x41' || dataRowBytes[1]?.trim() !== '0x53') {
    throw new Error(`Expected 0x41 0x53 at 0x0200, got ${dataRowBytes[0]} ${dataRowBytes[1]}`);
  }
  console.log('✓ PASS: Live memory update at 0x0200 reflected .DATA string "ASMBOOK" immediately while typing!');

  const asciiCell = await page.locator('.mem-table tbody tr').first().locator('td.ascii-cell').innerText();
  console.log('ASCII text column at 0x0200:', asciiCell);
  if (!asciiCell.includes('ASMBOOK')) {
    throw new Error(`Expected ASCII cell to contain 'ASMBOOK', got ${asciiCell}`);
  }
  console.log('✓ PASS: ASCII column displays "ASMBOOK" faithfully!');

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'live-mem-04-data-asmbook.png') });

  // 5. Test stepping updates memory
  console.log('Testing step execution updating memory...');
  // Type code that writes to memory at 0x0220
  await setCellCode(page, '#cell-1', 'MOV AL, 0EFh\nMOV [0220h], AL\nHLT');

  // Jump memory to 0x0220
  await memInput.click();
  await memInput.fill('0x0220');
  await memInput.press('Enter');
  await page.waitForTimeout(300);

  const byteBefore = await page.locator('.mem-table tbody tr').first().locator('td.byte').first().innerText();
  console.log('Byte at 0x0220 before execution:', byteBefore);

  // Step 1: MOV AL, 0EFh
  const stepBtn = page.locator('button.btn-step', { hasText: 'Step' }).first();
  await stepBtn.click();
  await page.waitForTimeout(300);

  // Step 2: MOV [0220h], AL
  await stepBtn.click();
  await page.waitForTimeout(300);

  const byteAfter = await page.locator('.mem-table tbody tr').first().locator('td.byte').first().innerText();
  console.log('Byte at 0x0220 after step 2 (MOV [0220h], AL):', byteAfter);

  if (byteAfter.trim() !== '0xEF') {
    throw new Error(`Expected 0xEF at 0x0220 after step, got ${byteAfter}`);
  }
  console.log('✓ PASS: Stepping instruction writing to memory updated memory panel to 0xEF live!');

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'live-mem-05-stepped-write.png') });

  await browser.close();
  console.log('\n=== ALL LIVE MEMORY UPDATE TESTS PASSED 100%! ===\n');
}

run().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
