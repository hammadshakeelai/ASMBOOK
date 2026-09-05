import { chromium } from 'playwright';

async function testUserTyping() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(500);

  const cmContent = page.locator('.cell-code .cm-content').first();
  await cmContent.click();
  await page.waitForTimeout(100);

  // Select all and type
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('MOV AX, 5432h');
  await page.waitForTimeout(300);

  const sourceInStore = await page.evaluate(async () => {
    const store = await import('/src/ui/store.ts');
    return store.cells.value.find(c => c.kind === 'code')?.source;
  });

  console.log('Source in store after user typing:', sourceInStore);
  await browser.close();
}

testUserTyping();
