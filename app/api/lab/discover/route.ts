import { NextRequest, NextResponse } from 'next/server';
import { qualifyCandidate, rankSources, type CandidateSource } from '@/lib/source-ranking';
import { searchWeb, SEARCH_ENGINES } from '@/lib/search-engines';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
  return !!host && !host.endsWith('.local') && !/^\d+(?:\.\d+){3}$/.test(host) && !host.includes(':');
}

function dedupeCandidates(items: Array<{ title: string; url: string; domain: string }>) {
  const map = new Map<string, { id: string; name: string; url: string; domain: string; hits: number; engines: Set<string> }>();
  for (const item of items) {
    if (!domainOk(item.url)) continue;
    const domain = item.domain.replace(/^www\./, '').toLowerCase();
    const current = map.get(domain);
    if (current) {
      current.hits += 1;
      current.engines.add(item.domain);
    } else {
      map.set(domain, {
        id: `discovered:${domain}`,
        name: item.title,
        url: item.url,
        domain,
        hits: 1,
        engines: new Set([item.domain]),
      });
    }
  }
  return [...map.values()].map((x) => ({
    ...x,
    searchPresence: Math.min(1, 0.25 + x.hits * 0.09 + (x.engines.size - 1) * 0.12),
  }));
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
  const engineIds = SEARCH_ENGINES.map((engine) => engine.id);
  const batches = await Promise.all(queries.map((query) => searchWeb(query, engineIds)));
  const candidates = dedupeCandidates(
    batches.flatMap((batch) => batch.flatMap((result) => result.hits)),
  ).sort((a, b) => b.searchPresence - a.searchPresence).slice(0, 40);

  const qualified = await mapLimit(candidates, 8, (candidate) => qualifyCandidate(candidate, topic, candidate.searchPresence));
  const valid = qualified.filter((x): x is CandidateSource => !!x);
  const ranked = rankSources(valid, 12);

  const engineHealth = batches.reduce<Record<string, { ok: number; hits: number; errors: string[] }>>((acc, batch) => {
    for (const item of batch) {
      const slot = acc[item.engine] ?? { ok: 0, hits: 0, errors: [] };
      if ('error' in item && item.error) slot.errors.push(item.error);
      else slot.ok += 1;
      slot.hits += item.hits.length;
      acc[item.engine] = slot;
    }
    return acc;
  }, {});

  return NextResponse.json({
    topic,
    results: ranked.map((x) => ({ ...x, enabled: false })),
    totalCandidates: candidates.length,
    qualifiedCount: valid.length,
    rejectedCount: candidates.length - valid.length,
    engines: SEARCH_ENGINES.map((x) => ({ id: x.id, name: x.name, health: engineHealth[x.id] ?? { ok: 0, hits: 0, errors: [] } })),
    queryCount: queries.length,
    maxResults: 12,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
