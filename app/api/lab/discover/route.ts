import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { qualifyCandidate, rankSources, type CandidateSource } from '@/lib/source-ranking';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UA = 'ComparisSourceDiscovery/2.1';
const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
const SEARCH_HOSTS = new Set(['google.com', 'www.google.com', 'bing.com', 'www.bing.com', 'youtube.com', 'www.youtube.com']);
const QUERY_TEMPLATES = [
  (topic: string) => `فروشگاه ${topic} ایران`,
  (topic: string) => `خرید ${topic} فروشگاه اینترنتی ایران`,
  (topic: string) => `${topic} قیمت فروشگاه`,
  (topic: string) => `${topic} فروشنده ایران`,
  (topic: string) => `site:.ir ${topic} خرید قیمت`,
];

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
    cache: 'no-store', signal: AbortSignal.timeout(9000),
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
  const map = new Map<string, { name: string; url: string; domain: string; hits: number }>();
  for (const item of items) {
    const domain = item.domain.replace(/^www\./, '').toLowerCase();
    if (!domain) continue;
    const current = map.get(domain);
    map.set(domain, current ? { ...current, hits: current.hits + 1 } : { ...item, domain, hits: 1 });
  }
  return [...map.values()].map((x) => ({ ...x, searchPresence: Math.min(1, 0.35 + x.hits * 0.13) }));
}

async function mapLimit<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = [];
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return output;
}

export async function GET(req: NextRequest) {
  const topic = req.nextUrl.searchParams.get('q')?.trim();
  if (!topic) return NextResponse.json({ error: 'q is required' }, { status: 400 });
  if (topic.length > 120) return NextResponse.json({ error: 'query too long' }, { status: 400 });

  const queries = QUERY_TEMPLATES.map((make) => make(topic));
  const urls = queries.flatMap((query) => [
    `https://www.google.com/search?q=${encodeURIComponent(query)}&num=20`,
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=20`,
  ]);

  const fetched = await Promise.allSettled(urls.map(searchEngine));
  const candidates = dedupeCandidates(
    fetched.flatMap((result, index) => result.status === 'fulfilled'
      ? extractResults(result.value, index % 2 === 0 ? 'google' : 'bing')
      : []),
  ).sort((a, b) => b.searchPresence - a.searchPresence).slice(0, 40);

  const qualified = await mapLimit(candidates, 8, (candidate) => qualifyCandidate(candidate, topic, candidate.searchPresence));
  const valid = qualified.filter((x): x is CandidateSource => !!x);
  const ranked = rankSources(valid, 12);

  return NextResponse.json({
    topic,
    results: ranked.map((x) => ({ ...x, enabled: false })),
    totalCandidates: candidates.length,
    qualifiedCount: valid.length,
    rejectedCount: candidates.length - valid.length,
    engines: ['google', 'bing'],
    queryCount: queries.length,
    maxResults: 12,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
