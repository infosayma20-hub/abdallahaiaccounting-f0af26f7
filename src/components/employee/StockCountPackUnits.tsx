import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Pencil, Plus, ScanLine, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { normalizeBarcode } from "@/lib/barcode";
import type { PackUnit } from "@/lib/inventory/pack-units";

type Row = PackUnit & { used?: boolean };
type Draft = { id: string | null; name: string; factor: string; price: string; barcode: string; used?: boolean };

/** وحدات التعبئة للصنف (كرتونة = 12 قطعة) بسعر وباركود خاص — الحفظ عبر RPC آمن مع سجل تعديلات. */
export default function StockCountPackUnits({ productId, baseUnit, scanned, onScanRequest, onLoaded }: {
  productId: string;
  baseUnit: string;
  scanned: string | null;
  onScanRequest: () => void;
  onLoaded?: (units: PackUnit[]) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await (supabase.rpc as any)("stock_count_pack_units", { p_product_id: productId });
    if (error) { toast.error(error.message); setRows([]); return; }
    const list = ((data as any[]) || []).map((r) => ({ ...r, factor: Number(r.factor), price: r.price === null ? null : Number(r.price) })) as Row[];
    setRows(list);
    onLoaded?.(list);
  }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setRows(null); setDraft(null); load(); }, [load]);
  useEffect(() => { if (scanned && draft) setDraft({ ...draft, barcode: scanned }); }, [scanned]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!draft || busy) return;
    const factor = Number(draft.factor), price = Number(draft.price);
    if (!draft.name.trim()) { toast.error("اكتب اسم الوحدة"); return; }
    if (!(factor > 1)) { toast.error(`اكتب كم ${baseUnit} داخل الوحدة (أكثر من 1)`); return; }
    if (draft.price.trim() === "" || !(price >= 0)) { toast.error("اكتب سعر بيع الوحدة"); return; }
    setBusy(true);
    const { error } = await (supabase.rpc as any)("stock_count_set_pack_unit", {
      p_product_id: productId, p_unit_id: draft.id, p_name: draft.name.trim(), p_factor: factor, p_price: price,
      p_barcode: normalizeBarcode(draft.barcode) || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(draft.id ? "تم تعديل الوحدة" : "تمت إضافة الوحدة");
    setDraft(null);
    await load();
  };

  if (rows === null) return <div className="text-xs text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin" /> الوحدات…</div>;

  return (
    <div className="space-y-1.5 border-b border-border pb-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">وحدات التعبئة</div>
        {!draft && <Button type="button" variant="ghost" size="sm" className="h-9 gap-1 px-2 text-xs" aria-label="إضافة وحدة"
          onClick={() => setDraft({ id: null, name: "", factor: "", price: "", barcode: "" })}><Plus className="h-4 w-4" />إضافة وحدة</Button>}
      </div>
      {rows.length === 0 && !draft && <div className="text-[11px] text-muted-foreground">لا توجد وحدات — مثال: كرتونة = 12 {baseUnit}</div>}
      {rows.map((r) => draft?.id === r.id ? null : (
        <div key={r.id} className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{r.name} <span className="text-xs font-normal text-muted-foreground">= {r.factor} {baseUnit} · {r.price ?? "-"}</span></div>
            <div className="break-all font-mono text-[11px] text-muted-foreground" dir="ltr">{r.barcode || "بدون باركود"}</div>
          </div>
          <Button type="button" variant="ghost" size="icon" disabled={!!draft || busy} aria-label={`تعديل الوحدة ${r.name}`}
            className="h-10 w-10 shrink-0 bg-muted text-muted-foreground"
            onClick={() => setDraft({ id: r.id, name: r.name, factor: String(r.factor), price: r.price === null ? "" : String(r.price), barcode: r.barcode || "", used: r.used })}>
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {draft && (
        <div className="space-y-1.5 rounded-lg bg-muted/50 p-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Input value={draft.name} disabled={busy || draft.used} aria-label="اسم الوحدة" placeholder="اسم الوحدة (كرتونة)" maxLength={80}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Input value={draft.factor} disabled={busy || draft.used} inputMode="decimal" aria-label="عدد القطع داخل الوحدة" placeholder={`كم ${baseUnit}؟`}
              onChange={(e) => setDraft({ ...draft, factor: e.target.value })} />
          </div>
          <Input value={draft.price} disabled={busy} inputMode="decimal" aria-label="سعر بيع الوحدة" placeholder="سعر بيع الوحدة"
            onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
          <div className="flex gap-1.5">
            <Input dir="ltr" inputMode="numeric" value={draft.barcode} disabled={busy} className="min-w-0 flex-1" aria-label="باركود الوحدة" placeholder="باركود الوحدة"
              onChange={(e) => setDraft({ ...draft, barcode: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }} />
            <Button type="button" variant="outline" size="icon" className="shrink-0" disabled={busy} onClick={onScanRequest} aria-label="مسح باركود الوحدة"><ScanLine className="h-4 w-4" /></Button>
          </div>
          {draft.used && <div className="text-[11px] text-muted-foreground">الوحدة مستخدمة بفواتير: يمكن تعديل السعر والباركود فقط.</div>}
          <div className="flex justify-end gap-1.5">
            <Button type="button" size="icon" onClick={save} disabled={busy} aria-label="حفظ الوحدة">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</Button>
            <Button type="button" variant="ghost" size="icon" disabled={busy} onClick={() => setDraft(null)} aria-label="إلغاء الوحدة"><X className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
