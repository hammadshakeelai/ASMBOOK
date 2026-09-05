import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const BASE_URL = 'http://localhost:5173';

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: []
};

function record(name, status, details = '') {
  results.total++;
  if (status) {
    results.passed++;
    console.log(`  [PASS] ${name} ${details ? '(' + details + ')' : ''}`);
    results.tests.push({ name, status: 'PASS', details });
  } else {
    results.failed++;
    console.error(`  [FAIL] ${name} ${details ? ': ' + details : ''}`);
    results.tests.push({ name, status: 'FAIL', details });
  }
}

async function run() {
  console.log('================================================================');
  console.log('  ASMBOOK Exhaustive Browser Session Automation & Verification');
  console.log('================================================================\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 920 },
    permissions: ['clipboard-read', 'clipboard-write']
  });

  const page = await context.newPage();

  page.on('dialog', async (dialog) => {
    console.log(`    [Dialog] ${dialog.type()}: "${dialog.message()}" -> Accepting`);
    await dialog.accept();
  });

  page.on('pageerror', (err) => {
    console.warn(`    [Page Error] ${err.message}`);
  });

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Page Load, Title, Header & Navbar Controls
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Testing Page Load, Title & Navbar Controls ---');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const title = await page.title();
    record('Page title', title === 'ASMBOOK — 8086 Assembly Notebook', `title: "${title}"`);

    const headerH1 = await page.locator('.app-header h1').innerText();
    record('Header H1 title', headerH1 === 'ASMBOOK', `h1: "${headerH1}"`);

    const subtitle = await page.locator('.app-header .subtitle').innerText();
    record('Header subtitle', subtitle === '8086 Assembly Notebook', `subtitle: "${subtitle}"`);

    const kernelStatus = await page.locator('.kernel-status').getAttribute('class');
    record('Kernel status idle', kernelStatus?.includes('idle'), `class: "${kernelStatus}"`);

    const demoBtn = page.locator('.header-actions button:has-text("Demo GCD")');
    record('Demo GCD button present', await demoBtn.isVisible());

    const newBtn = page.locator('.header-actions button:has-text("New")');
    record('New button present', await newBtn.isVisible());

    const importBtn = page.locator('.header-actions button:has-text("Import")');
    record('Import button present', await importBtn.isVisible());

    const exportBtn = page.locator('.header-actions button:has-text("Export")');
    record('Export button present', await exportBtn.isVisible());

    const shareBtn = page.locator('.header-actions button:has-text("Share")');
    record('Share button present', await shareBtn.isVisible());

    const themeBtn = page.locator('.header-actions .btn-theme');
    record('Theme toggle button present', await themeBtn.isVisible());

    const lessonsBtn = page.locator('.lessons-dropdown button');
    await lessonsBtn.click();
    await page.waitForTimeout(200);
    const lessonsMenuVisible = await page.locator('.lessons-menu').isVisible();
    record('Lessons dropdown menu opens', lessonsMenuVisible);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    const modePill = page.locator('.notebook-toolbar .mode-pill');
    record('Toolbar mode pill present', await modePill.isVisible(), `text: "${await modePill.innerText()}"`);

    const tbRun = page.locator('.notebook-toolbar .tb-btn-run');
    record('Toolbar Run button present', await tbRun.isVisible());

    const tbStep = page.locator('.notebook-toolbar button:has-text("Step")');
    record('Toolbar Step button present', await tbStep.isVisible());

    const tbRestart = page.locator('.notebook-toolbar button:has-text("Restart")');
    record('Toolbar Restart button present', await tbRestart.isVisible());

    const tbRunAll = page.locator('.notebook-toolbar button:has-text("Run All")');
    record('Toolbar Run All button present', await tbRunAll.isVisible());

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'test-01-page-load.png') });

    // -------------------------------------------------------------------------
    // TEST 2: Dark Mode / Light Mode Toggle & Persistence
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Testing Dark / Light Mode Toggle & Persistence ---');
    const initialThemeAttr = await page.locator('html').getAttribute('data-theme');
    console.log(`    Current theme attribute: "${initialThemeAttr}"`);

    await themeBtn.click();
    await page.waitForTimeout(300);

    const themeAfterToggle = await page.locator('html').getAttribute('data-theme');
    const expectedTheme = initialThemeAttr === 'dark' ? 'light' : 'dark';
    record('Theme toggled on <html>', themeAfterToggle === expectedTheme, `data-theme="${themeAfterToggle}"`);

    const storedTheme = await page.evaluate(() => localStorage.getItem('asmbook_theme'));
    record('Theme saved to localStorage', storedTheme === expectedTheme, `stored: "${storedTheme}"`);

    const appThemeAttr = await page.locator('.app').getAttribute('data-theme');
    record('Theme applied to .app container', appThemeAttr === expectedTheme, `.app data-theme="${appThemeAttr}"`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'test-02-theme-switched.png') });

    const tbThemeBtn = page.locator('.notebook-toolbar .tb-btn-theme');
    await tbThemeBtn.click();
    await page.waitForTimeout(300);

    const themeAfterSecondToggle = await page.locator('html').getAttribute('data-theme');
    record('Theme toggled back via toolbar', themeAfterSecondToggle === initialThemeAttr, `data-theme="${themeAfterSecondToggle}"`);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const persistedTheme = await page.locator('html').getAttribute('data-theme');
    record('Theme persisted across page reload', persistedTheme === initialThemeAttr, `persisted: "${persistedTheme}"`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'test-03-theme-persisted.png') });

    // -------------------------------------------------------------------------
    // TEST 3: CodeMirror Editor Typing, Modifying Code & Breakpoint Toggling
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Testing CodeMirror Typing, Modifying & Breakpoints ---');

    const firstCodeCell = page.locator('.cell-code').first();
    await firstCodeCell.waitFor({ state: 'visible' });

    const cmEditor = firstCodeCell.locator('.cm-content');
    await cmEditor.click();
    await page.waitForTimeout(200);

    const testCode = [
      '; Breakpoint & Step Test',
      'MOV AX, 1234h',
      'MOV BX, 5678h',
      'ADD AX, BX',
      'HLT'
    ].join('\n');

    await firstCodeCell.locator('.cell-editor').evaluate((el, code) => {
      const view = el.__cmView;
      if (view) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: code }
        });
      }
    }, testCode);
    await page.waitForTimeout(300);

    const currentCode = await cmEditor.innerText();
    record('CodeMirror code modified', currentCode.includes('MOV AX, 1234h') && currentCode.includes('ADD AX, BX'));

    const firstGutter = firstCodeCell.locator('.cm-gutters .cm-gutter').first();
    const gutterElements = firstGutter.locator('.cm-gutterElement');
    const gutterCount = await gutterElements.count();
    record('Gutter elements present', gutterCount > 0, `count: ${gutterCount}`);

    if (gutterCount >= 2) {
      await gutterElements.nth(1).click();
      await page.waitForTimeout(200);
      const bpMarker = firstCodeCell.locator('.cm-breakpoint');
      const hasBp = await bpMarker.count() > 0;
      record('Breakpoint marker appeared on click', hasBp);

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'test-04-editor-breakpoint-set.png') });

      await gutterElements.nth(1).click();
      await page.waitForTimeout(200);
      const bpMarkerRemoved = await bpMarker.count() === 0;
      record('Breakpoint marker removed on second click', bpMarkerRemoved);
    }

    // -------------------------------------------------------------------------
    // TEST 4: Single-Stepping & Watching Registers Update Line-by-Line
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Testing Single-Stepping & Register Panel Live Updates ---');

    const stepProgram = [
      'MOV AX, 0AAh',
      'MOV BX, 0BBh',
      'MOV CX, 0CCh',
      'MOV DX, 0DDh',
      'HLT'
    ].join('\n');

    await firstCodeCell.locator('.cell-editor').evaluate((el, code) => {
      const view = el.__cmView;
      if (view) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
      }
    }, stepProgram);
    await page.waitForTimeout(300);

    await page.locator('.notebook-toolbar button:has-text("Restart")').click();
    await page.waitForTimeout(200);

    async function getRegisterVal(reg) {
      return page.evaluate((targetReg) => {
        const rows = document.querySelectorAll('.regs-table tr');
        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          for (let i = 0; i < cells.length; i += 2) {
            if (cells[i]?.innerText.trim() === targetReg) {
              return cells[i + 1]?.innerText.trim();
            }
          }
        }
        return null;
      }, reg);
    }

    const initialAX = await getRegisterVal('AX');
    record('Initial AX is 0x0000', initialAX === '0x0000', `AX: ${initialAX}`);

    const stepBtn = page.locator('.controls .btn-step');
    await stepBtn.click();
    await page.waitForTimeout(200);

    const axAfterStep1 = await getRegisterVal('AX');
    record('Step 1 updates AX to 0x00AA', axAfterStep1 === '0x00AA', `AX: ${axAfterStep1}`);

    await stepBtn.click();
    await page.waitForTimeout(200);
    const bxAfterStep2 = await getRegisterVal('BX');
    record('Step 2 updates BX to 0x00BB', bxAfterStep2 === '0x00BB', `BX: ${bxAfterStep2}`);

    await stepBtn.click();
    await page.waitForTimeout(200);
    const cxAfterStep3 = await getRegisterVal('CX');
    record('Step 3 updates CX to 0x00CC', cxAfterStep3 === '0x00CC', `CX: ${cxAfterStep3}`);

    await stepBtn.click();
    await page.waitForTimeout(200);
    const dxAfterStep4 = await getRegisterVal('DX');
    record('Step 4 updates DX to 0x00DD', dxAfterStep4 === '0x00DD', `DX: ${dxAfterStep4}`);

    const allRegs = ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP', 'CS', 'DS', 'SS', 'ES', 'IP'];
    let allRegsPresent = true;
    for (const r of allRegs) {
      const val = await getRegisterVal(r);
      if (!val || !val.startsWith('0x')) {
        allRegsPresent = false;
        console.warn(`Missing or invalid register ${r}: ${val}`);
      }
    }
    record('All 13 registers (GPRs, pointers, segments, IP) displayed', allRegsPresent);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'test-05-single-step-registers.png') });

    // -------------------------------------------------------------------------
    // TEST 5: Flags View Reactivity (ZF, CF, SF, OF, PF, AF)
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Testing Flags View (ZF, CF, SF, OF, PF, AF) ---');

    async function getFlags() {
      return page.evaluate(() => {
        const flagEls = document.querySelectorAll('.flags-row .flag-bit');
        const flags = {};
        for (const el of flagEls) {
          const text = el.innerText.trim();
          const [name, val] = text.split(':');
          flags[name] = {
            val: Number(val),
            set: el.classList.contains('set')
          };
        }
        return flags;
      });
    }

    const flagsProgram = [
      'MOV AX, 50h',
      'CMP AX, 50h',
      'MOV AX, 0FFFFh',
      'ADD AX, 1',
      'MOV AX, 1',
      'SUB AX, 10',
      'HLT'
    ].join('\n');

    await firstCodeCell.locator('.cell-editor').evaluate((el, code) => {
      const view = el.__cmView;
      if (view) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
      }
    }, flagsProgram);
    await page.waitForTimeout(300);

    await page.locator('.notebook-toolbar button:has-text("Restart")').click();
    await page.waitForTimeout(200);

    await stepBtn.click();
    await page.waitForTimeout(100);

    await stepBtn.click();
    await page.waitForTimeout(200);
    const flagsAfterCmp = await getFlags();
    record('CMP AX, AX sets ZF=1', flagsAfterCmp.ZF?.val === 1 && flagsAfterCmp.ZF?.set, `ZF=${flagsAfterCmp.ZF?.val}`);
    record('CMP AX, AX sets PF=1', flagsAfterCmp.PF?.val === 1 && flagsAfterCmp.PF?.set, `PF=${flagsAfterCmp.PF?.val}`);

    await stepBtn.click();
    await page.waitForTimeout(100);

    await stepBtn.click();
    await page.waitForTimeout(200);
    const flagsAfterAdd = await getFlags();
    record('ADD overflow sets CF=1', flagsAfterAdd.CF?.val === 1 && flagsAfterAdd.CF?.set, `CF=${flagsAfterAdd.CF?.val}`);
    record('ADD overflow sets ZF=1', flagsAfterAdd.ZF?.val === 1 && flagsAfterAdd.ZF?.set, `ZF=${flagsAfterAdd.ZF?.val}`);

    await stepBtn.click();
    await page.waitForTimeout(100);

    await stepBtn.click();
    await page.waitForTimeout(200);
    const flagsAfterSub = await getFlags();
    record('SUB underflow sets SF=1', flagsAfterSub.SF?.val === 1 && flagsAfterSub.SF?.set, `SF=${flagsAfterSub.SF?.val}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'test-06-flags-reactivity.png') });

    // -------------------------------------------------------------------------
    // TEST 6: Memory Panel Navigation & Hex Dump
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Testing Memory Panel Navigation & Hex Dump ---');

    const memInput = page.locator('.mem-addr-input');
    await memInput.waitFor({ state: 'visible' });

    async function getFirstMemTableAddr() {
      return page.evaluate(() => {
        const firstAddrCell = document.querySelector('.mem-table tbody tr td.addr');
        return firstAddrCell ? firstAddrCell.innerText.trim() : null;
      });
    }

    await memInput.click();
    await memInput.fill('0x1000');
    await memInput.press('Enter');
    await page.waitForTimeout(300);

    let memAddr1 = await getFirstMemTableAddr();
    record('Memory panel navigated to 0x1000', memAddr1 === '0x1000', `table addr: ${memAddr1}`);

    await memInput.click();
    await memInput.fill('0x0100');
    await memInput.press('Enter');
    await page.waitForTimeout(300);

    let memAddr2 = await getFirstMemTableAddr();
    record('Memory panel navigated to 0x0100', memAddr2 === '0x0100', `table addr: ${memAddr2}`);

    await memInput.click();
    await memInput.fill('0x2000');
    await memInput.press('Enter');
    await page.waitForTimeout(300);

    let memAddr3 = await getFirstMemTableAddr();
    record('Memory panel navigated to 0x2000', memAddr3 === '0x2000', `table addr: ${memAddr3}`);

    const byteCellsCount = await page.locator('.mem-table tbody tr').first().locator('td.byte').count();
    record('Memory table renders 16 columns per row', byteCellsCount === 16, `columns: ${byteCellsCount}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'test-07-memory-navigation.png') });

    // -------------------------------------------------------------------------
    // TEST 7: Stack Panel Visualization (PUSH & POP)
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Testing Stack Panel Visualization (PUSH & POP) ---');

    const stackProgram = [
      'MOV AX, 0AAAAh',
      'MOV BX, 0BBBBh',
      'PUSH AX',
      'PUSH BX',
      'POP CX',
      'POP DX',
      'HLT'
    ].join('\n');

    await firstCodeCell.locator('.cell-editor').evaluate((el, code) => {
      const view = el.__cmView;
      if (view) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
      }
    }, stackProgram);
    await page.waitForTimeout(300);

    await page.locator('.notebook-toolbar button:has-text("Restart")').click();
    await page.waitForTimeout(200);

    const initialSP = await getRegisterVal('SP');
    console.log(`    Initial SP: ${initialSP}`);

    await stepBtn.click();
    await page.waitForTimeout(100);

    await stepBtn.click();
    await page.waitForTimeout(100);

    await stepBtn.click();
    await page.waitForTimeout(200);
    const spAfterPush1 = await getRegisterVal('SP');
    const topValAfterPush1 = await page.evaluate(() => {
      const topRow = document.querySelector('.stack-table tbody tr.top-of-stack');
      return topRow ? topRow.querySelectorAll('td')[1]?.innerText.trim() : null;
    });
    record('PUSH AX decremented SP', spAfterPush1 !== initialSP, `SP: ${initialSP} -> ${spAfterPush1}`);
    record('Stack table displays 0xAAAA at top', topValAfterPush1 === '0xAAAA', `top: ${topValAfterPush1}`);

    await stepBtn.click();
    await page.waitForTimeout(200);
    const topValAfterPush2 = await page.evaluate(() => {
      const topRow = document.querySelector('.stack-table tbody tr.top-of-stack');
      return topRow ? topRow.querySelectorAll('td')[1]?.innerText.trim() : null;
    });
    record('Stack table displays 0xBBBB at top after second push', topValAfterPush2 === '0xBBBB', `top: ${topValAfterPush2}`);

    await stepBtn.click();
    await page.waitForTimeout(200);
    const cxAfterPop = await getRegisterVal('CX');
    record('POP CX restores 0xBBBB into CX', cxAfterPop === '0xBBBB', `CX: ${cxAfterPop}`);

    await stepBtn.click();
    await page.waitForTimeout(200);
    const dxAfterPop = await getRegisterVal('DX');
    record('POP DX restores 0xAAAA into DX', dxAfterPop === '0xAAAA', `DX: ${dxAfterPop}`);

    const spAfterPops = await getRegisterVal('SP');
    record('SP restored after matching pops', spAfterPops === initialSP, `SP: ${spAfterPops}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'test-08-stack-visualization.png') });

    // -------------------------------------------------------------------------
    // TEST 8: Output & Terminal Panel (INT 21h AH=02h and AH=09h)
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Testing DOS Interrupts INT 21h AH=02h & AH=09h ---');

    const dosProgram = [
      '; DOS Output Test',
      '.DATA',
      "str DB 'DOS_PRINT_WORKS!$', 0",
      '.CODE',
      "MOV DL, 'Z'",
      'MOV AH, 02h',
      'INT 21h',
      'MOV DX, str',
      'MOV AH, 09h',
      'INT 21h',
      'HLT'
    ].join('\n');

    await firstCodeCell.locator('.cell-editor').evaluate((el, code) => {
      const view = el.__cmView;
      if (view) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
      }
    }, dosProgram);
    await page.waitForTimeout(300);

    await page.locator('.notebook-toolbar button:has-text("Restart")').click();
    await page.waitForTimeout(200);

    const runBtn = firstCodeCell.locator('.btn-run');
    await runBtn.click();
    await page.waitForTimeout(400);

    const cellOutput = await firstCodeCell.locator('pre.cell-output').innerText();
    console.log(`    Cell output text: "${cellOutput}"`);
    record('Cell output contains char from AH=02h ("Z")', cellOutput.includes('Z'));
    record('Cell output contains string from AH=09h ("DOS_PRINT_WORKS!")', cellOutput.includes('DOS_PRINT_WORKS!'));

    const textScreenOutput = await page.locator('.text-screen-content').innerText();
    console.log(`    Text Screen output: "${textScreenOutput}"`);
    record('Sidebar Text Screen contains "ZDOS_PRINT_WORKS!"', textScreenOutput.includes('ZDOS_PRINT_WORKS!'));

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'test-09-terminal-output.png') });

    // -------------------------------------------------------------------------
    // TEST 9: Multi-Cell Execution & State Accumulation
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Testing Multi-Cell Execution & State Accumulation ---');

    await page.locator('.header-actions button:has-text("New")').click();
    await page.waitForTimeout(300);

    const c1 = page.locator('.cell-code').nth(0);
    const code1 = 'MOV AX, 1000h';
    await c1.locator('.cell-editor').evaluate((el, code) => {
      const view = el.__cmView;
      if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
    }, code1);
    await page.waitForTimeout(200);

    await page.locator('.notebook-toolbar button:has-text("Code")').click();
    await page.waitForTimeout(200);

    const c2 = page.locator('.cell-code').nth(1);
    const code2 = 'MOV BX, 0234h\nADD AX, BX';
    await c2.locator('.cell-editor').evaluate((el, code) => {
      const view = el.__cmView;
      if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
    }, code2);
    await page.waitForTimeout(200);

    await page.locator('.notebook-toolbar button:has-text("Code")').click();
    await page.waitForTimeout(200);

    const c3 = page.locator('.cell-code').nth(2);
    const code3 = 'MOV CX, AX\nADD CX, CX';
    await c3.locator('.cell-editor').evaluate((el, code) => {
      const view = el.__cmView;
      if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
    }, code3);
    await page.waitForTimeout(200);

    await page.locator('.notebook-toolbar button:has-text("Restart")').click();
    await page.waitForTimeout(200);

    await c1.locator('.btn-run').click();
    await page.waitForTimeout(300);
    const axAfterC1 = await getRegisterVal('AX');
    record('Cell 1 executed: AX = 0x1000', axAfterC1 === '0x1000', `AX: ${axAfterC1}`);

    await c2.locator('.btn-run').click();
    await page.waitForTimeout(300);
    const axAfterC2 = await getRegisterVal('AX');
    const bxAfterC2 = await getRegisterVal('BX');
    record('Cell 2 executed: AX accumulated to 0x1234', axAfterC2 === '0x1234', `AX: ${axAfterC2}`);
    record('Cell 2 executed: BX = 0x0234', bxAfterC2 === '0x0234', `BX: ${bxAfterC2}`);

    await c3.locator('.btn-run').click();
    await page.waitForTimeout(300);
    const cxAfterC3 = await getRegisterVal('CX');
    const axAfterC3 = await getRegisterVal('AX');
    record('Cell 3 executed: CX = 0x2468 (0x1234 + 0x1234)', cxAfterC3 === '0x2468', `CX: ${cxAfterC3}`);
    record('Cell 3 retained previous AX = 0x1234', axAfterC3 === '0x1234', `AX: ${axAfterC3}`);

    const diffChips = await c2.locator('.diff-chip').count();
    record('Cell 2 rendered register diff chips', diffChips > 0, `count: ${diffChips}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'test-10-multicell-accumulation.png') });

    // -------------------------------------------------------------------------
    // TEST 10: Share / URL Export & Hash Restoration
    // -------------------------------------------------------------------------
    console.log('\n--- 10. Testing Share / URL Export & Hash Restoration ---');

    await page.locator('.header-actions button:has-text("Share")').click();
    await page.waitForTimeout(400);

    const toast = page.locator('.asmbook-toast');
    const toastVisible = await toast.isVisible();
    const toastText = toastVisible ? await toast.innerText() : '';
    record('Share toast notification shown', toastVisible, `toast: "${toastText}"`);

    const pageUrl = page.url();
    const hasNotebookHash = pageUrl.includes('#notebook=');
    record('URL hash contains #notebook= data', hasNotebookHash, `url hash: ${pageUrl.split('#')[1] || 'none'}`);

    console.log('    Opening new page with share hash URL...');
    const context2 = await browser.newContext({ viewport: { width: 1440, height: 920 } });
    const page2 = await context2.newPage();

    await page2.goto(pageUrl, { waitUntil: 'networkidle' });
    await page2.waitForTimeout(600);

    const restoredCells = page2.locator('.cell-code');
    const restoredCount = await restoredCells.count();
    record('Restored page has 3 code cells', restoredCount === 3, `count: ${restoredCount}`);

    const restoredCell2Text = await restoredCells.nth(1).locator('.cm-content').innerText();
    record('Cell 2 code correctly restored from URL hash', restoredCell2Text.includes('MOV BX, 0234h'));

    const restoredCell3Text = await restoredCells.nth(2).locator('.cm-content').innerText();
    record('Cell 3 code correctly restored from URL hash', restoredCell3Text.includes('MOV CX, AX'));

    await page2.locator('.notebook-toolbar button:has-text("Run All")').click();
    await page2.waitForTimeout(500);

    const restoredCX = await page2.evaluate(() => {
      const rows = document.querySelectorAll('.regs-table tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        for (let i = 0; i < cells.length; i += 2) {
          if (cells[i]?.innerText.trim() === 'CX') return cells[i + 1]?.innerText.trim();
        }
      }
      return null;
    });
    record('Restored notebook runs correctly (CX = 0x2468)', restoredCX === '0x2468', `CX: ${restoredCX}`);

    await page2.screenshot({ path: path.join(SCREENSHOT_DIR, 'test-11-share-url-restored.png') });
    await context2.close();

    // -------------------------------------------------------------------------
    // TEST 11: Demo GCD Showcase & Sidebar Tab Switching
    // -------------------------------------------------------------------------
    console.log('\n--- 11. Testing Demo GCD Showcase & Sidebar Tool Tabs ---');

    await page.locator('.header-actions button:has-text("Demo GCD")').click();
    await page.waitForTimeout(500);

    const gcdTitle = await page.locator('.markdown-body h1').first().innerText();
    record('Euclidean GCD demo loaded', gcdTitle.includes('Greatest Common Divisor (GCD)'), `title: "${gcdTitle}"`);

    await page.locator('.notebook-toolbar button:has-text("Run All")').click();
    await page.waitForTimeout(600);

    const gcdOutput = await page.locator('.text-screen-content').innerText();
    record('GCD calculation finished with correct output', gcdOutput.includes('Euclidean GCD(48, 18) = 6'));

    const finalAX = await getRegisterVal('AX');
    record('Final AX register holds GCD result = 6', finalAX === '0x0006', `AX: ${finalAX}`);

    const outlineTabBtn = page.locator('.sidebar-tab-bar button[role="tab"]:has-text("Outline")');
    await outlineTabBtn.click();
    await page.waitForTimeout(300);
    const outlineVisible = await page.locator('.notebook-outline').isVisible();
    record('Outline / Table of Contents tab functions', outlineVisible);

    const calcTabBtn = page.locator('.sidebar-tab-bar button[role="tab"]:has-text("Address Calc")');
    await calcTabBtn.click();
    await page.waitForTimeout(300);
    const calcVisible = await page.locator('.address-calc').isVisible();
    record('Address Calculator tab functions', calcVisible);

    const inspectorTabBtn = page.locator('.sidebar-tab-bar button[role="tab"]:has-text("Inspector")');
    await inspectorTabBtn.click();
    await page.waitForTimeout(300);
    const inspectorVisible = await page.locator('.machine-panel').isVisible();
    record('Inspector tab restored', inspectorVisible);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'test-12-gcd-showcase-complete.png') });

  } catch (err) {
    console.error('Fatal execution error during browser automation:', err);
    record('Fatal automation error', false, err.message);
  } finally {
    await browser.close();
  }

  console.log('\n================================================================');
  console.log(`  AUTOMATION RESULTS: ${results.passed}/${results.total} PASSED (${results.failed} failed)`);
  console.log('================================================================\n');

  if (results.failed > 0) {
    process.exit(1);
  }
}

run();
