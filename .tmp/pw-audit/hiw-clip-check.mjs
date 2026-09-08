import { chromium } from 'playwright';

const viewports = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'lg-1024', width: 1024, height: 768 },
];

const browser = await chromium.launch();
for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto('http://127.0.0.1:3002/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.getElementById('how-it-works')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  const metrics = await page.evaluate(() => {
    const el = document.getElementById('how-it-works');
    const h2 = el?.querySelector('h2');
    return {
      headingPx: h2 ? Math.round(parseFloat(getComputedStyle(h2).fontSize)) : null,
      clipped: (el?.scrollHeight ?? 0) > (el?.clientHeight ?? 0) + 8,
      client: el?.clientHeight,
      scroll: el?.scrollHeight,
    };
  });
  console.log(vp.name, JSON.stringify(metrics));
  await page.close();
}
await browser.close();
