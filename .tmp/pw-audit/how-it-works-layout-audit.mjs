import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, 'how-it-works-layout');
const URL = process.env.HIW_URL || 'http://127.0.0.1:3003/';

const viewports = [
  { name: 'desktop-1440', width: 1440, height: 900, split: true },
  { name: 'laptop-1280', width: 1280, height: 800, split: true },
  { name: 'narrow-900', width: 900, height: 820, split: false },
  { name: 'tablet-768', width: 768, height: 1024, split: false },
  { name: 'mobile-375', width: 375, height: 812, split: false },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
let failed = false;

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.getElementById('how-it-works')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(400);

  const section = page.locator('#how-it-works');
  await section.screenshot({ path: path.join(OUT, `${vp.name}.png`) });

  const metrics = await page.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right };
    };
    const el = document.getElementById('how-it-works');
    const copy = document.querySelector('[data-hiw="copy"]');
    const trust = document.querySelector('[data-hiw="trust"]');
    const steps = document.querySelector('[data-hiw="steps"]');
    const highlights = document.querySelector('[data-hiw="highlights"]');
    const stepTitles = [...(steps?.querySelectorAll('h3') ?? [])].map(box);
    let stepOverlap = false;
    for (let i = 0; i < stepTitles.length; i++) {
      for (let j = i + 1; j < stepTitles.length; j++) {
        const a = stepTitles[i];
        const b = stepTitles[j];
        if (!a || !b) continue;
        const overlap = a.x < b.right - 4 && a.right > b.x + 4 && a.y < b.bottom - 4 && a.bottom > b.y + 4;
        if (overlap) stepOverlap = true;
      }
    }
    return {
      client: el?.clientHeight,
      scroll: el?.scrollHeight,
      clipped: (el?.scrollHeight ?? 0) > (el?.clientHeight ?? 0) + 8,
      copy: box(copy),
      trust: box(trust),
      steps: box(steps),
      highlights: box(highlights),
      copyAlign: copy ? getComputedStyle(copy).textAlign : null,
      stepOverlap,
    };
  });

  const sideBySide = metrics.trust && metrics.copy && metrics.trust.x > metrics.copy.x + metrics.copy.w * 0.4;
  const stacked = metrics.trust && metrics.copy && metrics.trust.y >= metrics.copy.bottom - 4;
  const highlightsUnderTrust =
    metrics.highlights && metrics.trust && metrics.highlights.y >= metrics.trust.bottom - 8;
  const highlightsAboveSteps =
    metrics.highlights && metrics.steps && metrics.highlights.bottom <= metrics.steps.y + 8;

  console.log(
    JSON.stringify({
      name: vp.name,
      clipped: metrics.clipped,
      copyAlign: metrics.copyAlign,
      sideBySide,
      stacked,
      highlightsUnderTrust,
      highlightsAboveSteps,
      stepOverlap: metrics.stepOverlap,
    }),
  );

  if (metrics.copyAlign !== 'left') {
    console.error(`FAIL ${vp.name}: copy should be left-aligned`);
    failed = true;
  }
  if (vp.split && !sideBySide) {
    console.error(`FAIL ${vp.name}: expected 50/50 copy | trust`);
    failed = true;
  }
  if (!vp.split && !stacked) {
    console.error(`FAIL ${vp.name}: expected copy then trust stacked`);
    failed = true;
  }
  if (!highlightsUnderTrust) {
    console.error(`FAIL ${vp.name}: highlights should sit under the AI assists card`);
    failed = true;
  }
  if (!highlightsAboveSteps) {
    console.error(`FAIL ${vp.name}: highlights should sit above the step cards`);
    failed = true;
  }
  if (metrics.stepOverlap) {
    console.error(`FAIL ${vp.name}: step titles are overlapping`);
    failed = true;
  }

  await page.close();
}

await browser.close();
if (failed) process.exit(1);
