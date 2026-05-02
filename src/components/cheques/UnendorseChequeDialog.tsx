import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Undo2, AlertTriangle } from "lucide-react";

interface ChequeLite {
  id: string;
  cheque_number: string | null;
  bank_name: string | null;
  amount: number;
  party_name: string;
  endorsed_to_name?: string | null;
  endorsement_voucher_id?: string | null;
  currency?: string | null;
}

interface Props {
  cheque: ChequeLite | null;
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const UnendorseChequeDialog = ({ cheque, userId, open, onOpenChange, onSuccess }: Props) => {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!cheque || !userId) return;
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      toast.error("سبب إلغاء التجيير مطلوب (3 أحرف على الأقل)");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("cancel_cheque_endorsement", {
        p_user_id: userId,
        p_cheque_id: cheque.id,
        p_reason: trimmed,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string; reverse_tx_id?: string };
      if (!result?.success) {
        toast.error(result?.error || "فشل إلغاء التجيير");
        return;
      }
      toast.success("تم إلغاء التجيير وإنشاء قيد عكسي. الشيك أصبح بحوزتك مرة أخرى.");
      setReason("");
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      toast.error(e?.message || "خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!loading) { onOpenChange(o); if (!o) setReason(""); } }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-base">
            <Undo2 className="h-5 w-5 text-amber-600" />
            إلغاء تجيير الشيك
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-right">
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl p-3 space-y-2 text-xs">
                <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>سيتم إنشاء قيد محاسبي عكسي لقيد التجيير الأصلي (لن يُحذف القيد الأصلي).</span>
                </div>
              </div>

              {cheque && (
                <div className="bg-muted/40 rounded-xl p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">رقم الشيك:</span>
                    <span className="font-mono font-semibold" dir="ltr">{cheque.cheque_number || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">البنك:</span>
                    <span className="font-semibold">{cheque.bank_name || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">المبلغ:</span>
                    <span className="font-bold tabular-nums">
                      {cheque.amount.toLocaleString()} {cheque.currency || "₪"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">من:</span>
                    <span className="font-semibold">{cheque.party_name}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1.5">
                    <span className="text-muted-foreground">مظهَّر إلى:</span>
                    <span className="font-semibold text-purple-700 dark:text-purple-400">
                      {cheque.endorsed_to_name || "—"}
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="unendorse-reason" className="text-xs font-semibold">
                  سبب إلغاء التجيير <span className="text-red-600">*</span>
                </Label>
                <Textarea
                  id="unendorse-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="مثال: تم التجيير لمورد خاطئ، نريد استرجاع الشيك..."
                  rows={3}
                  disabled={loading}
                  className="text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  السبب سيُسجَّل في سجل حالات الشيك ووصف القيد العكسي.
                </p>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>تراجع</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleConfirm(); }}
            disabled={loading || reason.trim().length < 3}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4 ml-1" />}
            تأكيد إلغاء التجيير
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default UnendorseChequeDialog;