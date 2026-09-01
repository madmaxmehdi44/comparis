import { NextRequest, NextResponse } from 'next/server';
import { crawlAll, crawlSource } from '@/lib/crawler';
import { buildComparisons } from '@/lib/comparison';
import { SOURCES } from '@/lib/sources';
import { parseDiscoveredSources } from '@/lib/discovered-sources';

export const dynamic = 'force-dynamic';
export const maxDuration = 25;

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')?.trim();
  if (!query) return NextResponse.json({ error: 'q is required' }, { status: 400 });
  if (query.length > 120) return NextResponse.json({ error: 'query too long' }, { status: 400 });

  const discovered = parseDiscoveredSources(req.nextUrl.searchParams.get('sources'));
  const registry = [...SOURCES, ...discovered];
  const unique = [...new Map(registry.map((source) => [source.id, source])).values()];
  const sources = unique.length === SOURCES.length && !discovered.length
    ? await crawlAll(query)
    : await Promise.all(unique.map((source) => crawlSource(source, query)));
  const offers = sources.flatMap((source) => source.offers);
  const groups = buildComparisons(offers);
  const results = groups.flatMap((group) => group.offers).sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));

  return NextResponse.json(
    { query, groups, results, sources, completedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
