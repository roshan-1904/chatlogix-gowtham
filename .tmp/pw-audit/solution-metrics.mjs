import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:3002/';
const page = await (await chromium.launch()).newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => document.getElementById('product')?.scrollIntoView({ block: 'start' }));
await page.waitForTimeout(300);

const metrics = await page.evaluate(() => {
  const section = document.getElementById('product');
  const h2 = section?.querySelector('h2');
  const highlight = h2?.querySelector('span.relative');
  const phone = section?.querySelector('[aria-label="ChatLogix catalog-backed reply example"]');
  const notes = [...(section?.querySelectorAll('.font-handwritten') ?? [])].map((el) => {
    const r = el.getBoundingClientRect();
    return { text: el.textContent?.replace(/\s+/g, ' ').trim(), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });
  const arrows = [...(section?.querySelectorAll('svg') ?? [])]
    .filter((svg) => svg.getAttribute('viewBox')?.startsWith('0 0 8') || svg.getAttribute('viewBox')?.startsWith('0 0 9'))
    .map((svg) => {
      const r = svg.getBoundingClientRect();
      return { viewBox: svg.getAttribute('viewBox'), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) };
  };
  const overflow = section ? getComputedStyle(section).overflow : null;
  return {
    section: rect(section),
    overflow,
    highlight: highlight ? { text: highlight.textContent, ...rect(highlight) } : null,
    phone: rect(phone),
    notes,
    arrows,
    sectionScrollHeight: section?.scrollHeight,
    sectionClientHeight: section?.clientHeight,
  };
});

console.log(JSON.stringify(metrics, null, 2));
await page.close();
await page.context().browser()?.close();
