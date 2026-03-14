import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  docNumber?: string;
  docAmount?: number;
}

const DELETE_REASONS = [
  "خطأ في البيانات",
  "مستند مكرر",
  "إلغاء الطلب",
  "سبب آخر",
];

const DeleteDocumentDialog = ({ open, onClose, onConfirm, docNumber, docAmount }: Props) => {
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    if (!reason) return;
    onConfirm(reason);
    setReason("");
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            تأكيد الحذف
          </DialogTitle>
          <DialogDescription>هذا الإجراء لا يمكن التراجع عنه</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-xl">
            <p className="text-sm font-semibold text-destructive flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" />
              سيتم حذف:
            </p>
            <p className="text-sm mt-1 text-foreground font-bold">
              {docNumber} {docAmount ? `— ₪${docAmount.toLocaleString()}` : ""}
            </p>
            <p className="text-[11px] text-destructive mt-2">
              سيتم عكس القيود المحاسبية وتحديث أرصدة الزبائن تلقائياً
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">سبب الحذف (مطلوب)</label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="اختر السبب..." /></SelectTrigger>
              <SelectContent>
                {DELETE_REASONS.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:justify-start">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            variant="destructive"
            disabled={!reason}
            onClick={handleConfirm}
            className="gap-1.5"
          >
            <Trash2 className="h-4 w-4" />
            نعم، احذف المستند
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteDocumentDialog;
