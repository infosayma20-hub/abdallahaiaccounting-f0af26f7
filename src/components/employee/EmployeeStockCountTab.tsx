import { useEffect, useRef, useState } from "react";
import { Camera, ClipboardPaste, Copy, ImagePlus, Loader2, PackageSearch, Plus, Save, ScanLine, TriangleAlert, X } from "lucide-react";
import { compressProductImage, uploadProductImage } from "@/lib/productImage";
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
type Product = { id: string; name: string; sell_price: number | null; barcode: string | null; unit: string | null; image_url: string | null; system_qty: number; pending_qty: number | null };

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
  // تعريف صنف جديد
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [extraCode, setExtraCode] = useState("");
  const [newImg, setNewImg] = useState<{ blob: Blob; preview: string } | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [scanTarget, setScanTarget] = useState<"lookup" | "extra">("lookup");
  const newFileRef = useRef<HTMLInputElement>(null);
  const editFileRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const resetNew = (c: string | null) => {
    setUnknownCode(c); setUnknownNote(""); setNewName(""); setNewPrice(""); setNewQty("");
    setNewCodes(c ? [c] : []); setExtraCode(""); setNewImg(null);
  };

  const prepImage = async (f: File) => {
    setImgBusy(true);
    try { const blob = await compressProductImage(f); return { blob, preview: URL.createObjectURL(blob) }; }
    catch (e: any) { toast.error(e?.message || "تعذّر قراءة الصورة"); return null; }
    finally { setImgBusy(false); }
  };

  const addCode = (raw: string) => {
    const c = normalizeBarcode(raw);
    if (!c) return;
    if (newCodes.includes(c)) { toast.message("الباركود مضاف مسبقًا"); return; }
    setNewCodes((p) => [...p, c]); setExtraCode("");
  };

  const createProduct = async () => {
    const n = newName.trim();
    const pr = Number(newPrice);
    const q = newQty.trim() === "" ? null : Number(newQty);
    if (!n) { toast.error("اكتب اسم الصنف"); return; }
    if (newPrice.trim() === "" || !isFinite(pr) || pr < 0) { toast.error("أدخل سعر بيع صحيح"); return; }
    if (q !== null && (!isFinite(q) || q < 0)) { toast.error("أدخل كمية صحيحة"); return; }
    setCreating(true);
    try {
      const image = newImg ? await uploadProductImage(newImg.blob) : null;
      const { error } = await supabase.rpc("stock_count_create_product", {
        p_name: n, p_sell_price: pr, p_barcodes: newCodes, p_image_url: image as any, p_counted_qty: q as any,
      });
      if (error) throw error;
      toast.success(q !== null ? "عُرّف الصنف — الكمية أُرسلت للمراجعة" : "عُرّف الصنف وصار يظهر في نقطة البيع");
      resetNew(null); setCode("");
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (e: any) { toast.error(e?.message || "تعذّر تعريف الصنف"); }
    finally { setCreating(false); }
  };

  const changeImage = async (f: File) => {
    if (!product) return;
    const img = await prepImage(f);
    if (!img) return;
    setImgBusy(true);
    try {
      const url = await uploadProductImage(img.blob);
      const { error } = await supabase.rpc("stock_count_set_image", { p_product_id: product.id, p_image_url: url });
      if (error) throw error;
      toast.success("حُفظت صورة الصنف");
    } catch (e: any) { toast.error(e?.message || "تعذّر حفظ الصورة"); }
    finally { setImgBusy(false); }
  };

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
    if (!data) { setProduct(null); resetNew(c); setCode(""); return; }
    resetNew(null);
    const p = data as any as Product;
    setProduct(p);
    setName("");
    setPrice("");
    setQty("");
    setCode("");
  };

  const reportUnknown = async () => {
    if (!unknownCode) return;
    setReporting(true);
    const { error } = await (supabase.rpc as any)("stock_count_report_unknown", { p_code: unknownCode, p_note: newName.trim() || unknownNote.trim() || null });
    setReporting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("سُجّل الباركود — سيظهر للإدارة في مراجعة الجرد");
    resetNew(null);
    setTimeout(() => codeRef.current?.focus(), 50);
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
              <Button type="button" size="icon" className="h-12 w-12 shrink-0" onClick={() => { setScanTarget("lookup"); setScanOpen(true); }} aria-label="فتح الكاميرا"><Camera className="h-5 w-5" /></Button>
            </form>

            {looking && <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin" /></div>}

            {unknownCode && !product && (
              <Card className="rounded-2xl border-amber-500/40">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600"><TriangleAlert className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-foreground">صنف غير معرّف — عرّفه الآن</div>
                      <div className="font-mono text-xs text-muted-foreground">{unknownCode}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => newFileRef.current?.click()}
                      className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-primary/40 bg-primary/5">
                      {imgBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : newImg ? <img src={newImg.preview} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-7 w-7 text-primary" />}
                    </button>
                    <div className="text-xs text-muted-foreground">صورة الصنف بالكاميرا (اختياري)<br />تُصغَّر تلقائيًا{newImg ? ` · ${Math.round(newImg.blob.size / 1024)}KB` : ""}</div>
                    <input ref={newFileRef} type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setNewImg(await prepImage(f)); }} />
                  </div>
                  <div><Label>اسم الصنف *</Label><Input value={newName} placeholder="مثال: حليب مبخّر 410غ" onChange={(e) => setNewName(e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>سعر البيع *</Label><Input inputMode="decimal" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} /></div>
                    <div><Label>الكمية المعدودة</Label><Input inputMode="decimal" value={newQty} disabled={!ctx.warehouse_id} placeholder="اختياري" onChange={(e) => setNewQty(e.target.value)} /></div>
                  </div>
                  <div className="space-y-2">
                    <Label>الباركودات</Label>
                    {newCodes.map((c, i) => (
                      <div key={c} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                        <span className="flex-1 font-mono text-sm">{c}</span>
                        {i > 0 && <button type="button" aria-label="حذف" onClick={() => setNewCodes(newCodes.filter((x) => x !== c))}><X className="h-4 w-4 text-muted-foreground" /></button>}
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Input inputMode="numeric" value={extraCode} placeholder="باركود إضافي" onChange={(e) => setExtraCode(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCode(extraCode); } }} />
                      <Button type="button" variant="outline" size="icon" onClick={() => addCode(extraCode)} aria-label="إضافة"><Plus className="h-4 w-4" /></Button>
                      <Button type="button" variant="outline" size="icon" onClick={() => { setScanTarget("extra"); setScanOpen(true); }} aria-label="مسح باركود إضافي"><Camera className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">الصنف يُضاف فورًا ويظهر في نقطة البيع بالاسم والسعر والصورة. الكمية تُراجع قبل اعتمادها.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={reportUnknown} disabled={reporting || creating}>{reporting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}تأجيل للإدارة</Button>
                    <Button className="flex-1" onClick={createProduct} disabled={creating || imgBusy}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}تعريف الصنف</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {!product && !looking && !unknownCode && (
              <button type="button" onClick={() => { setScanTarget("lookup"); setScanOpen(true); }}
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
                    <button type="button" onClick={() => editFileRef.current?.click()} aria-label="صورة الصنف" title={product.image_url ? "تغيير صورة الصنف" : "التقاط صورة للصنف"}
                      className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-primary/40 bg-primary/5">
                      {imgBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : product.image_url ? (
                        <img src={product.image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex flex-col items-center gap-1 text-primary"><ImagePlus className="h-6 w-6" /><span className="text-[10px]">صورة</span></span>
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1 truncate font-bold text-foreground">{product.name}</div>
                        <button type="button" onClick={() => nameInputRef.current?.focus()} aria-label="تعديل الاسم" title="تعديل الاسم"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition active:scale-95">
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
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
                    <div><Label>اسم جديد (اختياري)</Label><Input ref={nameInputRef} value={name} placeholder={product.name} onChange={(e) => setName(e.target.value)} /></div>
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
      <input ref={editFileRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) changeImage(f); }} />
      <POSBarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onScan={(c) => { setScanOpen(false); if (scanTarget === "extra") addCode(c); else lookup(c); }} />
    </div>
  );
}
