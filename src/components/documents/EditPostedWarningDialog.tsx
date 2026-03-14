import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, FileEdit } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  docNumber?: string;
  docAmount?: number;
}

const EditPostedWarningDialog = ({ open, onClose, onConfirm, docNumber, docAmount }: Props) => {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            تعديل مستند مرحَّل
          </DialogTitle>
          <DialogDescription>أنت على وشك تعديل مستند مرحّل</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-foreground">
            أنت على وشك تعديل:
          </p>
          <p className="text-sm font-bold text-primary">
            {docNumber} {docAmount ? `— ₪${docAmount.toLocaleString()}` : ""}
          </p>

          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-700 dark:text-amber-300">
            ⚠️ سيتم تسجيل هذا التعديل في سجل النشاط
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:justify-start">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={onConfirm} className="gap-1.5">
            <FileEdit className="h-4 w-4" />
            نعم، عدّل المستند
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditPostedWarningDialog;
