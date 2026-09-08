import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, 'trust-audit');
const URL = process.env.HIW_URL || 'http://127.0.0.1:3003/';

const viewports = [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
let failed = false;

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.getElementById('trust')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(400);
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  const section = page.locator('#trust');
  const exists = await section.count();
  if (!exists) {
    console.error(`FAIL ${vp.name}: #trust missing`);
    failed = true;
    await page.close();
    continue;
  }
  await section.screenshot({ path: path.join(OUT, `${vp.name}.png`) });
  const metrics = await page.evaluate(() => {
    const el = document.getElementById('trust');
    const cards = el?.querySelectorAll('article') ?? [];
    const headline = el?.querySelector('h2')?.textContent ?? '';
    return {
      client: el?.clientHeight,
      scroll: el?.scrollHeight,
      cards: cards.length,
      headline,
    };
  });
  console.log(vp.name, JSON.stringify({ ...metrics, pageOverflowX: overflowX }));
  if (overflowX) {
    console.error(`FAIL ${vp.name}: horizontal overflow`);
    failed = true;
  }
  if (metrics.cards !== 4) {
    console.error(`FAIL ${vp.name}: expected 4 cards`);
    failed = true;
  }
  await page.close();
}

await browser.close();
if (failed) process.exit(1);
