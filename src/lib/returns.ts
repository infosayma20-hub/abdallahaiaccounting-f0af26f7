import { supabase } from "@/integrations/supabase/client";

export const RETURNS_PILOT_OWNER = "d8ddc6f2-d666-468f-85c3-f8845fb9c71c";
export const isReturnsPilot = (ownerId?: string | null) => ownerId === RETURNS_PILOT_OWNER;
export type ReturnTaxCategory = "taxable" | "zero" | "exempt";
export interface ReturnCalculationLine {
  quantity: number;
  unitPrice: number;
  discount: number;
  discountType?: "amount" | "percent";
  taxRate: number;
  taxCategory: ReturnTaxCategory;
}
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function calculateReturnLine(line: ReturnCalculationLine, taxEnabled: boolean, inclusive = false) {
  const gross = line.quantity * line.unitPrice;
  const discount = line.discountType === "percent" ? gross * line.discount / 100 : line.discount;
  const rate = taxEnabled && line.taxCategory === "taxable" ? line.taxRate : 0;
  const divisor = inclusive ? 1 + rate / 100 : 1;
  const net = round((gross - discount) / divisor);
  const tax = round(net * rate / 100);
  return { gross: round(gross / divisor), discount: round(discount / divisor), storedDiscount: discount, net, tax, total: round(net + tax) };
}
export function calculateReturnSummary(lines: ReturnCalculationLine[], taxEnabled: boolean, inclusive = false) {
  return lines.reduce((sum, line) => {
    const value = calculateReturnLine(line, taxEnabled, inclusive);
    return { subtotal: round(sum.subtotal + value.gross), discount: round(sum.discount + value.discount), net: round(sum.net + value.net), tax: round(sum.tax + value.tax), total: round(sum.total + value.total) };
  }, { subtotal: 0, discount: 0, net: 0, tax: 0, total: 0 });
}

export async function cancelManagedReturn(ownerId: string, row: { id: string; revision?: number | null }, deleteDraft = false) {
  const { data, error } = await supabase.rpc("cancel_return_command_v1", {
    p_owner: ownerId, p_return_id: row.id, p_expected_revision: row.revision ?? 0,
    p_command_key: crypto.randomUUID(), p_delete_draft: deleteDraft,
  });
  if (error) throw error;
  return data;
}