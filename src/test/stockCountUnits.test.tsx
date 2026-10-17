import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ProductUnitSelect from "@/components/inventory/ProductUnitSelect";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, onValueChange }: any) => <div onClick={(e) => { if ((e.target as HTMLElement).dataset.unit) onValueChange((e.target as HTMLElement).dataset.unit); }}>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <button data-unit={value}>{children}</button>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: () => null,
}));
afterEach(cleanup);
it("uses the existing inventory unit without changing it on load", () => {
  const change = vi.fn();
  render(<ProductUnitSelect value="كيلو" onChange={change} units={["حبة"]} />);
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "حبة", exact: true }));
  expect(change).toHaveBeenCalledWith("حبة");
});
it("adds a custom unit to the product selection", () => {
  const change = vi.fn();
  render(<ProductUnitSelect value="قطعة" onChange={change} units={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "إضافة وحدة جديدة" }));
  fireEvent.change(screen.getByRole("textbox", { name: "اسم الوحدة الجديدة" }), { target: { value: "  حبة  " } });
  fireEvent.click(screen.getByRole("button", { name: "اعتماد الوحدة الجديدة" }));
  expect(change).toHaveBeenCalledWith("حبة");
});