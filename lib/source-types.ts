export type SourceStatus = 'ok' | 'blocked' | 'failed' | 'timeout' | 'empty';

export interface Offer {
  sourceId: string;
  sourceName: string;
  url: string;
  title: string;
  price?: number;
  currency?: 'IRR' | 'IRT';
  availability?: 'in_stock' | 'out_of_stock' | 'unknown';
  observedAt: string;
  retrievalMethod: 'http' | 'search';
  confidence: number;
}

export interface SourceResult {
  sourceId: string;
  sourceName: string;
  status: SourceStatus;
  latencyMs: number;
  offers: Offer[];
  error?: string;
}
