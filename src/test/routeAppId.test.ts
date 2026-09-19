import { describe, it, expect } from "vitest";
import { resolveRouteAppId } from "@/lib/permissions/routeAppId";

describe("resolveRouteAppId", () => {
  it("maps shared invoices screen by type param", () => {
    expect(resolveRouteAppId("/invoices")).toBe("sales");
    expect(resolveRouteAppId("/invoices", "?type=sales")).toBe("sales");
    expect(resolveRouteAppId("/invoices", "?type=purchase")).toBe("purchases");
    expect(resolveRouteAppId("/invoices?type=purchase")).toBe("purchases");
    expect(resolveRouteAppId("/invoices/new", "?type=purchase")).toBe("purchases");
  });

  it("maps sales-side screens", () => {
    expect(resolveRouteAppId("/credit-notes")).toBe("sales");
    expect(resolveRouteAppId("/delivery-notes/new")).toBe("sales");
    expect(resolveRouteAppId("/orders/123")).toBe("sales");
    expect(resolveRouteAppId("/sales/returns")).toBe("sales");
  });

  it("maps purchases-side screens", () => {
    expect(resolveRouteAppId("/debit-notes")).toBe("purchases");
    expect(resolveRouteAppId("/procurement/orders/new")).toBe("purchases");
    expect(resolveRouteAppId("/purchases/returns")).toBe("purchases");
  });

  it("keeps existing apps intact and returns null for unknown routes", () => {
    expect(resolveRouteAppId("/hr/payroll")).toBe("hr");
    expect(resolveRouteAppId("/pos-users")).toBe("pos");
    expect(resolveRouteAppId("/accounting/journal")).toBe("finance");
    expect(resolveRouteAppId("/something-else")).toBeNull();
  });
});
