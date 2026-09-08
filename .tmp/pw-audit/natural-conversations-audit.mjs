import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, 'natural-conversations-audit');
const URL = process.env.HIW_URL || 'http://127.0.0.1:3003/';

const viewports = [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'mobile-414', width: 414, height: 896 },
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
  await page.evaluate(() => document.getElementById('natural-conversations')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(800);
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  const section = page.locator('#natural-conversations');
  await section.screenshot({ path: path.join(OUT, `${vp.name}.png`) });
  const metrics = await page.evaluate(() => {
    const el = document.getElementById('natural-conversations');
    const floatCards = [...document.querySelectorAll('#natural-conversations .lg\\:flex')];
    return {
      client: el?.clientHeight,
      scroll: el?.scrollHeight,
      overflowY: el ? el.scrollHeight > el.clientHeight + 8 : false,
    };
  });
  console.log(vp.name, JSON.stringify({ ...metrics, pageOverflowX: overflowX }));
  if (overflowX) {
    console.error(`FAIL ${vp.name}: horizontal overflow`);
    failed = true;
  }
  await page.close();
}

await browser.close();
if (failed) process.exit(1);
