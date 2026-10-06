import { createRef } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import POSv2TopBar from "@/components/pos/v2/POSv2TopBar";
import { POS_V2_DARK } from "@/components/pos/v2/posV2Theme";
import { StockoutAlertButton } from "@/components/pos/StockoutAlerts";
import { readFileSync } from "node:fs";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from,
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "cashier" } }) }));
vi.mock("@/components/pos/BridgeStatusIndicator", () => ({ default: () => <span>حالة الطابعات</span> }));
vi.mock("@/i18n/pos-lang", () => ({ usePosLang: () => ({ lang: "ar", dir: "rtl", setLang: vi.fn(), t: (s: string) => s }) }));

const owner = "0b08eba6-c81a-4f6c-b371-e6e324016e73";
function renderBar(stockout = true) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit", "gte"]) query[method] = vi.fn(() => query);
  query.then = (resolve: (value: { data: unknown[] }) => void) => Promise.resolve({ data: [] }).then(resolve);
  from.mockReturnValue(query);
  return render(<POSv2TopBar
    t={POS_V2_DARK} cashierName="كاشير" shiftLine="" searchRef={createRef<HTMLInputElement>()}
    searchQuery="" onSearchChange={vi.fn()} onSearchEnter={vi.fn()} onCameraScan={vi.fn()}
    heldCount={0} onHeld={vi.fn()} notificationsNode={<span data-testid="pending">الفواتير المحولة</span>}
    stockoutNode={stockout ? <StockoutAlertButton iconOnly dataOwnerId={owner} branchId="branch" /> : null}
    canInvoices onInvoices={vi.fn()} menuItems={[{ key: "kitchen", label: "المطبخ", onClick: vi.fn() }]}
    onToggleTheme={vi.fn()} barPinned onToggleBarPin={vi.fn()} canCloseShift={false} onCloseShift={vi.fn()}
  />);
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("POS v2 stockout presentation", () => {
  it("opens the existing stockout dialog beside pending orders without writing data", async () => {
    renderBar();
    const pendingGroup = screen.getByTestId("pending").parentElement?.parentElement;
    expect(pendingGroup?.nextElementSibling).toHaveTextContent("تنبيه نفاد صنف");
    fireEvent.click(screen.getByTitle("تنبيه نفاد صنف للكول سنتر"));
    expect(await screen.findByRole("dialog")).toHaveTextContent("تنبيه نفاد صنف/مكوّن");
    await waitFor(() => expect(from).toHaveBeenCalledWith("products"));
    expect(from.mock.results.every(result => !result.value.insert)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "إلغاء" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps kitchen in More and omits stockout when no tenant-specific node is passed", () => {
    renderBar(false);
    expect(screen.queryByTitle("تنبيه نفاد صنف للكول سنتر")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "المطبخ" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle("المزيد"));
    expect(screen.getByRole("button", { name: "المطبخ" })).toBeInTheDocument();
  });

  it("gates POS integration by exact owner and cashier mode, preserving legacy header", () => {
    const page = readFileSync("src/pages/POSPage.tsx", "utf8");
    expect(page).toContain("stockoutNode={dataOwnerId === MALAKI_OWNER_ID && !isCallCenter ? (");
    expect(page).toContain('key: "kitchen", label: "المطبخ"');
    expect(page).not.toContain("showKitchen=");
    expect(page).toContain("{/* Kitchen — hidden for Malaky (unused) */}");
  });
});