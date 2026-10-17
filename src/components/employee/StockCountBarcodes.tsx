import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Pencil, Plus, ScanLine, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { normalizeBarcode } from "@/lib/barcode";

type Code = { code: string; primary: boolean };

/** عرض باركودات الصنف وتعديلها من شاشة الجرد — الحفظ عبر RPC آمن مع سجل تعديلات. */
export default function StockCountBarcodes({ productId, onChanged, onScanRequest, scanned }: {
  productId: string;
  onChanged?: () => void;
  onScanRequest: () => void;
  scanned: string | null;
}) {
  const [codes, setCodes] = useState<Code[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // الكود القديم، "" = الصنف بدون باركود
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await (supabase.rpc as any)("stock_count_barcodes", { p_product_id: productId });
    if (error) { toast.error(error.message); setCodes([]); return; }
    setCodes((data as Code[]) || []);
  }, [productId]);

  useEffect(() => { setCodes(null); setEditing(null); load(); }, [load]);
  useEffect(() => { if (scanned && editing !== null) setValue(scanned); }, [scanned]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (busy || editing === null) return;
    const v = normalizeBarcode(value);
    if (!v) { toast.error("اكتب الباركود الجديد"); return; }
    setBusy(true);
    const { error } = await (supabase.rpc as any)("stock_count_set_barcode", { p_product_id: productId, p_old: editing || null, p_new: v });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing === "" ? "تمت إضافة الباركود للصنف" : "تم تعديل الباركود");
    setEditing(null);
    await load();
    onChanged?.();
  };

  if (codes === null) return <div className="text-xs text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin" /> الباركودات…</div>;

  const startEdit = (old: string) => { setEditing(old); setValue(old); };

  return (
    <div className="space-y-1.5 border-y border-border py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">الباركودات</div>
        {editing === null && <Button type="button" variant="ghost" size="sm" className="h-9 gap-1 px-2 text-xs" onClick={() => startEdit("")} aria-label="إضافة باركود للصنف"><Plus className="h-4 w-4" />إضافة</Button>}
      </div>
      {codes.map((c) => editing === c.code ? null : (
        <div key={c.code} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 break-all font-mono text-sm" dir="ltr">{c.code}</span>
          {c.primary && codes.length > 1 && <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">رئيسي</span>}
          <Button type="button" variant="ghost" size="icon" disabled={editing !== null || busy} onClick={() => startEdit(c.code)} aria-label="تعديل الباركود" title="تعديل الباركود"
            className="h-10 w-10 shrink-0 bg-muted text-muted-foreground">
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {editing !== null && (
        <div className="space-y-1">
          {editing && <div className="text-[11px] text-muted-foreground">القديم: <span className="font-mono" dir="ltr">{editing}</span></div>}
          <div className="flex gap-1.5">
            <Input autoFocus dir="ltr" inputMode="numeric" value={value} disabled={busy} className="min-w-0 flex-1" aria-label={editing === "" ? "باركود إضافي" : "الباركود الجديد"} onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }} placeholder={editing === "" ? "باركود إضافي" : "الباركود الجديد"} />
            <Button type="button" variant="outline" size="icon" className="shrink-0" disabled={busy} onClick={onScanRequest} aria-label="مسح بالكاميرا"><ScanLine className="h-4 w-4" /></Button>
          </div>
          <div className="flex justify-end gap-1.5">
            <Button type="button" size="icon" className="shrink-0" onClick={save} disabled={busy} aria-label="حفظ الباركود">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </Button>
            <Button type="button" variant="ghost" size="icon" className="shrink-0" disabled={busy} onClick={() => setEditing(null)} aria-label="إلغاء"><X className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
