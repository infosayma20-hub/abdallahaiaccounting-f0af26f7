export type POSIncomingOrderType = "delivery" | "takeaway" | "dine_in";
type IncomingType = POSIncomingOrderType | "pickup";

export interface IncomingOrderTypeSource {
  delivery_type?: string | null;
  delivery_info?: { original_delivery_type?: unknown } | null;
}

const isIncomingType = (value: unknown): value is IncomingType =>
  value === "delivery" || value === "takeaway" || value === "dine_in" || value === "pickup";

/** The staging field is constrained; the preserved original mode wins when valid. */
export function incomingOrderType(order: IncomingOrderTypeSource): IncomingType {
  const original = order.delivery_info?.original_delivery_type;
  if (isIncomingType(original)) return original;
  return isIncomingType(order.delivery_type) ? order.delivery_type : "pickup";
}

/** Legacy pickup keeps its existing POS behavior; never invent a table assignment. */
export function incomingPOSOrderType(order: IncomingOrderTypeSource): POSIncomingOrderType {
  const type = incomingOrderType(order);
  return type === "pickup" ? "takeaway" : type;
}

export function incomingOrderTypeLabel(order: IncomingOrderTypeSource): string {
  return { delivery: "توصيل", dine_in: "صالة", takeaway: "سفري", pickup: "استلام" }[incomingOrderType(order)];
}