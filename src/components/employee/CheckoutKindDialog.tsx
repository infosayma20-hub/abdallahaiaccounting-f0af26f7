import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Coffee, LogOut } from "lucide-react";

export type CheckoutKind = "temporary" | "end_of_day";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** يُستدعى بعد اختيار الموظف — الجهة المستدعية تكمل مسح QR. */
  onSelect: (kind: CheckoutKind) => void;
}

/**
 * قبل بصمة الخروج نسأل الموظف عن نيته بدل ما يخمّن النظام من طول الفجوة:
 *  • مغادرة مؤقتة → الوقت خارج العمل يُحتسب ضمن سقف المغادرات (30 دقيقة).
 *  • إنهاء دوام   → الفجوة بعدها ليست مغادرة، وأي عودة تبدأ جلسة جديدة.
 */
export default function CheckoutKindDialog({ open, onOpenChange, onSelect }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle>نوع الخروج</DialogTitle>
          <DialogDescription>
            اختر نوع الخروج بدقة — يعتمد عليه احتساب المغادرات وساعات دوامك.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <Button
            variant="outline"
            className="w-full h-auto py-3 rounded-2xl justify-start gap-3 text-right"
            onClick={() => onSelect("temporary")}
          >
            <Coffee className="h-5 w-5 shrink-0 text-warning" />
            <span className="flex flex-col items-start gap-0.5">
              <span className="font-semibold">مغادرة مؤقتة — سأعود</span>
              <span className="text-xs text-muted-foreground font-normal">
                تُحتسب ضمن سقف المغادرات اليومي (30 دقيقة)
              </span>
            </span>
          </Button>

          <Button
            variant="outline"
            className="w-full h-auto py-3 rounded-2xl justify-start gap-3 text-right"
            onClick={() => onSelect("end_of_day")}
          >
            <LogOut className="h-5 w-5 shrink-0 text-destructive" />
            <span className="flex flex-col items-start gap-0.5">
              <span className="font-semibold">إنهاء الدوام</span>
              <span className="text-xs text-muted-foreground font-normal">
                لا تُحتسب مغادرة؛ أي عودة لاحقة تبدأ دواماً جديداً
              </span>
            </span>
          </Button>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            ملاحظة: إذا اخترت "إنهاء الدوام" ثم عدت خلال أقل من ساعة، يُحتسب الوقت
            مغادرة تلقائياً ويظهر للموارد البشرية.
          </p>

          <Button
            variant="ghost"
            className="w-full rounded-2xl text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            إلغاء — لم أخرج بعد
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
