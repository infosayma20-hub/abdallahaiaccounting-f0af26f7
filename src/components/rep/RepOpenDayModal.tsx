import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, Wallet } from "lucide-react";

interface Props {
  open: boolean;
  salesRepId: string;
  repCashBoxId: string | null;
  onOpened: () => void;
}

interface CashBoxOpt {
  id: string;
  name: string;
  gl_account_code: string | null;
  currency: string;
}

const CURRENCY_LABEL: Record<string, string> = { ILS: "شيكل", USD: "دولار", JOD: "دينار", EUR: "يورو" };

export default function RepOpenDayModal({ open, salesRepId, repCashBoxId, onOpened }: Props) {
  const [boxes, setBoxes] = useState<CashBoxOpt[]>([]);
  const [sourceBoxId, setSourceBoxId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [currency, setCurrency] = useState<string>("ILS");
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("cash_boxes")
        .select("id, name, gl_account_code, currency, is_active")
        .eq("is_active", true)
        .order("name");
      const filtered = (data || []).filter((b: any) => b.id !== repCashBoxId && b.gl_account_code);
      setBoxes(filtered);
      setLoading(false);
    })();
  }, [open, repCashBoxId]);

  const filteredBoxes = boxes.filter((b) => b.currency === currency);

  const handleSubmit = async () => {
    const amt = Number(amount);
    if (amt > 0 && !sourceBoxId) {
      toast({ title: "اختر الصندوق المصدر للعهدة", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).rpc("open_van_day_with_entry", {
        p_sales_rep_id: salesRepId,
        p_opening_cash: isFinite(amt) ? amt : 0,
        p_opening_currency: currency,
        p_source_cash_box_id: amt > 0 ? sourceBoxId : null,
        p_notes: notes || null,
        p_load_transfer_id: null,
      });
      if (error) throw error;
      toast({ title: "تم فتح اليوم بنجاح" });
      onOpened();
    } catch (e: any) {
      toast({ title: "تعذّر فتح اليوم", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => { /* obligatory */ }}>
      <DialogContent dir="rtl" className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            فتح يوم العمل
          </DialogTitle>
          <DialogDescription>
            أدخل قيمة العهدة الافتتاحية واختر الصندوق المصدر. ستفتح يومك تلقائياً.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>قيمة العهدة</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>العملة</Label>
              <Select value={currency} onValueChange={(v) => { setCurrency(v); setSourceBoxId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CURRENCY_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {Number(amount) > 0 && (
            <div className="space-y-1.5">
              <Label>تحويل من صندوق</Label>
              <Select value={sourceBoxId} onValueChange={setSourceBoxId} disabled={loading}>
                <SelectTrigger>
                  <SelectValue placeholder={loading ? "جاري التحميل..." : "اختر الصندوق المصدر"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredBoxes.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">لا يوجد صناديق بهذه العملة</div>
                  ) : filteredBoxes.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>ملاحظات (اختياري)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="..." />
          </div>

          <div className="text-[11px] text-muted-foreground bg-muted/30 rounded-md p-2">
            القيد المحاسبي: <strong>مدين</strong> صندوق المندوب / <strong>دائن</strong> الصندوق المصدر
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button onClick={handleSubmit} disabled={submitting} className="min-w-[120px]">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "فتح اليوم"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}