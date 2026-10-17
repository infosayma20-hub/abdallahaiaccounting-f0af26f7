import { describe, expect, it } from "vitest";
import { packAsProduct, toBaseQty } from "@/lib/inventory/pack-units";

const soap = { name: "صابون دوف", sell_price: 3, buy_price: 2, unit: "قطعة" };
const carton = { id: "u1", name: "كرتونة", factor: 12, price: 30, barcode: "111" };

describe("pack units (carton = 12 pieces)", () => {
  it("counting 3 cartons stores 36 pieces", () => expect(toBaseQty(3, 12)).toBe(36));
  it("counting in the base unit keeps the quantity", () => expect(toBaseQty(5, undefined)).toBe(5));
  it("carton scan sells at the carton's own price", () => expect(packAsProduct(soap, carton).sell_price).toBe(30));
  it("carton cost is piece cost × pieces", () => expect(packAsProduct(soap, carton).buy_price).toBe(24));
  it("carton line carries the unit name the server resolves", () => {
    expect(packAsProduct(soap, carton)).toMatchObject({ unit: "كرتونة", name: "صابون دوف — كرتونة" });
  });
});
