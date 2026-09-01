import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const UA = 'ComparisSourceDiscovery/1.0';
const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
const KNOWN = new Set([
  'torob.com', 'digikala.com', 'emalls.ir', 'fafait.net', 'markazi.co', 'radincomputer.com',
  'darja.online', 'rightech.ir', 'rayanehonline.com', 'technolife.com', 'meghdadit.com',
  'lioncomputer.com', 'pcmarkazi.com', 'irtechland.com', 'pasargadit.com', 'shopmit.ir',
]);

function hostOf(raw: string) {
  try { return new URL(raw).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

function domainOk(raw: string) {
  const host = hostOf(raw);
  return !!host && !BLOCKED_HOSTS.has(host) && !host.endsWith('.local') && !/^\d+(?:\.\d+){3}$/.test(host) && !host.includes(':');
}

function titleFromUrl(raw: string) {
  const host = hostOf(raw);
  return host.split('.')[0]?.replace(/[-_]+/g, ' ') || raw;
}

async function searchEngine(url: string) {
  const response = await fetch(url, { cache: 'no-store', headers: { 'user-agent': UA, accept: 'text/html,*/*;q=0.8', 'accept-language': 'fa-IR,fa;q=0.9,en;q=0.6' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function extractResults(html: string, engine: 'google' | 'bing', topic: string) {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const rows: Array<{ name: string; url: string; domain: string; description: string; known: boolean }> = [];
  const selectors = engine === 'google' ? ['a[href]'] : ['li.b_algo h2 a', 'a[href]'];
  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const a = $(el);
      const href = a.attr('href');
      if (!href || !/^https?:\/\//i.test(href) || !domainOk(href)) return;
      const domain = hostOf(href);
      if (!domain || domain.includes('google.') || domain.includes('bing.') || domain.includes('youtube.')) return;
      const canonical = `https://${domain}`;
      if (seen.has(domain)) return;
      seen.add(domain);
      const container = a.closest('div,li').first();
      const text = container.text().replace(/\s+/g, ' ').trim();
      const name = a.text().replace(/\s+/g, ' ').trim() || titleFromUrl(href);
      const description = text.replace(name, '').trim().slice(0, 220);
      rows.push({ name, url: canonical, domain, description: description || `فروشگاه یا منبع مرتبط با «${topic}»`, known: KNOWN.has(domain) });
    });
    if (rows.length >= 25) break;
  }
  return rows;
}

export async function GET(req: NextRequest) {
  const topic = req.nextUrl.searchParams.get('q')?.trim();
  if (!topic) return NextResponse.json({ error: 'q is required' }, { status: 400 });
  const encoded = encodeURIComponent(topic);
  const queries = [
    `فروشگاه ${topic} ایران`,
    `خرید ${topic} فروشگاه اینترنتی ایران`,
    `${topic} قیمت فروشگاه`,
  ];
  const urls = queries.flatMap((q) => [
    `https://www.google.com/search?q=${encodeURIComponent(q)}&num=20`,
    `https://www.bing.com/search?q=${encodeURIComponent(q)}&count=20`,
  ]);
  const results = await Promise.allSettled(urls.map(searchEngine));
  const combined = new Map<string, { name: string; url: string; domain: string; description: string; known: boolean }>();
  results.forEach((result, index) => {
    if (result.status !== 'fulfilled') return;
    const engine = index % 2 === 0 ? 'google' : 'bing';
    for (const item of extractResults(result.value, engine, topic)) {
      if (!combined.has(item.domain)) combined.set(item.domain, item);
    }
  });

  const sites = [...combined.values()]
    .filter((x) => !KNOWN.has(x.domain) || !['torob.com', 'digikala.com', 'emalls.ir'].includes(x.domain))
    .slice(0, 30)
    .map((x, index) => ({
      id: `discovered-${x.domain}`,
      name: x.name.length > 80 ? x.domain : x.name,
      domain: x.domain,
      url: x.url,
      logo: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(x.domain)}&sz=128`,
      description: x.description,
      relevance: Math.max(0.45, 1 - index * 0.015),
      enabled: false,
      priority: 50,
    }));

  return NextResponse.json({ topic, results: sites, engines: ['google', 'bing'], queryCount: queries.length, encoded });
}
