import { canonicalTitle } from './normalize';
import type { Offer } from './types';

export interface ProductIdentity {
  brand?: string;
  model?: string;
  variant?: string;
  capacity?: string;
  sku?: string;
}

export interface ProductGroup {
  key: string;
  title: string;
  offers: Offer[];
  confidence: number;
  identity: ProductIdentity;
}

const STOP = new Set(['گارانتی', 'اصل', 'اورجینال', 'جدید', 'فروش', 'خرید', 'قیمت', 'کالا']);
const BRAND_RE = /\b(apple|samsung|xiaomi|huawei|asus|msi|gigabyte|lenovo|hp|dell|sony|lg|amd|intel|nvidia)\b/i;
const SKU_RE = /\b[A-Z0-9]{3,}(?:[-_][A-Z0-9]{2,})+\b/i;
const CAPACITY_RE = /\b\d+(?:\.\d+)?\s?(?:gb|tb|mb|گیگ|ترابایت)\b/i;

function identity(title: string): ProductIdentity {
  const normalized = canonicalTitle(title);
  const brand = normalized.match(BRAND_RE)?.[1]?.toLowerCase();
  const sku = title.match(SKU_RE)?.[0]?.toUpperCase();
  const capacity = normalized.match(CAPACITY_RE)?.[0];
  const words = normalized.split(' ').filter((x) => x.length > 1 && !STOP.has(x));
  return { brand, sku, capacity, model: words.slice(0, 8).join(' ') };
}

function tokens(value: string): Set<string> {
  return new Set(canonicalTitle(value).split(' ').filter((x) => x.length > 1 && !STOP.has(x)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  return intersection / Math.max(1, new Set([...a, ...b]).size);
}

function scoreOffer(offer: Offer, group: ProductGroup): number {
  const left = identity(offer.title);
  const right = group.identity;
  if (left.sku && right.sku && left.sku === right.sku) return 1;
  if (left.brand && right.brand && left.brand !== right.brand) return 0;
  if (left.capacity && right.capacity && left.capacity !== right.capacity) return 0;
  const semantic = jaccard(tokens(offer.title), tokens(group.title));
  const brandBonus = left.brand && right.brand && left.brand === right.brand ? 0.12 : 0;
  const capacityBonus = left.capacity && right.capacity && left.capacity === right.capacity ? 0.08 : 0;
  return Math.min(1, semantic + brandBonus + capacityBonus);
}

export function groupOffers(offers: Offer[]): ProductGroup[] {
  const groups: ProductGroup[] = [];
  for (const offer of offers) {
    let best: ProductGroup | undefined;
    let bestScore = 0;
    for (const group of groups) {
      const score = scoreOffer(offer, group);
      if (score > bestScore) {
        bestScore = score;
        best = group;
      }
    }
    if (best && bestScore >= 0.68) {
      best.offers.push(offer);
      best.confidence = Math.min(best.confidence, bestScore);
    } else {
      groups.push({ key: canonicalTitle(offer.title), title: offer.title, offers: [offer], confidence: offer.confidence, identity: identity(offer.title) });
    }
  }
  return groups.map((group) => ({ ...group, offers: [...group.offers].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)) }));
}
