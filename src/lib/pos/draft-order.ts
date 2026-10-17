const PREFIX = "[POS_DRAFT_V1]";
type Mode = "dine_in" | "takeaway" | "delivery";
export interface DraftDetails {
  name: string;
  customerName: string;
  customerId: string | null;
  customerPhone: string;
  posCustomerId: string | null;
  orderDiscount: number;
  orderDiscountType: "fixed" | "percent";
  orderNote: string;
  tableId: string | null;
  tableName: string | null;
  guestCount: number;
  guestName: string;
  orderType: Mode;
  deliveryAddress: string;
  zoneCode: string;
  areaName: string;
  callCenterOrderId?: string | null;
  callCenterPaymentMethod?: string | null;
  callCenterCustomerContactId?: string | null;
  callCenterSourceApp?: string | null;
  callCenterVisaGlAccountCode?: string | null;
  callCenterDeliveryInfo?: unknown;
  callCenterDeliveryFee?: number | null;
  callCenterSkipWheelsDispatch?: boolean | null;
}
export interface SavedDraft {
  id: string;
  customer_name?: string | null;
  customer_id?: string | null;
  pos_customer_id?: string | null;
  order_note?: string | null;
  notes?: string | null;
  discount_amount?: number | null;
  table_id?: string | null;
  guest_count?: number | null;
  guest_name?: string | null;
  order_type?: string | null;
  delivery_address?: string | null;
  customer_address?: string | null;
  zone_code?: string | null;
  area_name?: string | null;
  delivery_fee?: number | null;
  contacts?: { phone: string | null } | null;
  discount_reason?: string | null;
  discount_approved_by?: string | null;
}

/** Versioned, draft-only metadata in the existing notes field; no cart or privileges. */
export function serializeDraftDetails(order: DraftDetails): string {
  const { name, customerName, customerId, customerPhone, posCustomerId, orderDiscount, orderDiscountType,
    orderNote, tableId, tableName, guestCount, guestName, orderType, deliveryAddress, zoneCode, areaName,
    callCenterOrderId, callCenterPaymentMethod, callCenterCustomerContactId, callCenterSourceApp,
    callCenterVisaGlAccountCode, callCenterDeliveryInfo, callCenterDeliveryFee, callCenterSkipWheelsDispatch } = order;
  return PREFIX + JSON.stringify({ name, customerName, customerId, customerPhone, posCustomerId,
    orderDiscount, orderDiscountType, orderNote, tableId, tableName, guestCount, guestName, orderType,
    deliveryAddress, zoneCode, areaName, callCenterOrderId, callCenterPaymentMethod,
    callCenterCustomerContactId, callCenterSourceApp, callCenterVisaGlAccountCode, callCenterDeliveryInfo,
    callCenterDeliveryFee, callCenterSkipWheelsDispatch });
}

export function hydrateDraftDetails(row: SavedDraft): DraftDetails {
  let metadata: Partial<DraftDetails> = {};
  if (row.notes?.startsWith(PREFIX)) {
    try {
      const parsed = JSON.parse(row.notes.slice(PREFIX.length));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed;
    } catch { /* Old or malformed notes must not prevent opening a draft. */ }
  }
  const fallbackType: Mode = row.order_type === "delivery" ? "delivery" : row.order_type === "dine_in" || row.table_id ? "dine_in" : "takeaway";
  const orderType = metadata.orderType === "delivery" || metadata.orderType === "dine_in" || metadata.orderType === "takeaway" ? metadata.orderType : fallbackType;
  return {
    name: metadata.name || row.customer_name || row.guest_name || "طلب معلق",
    customerName: row.customer_name || metadata.customerName || "",
    customerId: row.customer_id || null,
    customerPhone: metadata.customerPhone || row.contacts?.phone || "",
    posCustomerId: row.pos_customer_id || null,
    orderDiscount: Number(metadata.orderDiscount ?? row.discount_amount) || 0,
    orderDiscountType: metadata.orderDiscountType === "percent" ? "percent" : "fixed",
    orderNote: row.order_note ?? metadata.orderNote ?? (row.notes?.startsWith(PREFIX) ? "" : row.notes || ""),
    tableId: row.table_id || null,
    tableName: metadata.tableName || null,
    guestCount: Number(row.guest_count) || 1,
    guestName: row.guest_name || "",
    orderType,
    deliveryAddress: row.delivery_address || row.customer_address || "",
    zoneCode: row.zone_code || "",
    areaName: row.area_name || "",
    callCenterOrderId: metadata.callCenterOrderId || null,
    callCenterPaymentMethod: metadata.callCenterPaymentMethod || null,
    callCenterCustomerContactId: metadata.callCenterCustomerContactId || null,
    callCenterSourceApp: metadata.callCenterSourceApp || null,
    callCenterVisaGlAccountCode: metadata.callCenterVisaGlAccountCode || null,
    callCenterDeliveryInfo: metadata.callCenterDeliveryInfo || null,
    callCenterDeliveryFee: Number(row.delivery_fee ?? metadata.callCenterDeliveryFee) || 0,
    callCenterSkipWheelsDispatch: !!metadata.callCenterSkipWheelsDispatch,
  };
}

export interface SavedDraftLine {
  product_id: string | null;
  product_name: string;
  qty: number;
  unit_price: number;
  cost_price?: number;
  discount_pct?: number;
  tax_rate?: number;
  unit?: string;
  total: number;
  notes?: string | null;
  modifiers?: { group_id?: string; group_name?: string; option_id?: string; option_name: string; extra_price?: number }[];
}
export function hydrateDraftLine(line: SavedDraftLine) {
  const note = line.notes || "";
  return {
    id: crypto.randomUUID(), product_id: line.product_id, name: line.product_name,
    qty: Number(line.qty), unit_price: Number(line.unit_price), cost_price: Number(line.cost_price) || 0,
    discount_pct: Number(line.discount_pct) || 0, tax_rate: Number(line.tax_rate) || 0,
    unit: line.unit || "قطعة", total: Number(line.total), note,
    employee_hot_drink: note.startsWith("[EMPLOYEE_HOT_DRINK]"),
    modifiers: (line.modifiers || []).map(m => ({ group_id: m.group_id || "", group_name: m.group_name || "",
      option_id: m.option_id || "", option_name: m.option_name, extra_price: Number(m.extra_price) || 0 })),
  };
}