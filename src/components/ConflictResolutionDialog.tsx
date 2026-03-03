import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { AlertTriangle } from "lucide-react";

interface ConflictResolutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modifiedByName: string;
  modifiedAt: string;
  onKeepMine: () => void;
  onAcceptTheirs: () => void;
}

export default function ConflictResolutionDialog({
  open,
  onOpenChange,
  modifiedByName,
  modifiedAt,
  onKeepMine,
  onAcceptTheirs,
}: ConflictResolutionDialogProps) {
  const timeStr = modifiedAt
    ? format(new Date(modifiedAt), "hh:mm a yyyy/MM/dd", { locale: ar })
    : "";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md" dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            تعارض في التعديل
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base leading-relaxed">
            تم تعديل هذا السجل من <strong>{modifiedByName}</strong> الساعة{" "}
            <strong>{timeStr}</strong>
            <br />
            <br />
            هل تريد:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row-reverse gap-2 sm:flex-row-reverse">
          <AlertDialogAction
            onClick={onKeepMine}
            className="bg-primary hover:bg-primary/90"
          >
            الاحتفاظ بتعديلي
          </AlertDialogAction>
          <AlertDialogCancel onClick={onAcceptTheirs}>
            قبول التعديل الجديد
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
