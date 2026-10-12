import { Package, Plus, Trash2, Percent, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import InlineProductAutocomplete from "@/components/invoice/InlineProductAutocomplete";
import InvoiceNumericInput from "@/components/invoice/InvoiceNumericInput";
import { calculateReturnLine, type ReturnCalculationLine } from "@/lib/returns";

export interface ReturnEditorItem extends ReturnCalculationLine {
  id: string;
  productId?: string | null;
  sourceInvoiceItemId?: string | null;
  description: string;
  maxReturnableQty?: number | null;
}
interface Product {
  id: string; name: string; barcode: string | null; sku: string | null;
  sell_price: number | null; buy_price: number | null; unit: string | null; quantity: number | null;
}
interface Props {
  items: ReturnEditorItem[]; products: Product[]; isSales: boolean;
  readonly: boolean; linked: boolean; taxEnabled: boolean; inclusive: boolean;
  allowPercent: boolean;
  onUpdate: (id: string, patch: Partial<ReturnEditorItem>) => void;
  onAdd: () => void; onRemove: (id: string) => void;
}
export default function ReturnItemsEditor({ items, products, isSales, readonly, linked, taxEnabled, inclusive, allowPercent, onUpdate, onAdd, onRemove }: Props) {
  const productMap = new Map(products.map(p => [p.id, p]));
  const productField = (item: ReturnEditorItem) => {
    const product = item.productId ? productMap.get(item.productId) : undefined;
    return <div className="min-w-0 space-y-1">
      <InlineProductAutocomplete value={item.description} products={products} invoiceType={isSales ? "sales" : "purchase"} currencySymbol="₪" disabled={readonly || linked}
        placeholder="ابحث باسم الصنف أو الباركود..."
        inputProps={{ "aria-label": "الصنف" }}
        onChange={description => onUpdate(item.id, { description, productId: null })}
        onSelect={id => {
          const p = productMap.get(id);
          if (p) onUpdate(item.id, { productId: id, description: p.name, unitPrice: item.unitPrice > 0 ? item.unitPrice : Number(isSales ? p.sell_price : p.buy_price) || 0 });
        }} />
      {product && <p className="text-[10px] text-muted-foreground px-1 tabular-nums">{product.sku || product.barcode || "بدون باركود"} · المتاح: {Number(product.quantity || 0).toLocaleString()} {product.unit || "قطعة"}</p>}
      {item.maxReturnableQty != null && <p className="text-[10px] text-muted-foreground px-1">القابل للإرجاع: {item.maxReturnableQty}</p>}
    </div>;
  };
  const numeric = (item: ReturnEditorItem, field: "quantity" | "unitPrice" | "discount", label: string) => <InvoiceNumericInput aria-label={label} value={item[field]} disabled={readonly} min={0} step="any" max={field === "quantity" ? item.maxReturnableQty ?? undefined : undefined} minWidthPx={72} maxWidthPx={110} focusMaxWidthPx={130} onChange={e => onUpdate(item.id, { [field]: Number(e.target.value) || 0 })} />;
  const discount = (item: ReturnEditorItem) => <div className="flex items-center gap-1">{numeric(item, "discount", "الخصم")}{allowPercent && <Button size="icon" variant="outline" className="h-9 w-8 shrink-0" disabled={readonly} title={item.discountType === "percent" ? "خصم نسبة" : "خصم مبلغ"} aria-label="نوع الخصم" onClick={() => onUpdate(item.id, { discount: 0, discountType: item.discountType === "percent" ? "amount" : "percent" })}>{item.discountType === "percent" ? <Percent className="h-3 w-3" /> : <Coins className="h-3 w-3" />}</Button>}</div>;
  const tax = (item: ReturnEditorItem) => <Select dir="rtl" value={item.taxCategory} disabled={readonly || linked || !taxEnabled} onValueChange={v => onUpdate(item.id, { taxCategory: v as ReturnEditorItem["taxCategory"] })}><SelectTrigger className="h-9 text-xs" aria-label="ضريبة البند"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="taxable">خاضع {item.taxRate || 16}%</SelectItem><SelectItem value="zero">صفري</SelectItem><SelectItem value="exempt">معفى</SelectItem></SelectContent></Select>;
  const remove = (item: ReturnEditorItem) => !readonly && <Button variant="ghost" size="icon" className="h-8 w-8" title="حذف البند" aria-label="حذف البند" disabled={items.length <= 1} onClick={() => onRemove(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>;
  const total = (item: ReturnEditorItem) => <span className="font-semibold tabular-nums whitespace-nowrap">₪{calculateReturnLine(item, taxEnabled, inclusive).total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
  const handleEnter = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (e.key !== "Enter" || e.shiftKey || readonly || t.tagName !== "INPUT" || t.getAttribute("aria-label") === "الصنف") return;
    e.preventDefault();
    const root = e.currentTarget;
    const fields = Array.from(root.querySelectorAll<HTMLInputElement>("input:not([disabled])"));
    const next = fields[fields.indexOf(t as HTMLInputElement) + 1];
    if (next) { next.focus(); next.select?.(); return; }
    if (linked) return;
    onAdd();
    setTimeout(() => {
      const rows = root.querySelectorAll("tbody tr");
      rows[rows.length - 1]?.querySelector<HTMLInputElement>("input")?.focus();
    }, 50);
  };
  return <section className="border border-border rounded-lg bg-background min-w-0">
    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border"><h2 className="text-sm font-semibold flex items-center gap-2"><Package className="h-4 w-4 text-primary" />البنود المرتجعة <span className="text-xs font-normal text-muted-foreground">({items.length})</span></h2>{!readonly && !linked && <Button size="sm" variant="outline" onClick={onAdd} className="gap-1"><Plus className="h-4 w-4" />إضافة بند</Button>}</div>
    <div className="hidden lg:block overflow-x-auto" onKeyDown={handleEnter}><table className="w-full text-xs border-collapse"><thead><tr className="bg-muted/50 text-muted-foreground border-b border-border"><th className="px-3 py-3 text-center">#</th><th className="px-3 py-3 text-right min-w-[280px]">المنتج / الخدمة</th><th className="px-2 py-3 text-center">الكمية</th><th className="px-2 py-3 text-center">الوحدة</th><th className="px-2 py-3 text-center">السعر</th><th className="px-2 py-3 text-center">الخصم</th>{taxEnabled && <th className="px-2 py-3 text-center min-w-[110px]">الضريبة</th>}<th className="px-3 py-3 text-left">الإجمالي</th><th className="w-10" /></tr></thead><tbody>{items.map((item, index) => <tr key={item.id} className="border-b border-border/50 even:bg-muted/20 focus-within:bg-primary/5"><td className="px-3 py-3 text-center text-muted-foreground">{index + 1}</td><td className="px-2 py-2 align-top">{productField(item)}</td><td className="px-2 py-2 text-center">{numeric(item, "quantity", "الكمية")}</td><td className="px-2 py-2 text-center text-muted-foreground">{productMap.get(item.productId || "")?.unit || "قطعة"}</td><td className="px-2 py-2 text-center">{numeric(item, "unitPrice", "السعر")}</td><td className="px-2 py-2">{discount(item)}</td>{taxEnabled && <td className="px-2 py-2">{tax(item)}</td>}<td className="px-3 py-2 text-left">{total(item)}</td><td className="px-1 py-2">{remove(item)}</td></tr>)}</tbody></table></div>
    <div className="lg:hidden divide-y divide-border">{items.map((item, index) => <div key={item.id} className="p-3 space-y-3"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">البند {index + 1}</span>{remove(item)}</div>{productField(item)}<div className="grid grid-cols-2 sm:grid-cols-3 gap-3"><label className="space-y-1 text-xs"><span className="block text-muted-foreground">الكمية</span>{numeric(item, "quantity", "الكمية")}</label><label className="space-y-1 text-xs"><span className="block text-muted-foreground">السعر</span>{numeric(item, "unitPrice", "السعر")}</label><label className="space-y-1 text-xs"><span className="block text-muted-foreground">الخصم</span>{discount(item)}</label>{taxEnabled && <label className="space-y-1 text-xs"><span className="block text-muted-foreground">الضريبة</span>{tax(item)}</label>}</div><div className="flex justify-between border-t border-border pt-2 text-xs"><span className="text-muted-foreground">{productMap.get(item.productId || "")?.unit || "قطعة"}</span>{total(item)}</div></div>)}</div>
  </section>;
}