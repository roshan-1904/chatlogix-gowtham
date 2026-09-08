import { chromium } from 'playwright';

const page = await (await chromium.launch()).newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:3002/', { waitUntil: 'networkidle' });
await page.evaluate(() => document.getElementById('product')?.scrollIntoView({ block: 'start' }));
await page.waitForTimeout(300);

const m = await page.evaluate(() => {
  const phone = document.querySelector('[aria-label="ChatLogix catalog-backed reply example"]');
  const notes = [...document.querySelectorAll('#product .font-handwritten')].map((el) => {
    const r = el.getBoundingClientRect();
    const pr = phone.getBoundingClientRect();
    const gapLeft = Math.round(pr.left - r.right);
    const gapRight = Math.round(r.left - pr.right);
    return {
      text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 32),
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      right: Math.round(r.right),
      gapToPhone: gapLeft > 0 ? gapLeft : gapRight > 0 ? gapRight : Math.round(Math.min(Math.abs(gapLeft), Math.abs(gapRight)) * -1),
    };
  });
  const pr = phone.getBoundingClientRect();
  return {
    phone: { x: Math.round(pr.x), w: Math.round(pr.width), y: Math.round(pr.y), h: Math.round(pr.height) },
    notes,
  };
});
console.log(JSON.stringify(m, null, 2));
await page.context().browser()?.close();
