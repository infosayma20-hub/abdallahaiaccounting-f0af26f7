import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, FileText } from "lucide-react";

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  subtotal: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  contactName: string;
  total: number;
  items: InvoiceItem[];
  currency: string;
}

interface CreditNoteModalProps {
  open: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  mode: "full" | "partial" | "correction";
  onConfirm: (data: {
    mode: "full" | "partial" | "correction";
    reason: string;
    customReason: string;
    selectedItems?: string[];
  }) => Promise<void>;
}

const REASONS = [
  { value: "price_error", label: "خطأ في السعر" },
  { value: "quantity_error", label: "خطأ في الكمية" },
  { value: "goods_return", label: "إرجاع بضاعة" },
  { value: "other", label: "سبب آخر" },
];

const CreditNoteModal = ({ open, onClose, invoice, mode, onConfirm }: CreditNoteModalProps) => {
  const [reason, setReason] = useState("price_error");
  const [customReason, setCustomReason] = useState("");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  if (!invoice) return null;

  const modeLabels = {
    full: "إشعار دائن — عكس كامل",
    partial: "إشعار دائن — عكس جزئي",
    correction: "فاتورة تصحيح",
  };

  const modeDescriptions = {
    full: "سيتم إنشاء إشعار دائن يعكس الفاتورة بالكامل",
    partial: "حدد البنود المراد عكسها من الفاتورة",
    correction: "سيتم عكس الفاتورة بالكامل وإنشاء فاتورة جديدة للتعديل",
  };

  const selectedTotal = mode === "partial"
    ? invoice.items.filter(i => selectedItems.includes(i.id)).reduce((s, i) => s + i.subtotal, 0)
    : invoice.total;

  const toggleItem = (id: string) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleConfirm = async () => {
    if (reason === "other" && !customReason.trim()) return;
    if (mode === "partial" && selectedItems.length === 0) return;
    setLoading(true);
    try {
      await onConfirm({ mode, reason, customReason, selectedItems: mode === "partial" ? selectedItems : undefined });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const fmtAmount = (n: number) => `₪${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {modeLabels[mode]}
          </DialogTitle>
          <DialogDescription>{modeDescriptions[mode]}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Invoice info */}
          <div className="rounded-xl bg-muted/40 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">الفاتورة:</span>
              <span className="font-bold font-mono">{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">المبلغ:</span>
              <span className="font-bold text-destructive">{fmtAmount(selectedTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">الزبون:</span>
              <span className="font-semibold">{invoice.contactName}</span>
            </div>
          </div>

          {/* Partial: item selection */}
          {mode === "partial" && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">حدد البنود المراد عكسها:</Label>
              <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl border border-border/50 p-3">
                {invoice.items.map(item => (
                  <label key={item.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 cursor-pointer transition-colors">
                    <Checkbox checked={selectedItems.includes(item.id)} onCheckedChange={() => toggleItem(item.id)} />
                    <span className="flex-1 text-sm">{item.description}</span>
                    <span className="text-sm font-semibold tabular-nums">{fmtAmount(item.subtotal)}</span>
                  </label>
                ))}
              </div>
              {selectedItems.length > 0 && (
                <div className="text-sm font-bold text-destructive text-left">
                  إجمالي العكس: {fmtAmount(selectedTotal)}
                </div>
              )}
            </div>
          )}

          {/* Journal entry preview */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-primary">القيد المحاسبي الذي سيُنشأ تلقائياً:</p>
            <div className="flex justify-between text-xs">
              <span>مدين: ح/المبيعات</span>
              <span className="font-bold tabular-nums">{fmtAmount(selectedTotal)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>دائن: ح/ذمم عملاء ({invoice.contactName})</span>
              <span className="font-bold tabular-nums">{fmtAmount(selectedTotal)}</span>
            </div>
          </div>

          <Separator />

          {/* Reason selection */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">سبب الإشعار الدائن: <span className="text-destructive">*</span></Label>
            <RadioGroup value={reason} onValueChange={setReason} className="space-y-2">
              {REASONS.map(r => (
                <div key={r.value} className="flex items-center gap-2">
                  <RadioGroupItem value={r.value} id={`reason-${r.value}`} />
                  <Label htmlFor={`reason-${r.value}`} className="text-sm cursor-pointer">{r.label}</Label>
                </div>
              ))}
            </RadioGroup>
            {reason === "other" && (
              <Textarea
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                placeholder="اكتب السبب هنا..."
                rows={2}
                className="rounded-xl text-sm"
              />
            )}
          </div>

          {/* Warning for correction */}
          {mode === "correction" && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                سيتم إنشاء إشعار دائن يعكس الفاتورة بالكامل، ثم فتح فاتورة جديدة بنفس البيانات للتعديل عليها.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose} disabled={loading} className="rounded-xl">
              إلغاء
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={loading || (reason === "other" && !customReason.trim()) || (mode === "partial" && selectedItems.length === 0)}
              className="rounded-xl gap-1.5"
            >
              {loading ? "جاري الإنشاء..." : mode === "correction" ? "إنشاء فاتورة التصحيح ✓" : "إنشاء الإشعار الدائن ✓"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreditNoteModal;
