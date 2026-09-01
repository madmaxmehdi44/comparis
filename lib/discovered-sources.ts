import type { SourceDefinition, SourceStrategy } from './sources';

export interface DiscoveredSourceInput {
  id: string;
  name: string;
  domain: string;
  url: string;
  priority?: number;
}

function safeUrl(raw: string): URL | undefined {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost') || /^\d+(?:\.\d+){3}$/.test(host)) return undefined;
    if (host === '127.0.0.1' || host === '0.0.0.0') return undefined;
    return url;
  } catch { return undefined; }
}

function makeStrategy(name: string, method: SourceStrategy['method'], kind: SourceStrategy['kind'], timeoutMs: number, buildUrl: (query: string) => string): SourceStrategy {
  return { name, method, kind, timeoutMs, buildUrl };
}

export function buildDiscoveredSource(input: DiscoveredSourceInput): SourceDefinition | undefined {
  const base = safeUrl(input.url);
  if (!base) return undefined;
  const domain = input.domain.toLowerCase().replace(/^www\./, '');
  if (!domain || !base.hostname.toLowerCase().replace(/^www\./, '').endsWith(domain)) return undefined;
  const encoded = (query: string) => encodeURIComponent(query.trim());
  const strategies: readonly SourceStrategy[] = [
    makeStrategy('site-search', 'http', 'site', 6500, (query) => `${base.origin}/search?q=${encoded(query)}`),
    makeStrategy('site-query', 'http', 'site', 6500, (query) => `${base.origin}/?s=${encoded(query)}`),
    makeStrategy('google-index', 'search', 'search-engine', 7500, (query) => `https://www.google.com/search?q=${encoded(`site:${domain} ${query}`)}`),
    makeStrategy('bing-index', 'search', 'search-engine', 7500, (query) => `https://www.bing.com/search?q=${encoded(`site:${domain} ${query}`)}`),
  ];
  return { id: input.id, name: input.name, strategies };
}

export function parseDiscoveredSources(raw: string | null): SourceDefinition[] {
  if (!raw) return [];
  try {
    const values = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    return values
      .filter((x): x is DiscoveredSourceInput => !!x && typeof x === 'object' && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.domain === 'string' && typeof x.url === 'string')
      .sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50))
      .slice(0, 15)
      .map(buildDiscoveredSource)
      .filter((x): x is SourceDefinition => !!x);
  } catch { return []; }
}
