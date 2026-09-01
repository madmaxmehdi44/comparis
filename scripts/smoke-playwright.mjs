import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ locale: 'fa-IR', viewport: { width: 1280, height: 720 } });
  await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.getByRole('heading', { name: 'Example Domain' }).waitFor({ state: 'visible', timeout: 5000 });
  const title = await page.title();
  if (!title) throw new Error('Playwright smoke test: empty title');
  console.log(`Playwright OK: ${title}`);
} finally {
  await browser.close();
}
