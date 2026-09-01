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
  diagnostics?: {
    finalUrl?: string;
    title?: string;
    requests?: string[];
    responses?: Array<{ url: string; status: number; type: string }>;
  };
}

export interface ComparisonGroup {
  key: string;
  title: string;
  offers: Offer[];
  confidence: number;
  identity: {
    brand?: string;
    model?: string;
    variant?: string;
    capacity?: string;
    sku?: string;
  };
  stats: {
    min?: number;
    max?: number;
    average?: number;
    savings?: number;
  };
  sellerCount: number;
}

export interface SearchResponse {
  query: string;
  results: Offer[];
  groups?: ComparisonGroup[];
  sources: SourceResult[];
  completedAt: string;
}
