# Comparis

Comparis is a real-time product discovery and price-comparison MVP for Iranian sources.

## Implemented

- Parallel source crawling with independent time budgets.
- Fault isolation: a blocked or failed source does not fail the whole search.
- Explicit `fresh`, `blocked`, `failed`, and `stale` states.
- JSON-LD Product/Offer extraction with DOM fallback.
- Persian/Arabic digit normalization and Rial/Toman normalization.
- Source-aware offer deduplication; identical offers from different merchants are never collapsed together.
- Conservative entity resolution with brand, capacity and SKU conflict guards.
- Observation timestamps and extraction confidence.
- Source-by-source Server-Sent Events at `/api/search/stream`.
- Responsive Persian RTL interface with live source status.
- Fixed source registry; the API does not fetch arbitrary user-supplied URLs, reducing SSRF risk.
- Optional Playwright fallback for JavaScript-heavy sources via `PLAYWRIGHT_ENABLED=true`.
- No CAPTCHA, Cloudflare, fingerprint, or anti-bot bypass logic.
- TypeScript validation in CI before the production build.

## Run locally

```bash
npm install
npm run typecheck
npm run dev
```

Open `http://localhost:3000` and search for a product such as:

```text
RTX 5070 Ti 16GB
```

For browser-based fallback:

```bash
npx playwright install chromium
PLAYWRIGHT_ENABLED=true npm run dev
```

## API

```text
GET /api/search?q=<product>
GET /api/search/stream?q=<product>
```

The stream emits `start`, `source`, and `done` events. The interface updates as individual sources complete.

## Resilience model

HTTP retrieval is the first tier because it is cheaper and easier to operate. Playwright is isolated as a separate fallback tier for sources that genuinely require JavaScript. A source that blocks or fails is reported as degraded instead of being represented as fresh data.

Entity matching is intentionally conservative. SKU conflicts, brand conflicts and capacity conflicts prevent automatic merging. The system prefers separate products over a false positive match.

## Production architecture

The current repository is the executable MVP. The next scale layer is:

1. Redis/BullMQ for scheduled refresh, retries, backoff and concurrency control.
2. PostgreSQL for canonical products, offers, observations and price history.
3. Per-domain adapters with fixtures and regression tests.
4. Persistent source-health metrics and adaptive freshness policies.
5. Identifier-first entity resolution using GTIN/MPN/SKU, followed by constrained semantic matching.
6. Search discovery for additional merchants without allowing arbitrary URL fetching.
