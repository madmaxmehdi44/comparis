import { NextRequest } from 'next/server';
import { SOURCES } from '@/lib/sources';
import { crawlSource } from '@/lib/crawler';
import { buildComparisons } from '@/lib/comparison';

export const dynamic = 'force-dynamic';
export const maxDuration = 25;

function event(name: string, data: unknown) {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')?.trim();
  if (!query) return new Response('q is required', { status: 400 });
  if (query.length > 120) return new Response('query too long', { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (name: string, payload: unknown) => controller.enqueue(encoder.encode(event(name, payload)));
      send('start', { query, sources: SOURCES.map(({ id, name }) => ({ id, name })) });

      const jobs = SOURCES.map(async (source) => {
        const result = await crawlSource(source, query);
        send('source', result);
        return result;
      });
      const results = await Promise.all(jobs);
      const offers = results.flatMap((x) => x.offers);

      send('done', {
        query,
        sources: results,
        groups: buildComparisons(offers),
        results: offers.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)),
        completedAt: new Date().toISOString(),
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
