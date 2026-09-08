import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import path from 'path';

const URL = 'http://127.0.0.1:3002/';
const OUT = path.resolve('problem-audit-output');

const viewports = [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'mobile-390', width: 390, height: 667 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'tablet-1024', width: 1024, height: 768 },
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.querySelector('#problem')?.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(500);

  const metrics = await page.evaluate(() => {
    const section = document.querySelector('#problem');
    const h2 = section?.querySelector('h2');
    const cards = [...(section?.querySelectorAll('article') ?? [])];
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height };
    };
    const s = rect(section);
    const overflowY = section ? section.scrollHeight > section.clientHeight + 2 : null;
    const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    const cardsOff = cards.map((c, i) => {
      const r = rect(c);
      return {
        i,
        clippedBottom: s && r ? r.bottom > s.bottom + 2 : null,
        clippedRight: s && r ? r.right > s.right + 2 : null,
        w: r?.w,
        h: r?.h,
      };
    });
    return {
      section: s,
      h2: rect(h2),
      overflowY,
      overflowX,
      cardCount: cards.length,
      cardsOff,
    };
  });

  await page.screenshot({ path: path.join(OUT, `${vp.name}.png`) });
  console.log(JSON.stringify({ viewport: vp, metrics }, null, 2));
  await page.close();
}

await browser.close();
