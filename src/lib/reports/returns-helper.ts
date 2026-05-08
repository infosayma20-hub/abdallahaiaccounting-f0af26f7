// Shared helpers for subtracting `returns` from sales/purchase reports.
// Always filters: is_deleted=false AND status='confirmed' (excludes draft/cancelled).
// `return_type` values: 'sales' | 'purchase' (singular). Date window applied on return_date.
import { supabase } from "@/integrations/supabase/client";

export interface ReturnsByContact {
  available: boolean;          // false if query failed (column/permission)
  byContactId: Map<string, number>;  // contact_id -> total amount (incl. tax)
  unmappedTotal: number;       // returns missing contact_id
}

export interface ReturnsByProduct {
  available: boolean;
  byProductId: Map<string, { qty: number; amount: number }>;
  byProductName: Map<string, { qty: number; amount: number }>; // for legacy joins
  unmapped: { qty: number; amount: number }; // missing product_id
}

const STATUS_OK = (s: string | null | undefined) => !s || s === "confirmed";

export async function loadReturnsByContact(
  uid: string,
  type: "sales" | "purchase",
  dateFrom: string,
  dateTo: string,
): Promise<ReturnsByContact> {
  try {
    const { data, error } = await supabase
      .from("returns")
      .select("contact_id, total_amount, status")
      .eq("user_id", uid)
      .eq("return_type", type)
      .eq("is_deleted", false)
      .gte("return_date", dateFrom)
      .lte("return_date", dateTo);
    if (error) return { available: false, byContactId: new Map(), unmappedTotal: 0 };
    const byContactId = new Map<string, number>();
    let unmappedTotal = 0;
    (data || []).forEach((r: any) => {
      if (!STATUS_OK(r.status)) return;
      const amt = Number(r.total_amount) || 0;
      if (!r.contact_id) { unmappedTotal += amt; return; }
      byContactId.set(r.contact_id, (byContactId.get(r.contact_id) || 0) + amt);
    });
    return { available: true, byContactId, unmappedTotal };
  } catch {
    return { available: false, byContactId: new Map(), unmappedTotal: 0 };
  }
}

export async function loadReturnsByProduct(
  uid: string,
  type: "sales" | "purchase",
  dateFrom: string,
  dateTo: string,
): Promise<ReturnsByProduct> {
  try {
    const { data: heads, error } = await supabase
      .from("returns")
      .select("id, status")
      .eq("user_id", uid)
      .eq("return_type", type)
      .eq("is_deleted", false)
      .gte("return_date", dateFrom)
      .lte("return_date", dateTo);
    if (error) return { available: false, byProductId: new Map(), byProductName: new Map(), unmapped: { qty: 0, amount: 0 } };
    const ids = (heads || []).filter((h: any) => STATUS_OK(h.status)).map((h: any) => h.id);
    if (!ids.length) return { available: true, byProductId: new Map(), byProductName: new Map(), unmapped: { qty: 0, amount: 0 } };
    const { data: items } = await supabase
      .from("return_items")
      .select("product_id, quantity, line_total")
      .in("return_id", ids);
    const byProductId = new Map<string, { qty: number; amount: number }>();
    const unmapped = { qty: 0, amount: 0 };
    const pids = new Set<string>();
    (items || []).forEach((it: any) => {
      const qty = Number(it.quantity) || 0;
      const amt = Number(it.line_total) || 0;
      if (!it.product_id) { unmapped.qty += qty; unmapped.amount += amt; return; }
      pids.add(it.product_id);
      const cur = byProductId.get(it.product_id) || { qty: 0, amount: 0 };
      cur.qty += qty; cur.amount += amt;
      byProductId.set(it.product_id, cur);
    });
    // Build name index for loaders that aggregate by product_name
    const byProductName = new Map<string, { qty: number; amount: number }>();
    if (pids.size) {
      const { data: prods } = await supabase
        .from("products")
        .select("id, name")
        .in("id", Array.from(pids));
      const nameMap = new Map((prods || []).map((p: any) => [p.id, p.name]));
      byProductId.forEach((v, pid) => {
        const name = nameMap.get(pid);
        if (!name) return;
        const cur = byProductName.get(name) || { qty: 0, amount: 0 };
        cur.qty += v.qty; cur.amount += v.amount;
        byProductName.set(name, cur);
      });
    }
    return { available: true, byProductId, byProductName, unmapped };
  } catch {
    return { available: false, byProductId: new Map(), byProductName: new Map(), unmapped: { qty: 0, amount: 0 } };
  }
}