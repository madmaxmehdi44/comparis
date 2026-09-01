export const PLAYWRIGHT_LAB_MODES = [
  { id: 'smart-extract', label: 'استخراج هوشمند', description: 'Product/Offer JSON-LD و preview متن صفحه', api: 'locator + evaluateAll' },
  { id: 'locators', label: 'Locator Explorer', description: 'پیدا کردن عناصر و استخراج text/href', api: 'locator + count + evaluateAll' },
  { id: 'wait-and-load', label: 'Wait / Load', description: 'آزمون load و wait سفارشی', api: 'goto + waitForLoadState + waitFor' },
  { id: 'evaluate-dom', label: 'DOM Evaluate', description: 'اجرای JavaScript روی DOM واقعی', api: 'locator + evaluateAll' },
  { id: 'network', label: 'Network Monitor', description: 'ردیابی XHR و Fetch صفحه', api: 'page.on(request/response)' },
  { id: 'screenshot', label: 'Screenshot', description: 'بررسی بصری viewport', api: 'page.screenshot' },
  { id: 'responsive', label: 'Responsive', description: 'آزمون viewport موبایل و overflow', api: 'setViewportSize + evaluate' },
  { id: 'locale', label: 'Locale / Timezone', description: 'تست زبان، timezone و dark/light scheme', api: 'BrowserContext emulation' },
  { id: 'storage', label: 'Storage State', description: 'مشاهده cookies و localStorage بدون secret', api: 'context.storageState' },
  { id: 'frames', label: 'Frames', description: 'شناسایی iframe و frame URLها', api: 'page.frames' },
  { id: 'click-and-pagination', label: 'Click / Pagination', description: 'تست locator برای next/page navigation', api: 'locator.click + waitForLoadState' },
  { id: 'full-diagnostics', label: 'Full Diagnostics', description: 'نمای کلی DOM، کنترل‌ها، frame و resource errors', api: 'getByRole + locator + content' },
] as const;

export type PlaywrightLabMode = (typeof PLAYWRIGHT_LAB_MODES)[number]['id'];
