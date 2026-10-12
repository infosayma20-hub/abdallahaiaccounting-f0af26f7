import { supabase } from "@/integrations/supabase/client";

// Only this workspace has explicitly opted into direct invoice discounts.
export const CASHIER_DISCOUNT_OWNER = "9e4d10d9-95df-4acf-9cec-ad41099fcbd4";

export function cashierDiscountAllowed(owner: string | null | undefined, enabled: boolean, featureAllowed: boolean) {
  return owner === CASHIER_DISCOUNT_OWNER && enabled && featureAllowed;
}

export function discountWithinLimit(amount: number, type: "fixed" | "percent", subtotal: number, maxPercent: number) {
  if (![amount, subtotal, maxPercent].every(Number.isFinite) || amount <= 0 || subtotal <= 0) return false;
  const percent = type === "percent" ? amount : amount / subtotal * 100;
  return percent <= Math.min(100, Math.max(0, maxPercent)) + 0.0000001;
}

/** Re-read server-owned permissions; never authenticate another user here. */
export async function readCashierDiscountPermission(owner: string) {
  if (owner !== CASHIER_DISCOUNT_OWNER) return null;
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;
  const { data: cashier, error } = await supabase.from("pos_users")
    .select("id,user_id,full_name").eq("auth_user_id", user.id).eq("user_id", owner).maybeSingle();
  if (error || !cashier) return null;
  const { data: permission, error: permissionError } = await supabase.from("pos_user_permissions")
    .select("can_apply_discount,max_discount_percent").eq("pos_user_id", cashier.id).maybeSingle();
  if (permissionError || !permission?.can_apply_discount) return null;
  return { userId: user.id, name: cashier.full_name || "الكاشير", maxPercent: Number(permission.max_discount_percent ?? 100) };
}