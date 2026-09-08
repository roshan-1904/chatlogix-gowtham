import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:3002/', { waitUntil: 'networkidle' });
await page.evaluate(() => document.getElementById('how-it-works')?.scrollIntoView({ block: 'start' }));
await page.waitForTimeout(400);

const metrics = await page.evaluate(() => {
  const el = document.getElementById('how-it-works');
  const mocks = [...(el?.querySelectorAll('[data-hiw=steps] .rounded-md.border') ?? [])];
  return {
    clipped: (el?.scrollHeight ?? 0) > (el?.clientHeight ?? 0) + 8,
    mockH: mocks.map((n) => Math.round(n.getBoundingClientRect().height)),
    samples: mocks.map((card, i) => {
      const nodes = [...card.querySelectorAll('p, span')].filter((n) => (n.textContent ?? '').trim().length > 1);
      const sizes = [...new Set(nodes.map((n) => Math.round(parseFloat(getComputedStyle(n).fontSize))))].sort((a, b) => a - b);
      return { i: i + 1, sizes };
    }),
  };
});

console.log(JSON.stringify(metrics, null, 2));
await browser.close();
