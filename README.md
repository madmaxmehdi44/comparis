# Comparis

Comparis is a real-time product discovery and price-comparison MVP for Iranian sources.

## What is implemented

- Parallel source crawling with independent timeouts.
- Fault isolation: one blocked/failed source does not fail the search.
- Explicit `fresh`, `blocked`, and `failed` source states.
- JSON-LD Product/Offer extraction with DOM fallback.
- Persian/Arabic digit normalization.
- Toman/Rial-aware price normalization.
- Deterministic product-title normalization and offer deduplication.
- Observation timestamps and extraction confidence.
- Source-by-source Server-Sent Events at `/api/search/stream`.
- Responsive Persian RTL interface with live source status.
- Fixed source registry; there is no user-controlled URL fetching, which avoids an SSRF surface in the search API.
- No CAPTCHA, Cloudflare, or anti-bot bypass logic.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and search for a product, for example:

```text
RTX 5070 Ti 16GB
```

## API

```text
GET /api/search?q=<product>
GET /api/search/stream?q=<product>
```

The stream emits `start`, `source`, and `done` events. The UI updates immediately as each source completes.

## Resilience model

The crawler intentionally prefers cheap HTTP retrieval. Browser rendering is a separate worker tier for sources that genuinely require JavaScript and should not be the default path. A blocked source is reported as blocked rather than being silently represented as fresh data.

Product matching in this MVP is deliberately conservative. Exact identifiers such as GTIN/MPN/SKU are not invented when absent. The current deterministic matcher normalizes titles and deduplicates equivalent offers; probabilistic/entity resolution is reserved for the worker/database stage.

## Next production layer

1. Redis/BullMQ for scheduled refresh, retry, backoff, concurrency and browser workers.
2. PostgreSQL for canonical products, offers, observations and price history.
3. Per-domain adapters with fixtures and regression tests.
4. Source health metrics and adaptive freshness policies.
5. Identifier-first entity resolution (GTIN/MPN/SKU) followed by constrained semantic matching.
6. Search discovery for additional merchants without allowing arbitrary user URLs.
