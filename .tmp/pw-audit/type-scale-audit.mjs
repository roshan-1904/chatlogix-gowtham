import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:3002/', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const ids = ['hero', 'problem', 'product', 'how-it-works'];
const out = {};

for (const id of ids) {
  await page.evaluate((sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({ block: 'start' });
  }, id);
  await page.waitForTimeout(300);
  out[id] = await page.evaluate((sectionId) => {
    const root = document.getElementById(sectionId);
    const heading = root?.querySelector('h1, h2');
    const ps = [...(root?.querySelectorAll('p') ?? [])];
    const eyebrow = ps.find((p) => getComputedStyle(p).textTransform === 'uppercase');
    const body = [...(heading?.parentElement?.querySelectorAll('p') ?? [])].find(
      (p) => getComputedStyle(p).textTransform !== 'uppercase',
    );
    return {
      headingPx: heading ? Math.round(parseFloat(getComputedStyle(heading).fontSize)) : null,
      headingTag: heading?.tagName ?? null,
      eyebrowPx: eyebrow ? Math.round(parseFloat(getComputedStyle(eyebrow).fontSize)) : null,
      bodyPx: body ? Math.round(parseFloat(getComputedStyle(body).fontSize)) : null,
      clipped: (root?.scrollHeight ?? 0) > (root?.clientHeight ?? 0) + 8,
      client: root?.clientHeight,
      scroll: root?.scrollHeight,
    };
  }, id);
}

console.log(JSON.stringify(out, null, 2));
await browser.close();
