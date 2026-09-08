import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const URL = 'http://127.0.0.1:3002/';
const OUT = path.resolve('scripts/hero-audit-output');

const viewports = [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'tablet-1024', width: 1024, height: 768 },
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const results = [];

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const metrics = await page.evaluate(() => {
    const section = document.querySelector('section');
    const h1 = document.querySelector('h1');
    const scroll = document.querySelector('.marketing-snap-scroll');
    const header = document.querySelector('header');

    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };

    const sectionRect = rect(section);
    const h1Rect = rect(h1);
    const scrollRect = rect(scroll);
    const headerRect = rect(header);

    const sectionScrollHeight = section?.scrollHeight ?? 0;
    const sectionClientHeight = section?.clientHeight ?? 0;
    const docScrollWidth = document.documentElement.scrollWidth;
    const docClientWidth = document.documentElement.clientWidth;

    const h1ClippedTop = h1Rect && headerRect ? h1Rect.top < headerRect.bottom : null;
    const h1ClippedBottom = h1Rect && sectionRect ? h1Rect.bottom > sectionRect.bottom : null;
    const sectionOverflows = sectionScrollHeight > sectionClientHeight + 2;
    const horizontalOverflow = docScrollWidth > docClientWidth + 1;

    const phones = [...document.querySelectorAll('figure[aria-label]')].map((el, i) => ({
      index: i,
      ...rect(el),
    }));

    return {
      section: sectionRect,
      h1: h1Rect,
      scroll: scrollRect,
      header: headerRect,
      sectionScrollHeight,
      sectionClientHeight,
      sectionOverflows,
      h1ClippedTop,
      h1ClippedBottom,
      horizontalOverflow,
      docScrollWidth,
      docClientWidth,
      phones,
    };
  });

  await page.screenshot({ path: path.join(OUT, `${vp.name}.png`), fullPage: false });
  results.push({ viewport: vp, metrics });
  await page.close();
}

await browser.close();
await writeFile(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
