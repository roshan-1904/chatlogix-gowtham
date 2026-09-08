import { chromium } from 'playwright';
const browser = await chromium.launch();
for (const vp of [{ w: 375, h: 812 }, { w: 768, h: 1024 }]) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
  await page.goto('http://127.0.0.1:3002/', { waitUntil: 'networkidle' });
  const m = await page.evaluate(() => {
    const s = document.querySelector('section');
    return {
      overflow: (s?.scrollHeight ?? 0) > (s?.clientHeight ?? 0) + 2,
      sh: s?.scrollHeight,
      ch: s?.clientHeight,
    };
  });
  console.log(vp, m);
  await page.close();
}
await browser.close();
