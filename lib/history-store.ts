import type { PriceObservation } from './price-history';

export interface HistoryStore {
  append(observations: PriceObservation[]): Promise<void>;
  recent(productKey: string, limit?: number): Promise<PriceObservation[]>;
}

const memory = new Map<string, PriceObservation[]>();

export const memoryHistoryStore: HistoryStore = {
  async append(observations) {
    for (const observation of observations) {
      const bucket = memory.get(observation.productKey) ?? [];
      bucket.push(observation);
      bucket.sort((a, b) => b.observedAt.localeCompare(a.observedAt));
      memory.set(observation.productKey, bucket.slice(0, 500));
    }
  },
  async recent(productKey, limit = 50) {
    return (memory.get(productKey) ?? []).slice(0, limit);
  },
};
