import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, PackageSearch, Save, ScanLine, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import ManagerHeader from "@/components/employee/manager/ManagerHeader";
import POSBarcodeScanner from "@/components/pos/POSBarcodeScanner";
import { normalizeBarcode } from "@/lib/barcode";

type Ctx = { branch_name: string | null; warehouse_id: string | null; warehouse_name: string | null };
type Product = { id: string; name: string; sell_price: number | null; barcode: string | null; unit: string | null; system_qty: number; pending_qty: number | null };

/**
 * جرد المخزون للموظف: مسح الباركود/QR ثم تعديل اختياري للاسم وسعر البيع والكمية.
 * الاسم والسعر يُطبّقان فورًا مع سجل؛ الكمية تُرسل للمراجعة قبل أن تغيّر المخزون.
 */
export default function EmployeeStockCountTab({ onBack }: { onBack: () => void }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [ctxError, setCtxError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [looking, setLooking] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [unknownNote, setUnknownNote] = useState("");
  const [reporting, setReporting] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.rpc("stock_count_context").then(({ data, error }) => {
      if (error) setCtxError(error.message);
      else setCtx(data as any);
    });
  }, []);

  const lookup = async (raw: string) => {
    const c = normalizeBarcode(raw);
    if (!c) return;
    setLooking(true);
    const { data, error } = await supabase.rpc("stock_count_lookup", { p_code: c });
    setLooking(false);
    if (error) { toast.error(error.message); return; }
    if (!data) { setProduct(null); setUnknownCode(c); setUnknownNote(""); return; }
    setUnknownCode(null);
    const p = data as any as Product;
    setProduct(p);
    setName("");
    setPrice("");
    setQty("");
    setCode("");
  };

  const save = async () => {
    if (!product) return;
    const n = name.trim();
    const pr = price.trim() === "" ? null : Number(price);
    const q = qty.trim() === "" ? null : Number(qty);
    if (!n && pr === null && q === null) { toast.message("لم تُدخل أي تعديل"); return; }
    if ((pr !== null && (!isFinite(pr) || pr < 0)) || (q !== null && (!isFinite(q) || q < 0))) { toast.error("أدخل رقمًا صحيحًا"); return; }
    setSaving(true);
    const { error } = await supabase.rpc("stock_count_submit", {
      p_product_id: product.id, p_name: n || null, p_sell_price: pr, p_counted_qty: q,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(q !== null ? "تم الحفظ — الكمية أُرسلت للمراجعة" : "تم الحفظ");
    setProduct(null);
    setTimeout(() => codeRef.current?.focus(), 50);
  };

  return (
    <div className="pb-24" dir="rtl">
      <ManagerHeader title="جرد المخزون" subtitle={ctx ? `${ctx.branch_name ?? ""}${ctx.warehouse_name ? " · " + ctx.warehouse_name : ""}` : undefined} onBack={onBack} />
      <div className="space-y-3 p-4">
        {ctxError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{ctxError}</div>
        ) : !ctx ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {!ctx.warehouse_id && (
              <div className="rounded-xl border border-border bg-muted p-3 text-xs text-muted-foreground">
                لا يوجد مستودع مربوط بفرعك، فلا يمكن إرسال الكميات. تعديل الاسم والسعر متاح.
              </div>
            )}
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); lookup(code); }}>
              <Input ref={codeRef} autoFocus inputMode="numeric" placeholder="امسح أو اكتب الباركود" value={code} onChange={(e) => setCode(e.target.value)} className="h-12 text-base" />
              <Button type="button" size="icon" className="h-12 w-12 shrink-0" onClick={() => setScanOpen(true)} aria-label="فتح الكاميرا"><Camera className="h-5 w-5" /></Button>
            </form>

            {looking && <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin" /></div>}

            {!product && !looking && (
              <button type="button" onClick={() => setScanOpen(true)}
                className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-8 text-center transition active:scale-[0.98]">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><ScanLine className="h-8 w-8" /></span>
                <span className="font-bold text-foreground">اضغط لفتح الماسح</span>
                <span className="text-xs text-muted-foreground">باركود أو QR — بالكاميرا</span>
              </button>
            )}

            {product && (
              <Card className="rounded-2xl">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><PackageSearch className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-foreground">{product.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{product.barcode ?? "—"}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center text-sm">
                    <div className="rounded-lg bg-muted p-2"><div className="text-xs text-muted-foreground">سعر البيع الحالي</div><div className="font-bold">{Number(product.sell_price ?? 0).toFixed(2)}</div></div>
                    <div className="rounded-lg bg-muted p-2"><div className="text-xs text-muted-foreground">الكمية بالنظام</div><div className="font-bold">{Number(product.system_qty).toLocaleString("en")} {product.unit ?? ""}</div></div>
                  </div>
                  {product.pending_qty !== null && (
                    <div className="text-xs text-muted-foreground">يوجد عدّ سابق بانتظار المراجعة: {product.pending_qty} — العدّ الجديد يستبدله.</div>
                  )}
                  <div className="space-y-2">
                    <div><Label>اسم جديد (اختياري)</Label><Input value={name} placeholder={product.name} onChange={(e) => setName(e.target.value)} /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>سعر بيع جديد</Label><Input inputMode="decimal" value={price} placeholder="اختياري" onChange={(e) => setPrice(e.target.value)} /></div>
                      <div><Label>الكمية المعدودة</Label><Input inputMode="decimal" value={qty} disabled={!ctx.warehouse_id} placeholder="اختياري" onChange={(e) => setQty(e.target.value)} /></div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">الاسم والسعر يتغيّران فورًا في كل الفروع. الكمية تُراجع قبل اعتمادها.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setProduct(null)}>إلغاء</Button>
                    <Button className="flex-1" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ</Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
      <POSBarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onScan={(c) => { setScanOpen(false); lookup(c); }} />
    </div>
  );
}
