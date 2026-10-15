import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import POSv2TopBar from "@/components/pos/v2/POSv2TopBar";
import { POS_V2_DARK } from "@/components/pos/v2/posV2Theme";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({}),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "cashier" } }) }));
vi.mock("@/components/pos/BridgeStatusIndicator", () => ({ default: () => <span>حالة الطابعات</span> }));
vi.mock("@/i18n/pos-lang", () => ({ usePosLang: () => ({ lang: "ar", dir: "rtl", setLang: vi.fn(), t: (s: string) => s }) }));

function renderBar(searchQuery: string, onSearchChange = vi.fn()) {
  render(<POSv2TopBar
    t={POS_V2_DARK} cashierName="كاشير" shiftLine="" searchRef={createRef<HTMLInputElement>()}
    searchQuery={searchQuery} onSearchChange={onSearchChange} onSearchEnter={vi.fn()} onCameraScan={vi.fn()}
    heldCount={0} onHeld={vi.fn()} notificationsNode={<span>الفواتير المحولة</span>}
    canInvoices onInvoices={vi.fn()} menuItems={[]}
    onToggleTheme={vi.fn()} barPinned onToggleBarPin={vi.fn()} canCloseShift={false} onCloseShift={vi.fn()}
  />);
  return onSearchChange;
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("POS v2 search clear button", () => {
  it("shows the clear button only when the search line has text", () => {
    renderBar("");
    expect(screen.queryByLabelText("مسح البحث")).toBeNull();
    cleanup();
    renderBar("كولا");
    expect(screen.getByLabelText("مسح البحث")).toBeInTheDocument();
  });

  it("clears the whole search line in one click", () => {
    const onSearchChange = renderBar("كولا بيبسي");
    fireEvent.click(screen.getByLabelText("مسح البحث"));
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith("");
  });
});
