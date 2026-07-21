import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ShieldCheck, Lock } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentBase: string;
  currencies: Array<{ id: string; code: string; name_ar: string; symbol: string; country_flag: string; is_active: boolean }>;
  companyName?: string;
}

/**
 * Wizard for switching the tenant's base (functional) currency.
 *
 * Safety: this dialog is opened ONLY when
 * `check_can_change_base_currency` returns allowed=true — i.e. the tenant
 * has ZERO posted transactions/invoices/vouchers/POS orders. All existing
 * production tenants have activity, so this wizard is never reachable for
 * them and cannot alter their data.
 *
 * The actual mutation RPC is intentionally NOT wired here yet (Phase 3);
 * this UI covers the confirmation flow and shows the plan. The final
 * submit currently just informs the user that execution ships in the
 * next step.
 */
export const ChangeBaseCurrencyDialog = ({
  open,
  onOpenChange,
  currentBase,
  currencies,
  companyName,
}: Props) => {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [newCode, setNewCode] = useState<string>("");
  const [confirmText, setConfirmText] = useState("");

  // Re-check permission whenever dialog opens (defense in depth)
  const { data: guard, isLoading: checking } = useQuery({
    queryKey: ["can_change_base_currency", user?.id],
    enabled: open && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("check_can_change_base_currency", {
        p_data_owner_id: user!.id,
      });
      if (error) throw error;
      return data as any;
    },
  });

  useEffect(() => {
    if (!open) {
      setStep(1);
      setNewCode("");
      setConfirmText("");
    }
  }, [open]);

  const allowed = guard?.allowed === true;
  const eligible = currencies.filter((c) => c.is_active && c.code !== currentBase);
  const selected = eligible.find((c) => c.code === newCode);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            تغيير العملة الأساسية
          </DialogTitle>
        </DialogHeader>

        {checking && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            جاري التحقق من إمكانية التغيير…
          </div>
        )}

        {!checking && !allowed && (
          <div className="space-y-3">
            <div className="rounded-md border border-orange-300 bg-orange-50 p-4 flex gap-3">
              <Lock className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-semibold text-orange-800 mb-1">
                  التغيير غير مسموح
                </div>
                <div className="text-orange-700">
                  {guard?.reason || "يوجد قيود محاسبية منشورة."}
                </div>
                {typeof guard?.posted_count === "number" && guard.posted_count > 0 && (
                  <div className="text-xs mt-2 text-orange-600">
                    عدد القيود المنشورة: {guard.posted_count.toLocaleString("en-US")}
                  </div>
                )}
              </div>
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              وفقاً للمعيار المحاسبي الدولي IAS 21 وأنظمة ERP العالمية (SAP، Oracle، Odoo)،
              لا يمكن تغيير العملة الأساسية بعد ترحيل أي حركة محاسبية. الحل الوحيد هو
              إنشاء حساب جديد بالعملة الأساسية المرغوبة.
            </div>
            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              إغلاق
            </Button>
          </div>
        )}

        {!checking && allowed && step === 1 && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              العملة الأساسية الحالية: <span className="font-bold">{currentBase}</span>
            </div>
            <div>
              <Label>اختر العملة الأساسية الجديدة</Label>
              <Select value={newCode} onValueChange={setNewCode}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر عملة…" />
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((c) => (
                    <SelectItem key={c.id} value={c.code}>
                      {c.country_flag} {c.symbol} {c.name_ar} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
              <Button disabled={!newCode} onClick={() => setStep(2)}>التالي</Button>
            </div>
          </div>
        )}

        {!checking && allowed && step === 2 && selected && (
          <div className="space-y-4">
            <div className="rounded-md border border-red-300 bg-red-50 p-4 flex gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">
                <div className="font-semibold mb-1">تحذير نهائي</div>
                <div>
                  ستصبح <b>{selected.name_ar} ({selected.code})</b> هي العملة الأساسية
                  للحساب. جميع الحسابات، الفواتير، السندات، والتقارير المستقبلية
                  ستُسجَّل بهذه العملة. هذا القرار <b>لا يمكن التراجع عنه</b> بعد
                  أول قيد محاسبي.
                </div>
              </div>
            </div>
            <div>
              <Label>للتأكيد، اكتب اسم الشركة: <span className="font-mono">{companyName || "الشركة"}</span></Label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={companyName || "اسم الشركة"}
              />
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>رجوع</Button>
              <Button
                variant="destructive"
                disabled={confirmText.trim() !== (companyName || "").trim() || !confirmText.trim()}
                onClick={() => {
                  toast.info(
                    "جاهز للتنفيذ — سيتم تفعيل التغيير الفعلي في المرحلة التالية بعد تأكيدك.",
                    { duration: 5000 }
                  );
                  onOpenChange(false);
                }}
              >
                تأكيد التغيير
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ChangeBaseCurrencyDialog;