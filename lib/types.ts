export type SourceStatus = 'fresh' | 'stale' | 'blocked' | 'failed';
export type RetrievalMethod = 'api' | 'feed' | 'http' | 'browser' | 'search';

export interface Offer {
  sourceId: string;
  source: string;
  url: string;
  title: string;
  price?: number;
  currency: 'IRT';
  availability?: string;
  observedAt: string;
  status: SourceStatus;
  method: RetrievalMethod;
  confidence: number;
}

export interface SourceResult {
  id: string;
  name: string;
  status: SourceStatus;
  method: RetrievalMethod;
  offers: Offer[];
  latencyMs: number;
  error?: string;
}

export interface SearchResponse {
  query: string;
  results: Offer[];
  sources: SourceResult[];
  completedAt: string;
}
