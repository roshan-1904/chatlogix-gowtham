import { chromium } from 'playwright';

const page = await (await chromium.launch()).newPage({ viewport: { width: 375, height: 812 } });
await page.goto('http://127.0.0.1:3003/', { waitUntil: 'networkidle' });
await page.evaluate(() => document.getElementById('natural-conversations')?.scrollIntoView({ block: 'start' }));
await page.waitForTimeout(400);
const info = await page.evaluate(() => {
  const section = document.getElementById('natural-conversations');
  const inner = section?.firstElementChild;
  const phone = inner?.querySelector('figure');
  const strip = inner?.querySelector('p.text-center');
  return {
    innerOverflow: inner ? getComputedStyle(inner).overflowY : null,
    innerH: inner?.clientHeight,
    innerScroll: inner?.scrollHeight,
    phoneH: phone ? Math.round(phone.getBoundingClientRect().height) : 0,
    phoneY: phone ? Math.round(phone.getBoundingClientRect().y) : null,
    stripText: strip?.textContent,
  };
});
console.log(JSON.stringify(info));
await page.close();
await (await chromium.launch()).close();
