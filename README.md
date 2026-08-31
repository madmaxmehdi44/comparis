# Comparis

Real-time product discovery and price comparison for Iranian stores.

## MVP

- Parallel live fetch across Iranian sources
- Fault isolation per source
- JSON-LD extraction with DOM fallback
- Persian/Arabic digit normalization
- Price normalization to toman
- Fresh/blocked/failed source states
- Extraction confidence and observation timestamps
- Next.js App Router API + responsive RTL UI

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and search for a product such as `RTX 5070 Ti 16GB`.

## Architecture

`query -> source registry -> parallel fetch -> extraction -> normalization -> normalized offers -> live UI`

The crawler does not attempt to bypass CAPTCHA or anti-bot controls. A blocked source is isolated and explicitly reported. Browser rendering is intentionally a separate future worker tier rather than the default request path.

## Roadmap

1. Add per-domain adapters and selector tests.
2. Add Redis/BullMQ worker pool for scheduled refresh and browser rendering.
3. Add canonical product/entity resolution using SKU/MPN/GTIN before semantic matching.
4. Add PostgreSQL price history and freshness policies.
5. Add SSE streaming so results appear source-by-source.
6. Add source health metrics and adaptive crawl policies.
