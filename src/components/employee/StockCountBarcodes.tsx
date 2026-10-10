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
    const v = normalizeBarcode(value);
    if (!v) { toast.error("اكتب الباركود الجديد"); return; }
    setBusy(true);
    const { error } = await (supabase.rpc as any)("stock_count_set_barcode", { p_product_id: productId, p_old: editing || null, p_new: v });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم تعديل الباركود");
    setEditing(null);
    await load();
    onChanged?.();
  };

  if (codes === null) return <div className="text-xs text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin" /> الباركودات…</div>;

  const startEdit = (old: string) => { setEditing(old); setValue(old); };

  return (
    <div className="space-y-1.5 rounded-lg border border-border p-2">
      <div className="text-xs text-muted-foreground">الباركود</div>
      {codes.length === 0 && editing === null && (
        <button type="button" onClick={() => startEdit("")} className="flex items-center gap-1 text-xs text-primary">
          <Plus className="h-3 w-3" /> بدون باركود — إضافة باركود
        </button>
      )}
      {codes.map((c) => editing === c.code ? null : (
        <div key={c.code} className="flex items-center gap-2">
          <span className="flex-1 font-mono text-sm" dir="ltr">{c.code}</span>
          {c.primary && codes.length > 1 && <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">رئيسي</span>}
          <button type="button" onClick={() => startEdit(c.code)} aria-label="تعديل الباركود" title="تعديل الباركود"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground active:scale-95">
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      ))}
      {editing !== null && (
        <div className="space-y-1">
          {editing && <div className="text-[11px] text-muted-foreground">القديم: <span className="font-mono" dir="ltr">{editing}</span></div>}
          <div className="flex gap-1.5">
            <Input autoFocus dir="ltr" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }} placeholder="الباركود الجديد" />
            <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={onScanRequest} aria-label="مسح بالكاميرا"><ScanLine className="h-4 w-4" /></Button>
            <Button type="button" size="icon" className="shrink-0" onClick={save} disabled={busy} aria-label="حفظ الباركود">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </Button>
            <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => setEditing(null)} aria-label="إلغاء"><X className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
