import { describe, expect, it } from "vitest";
import { hydrateDraftDetails, hydrateDraftLine, serializeDraftDetails, type DraftDetails } from "@/lib/pos/draft-order";

const details: DraftDetails = {
  name: "طلب اختبار", customerName: "زبون", customerId: "contact", customerPhone: "0590000000", posCustomerId: "customer",
  orderDiscount: 10, orderDiscountType: "percent", orderNote: "بدون مخلل", tableId: null, tableName: null,
  guestCount: 2, guestName: "ضيف", orderType: "delivery", deliveryAddress: "رام الله", zoneCode: "A1", areaName: "المركز",
  callCenterOrderId: "dispatch", callCenterPaymentMethod: "visa", callCenterSourceApp: "app", callCenterVisaGlAccountCode: "1121",
  callCenterDeliveryFee: 15, callCenterSkipWheelsDispatch: true,
};
const row = { id: "draft", customer_name: "زبون", customer_id: "contact", pos_customer_id: "customer", order_note: "بدون مخلل",
  table_id: null, guest_count: 2, guest_name: "ضيف", order_type: "delivery", delivery_address: "رام الله", zone_code: "A1", area_name: "المركز", delivery_fee: 15 };

describe("saved POS drafts round-trip details", () => {
  it("preserves customer, order note, delivery and dispatch details", () => {
    const restored = hydrateDraftDetails({ ...row, notes: serializeDraftDetails(details) });
    expect(restored).toMatchObject(details);
  });
  it("preserves a 10 percent discount rather than converting it to 10 shekels", () => {
    const restored = hydrateDraftDetails({ ...row, discount_amount: 20, notes: serializeDraftDetails(details) });
    expect(restored.orderDiscount).toBe(10);
    expect(restored.orderDiscountType).toBe("percent");
  });
  it("restores existing drafts from stored fields without requiring new metadata", () => {
    const restored = hydrateDraftDetails({ ...row, notes: "ملاحظة قديمة", order_note: null, discount_amount: 20 });
    expect(restored.orderNote).toBe("ملاحظة قديمة");
    expect(restored.orderDiscount).toBe(20);
    expect(restored.orderDiscountType).toBe("fixed");
    expect(restored.orderType).toBe("delivery");
  });
  it("preserves line quantity, price, discount, tax, unit, cost, notes and modifiers", () => {
    const line = hydrateDraftLine({ product_id: "product", product_name: "وجبة", qty: 2, unit_price: 50, cost_price: 12,
      discount_pct: 10, tax_rate: 16, unit: "وجبة", total: 90, notes: "حار", modifiers: [{ option_name: "جبنة", extra_price: 5, option_id: "option" }] });
    expect(line).toMatchObject({ qty: 2, unit_price: 50, cost_price: 12, discount_pct: 10, tax_rate: 16, unit: "وجبة", total: 90, note: "حار" });
    expect(line.modifiers[0]).toMatchObject({ option_name: "جبنة", extra_price: 5, option_id: "option" });
  });
  it("retains the employee hot-drink marker when restoring", () => {
    expect(hydrateDraftLine({ product_id: "p", product_name: "شاي", qty: 1, unit_price: 5, total: 5, notes: "[EMPLOYEE_HOT_DRINK]" }).employee_hot_drink).toBe(true);
  });
});