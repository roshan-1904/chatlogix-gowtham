import { chromium } from 'playwright';

const viewports = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'tablet-768', width: 768, height: 1024 },
];

const browser = await chromium.launch();

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto('http://127.0.0.1:3002/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.getElementById('product')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(250);

  const m = await page.evaluate(() => {
    const section = document.getElementById('product');
    const phone = section?.querySelector('[aria-label="ChatLogix catalog-backed reply example"]');
    const trust = [...(section?.querySelectorAll('div') ?? [])].find((el) => el.className.includes('bg-[#e7f6f1]'));
    const canvas = phone?.children[1];
    const bubbles = [...(canvas?.children ?? [])].map((el, i) => {
      const r = el.getBoundingClientRect();
      return { i, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), text: el.textContent?.slice(0, 40) };
    });
    const notes = [...(section?.querySelectorAll('.font-handwritten') ?? [])].map((el) => {
      const r = el.getBoundingClientRect();
      return { text: el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 28), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) };
    });
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) };
    };
    const benefits = [...(section?.querySelectorAll('h3') ?? [])].map((el) => rect(el));
    return {
      section: { ...rect(section), scroll: section?.scrollHeight, client: section?.clientHeight },
      phone: rect(phone),
      trust: rect(trust),
      bubbles,
      notes,
      benefits,
      clipped: (section?.scrollHeight ?? 0) > (section?.clientHeight ?? 0) + 4,
    };
  });

  console.log('\n===', vp.name, '===');
  console.log(JSON.stringify(m, null, 2));
  await page.close();
}

await browser.close();
