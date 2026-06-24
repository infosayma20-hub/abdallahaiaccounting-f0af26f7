/**
 * useProductForceStations — إجبار طباعة منتجات محددة على محطات مطبخ إضافية،
 * حتى لو كانت فئة المنتج مكتومة عن تلك المحطة في pos_category_print_rules.
 *
 * المنطق: وجود صف في pos_product_force_stations مطابق
 *   (product_id, station_id) ومع branch_id الحالي أو NULL = اطبع على هذه المحطة.
 * يتم تجاوز قواعد الكتم لهذه المحطة فقط لهذا المنتج.
 */
import { supabase } from "@/integrations/supabase/client";

export interface ProductForceRule {
  id: string;
  branch_id: string | null;
  product_id: string;
  station_id: string;
}

const CHANNEL = "malaky-sync";
const SYNC_EVENT = "pos_product_force_stations:changed";

let _cache: ProductForceRule[] | null = null;
let _inflight: Promise<ProductForceRule[]> | null = null;

async function fetchRules(): Promise<ProductForceRule[]> {
  if (_cache) return _cache;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    const { data, error } = await supabase
      .from("pos_product_force_stations" as any)
      .select("id, branch_id, product_id, station_id");
    if (error) {
      console.warn("[useProductForceStations] load failed:", error.message);
      return [];
    }
    _cache = (data as any[]) || [];
    return _cache;
  })();
  try {
    return await _inflight;
  } finally {
    _inflight = null;
  }
}

export function invalidateProductForceStationsCache() {
  _cache = null;
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage({ type: SYNC_EVENT });
    bc.close();
  } catch {
    /* ignore */
  }
}

/**
 * loadForceChecker — يعيد دالة تتحقق هل المنتج مفروض الطباعة على محطة معينة
 * في هذا الفرع (أو على كل الفروع NULL).
 */
export async function loadForceChecker(branchId: string | null) {
  const rules = await fetchRules();
  return {
    /** هل (product, station) مفروض؟ يتجاوز قواعد الكتم. */
    isForced(productId: string | null | undefined, stationId: string) {
      if (!productId) return false;
      return rules.some(
        (r) =>
          r.product_id === productId &&
          r.station_id === stationId &&
          (r.branch_id === null || r.branch_id === branchId),
      );
    },
    /** يعيد قائمة المحطات الإضافية المفروضة لهذا المنتج. */
    forcedStationsFor(productId: string | null | undefined): string[] {
      if (!productId) return [];
      return rules
        .filter(
          (r) =>
            r.product_id === productId &&
            (r.branch_id === null || r.branch_id === branchId),
        )
        .map((r) => r.station_id);
    },
  };
}