import { chromium } from 'playwright';

const viewports = [
  { n: 'd1440', w: 1440, h: 900 },
  { n: 'l1280', w: 1280, h: 800 },
];

const browser = await chromium.launch();
for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
  await page.goto('http://127.0.0.1:3002/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.getElementById('product')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(250);
  const m = await page.evaluate(() => {
    const section = document.getElementById('product');
    const phone = document.querySelector('[aria-label="ChatLogix catalog-backed reply example"]');
    const sr = section.getBoundingClientRect();
    const pr = phone.getBoundingClientRect();
    return {
      phoneW: Math.round(pr.width),
      phoneH: Math.round(pr.height),
      phoneBottom: Math.round(pr.bottom),
      sectionBottom: Math.round(sr.bottom),
      clipped: pr.bottom > sr.bottom + 4 || pr.top < sr.top - 4,
      overflowY: getComputedStyle(section).overflowY,
    };
  });
  console.log(vp.n, JSON.stringify(m));
  await page.close();
}
await browser.close();
