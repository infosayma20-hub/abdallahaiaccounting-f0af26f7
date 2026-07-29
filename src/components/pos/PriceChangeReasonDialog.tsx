import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tag, AlertTriangle } from "lucide-react";

const QUICK_REASONS = [
  "موافقة مدير الفرع",
  "عرض / حملة تسويقية",
  "زبون دائم",
  "تعويض عن شكوى",
  "خطأ في السعر المسجّل",
];

interface Props {
  open: boolean;
  productName: string;
  originalPrice: number;
  newPrice: number;
  qty: number;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

const PriceChangeReasonDialog = ({
  open, productName, originalPrice, newPrice, qty, onCancel, onConfirm,
}: Props) => {
  const [reason, setReason] = useState("");

  useEffect(() => { if (open) setReason(""); }, [open]);

  const diff = (newPrice - originalPrice) * qty;

  const confirm = () => {
    const r = reason.trim();
    if (r.length < 3) return;
    onConfirm(r);
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Tag className="w-4 h-4 text-primary" />
            سبب تعديل سعر الصنف
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5">
            <p className="text-sm font-medium text-foreground">{productName}</p>
            <div className="flex items-center gap-3 text-[13px] font-mono tabular-nums">
              <span className="text-muted-foreground line-through">₪{originalPrice.toFixed(2)}</span>
              <span className="text-foreground">←</span>
              <span className="font-semibold text-primary">₪{newPrice.toFixed(2)}</span>
              <span className="text-muted-foreground">× {qty}</span>
            </div>
            <p className={`text-[12px] font-medium ${diff < 0 ? "text-destructive" : "text-emerald-600"}`}>
              الفرق: {diff > 0 ? "+" : ""}{diff.toFixed(2)} ₪
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {QUICK_REASONS.map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                  reason === r
                    ? "bg-primary/10 border-primary/40 text-primary"
                    : "bg-muted border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <Input
            autoFocus
            value={reason}
            onChange={e => setReason(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") confirm(); }}
            placeholder="اكتب سبب التعديل (إلزامي)"
          />

          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            سيتم تسجيل اسمك ووقت التعديل والسبب في سجل تعديلات الأسعار الذي تراجعه الإدارة.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>إلغاء وإرجاع السعر</Button>
          <Button onClick={confirm} disabled={reason.trim().length < 3}>تأكيد التعديل</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PriceChangeReasonDialog;
