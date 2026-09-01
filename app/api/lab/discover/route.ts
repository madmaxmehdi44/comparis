import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { qualifyCandidate, rankSources, type CandidateSource } from '@/lib/source-ranking';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UA = 'ComparisSourceDiscovery/2.0';
const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
const SEARCH_HOSTS = new Set(['google.com', 'www.google.com', 'bing.com', 'www.bing.com', 'youtube.com', 'www.youtube.com']);

function hostOf(raw: string) {
  try { return new URL(raw).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

function domainOk(raw: string) {
  const host = hostOf(raw);
  return !!host && !BLOCKED_HOSTS.has(host) && !host.endsWith('.local') && !/^\d+(?:\.\d+){3}$/.test(host) && !host.includes(':') && !SEARCH_HOSTS.has(host);
}

function titleFromUrl(raw: string) {
  return hostOf(raw).split('.')[0]?.replace(/[-_]+/g, ' ') || raw;
}

async function searchEngine(url: string) {
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(9000),
    headers: { 'user-agent': UA, accept: 'text/html,*/*;q=0.8', 'accept-language': 'fa-IR,fa;q=0.9,en;q=0.6' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function extractResults(html: string, engine: 'google' | 'bing') {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const rows: Array<{ name: string; url: string; domain: string }> = [];
  const selectors = engine === 'google' ? ['a[href]'] : ['li.b_algo h2 a', 'a[href]'];
  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const a = $(el);
      const href = a.attr('href');
      if (!href || !/^https?:\/\//i.test(href) || !domainOk(href)) return;
      const domain = hostOf(href);
      if (!domain || seen.has(domain)) return;
      seen.add(domain);
      let url = `https://${domain}`;
      try { url = new URL(href).origin; } catch {}
      const name = a.text().replace(/\s+/g, ' ').trim() || titleFromUrl(href);
      rows.push({ name: name.length > 80 ? titleFromUrl(href) : name, url, domain });
    });
    if (rows.length >= 40) break;
  }
  return rows;
}

function dedupeCandidates(items: Array<{ name: string; url: string; domain: string }>) {
  const map = new Map<string, { name: string; url: string; domain: string }>();
  for (const item of items) {
    const domain = item.domain.replace(/^www\./, '').toLowerCase();
    if (!domain || map.has(domain)) continue;
    map.set(domain, { ...item, domain });
  }
  return [...map.values()];
}

export async function GET(req: NextRequest) {
  const topic = req.nextUrl.searchParams.get('q')?.trim();
  if (!topic) return NextResponse.json({ error: 'q is required' }, { status: 400 });
  if (topic.length > 120) return NextResponse.json({ error: 'query too long' }, { status: 400 });

  const queries = [
    `فروشگاه ${topic} ایران`,
    `خرید ${topic} فروشگاه اینترنتی ایران`,
    `${topic} قیمت فروشگاه`,
    `${topic} فروشنده ایران`,
  ];
  const urls = queries.flatMap((q) => [
    `https://www.google.com/search?q=${encodeURIComponent(q)}&num=20`,
    `https://www.bing.com/search?q=${encodeURIComponent(q)}&count=20`,
  ]);

  const fetched = await Promise.allSettled(urls.map(searchEngine));
  const candidates = dedupeCandidates(
    fetched.flatMap((result, index) => result.status === 'fulfilled'
      ? extractResults(result.value, index % 2 === 0 ? 'google' : 'bing')
      : []),
  ).slice(0, 40);

  const qualified = await Promise.all(candidates.map((candidate) => qualifyCandidate(candidate, topic)));
  const ranked = rankSources(qualified.filter((x): x is CandidateSource => !!x), 12);

  return NextResponse.json({
    topic,
    results: ranked.map((x) => ({ ...x, enabled: false })),
    totalCandidates: candidates.length,
    qualifiedCount: qualified.filter(Boolean).length,
    engines: ['google', 'bing'],
    queryCount: queries.length,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
