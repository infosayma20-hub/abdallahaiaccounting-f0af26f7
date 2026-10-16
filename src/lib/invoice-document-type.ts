export type InvoiceDocumentType = "sales" | "purchase" | "sales_return" | "purchase_return";
export const isReturnDocument = (type: InvoiceDocumentType) => type === "sales_return" || type === "purchase_return";
export const documentPartyType = (type: InvoiceDocumentType): "sales" | "purchase" =>
  type === "purchase" || type === "purchase_return" ? "purchase" : "sales";
export function validateReturnItems(items: { quantity: number; bonusQuantity?: number; maxReturnableQty?: number | null }[]) {
  return items.every(item => Number.isFinite(item.quantity) && item.quantity > 0 &&
    !item.bonusQuantity && (item.maxReturnableQty == null || item.quantity <= item.maxReturnableQty));
}