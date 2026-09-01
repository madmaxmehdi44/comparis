import { chromium, type BrowserContext, type Page } from 'playwright';

export type PlaywrightLabMode =
  | 'smart-extract'
  | 'locators'
  | 'wait-and-load'
  | 'evaluate-dom'
  | 'network'
  | 'screenshot'
  | 'responsive'
  | 'locale'
  | 'storage'
  | 'frames'
  | 'click-and-pagination'
  | 'full-diagnostics';

export interface PlaywrightLabOptions {
  url: string;
  query?: string;
  mode: PlaywrightLabMode;
  timeoutMs: number;
  selector?: string;
  waitFor?: string;
  headless?: boolean;
  mobile?: boolean;
  locale?: string;
  timezoneId?: string;
  colorScheme?: 'light' | 'dark';
  screenshot?: boolean;
  maxItems?: number;
}

export interface PlaywrightLabResult {
  mode: PlaywrightLabMode;
  url: string;
  finalUrl: string;
  title: string;
  durationMs: number;
  status: 'success' | 'partial' | 'failed';
  details: Record<string, unknown>;
  errors: string[];
  screenshotDataUrl?: string;
}

const blockedHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

function safeHttpUrl(raw: string): URL {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('only http/https URLs are allowed');
  const host = url.hostname.toLowerCase();
  if (blockedHosts.has(host) || host.endsWith('.localhost') || /^\d+(?:\.\d+){3}$/.test(host)) {
    throw new Error('unsafe target rejected');
  }
  return url;
}

async function withPage(options: PlaywrightLabOptions, work: (page: Page, context: BrowserContext) => Promise<Record<string, unknown>>) {
  const started = Date.now();
  const target = safeHttpUrl(options.url).toString();
  const browser = await chromium.launch({ headless: options.headless ?? true });
  const context = await browser.newContext({
    locale: options.locale ?? 'fa-IR',
    timezoneId: options.timezoneId,
    colorScheme: options.colorScheme ?? 'light',
    viewport: options.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    isMobile: options.mobile ?? false,
  });
  const errors: string[] = [];
  context.on('requestfailed', (request) => errors.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  try {
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
    if (options.waitFor) await page.locator(options.waitFor).first().waitFor({ state: 'visible', timeout: options.timeoutMs });
    const details = await work(page, context);
    return { details, errors, finalUrl: page.url(), title: await page.title(), durationMs: Date.now() - started };
  } finally {
    await browser.close();
  }
}

export async function runPlaywrightLab(options: PlaywrightLabOptions): Promise<PlaywrightLabResult> {
  const started = Date.now();
  try {
    const execution = await withPage(options, async (page, context) => {
      switch (options.mode) {
        case 'wait-and-load': {
          await page.waitForLoadState('load', { timeout: options.timeoutMs });
          return { loadState: 'load', ready: true };
        }
        case 'locators': {
          const locator = page.locator(options.selector || 'a[href]');
          const count = await locator.count();
          const items = await locator.evaluateAll((els, max) => els.slice(0, Number(max)).map((el) => ({
            text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
            href: (el as HTMLAnchorElement).href || undefined,
            tag: el.tagName.toLowerCase(),
          })), options.maxItems ?? 20);
          return { locator: options.selector || 'a[href]', count, items };
        }
        case 'evaluate-dom': {
          const selector = options.selector || '[itemtype*="Product"], [data-product], article';
          const items = await page.locator(selector).evaluateAll((els, max) => els.slice(0, Number(max)).map((el) => ({
            text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500),
            html: el.outerHTML.slice(0, 1200),
          })), options.maxItems ?? 10);
          return { selector, items };
        }
        case 'network': {
          const requests: string[] = [];
          const responses: Array<{ status: number; url: string }> = [];
          page.on('request', (request) => {
            if (['xhr', 'fetch'].includes(request.resourceType())) requests.push(`${request.method()} ${request.url()}`);
          });
          page.on('response', (response) => {
            if (['xhr', 'fetch'].includes(response.request().resourceType())) responses.push({ status: response.status(), url: response.url() });
          });
          await page.waitForLoadState('networkidle', { timeout: Math.min(options.timeoutMs, 10000) }).catch(() => undefined);
          return { capturedRequests: requests.slice(-50), capturedResponses: responses.slice(-50) };
        }
        case 'screenshot': {
          const buffer = await page.screenshot({ type: 'jpeg', quality: 65, fullPage: false });
          return { screenshotBytes: buffer.length, viewport: page.viewportSize() };
        }
        case 'responsive': {
          await page.setViewportSize({ width: 390, height: 844 });
          const mobile = await page.locator('body').evaluate((body) => ({
            width: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            textLength: body.innerText.length,
          }));
          return { mobile };
        }
        case 'locale': {
          return {
            locale: context.pages().length ? await context.pages()[0].evaluate(() => navigator.language) : undefined,
            timezone: await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
            colorScheme: await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
          };
        }
        case 'storage': {
          const storage = await context.storageState();
          return {
            cookies: storage.cookies.length,
            origins: storage.origins.map((origin) => ({ origin: origin.origin, localStorageEntries: origin.localStorage.length })),
          };
        }
        case 'frames': {
          return { count: page.frames().length, frames: page.frames().map((frame) => ({ url: frame.url(), name: frame.name() })) };
        }
        case 'click-and-pagination': {
          const selector = options.selector || 'a[rel="next"], a:has-text("بعد"), a:has-text("صفحه بعد")';
          const next = page.locator(selector).first();
          const exists = await next.count();
          if (exists) await next.click({ timeout: Math.min(options.timeoutMs, 5000) }).catch(() => undefined);
          await page.waitForLoadState('domcontentloaded', { timeout: Math.min(options.timeoutMs, 7000) }).catch(() => undefined);
          return { selector, found: exists > 0, finalUrl: page.url() };
        }
        case 'smart-extract': {
          const products = await page.locator('script[type="application/ld+json"]').evaluateAll((els, max) => {
            const output: Array<{ name?: string; price?: string; currency?: string; url?: string }> = [];
            for (const el of els) {
              try {
                const parsed = JSON.parse(el.textContent || 'null');
                const roots = Array.isArray(parsed) ? parsed : [parsed];
                for (const root of roots) {
                  const graph = root && typeof root === 'object' && Array.isArray(root['@graph']) ? root['@graph'] : [root];
                  for (const item of graph) {
                    if (!item || typeof item !== 'object' || !String(item['@type'] || '').includes('Product')) continue;
                    const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
                    for (const offer of offers) {
                      if (!offer || typeof offer !== 'object') continue;
                      output.push({ name: item.name, price: offer.price ?? offer.lowPrice, currency: offer.priceCurrency, url: offer.url });
                    }
                  }
                }
              } catch {}
              if (output.length >= Number(max)) break;
            }
            return output.slice(0, Number(max));
          }, options.maxItems ?? 20);
          const bodyText = await page.locator('body').innerText({ timeout: Math.min(options.timeoutMs, 5000) }).catch(() => '');
          return { products, bodyTextPreview: bodyText.replace(/\s+/g, ' ').slice(0, 1200) };
        }
        case 'full-diagnostics': {
          const [links, buttons, inputs] = await Promise.all([
            page.getByRole('link').count(),
            page.getByRole('button').count(),
            page.locator('input,textarea,select').count(),
          ]);
          return {
            url: page.url(),
            title: await page.title(),
            viewport: page.viewportSize(),
            links,
            buttons,
            formControls: inputs,
            frames: page.frames().length,
            contentLength: (await page.content()).length,
          };
        }
      }
    });

    let screenshotDataUrl: string | undefined;
    if (options.screenshot || options.mode === 'screenshot') {
      // A second lightweight page is intentionally avoided. The screenshot mode returns metadata
      // while the API can request a dedicated thumbnail through the capture endpoint later.
      screenshotDataUrl = undefined;
    }

    return {
      mode: options.mode,
      url: options.url,
      finalUrl: execution.finalUrl,
      title: execution.title,
      durationMs: Date.now() - started,
      status: execution.errors.length ? 'partial' : 'success',
      details: execution.details,
      errors: execution.errors.slice(0, 30),
      screenshotDataUrl,
    };
  } catch (error) {
    return {
      mode: options.mode,
      url: options.url,
      finalUrl: options.url,
      title: '',
      durationMs: Date.now() - started,
      status: 'failed',
      details: {},
      errors: [error instanceof Error ? error.message : 'Playwright execution failed'],
    };
  }
}

export const PLAYWRIGHT_LAB_MODES: Array<{ id: PlaywrightLabMode; label: string; description: string; api: string }> = [
  { id: 'smart-extract', label: 'استخراج هوشمند', description: 'Product/Offer JSON-LD و preview متن صفحه', api: 'locator + evaluateAll' },
  { id: 'locators', label: 'Locator Explorer', description: 'پیدا کردن عناصر و استخراج text/href', api: 'locator + count + evaluateAll' },
  { id: 'wait-and-load', label: 'Wait / Load', description: 'آزمون load و wait سفارشی', api: 'goto + waitForLoadState + waitFor' },
  { id: 'evaluate-dom', label: 'DOM Evaluate', description: 'اجرای JavaScript روی DOM واقعی', api: 'locator + evaluateAll' },
  { id: 'network', label: 'Network Monitor', description: 'ردیابی XHR و Fetch صفحه', api: 'page.on(request/response)' },
  { id: 'screenshot', label: 'Screenshot', description: 'بررسی بصری viewport', api: 'page.screenshot' },
  { id: 'responsive', label: 'Responsive', description: 'آزمون viewport موبایل و overflow', api: 'setViewportSize + evaluate' },
  { id: 'locale', label: 'Locale / Timezone', description: 'تست زبان، timezone و dark/light scheme', api: 'BrowserContext emulation' },
  { id: 'storage', label: 'Storage State', description: 'مشاهده cookies و localStorage بدون استخراج secret', api: 'context.storageState' },
  { id: 'frames', label: 'Frames', description: 'شناسایی iframe و frame URLها', api: 'page.frames' },
  { id: 'click-and-pagination', label: 'Click / Pagination', description: 'تست locator برای next/page navigation', api: 'locator.click + waitForLoadState' },
  { id: 'full-diagnostics', label: 'Full Diagnostics', description: 'نمای کلی DOM، کنترل‌ها، frame و resource errors', api: 'getByRole + locator + content' },
];
