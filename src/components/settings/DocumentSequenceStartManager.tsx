import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Hash } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useAuth } from "@/hooks/useAuth";

type DocTypeDef = { key: string; label: string; sample: (year: number, n: number) => string };

const DOC_TYPES: DocTypeDef[] = [
  { key: "delivery_note", label: "الإرساليات", sample: (y, n) => `DN-${y}-${String(n).padStart(4, "0")}` },
  { key: "stock_transfer", label: "التحويلات المخزنية", sample: (y, n) => `${y}-${String(n).padStart(4, "0")}` },
  { key: "receipt_voucher", label: "سندات القبض", sample: (y, n) => `${y}-${String(n).padStart(4, "0")}` },
  { key: "payment_voucher", label: "سندات الصرف", sample: (y, n) => `${y}-${String(n).padStart(4, "0")}` },
  { key: "journal_voucher", label: "سندات القيد", sample: (y, n) => `${y}-${String(n).padStart(4, "0")}` },
];

const DocumentSequenceStartManager = () => {
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const ownerId = dataOwnerId || user?.id || null;

  const currentYear = new Date().getFullYear();
  const [docType, setDocType] = useState<string>("delivery_note");
  const [year, setYear] = useState<number>(currentYear);
  const [nextNumber, setNextNumber] = useState<number | null>(null);
  const [value, setValue] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const def = DOC_TYPES.find(d => d.key === docType) || DOC_TYPES[0];

  const loadNext = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("get_document_sequence_next", {
        p_user_id: ownerId,
        p_doc_type: docType,
        p_year: year,
      });
      if (error) throw error;
      const n = Number(data) || 1;
      setNextNumber(n);
      setValue(String(n));
    } catch (e: any) {
      setNextNumber(null);
      toast.error(e?.message || "تعذّر قراءة الرقم الحالي");
    } finally {
      setLoading(false);
    }
  }, [ownerId, docType, year]);

  useEffect(() => { loadNext(); }, [loadNext]);

  const handleSave = async () => {
    const n = parseInt(value, 10);
    if (!ownerId || !Number.isFinite(n) || n < 1) { toast.error("أدخل رقم بداية صحيح"); return; }
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("set_document_sequence_start", {
        p_user_id: ownerId,
        p_doc_type: docType,
        p_year: year,
        p_next_number: n,
      });
      if (error) throw error;
      toast.success(`سيبدأ الترقيم من ${def.sample(year, Number(data) || n)}`);
      await loadNext();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر حفظ رقم البداية");
    } finally {
      setSaving(false);
    }
  };

  const previewNumber = parseInt(value, 10);

  return (
    <div>
      <h3 className="text-base font-semibold text-foreground mb-1 flex items-center gap-2">
        <span className="w-1 h-5 bg-primary rounded-full" />
        رقم بداية الترقيم
      </h3>
      <p className="text-[11px] text-muted-foreground mb-4">
        حدّد الرقم الذي يبدأ منه المستند القادم، ويكمل النظام التسلسل تلقائياً بعده. لا يمكن اختيار رقم مستخدم مسبقاً، ولا تتأثر المستندات القديمة.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div className="space-y-2">
          <Label>نوع المستند</Label>
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DOC_TYPES.map(d => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>السنة</Label>
          <Select value={String(year)} onValueChange={v => setYear(parseInt(v, 10))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[currentYear, currentYear + 1].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>الرقم القادم</Label>
          <Input
            type="number"
            min={1}
            dir="ltr"
            value={value}
            onChange={e => setValue(e.target.value)}
            disabled={loading}
          />
        </div>

        <Button onClick={handleSave} disabled={saving || loading || !ownerId}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hash className="h-4 w-4" />}
          حفظ رقم البداية
        </Button>
      </div>

      <div className="mt-3 text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          الرقم الحالي المتوقع:{" "}
          <span className="font-mono" dir="ltr">
            {loading ? "…" : nextNumber ? def.sample(year, nextNumber) : "—"}
          </span>
        </span>
        {Number.isFinite(previewNumber) && previewNumber > 0 && (
          <span>
            بعد الحفظ:{" "}
            <span className="font-mono text-foreground" dir="ltr">{def.sample(year, previewNumber)}</span>
          </span>
        )}
      </div>
    </div>
  );
};

export default DocumentSequenceStartManager;
