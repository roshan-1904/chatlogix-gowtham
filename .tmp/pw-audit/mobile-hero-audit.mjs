import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:3002/';
const viewports = [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-414', width: 414, height: 896 },
];

const browser = await chromium.launch();
for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  const data = await page.evaluate(() => {
    const section = document.querySelector('section');
    const preview = document.querySelector('[aria-label]');
    const grid = preview?.querySelector('.grid');
    const cols = [...document.querySelectorAll('section figure')].slice(0, 2);
    const labels = [...document.querySelectorAll('section p')].filter((p) =>
      /YOUR DAY|WITH CHATLOGIX/i.test(p.textContent || ''),
    );
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height };
    };
    return {
      section: rect(section),
      preview: rect(preview),
      grid: rect(grid),
      phones: cols.map(rect),
      labels: labels.map(rect),
      sectionH: section?.clientHeight,
      previewParent: rect(preview?.parentElement),
    };
  });
  console.log(JSON.stringify({ vp: vp.name, data }, null, 2));
  await page.screenshot({ path: `mobile-${vp.name}.png` });
  await page.close();
}
await browser.close();
