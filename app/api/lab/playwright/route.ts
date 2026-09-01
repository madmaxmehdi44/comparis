import { NextRequest, NextResponse } from 'next/server';
import { PLAYWRIGHT_LAB_MODES, runPlaywrightLab, type PlaywrightLabMode } from '@/lib/playwright-lab';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

function clampNumber(raw: string | null, fallback: number, min: number, max: number) {
  const value = Number(raw ?? fallback);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const url = p.get('url')?.trim();
  const mode = (p.get('mode') || 'smart-extract') as PlaywrightLabMode;
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });
  if (!PLAYWRIGHT_LAB_MODES.some((x) => x.id === mode)) return NextResponse.json({ error: 'invalid Playwright mode' }, { status: 400 });

  const result = await runPlaywrightLab({
    url,
    query: p.get('q')?.trim() || undefined,
    mode,
    timeoutMs: clampNumber(p.get('timeout'), 12000, 2000, 30000),
    selector: p.get('selector')?.trim() || undefined,
    waitFor: p.get('waitFor')?.trim() || undefined,
    headless: p.get('headless') !== 'false',
    mobile: p.get('mobile') === 'true',
    locale: p.get('locale')?.trim() || 'fa-IR',
    timezoneId: p.get('timezone')?.trim() || undefined,
    colorScheme: p.get('colorScheme') === 'dark' ? 'dark' : 'light',
    screenshot: p.get('screenshot') === 'true',
    maxItems: clampNumber(p.get('maxItems'), 20, 1, 100),
  });

  return NextResponse.json({ result, modes: PLAYWRIGHT_LAB_MODES }, { headers: { 'Cache-Control': 'no-store' } });
}
