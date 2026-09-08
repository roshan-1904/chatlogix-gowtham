import { chromium } from 'playwright';

const viewports = [
  { n: 'm375', w: 375, h: 812 },
  { n: 't768', w: 768, h: 1024 },
  { n: 'd1440', w: 1440, h: 900 },
];

const browser = await chromium.launch();

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
  await page.goto('http://127.0.0.1:3002/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.getElementById('product')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(250);

  const s = await page.evaluate(() => {
    const el = document.querySelector('[data-solution-layout]');
    const cs = getComputedStyle(el);
    const kids = [...el.children].map((c) => {
      const r = c.getBoundingClientRect();
      return { y: Math.round(r.y), h: Math.round(r.height), b: Math.round(r.bottom) };
    });
    const phone = document
      .querySelector('[aria-label="ChatLogix catalog-backed reply example"]')
      ?.getBoundingClientRect();
    const trust = [...document.querySelectorAll('div')].find((d) =>
      String(d.className).includes('bg-[#e7f6f1]'),
    )?.getBoundingClientRect();
    return {
      display: cs.display,
      kids,
      phoneY: phone && Math.round(phone.y),
      phoneH: phone && Math.round(phone.height),
      trustB: trust && Math.round(trust.bottom),
      overlap: Boolean(phone && trust && phone.y < trust.bottom && phone.bottom > trust.y),
    };
  });

  console.log(vp.n, JSON.stringify(s));
  await page.close();
}

await browser.close();
