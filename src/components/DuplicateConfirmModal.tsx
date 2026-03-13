import { Copy, FileText, User, CreditCard, Calendar } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DuplicateInfo {
  contactName?: string;
  itemsCount?: number;
  paymentMethod?: string;
  linesCount?: number;
  description?: string;
  sourceRef?: string;
}

interface DuplicateConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  docType: "invoice" | "receipt" | "payment" | "journal";
  info: DuplicateInfo;
}

const DOC_LABELS: Record<string, string> = {
  invoice: "فاتورة",
  receipt: "سند قبض",
  payment: "سند صرف",
  journal: "سند قيد",
};

const DuplicateConfirmModal = ({ open, onClose, onConfirm, docType, info }: DuplicateConfirmModalProps) => {
  const today = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Copy className="h-4 w-4 text-primary" />
            </div>
            جديد مشابه
          </DialogTitle>
          <DialogDescription className="text-xs">
            سيُنشأ {DOC_LABELS[docType]} جديد يحتوي على نفس البيانات
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 py-2">
          {info.contactName && (
            <div className="flex items-center gap-2 text-sm">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">نفس الجهة:</span>
              <span className="font-semibold text-foreground">{info.contactName}</span>
            </div>
          )}
          {info.itemsCount != null && info.itemsCount > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">نفس البنود:</span>
              <span className="font-semibold text-foreground">{info.itemsCount} أصناف</span>
            </div>
          )}
          {info.linesCount != null && info.linesCount > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">نفس السطور:</span>
              <span className="font-semibold text-foreground">{info.linesCount} سطر</span>
            </div>
          )}
          {info.paymentMethod && (
            <div className="flex items-center gap-2 text-sm">
              <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">نفس طريقة الدفع:</span>
              <span className="font-semibold text-foreground">{info.paymentMethod}</span>
            </div>
          )}
          {info.description && (
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">الوصف:</span>
              <span className="font-semibold text-foreground truncate max-w-[180px]">{info.description}</span>
            </div>
          )}

          <div className="rounded-xl bg-muted/50 border border-border/50 p-3 space-y-1.5 mt-3">
            <div className="flex items-center gap-2 text-xs">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">التاريخ:</span>
              <span className="font-semibold">اليوم {today}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground mr-5">الرقم:</span>
              <span className="font-semibold">سيُولَّد تلقائياً</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
            إلغاء
          </Button>
          <Button className="flex-[2] rounded-xl gap-1.5 shadow-md shadow-primary/20" onClick={onConfirm}>
            <Copy className="h-4 w-4" /> إنشاء المشابه
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DuplicateConfirmModal;
