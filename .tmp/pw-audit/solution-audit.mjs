import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, 'solution-audit');
const URL = 'http://127.0.0.1:3002/';

const viewports = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-375', width: 375, height: 812 },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.getElementById('product')?.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(400);
  await page.locator('#product').screenshot({ path: path.join(OUT, `${vp.name}.png`) });
  await page.close();
  console.log('saved', vp.name);
}

await browser.close();
