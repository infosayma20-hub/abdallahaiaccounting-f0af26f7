import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wallet, Building2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { PayrollPaymentMethod } from "@/hooks/hr/usePayrollApproval";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Title shown in the dialog header */
  title: string;
  /** A short summary line (e.g. "صافي الراتب: ₪3,100" or "5 موظفين — ₪15,500") */
  summary: string;
  isSubmitting: boolean;
  /** Returns when the user confirms */
  onConfirm: (payload: {
    paymentMethod: PayrollPaymentMethod;
    bankAccountId: string | null;
    chequeNumber: string | null;
    chequeDueDate: string | null;
    paymentDate: string;
  }) => void;
};

const today = () => new Date().toISOString().slice(0, 10);

export function PayrollPaymentDialog({
  open,
  onOpenChange,
  title,
  summary,
  isSubmitting,
  onConfirm,
}: Props) {
  const [method, setMethod] = useState<PayrollPaymentMethod>("cash");
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDueDate, setChequeDueDate] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());

  // Reset on open
  useEffect(() => {
    if (open) {
      setMethod("cash");
      setBankAccountId(null);
      setChequeNumber("");
      setChequeDueDate("");
      setPaymentDate(today());
    }
  }, [open]);

  const banksQ = useQuery({
    queryKey: ["bank-accounts-active"],
    enabled: open && (method === "bank" || method === "cheque"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id,name,bank_name,account_number,gl_account_code")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const canSubmit =
    !isSubmitting &&
    !!paymentDate &&
    (method === "cash" ||
      (method === "bank" && !!bankAccountId) ||
      (method === "cheque" && chequeNumber.trim().length > 0));

  const handle = () => {
    onConfirm({
      paymentMethod: method,
      bankAccountId: method === "cash" ? null : bankAccountId,
      chequeNumber: method === "cheque" ? chequeNumber.trim() : null,
      chequeDueDate: method === "cheque" ? chequeDueDate || null : null,
      paymentDate,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-xs">
            سيتم إنشاء سند صرف وقيد محاسبي. لا يمكن التراجع بعد الدفع إلا عبر إلغاء السند.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted/40 px-3 py-2 text-sm font-medium">
            {summary}
          </div>

          {/* طريقة الدفع */}
          <div className="space-y-2">
            <Label>طريقة الدفع</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant={method === "cash" ? "default" : "outline"}
                onClick={() => setMethod("cash")}
                className="gap-1"
              >
                <Wallet className="h-4 w-4" />
                نقدي
              </Button>
              <Button
                type="button"
                variant={method === "bank" ? "default" : "outline"}
                onClick={() => setMethod("bank")}
                className="gap-1"
              >
                <Building2 className="h-4 w-4" />
                بنك
              </Button>
              <Button
                type="button"
                variant={method === "cheque" ? "default" : "outline"}
                onClick={() => setMethod("cheque")}
                className="gap-1"
              >
                <FileText className="h-4 w-4" />
                شيك
              </Button>
            </div>
          </div>

          {/* اختيار البنك */}
          {(method === "bank" || method === "cheque") && (
            <div className="space-y-2">
              <Label>
                {method === "bank" ? "الحساب البنكي" : "البنك المُصدِر للشيك (اختياري)"}
              </Label>
              <Select
                value={bankAccountId ?? ""}
                onValueChange={(v) => setBankAccountId(v || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر البنك..." />
                </SelectTrigger>
                <SelectContent>
                  {(banksQ.data || []).map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} {b.bank_name ? `— ${b.bank_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* تفاصيل الشيك */}
          {method === "cheque" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>رقم الشيك *</Label>
                <Input
                  value={chequeNumber}
                  onChange={(e) => setChequeNumber(e.target.value)}
                  placeholder="رقم الشيك..."
                />
              </div>
              <div className="space-y-2">
                <Label>تاريخ الاستحقاق</Label>
                <Input
                  type="date"
                  value={chequeDueDate}
                  onChange={(e) => setChequeDueDate(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* تاريخ الدفع */}
          <div className="space-y-2">
            <Label>تاريخ الدفع</Label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            onClick={handle}
            disabled={!canSubmit}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            تأكيد الدفع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}