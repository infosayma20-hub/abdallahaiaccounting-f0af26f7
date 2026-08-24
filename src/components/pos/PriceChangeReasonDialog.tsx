import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tag } from "lucide-react";

/** أسباب تعديل السعر المعتمدة (الملكي). اختيار السبب = تأكيد فوري. */
const REASONS = [
  "فرقية سعر التطبيقات",
  "تغير قطع البروست",
  "تغير نوع البيتزا في العروض",
  "التعويض",
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
  const diff = (newPrice - originalPrice) * qty;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-[320px] p-4 gap-3" dir="rtl">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-1.5 text-[14px]">
            <Tag className="w-4 h-4 text-primary" />
            سبب تعديل السعر
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-md bg-muted/50 px-2.5 py-2">
          <p className="text-[12px] font-medium truncate">{productName}</p>
          <div className="flex items-center gap-2 text-[12px] font-mono tabular-nums mt-0.5">
            <span className="text-muted-foreground line-through">₪{originalPrice.toFixed(2)}</span>
            <span>←</span>
            <span className="font-semibold text-primary">₪{newPrice.toFixed(2)}</span>
            <span className={`ms-auto font-medium ${diff < 0 ? "text-destructive" : "text-emerald-600"}`}>
              {diff > 0 ? "+" : ""}{diff.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="grid gap-1.5">
          {REASONS.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => onConfirm(r)}
              className="w-full text-right text-[13px] px-3 py-2.5 rounded-md border border-border bg-card hover:bg-primary/10 hover:border-primary/40 active:scale-[0.99] transition-all"
            >
              {r}
            </button>
          ))}
        </div>

        <Button variant="ghost" size="sm" className="h-8 text-[12px]" onClick={onCancel}>
          إلغاء وإرجاع السعر
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default PriceChangeReasonDialog;
