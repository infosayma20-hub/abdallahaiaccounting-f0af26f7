import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}

export default function CompleteTaskModal({ open, onClose, onConfirm }: Props) {
  const [note, setNote] = useState("");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader><DialogTitle>إنهاء المهمة</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>ملاحظة الإنجاز (اختياري)</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="أضف ملاحظة عن الإنجاز..." rows={3} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">إلغاء</Button>
            <Button onClick={() => onConfirm(note)} className="flex-1 bg-green-600 text-white hover:bg-green-700">
              <CheckCircle2 className="w-4 h-4 ml-1" /> تأكيد الإنهاء
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
