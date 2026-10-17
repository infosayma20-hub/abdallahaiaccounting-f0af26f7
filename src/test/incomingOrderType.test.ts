import { describe, expect, it } from "vitest";
import { incomingOrderType, incomingPOSOrderType } from "@/lib/pos/incoming-order-type";

describe("incoming orders preserve their original fulfillment mode", () => {
  it("keeps the reported dine-in order as dine_in when staging stores pickup", () => {
    const order = { delivery_type: "pickup", delivery_info: { original_delivery_type: "dine_in" } };
    expect(incomingOrderType(order)).toBe("dine_in");
    expect(incomingPOSOrderType(order)).toBe("dine_in");
  });
  it("keeps takeaway as takeaway", () => {
    expect(incomingPOSOrderType({ delivery_type: "pickup", delivery_info: { original_delivery_type: "takeaway" } })).toBe("takeaway");
  });
  it("keeps delivery as delivery", () => {
    expect(incomingPOSOrderType({ delivery_type: "delivery", delivery_info: { original_delivery_type: "delivery" } })).toBe("delivery");
  });
  it("retains historical pickup behavior without original metadata", () => {
    expect(incomingPOSOrderType({ delivery_type: "pickup" })).toBe("takeaway");
    expect(incomingPOSOrderType({ delivery_type: "delivery", delivery_info: null })).toBe("delivery");
  });
  it("does not trust unrecognized original metadata", () => {
    expect(incomingPOSOrderType({ delivery_type: "delivery", delivery_info: { original_delivery_type: "invalid" } })).toBe("delivery");
  });
});