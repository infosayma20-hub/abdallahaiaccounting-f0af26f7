/**
 * ScalesPage — الموازين الإلكترونية (/pos/scales)
 * تصميم يونيفاي بنمط Dynamics Finance: شريط أوامر + قائمة + تبويبات تفاصيل.
 * سعر الكيلو مصدره الوحيد سعر البيع للصنف (products.sell_price).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FinanceShell } from "@/components/finance/shell";
import type { ActionTab } from "@/components/finance/shell";
import {
  Plus, Save, Upload, RefreshCw, Wifi, Search, Scale, Trash2, Loader2, ListPlus, Radar,
} from "lucide-react";
import { buildSampleScaleBarcode } from "@/lib/scale-barcode";
import { scaleDiscover, scaleExport, scalePing } from "@/lib/scale-bridge";

interface ScaleRow {
  id?: string; name: string; branch_id: string | null; model: string; ip_address: string | null; port: number;
  barcode_prefix: string; plu_digits: number; value_mode: string; value_decimals: number; is_active: boolean;
  last_export_at?: string | null; last_status?: string | null;
}
interface ItemRow { id?: string; product_id: string; plu: number; key_no: number | null; shelf_life_days: number;
  name: string; barcode: string | null; unit: string; price: number; dirtyPrice?: boolean; dirty?: boolean; }
interface Branch { id: string; name: string }

const emptyScale = (): ScaleRow => ({ name: "ميزان جديد", branch_id: null, model: "RLS1100", ip_address: "", port: 5001,
  barcode_prefix: "20", plu_digits: 5, value_mode: "weight", value_decimals: 3, is_active: true });

export default function ScalesPage() {
  const { dataOwnerId } = useDataOwnerId() as any;
  const [scales, setScales] = useState<ScaleRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [current, setCurrent] = useState<ScaleRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [addQ, setAddQ] = useState("");
  const [addResults, setAddResults] = useState<any[]>([]);
  // product_id -> Set(business_unit_id) لكل أصناف المنشأة؛ null = لا قيود (فرع بدون نشاط)
  const [unitMap, setUnitMap] = useState<Map<string, Set<string>> | null>(null);

  const loadScales = useCallback(async () => {
    if (!dataOwnerId) return;
    const [{ data: s }, { data: b }] = await Promise.all([
      (supabase as any).from("pos_scales").select("*").eq("user_id", dataOwnerId).order("created_at"),
      supabase.from("branches").select("id,name").eq("user_id", dataOwnerId).order("name"),
    ]);
    setScales(s || []); setBranches((b as any) || []);
    setCurrent((c) => c?.id ? (s || []).find((x: any) => x.id === c.id) || c : c ?? (s?.[0] || null));
  }, [dataOwnerId]);

  const loadItems = useCallback(async (scaleId?: string) => {
    if (!scaleId) { setItems([]); return; }
    const { data } = await (supabase as any).from("pos_scale_items")
      .select("id,product_id,plu,key_no,shelf_life_days,products(name,barcode,unit,sell_price)")
      .eq("scale_id", scaleId).order("plu");
    setItems((data || []).map((r: any) => ({ id: r.id, product_id: r.product_id, plu: r.plu, key_no: r.key_no,
      shelf_life_days: r.shelf_life_days, name: r.products?.name || "", barcode: r.products?.barcode || null,
      unit: r.products?.unit || "", price: Number(r.products?.sell_price || 0) })));
  }, []);

  useEffect(() => { loadScales(); }, [loadScales]);
  useEffect(() => { loadItems(current?.id); }, [current?.id, loadItems]);

  const set = (patch: Partial<ScaleRow>) => setCurrent((c) => (c ? { ...c, ...patch } : c));
  const sample = useMemo(() => current ? buildSampleScaleBarcode(current as any, items[0]?.plu || 170, current.value_mode === "price" ? 12.5 : 1.25) : null, [current, items]);

  const save = async () => {
    if (!current || !dataOwnerId) return;
    const pre = current.barcode_prefix.trim();
    if (!/^\d{1,3}$/.test(pre)) return toast.error("البادئة لازم تكون من 1 إلى 3 أرقام");
    if (12 - pre.length - current.plu_digits < 3) return toast.error("عدد خانات رقم الصنف كبير على صيغة الباركود");
    setBusy("save");
    try {
      const { id, last_export_at, last_status, ...payload } = current as any;
      const row = { ...payload, barcode_prefix: pre, user_id: dataOwnerId };
      const res = id
        ? await (supabase as any).from("pos_scales").update(row).eq("id", id).select("*").single()
        : await (supabase as any).from("pos_scales").insert(row).select("*").single();
      if (res.error) throw res.error;
      const scaleId = res.data.id;
      // حفظ أصناف الميزان المعدّلة + الأسعار (سعر البيع للصنف)
      const dirty = items.filter((i) => i.dirty || !i.id);
      const plus = new Set<number>();
      for (const i of items) { if (plus.has(i.plu)) throw new Error(`رقم الصنف ${i.plu} مكرر`); plus.add(i.plu); }
      if (dirty.length) {
        const up = await (supabase as any).from("pos_scale_items").upsert(dirty.map((i) => ({
          ...(i.id ? { id: i.id } : {}), user_id: dataOwnerId, scale_id: scaleId, product_id: i.product_id,
          plu: i.plu, key_no: i.key_no, shelf_life_days: i.shelf_life_days })));
        if (up.error) throw up.error;
      }
      for (const i of items.filter((x) => x.dirtyPrice)) {
        const { error } = await supabase.from("products").update({ sell_price: i.price } as any).eq("id", i.product_id);
        if (error) throw error;
      }
      toast.success("تم الحفظ");
      setCurrent(res.data); await loadScales(); await loadItems(scaleId);
    } catch (e: any) { toast.error(e.message || "تعذّر الحفظ"); }
    finally { setBusy(null); }
  };

  const remove = async () => {
    if (!current?.id || !confirm(`حذف الميزان «${current.name}»؟ (الأصناف نفسها لا تُحذف)`)) return;
    const { error } = await (supabase as any).from("pos_scales").delete().eq("id", current.id);
    if (error) return toast.error(error.message);
    setCurrent(null); loadScales();
  };

  const nextPlu = () => items.reduce((m, i) => Math.max(m, i.plu), 0) + 1;

  const addAllWeighted = async () => {
    if (!dataOwnerId) return;
    const { data } = await supabase.from("products").select("id,name,barcode,unit,sell_price")
      .eq("user_id", dataOwnerId).in("unit", ["كيلو", "كغ", "kg", "KG"]).order("name");
    const have = new Set(items.map((i) => i.product_id));
    let p = nextPlu();
    const add = ((data as any[]) || []).filter((r) => !have.has(r.id)).map((r) => ({
      product_id: r.id, plu: p++, key_no: null, shelf_life_days: 0, name: r.name, barcode: r.barcode,
      unit: r.unit, price: Number(r.sell_price || 0), dirty: true }));
    setItems((x) => [...x, ...add]);
    toast.success(`انضاف ${add.length} صنف — اكبس حفظ`);
  };

  useEffect(() => {
    if (!dataOwnerId || addQ.trim().length < 2) { setAddResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("products").select("id,name,barcode,unit,sell_price")
        .eq("user_id", dataOwnerId).or(`name.ilike.%${addQ.trim()}%,barcode.eq.${addQ.trim()}`).limit(8);
      setAddResults((data as any) || []);
    }, 300);
    return () => clearTimeout(t);
  }, [addQ, dataOwnerId]);

  const addOne = (r: any) => {
    if (items.some((i) => i.product_id === r.id)) return toast.info("الصنف موجود بالميزان");
    setItems((x) => [...x, { product_id: r.id, plu: nextPlu(), key_no: null, shelf_life_days: 0, name: r.name,
      barcode: r.barcode, unit: r.unit, price: Number(r.sell_price || 0), dirty: true }]);
    setAddQ(""); setAddResults([]);
  };

  const removeItem = async (i: ItemRow) => {
    if (i.id) { const { error } = await (supabase as any).from("pos_scale_items").delete().eq("id", i.id); if (error) return toast.error(error.message); }
    setItems((x) => x.filter((y) => y !== i));
  };

  const patchItem = (idx: number, patch: Partial<ItemRow>) =>
    setItems((x) => x.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const log = async (action: string, status: string, count: number, message?: string) => {
    if (!current?.id || !dataOwnerId) return;
    await (supabase as any).from("pos_scale_sync_log").insert({ user_id: dataOwnerId, scale_id: current.id, action, status, items_count: count, message });
  };

  const ping = async () => {
    if (!current?.ip_address) return toast.error("أدخل عنوان الميزان");
    setBusy("ping");
    try { const r = await scalePing(current.ip_address, current.port); toast.success(`الميزان متصل (${r.elapsedMs}ms)`); await log("ping", "ok", 0); }
    catch (e: any) { toast.error(e.message); await log("ping", "error", 0, e.message); }
    finally { setBusy(null); }
  };

  const discover = async () => {
    setBusy("discover");
    try {
      const r = await scaleDiscover(current?.port || 5001);
      if (!r.found.length) toast.info("ما لقينا موازين على الشبكة");
      else { toast.success(`لقينا: ${r.found.map((f) => f.ip).join("، ")}`); if (current && !current.ip_address) set({ ip_address: r.found[0].ip }); }
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const exportToScale = async () => {
    if (!current?.id) return toast.error("احفظ الميزان أولًا");
    if (items.some((i) => i.dirty || i.dirtyPrice || !i.id)) return toast.error("في تعديلات غير محفوظة — اكبس حفظ أولًا");
    if (!current.ip_address) return toast.error("أدخل عنوان الميزان");
    setBusy("export");
    try {
      const r = await scaleExport(current.ip_address, current.port, current.model, items.map((i) => ({
        plu: i.plu, key_no: i.key_no, name: i.name, price: i.price, unit: i.unit, shelf_life_days: i.shelf_life_days, barcode: i.barcode })));
      await (supabase as any).from("pos_scales").update({ last_export_at: new Date().toISOString(), last_status: "ok" }).eq("id", current.id);
      await log("export", "ok", r.sent, r.message);
      toast.success(r.message || `تم إرسال ${r.sent} صنف للميزان`);
      loadScales();
    } catch (e: any) {
      await (supabase as any).from("pos_scales").update({ last_status: "error" }).eq("id", current.id);
      await log("export", "error", items.length, e.message); toast.error(e.message);
    } finally { setBusy(null); }
  };

  const refreshPrices = () => loadItems(current?.id).then(() => toast.success("تم تحديث الأسعار من الأصناف"));

  const shown = items.map((r, idx) => ({ r, idx })).filter(({ r }) => !q || r.name.includes(q) || String(r.plu) === q || r.barcode === q);
  const actionTabs: ActionTab[] = [{
    key: "general",
    label: "عام",
    groups: [
      { key: "new", label: "جديد", items: [
        { key: "new-scale", label: "ميزان جديد", icon: Plus, variant: "primary", disabled: !!busy, onClick: () => { setCurrent(emptyScale()); setItems([]); } },
      ]},
      { key: "record", label: "السجل", items: [
        { key: "save", label: busy === "save" ? "جاري الحفظ…" : "حفظ", icon: Save, disabled: !!busy || !current, onClick: save },
        { key: "delete", label: "حذف", icon: Trash2, variant: "danger", disabled: !!busy || !current?.id, onClick: remove },
      ]},
      { key: "scale", label: "الميزان", items: [
        { key: "export", label: busy === "export" ? "جاري التصدير…" : "تصدير للميزان", icon: Upload, disabled: !!busy || !current?.id, onClick: exportToScale },
        { key: "prices", label: "تحديث الأسعار", icon: RefreshCw, disabled: !!busy || !current?.id, onClick: refreshPrices },
        { key: "ping", label: busy === "ping" ? "جاري الفحص…" : "فحص الاتصال", icon: Wifi, disabled: !!busy || !current, onClick: ping },
        { key: "discover", label: busy === "discover" ? "جاري البحث…" : "بحث عن موازين", icon: Radar, disabled: !!busy, onClick: discover },
      ]},
    ],
  }];

  return (
    <FinanceShell
      title={current ? current.name : "الموازين الإلكترونية"}
      breadcrumb={[{ label: "نقطة البيع", href: "/pos" }, { label: "الموازين الإلكترونية" }]}
      actionTabs={actionTabs}
      rightSlot={busy ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : undefined}
    >
      <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
        {/* القائمة */}
        <div className="rounded-md border bg-background">
          <div className="border-b px-3 py-2 text-xs font-semibold text-muted-foreground">الموازين ({scales.length})</div>
          {scales.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">لا يوجد موازين — اكبس «جديد»</div>}
          {scales.map((s) => (
            <button key={s.id} onClick={() => setCurrent(s)}
              className={`flex w-full items-center gap-2 border-b px-3 py-2 text-right text-sm last:border-0 hover:bg-muted/50 ${current?.id === s.id ? "border-r-2 border-r-primary bg-primary/5" : ""}`}>
              <Scale className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{s.name}</div>
                <div className="truncate text-[11px] text-muted-foreground" dir="ltr">{s.ip_address || "—"} · {s.model}</div>
              </div>
              {s.last_status && <Badge variant={s.last_status === "ok" ? "secondary" : "destructive"} className="text-[10px]">{s.last_status === "ok" ? "متصل" : "خطأ"}</Badge>}
            </button>
          ))}
        </div>

        {/* التفاصيل */}
        {current ? (
          <div className="rounded-md border bg-background p-3">
            <Tabs defaultValue="general" dir="rtl">
              <TabsList className="h-8">
                <TabsTrigger value="general" className="text-xs">عام</TabsTrigger>
                <TabsTrigger value="barcode" className="text-xs">صيغة الباركود</TabsTrigger>
                <TabsTrigger value="items" className="text-xs">أصناف الميزان ({items.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="grid gap-3 pt-3 sm:grid-cols-2 lg:grid-cols-3">
                <F label="الاسم"><Input value={current.name} onChange={(e) => set({ name: e.target.value })} /></F>
                <F label="الفرع">
                  <Select dir="rtl" value={current.branch_id || "none"} onValueChange={(v) => set({ branch_id: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">بدون فرع</SelectItem>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="الموديل"><Input value={current.model} onChange={(e) => set({ model: e.target.value })} /></F>
                <F label="عنوان الشبكة (IP)"><Input dir="ltr" placeholder="192.168.1.145" value={current.ip_address || ""} onChange={(e) => set({ ip_address: e.target.value.trim() })} /></F>
                <F label="المنفذ"><Input dir="ltr" type="number" value={current.port} onChange={(e) => set({ port: Number(e.target.value) || 5001 })} /></F>
                <F label="آخر تصدير"><div className="h-9 rounded-md border bg-muted/40 px-3 text-sm leading-9 text-muted-foreground">{current.last_export_at ? new Date(current.last_export_at).toLocaleString("ar") : "—"}</div></F>
              </TabsContent>

              <TabsContent value="barcode" className="pt-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <F label="البادئة"><Input dir="ltr" value={current.barcode_prefix} onChange={(e) => set({ barcode_prefix: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></F>
                  <F label="خانات رقم الصنف"><Input dir="ltr" type="number" min={3} max={6} value={current.plu_digits} onChange={(e) => set({ plu_digits: Number(e.target.value) || 5 })} /></F>
                  <F label="الباركود يحمل">
                    <Select dir="rtl" value={current.value_mode} onValueChange={(v) => set({ value_mode: v, value_decimals: v === "price" ? 2 : 3 })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="weight">الوزن (كغ)</SelectItem><SelectItem value="price">السعر (₪)</SelectItem></SelectContent>
                    </Select>
                  </F>
                  <F label="الخانات العشرية"><Input dir="ltr" type="number" min={0} max={3} value={current.value_decimals} onChange={(e) => set({ value_decimals: Number(e.target.value) })} /></F>
                </div>
                <div className="mt-4 rounded-md border bg-muted/30 p-3">
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">معاينة</div>
                  {sample ? (
                    <div className="text-sm">
                      <span dir="ltr" className="font-mono text-base tracking-wider">
                        <span className="text-primary">{current.barcode_prefix}</span>
                        <span className="font-bold">{sample.slice(current.barcode_prefix.length, current.barcode_prefix.length + current.plu_digits)}</span>
                        <span>{sample.slice(current.barcode_prefix.length + current.plu_digits, 12)}</span>
                        <span className="text-muted-foreground">{sample[12]}</span>
                      </span>
                      <div className="mt-1 text-xs text-muted-foreground">بادئة · رقم الصنف {items[0]?.plu || 170} · {current.value_mode === "price" ? "سعر 12.50 ₪" : "وزن 1.250 كغ"} · خانة تحقق</div>
                    </div>
                  ) : <div className="text-xs text-destructive">الصيغة غير صالحة: البادئة + رقم الصنف لازم يتركوا 3 خانات على الأقل للقيمة</div>}
                </div>
              </TabsContent>

              <TabsContent value="items" className="pt-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <div className="relative w-56">
                    <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input className="h-9 pr-8" placeholder="بحث بالجدول" value={q} onChange={(e) => setQ(e.target.value)} />
                  </div>
                  <div className="relative w-64">
                    <Input className="h-9" placeholder="إضافة صنف (اسم أو باركود)" value={addQ} onChange={(e) => setAddQ(e.target.value)} />
                    {addResults.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md">
                        {addResults.map((r) => (
                          <button key={r.id} onClick={() => addOne(r)} className="block w-full px-3 py-1.5 text-right text-sm hover:bg-muted">
                            {r.name} <span className="text-[11px] text-muted-foreground">· {r.unit}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="outline" className="h-9 gap-1" onClick={addAllWeighted}><ListPlus className="h-4 w-4" />إضافة جميع الأصناف بالكيلو</Button>
                </div>
                <div className="overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>{["رقم الصنف (PLU)", "مفتاح", "الصنف", "الباركود", "الوحدة", "السعر ₪", "صلاحية (يوم)", ""].map((h) => <th key={h} className="px-2 py-2 text-right font-medium">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {shown.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-xs text-muted-foreground">لا يوجد أصناف</td></tr>}
                      {shown.map(({ r, idx }) => (
                        <tr key={r.product_id} className={`border-t ${r.dirty || r.dirtyPrice ? "bg-accent/30" : ""}`}>
                          <td className="px-1 py-1"><Input dir="ltr" type="number" className="h-8 w-20" value={r.plu} onChange={(e) => patchItem(idx, { plu: Number(e.target.value), dirty: true })} /></td>
                          <td className="px-1 py-1"><Input dir="ltr" type="number" className="h-8 w-16" value={r.key_no ?? ""} onChange={(e) => patchItem(idx, { key_no: e.target.value ? Number(e.target.value) : null, dirty: true })} /></td>
                          <td className="px-2 py-1">{r.name}</td>
                          <td className="px-2 py-1 font-mono text-xs" dir="ltr">{r.barcode || "—"}</td>
                          <td className="px-2 py-1 text-xs">{r.unit}</td>
                          <td className="px-1 py-1"><Input dir="ltr" type="number" step="0.01" className="h-8 w-24" value={r.price} onChange={(e) => patchItem(idx, { price: Number(e.target.value), dirtyPrice: true })} /></td>
                          <td className="px-1 py-1"><Input dir="ltr" type="number" className="h-8 w-16" value={r.shelf_life_days} onChange={(e) => patchItem(idx, { shelf_life_days: Number(e.target.value) || 0, dirty: true })} /></td>
                          <td className="px-1 py-1"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeItem(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">السعر هنا هو نفسه سعر البيع للصنف بنقطة البيع — تعديله بيعدّل سعر الصنف بعد الحفظ.</p>
              </TabsContent>
            </Tabs>
          </div>
        ) : <div className="rounded-md border bg-background p-10 text-center text-sm text-muted-foreground">اختر ميزانًا أو اكبس «جديد»</div>}
      </div>
    </FinanceShell>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}
