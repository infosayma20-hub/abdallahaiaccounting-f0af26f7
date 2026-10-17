import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StockCountBarcodes from "@/components/employee/StockCountBarcodes";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
afterEach(cleanup);
beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: [{ code: "8000700000005", primary: true }], error: null }); });
describe("stock count additional product barcodes", () => {
  it("adds an alternate barcode to the same product without replacing its primary", async () => {
    render(<StockCountBarcodes productId="product-1" scanned={null} onScanRequest={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "إضافة باركود للصنف" }));
    fireEvent.change(screen.getByRole("textbox", { name: "باركود إضافي" }), { target: { value: " ٨٠٠٠٧٠٠٠٠٠٠٠٦ " } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ الباركود" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("stock_count_set_barcode", { p_product_id: "product-1", p_old: null, p_new: "8000700000006" }));
  });
  it("edits only the selected barcode on its product", async () => {
    render(<StockCountBarcodes productId="product-1" scanned={null} onScanRequest={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "تعديل الباركود" }));
    fireEvent.change(screen.getByRole("textbox", { name: "الباركود الجديد" }), { target: { value: "8000700000007" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ الباركود" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("stock_count_set_barcode", { p_product_id: "product-1", p_old: "8000700000005", p_new: "8000700000007" }));
  });
});