import { chromium } from 'playwright';

const browser = await chromium.launch();
for (const vp of [
  { name: '375', w: 375, h: 812 },
  { name: '900', w: 900, h: 820 },
  { name: '1280', w: 1280, h: 800 },
  { name: '1440', w: 1440, h: 900 },
]) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
  await page.goto('http://127.0.0.1:3003/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.getElementById('how-it-works')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => {
    const inner = document.querySelector('#how-it-works > div');
    const steps = document.querySelector('[data-hiw=steps]');
    const titles = [...steps.querySelectorAll('h3')].map((el) => {
      const r = el.getBoundingClientRect();
      return { t: el.textContent, y: Math.round(r.y), h: Math.round(r.height) };
    });
    const mocks = [...steps.querySelectorAll('.rounded-lg.border')].map((el) =>
      Math.round(el.getBoundingClientRect().height),
    );
    return {
      innerOverflow: getComputedStyle(inner).overflowY,
      innerH: inner.clientHeight,
      innerScroll: inner.scrollHeight,
      stepsH: Math.round(steps.getBoundingClientRect().height),
      mocks,
      titles,
      liH: [...steps.querySelectorAll('li')].map((li) => Math.round(li.getBoundingClientRect().height)),
    };
  });
  console.log(vp.name, JSON.stringify(info));
  await page.close();
}
await browser.close();
