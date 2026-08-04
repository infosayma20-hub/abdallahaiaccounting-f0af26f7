/**
 * Supplier item alias matching.
 *
 * Suppliers write item names differently than the names we already created
 * in `products` (which are wired into historical orders). Instead of creating
 * duplicate products, we store an alias row per (supplier, supplier item name)
 * that points to the existing product.
 */
import { normalizeArabicSearch } from "@/lib/utils";

export interface AliasProduct {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  unit?: string | null;
  buy_price?: number | null;
}

export interface MatchSuggestion {
  product: AliasProduct;
  score: number;
}

function tokens(v: string): string[] {
  return normalizeArabicSearch(v).split(/\s+/).filter(Boolean);
}

/** 0..1 similarity between a supplier item name and a product name. */
export function similarity(aliasName: string, productName: string): number {
  const a = normalizeArabicSearch(aliasName);
  const b = normalizeArabicSearch(productName);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ac = a.replace(/\s+/g, "");
  const bc = b.replace(/\s+/g, "");
  if (ac === bc) return 0.98;
  if (bc.includes(ac) || ac.includes(bc)) return 0.9;

  const at = tokens(a);
  const bt = tokens(b);
  if (!at.length || !bt.length) return 0;
  let hits = 0;
  for (const t of at) {
    if (bt.some(x => x === t || (t.length > 2 && (x.includes(t) || t.includes(x))))) hits++;
  }
  const coverage = hits / at.length;
  const reverse = bt.filter(x => at.some(t => t === x || (x.length > 2 && (t.includes(x) || x.includes(t))))).length / bt.length;
  return Math.min(0.88, (coverage * 0.6 + reverse * 0.4));
}

export function suggestMatches(
  aliasName: string,
  products: AliasProduct[],
  limit = 5,
): MatchSuggestion[] {
  return products
    .map(p => ({ product: p, score: similarity(aliasName, p.name) }))
    .filter(s => s.score >= 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Parse pasted supplier lines: "name<TAB|,|;>qty<...>price" — name is required. */
export interface ParsedLine {
  name: string;
  quantity?: number | null;
  price?: number | null;
  code?: string | null;
}

export function parsePastedLines(raw: string): ParsedLine[] {
  return raw
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split(/\t|\s*[;|]\s*|\s{2,}|\s*,\s*/).map(p => p.trim()).filter(Boolean);
      const name = parts[0] || line;
      const nums = parts.slice(1).map(p => Number(String(p).replace(/[^\d.-]/g, ""))).filter(n => Number.isFinite(n));
      return {
        name,
        quantity: nums.length >= 2 ? nums[0] : nums.length === 1 ? nums[0] : null,
        price: nums.length >= 2 ? nums[1] : null,
        code: null,
      };
    })
    .filter(l => !!l.name);
}
