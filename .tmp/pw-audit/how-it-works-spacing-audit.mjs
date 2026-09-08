import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, 'how-it-works-spacing');
const URL = process.env.HIW_URL || 'http://127.0.0.1:3002/';

const viewports = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-375', width: 375, height: 812 },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
let failed = false;

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.getElementById('how-it-works')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(500);

  const section = page.locator('#how-it-works');
  await section.screenshot({ path: path.join(OUT, `${vp.name}.png`) });

  const metrics = await page.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const el = document.getElementById('how-it-works');
    const copy = document.querySelector('[data-hiw="copy"]');
    const trust = document.querySelector('[data-hiw="trust"]');
    const steps = document.querySelector('[data-hiw="steps"]');
    const mocks = [...(steps?.querySelectorAll('.rounded-md.border') ?? [])].map((n) => Math.round(n.getBoundingClientRect().height));
    const lis = [...(steps?.querySelectorAll('li') ?? [])].map((n) => Math.round(n.getBoundingClientRect().height));
    const headerGap =
      copy && trust && trust.getBoundingClientRect().x > copy.getBoundingClientRect().right
        ? Math.round(trust.getBoundingClientRect().x - copy.getBoundingClientRect().right)
        : null;
    const mockSpread = mocks.length ? Math.max(...mocks) - Math.min(...mocks) : 0;
    return {
      clipped: (el?.scrollHeight ?? 0) > (el?.clientHeight ?? 0) + 8,
      headerGap,
      copy: box(copy),
      trust: box(trust),
      mocks,
      mockSpread,
      lis,
    };
  });

  console.log(JSON.stringify({ name: vp.name, ...metrics }));

  if (vp.width >= 1280) {
    if (metrics.headerGap == null || metrics.headerGap > 120) {
      console.error(`FAIL ${vp.name}: header gap ${metrics.headerGap} should be a tight gutter`);
      failed = true;
    }
    if (metrics.mockSpread > 4) {
      console.error(`FAIL ${vp.name}: mock heights differ by ${metrics.mockSpread}px ${JSON.stringify(metrics.mocks)}`);
      failed = true;
    }
  }

  await page.close();
}

await browser.close();
if (failed) process.exit(1);
