import { NextRequest, NextResponse } from 'next/server';
import { crawlAll } from '@/lib/crawler';
import { dedupeOffers } from '@/lib/match';

export const dynamic = 'force-dynamic';
export const maxDuration = 25;

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')?.trim();
  if (!query) return NextResponse.json({ error: 'q is required' }, { status: 400 });
  if (query.length > 120) return NextResponse.json({ error: 'query too long' }, { status: 400 });

  const sources = await crawlAll(query);
  const results = dedupeOffers(sources.flatMap((source) => source.offers));
  return NextResponse.json(
    { query, results, sources, completedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
