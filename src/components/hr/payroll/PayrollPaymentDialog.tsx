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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Wallet, Building2, FileText, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { PayrollPaymentMethod } from "@/hooks/hr/usePayrollApproval";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  summary: string;
  isSubmitting: boolean;
  onConfirm: (payload: {
    paymentMethod: PayrollPaymentMethod;
    bankAccountId: string | null;
    chequeNumber: string | null;
    chequeDueDate: string | null;
    paymentDate: string;
    paymentAccountCode: string | null;
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
  const [cashAccountCode, setCashAccountCode] = useState<string | null>(null);
  const [chequeAccountCode, setChequeAccountCode] = useState<string | null>(null);
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDueDate, setChequeDueDate] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());

  useEffect(() => {
    if (open) {
      setMethod("cash");
      setBankAccountId(null);
      setCashAccountCode(null);
      setChequeAccountCode(null);
      setChequeNumber("");
      setChequeDueDate("");
      setPaymentDate(today());
    }
  }, [open]);

  // Cash boxes (the actual cash registers / drawers, mapped to GL accounts)
  const cashBoxesQ = useQuery({
    queryKey: ["payroll-cash-boxes"],
    enabled: open && method === "cash",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_boxes")
        .select("id,name,gl_account_code,currency")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data || []).filter((b: any) => !!b.gl_account_code);
    },
  });

  // Bank accounts (used for bank transfers and as cheque source)
  const banksQ = useQuery({
    queryKey: ["bank-accounts-active"],
    enabled: open && (method === "bank" || method === "cheque"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id,name,bank_name,account_number,gl_account_code,outgoing_checks_account_code")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Outgoing-cheque accounts (children of 1160)
  const chequeAccountsQ = useQuery({
    queryKey: ["payroll-cheque-accounts"],
    enabled: open && method === "cheque",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("account_code,account_name,parent_code")
        .or("parent_code.eq.1160,account_code.eq.1160")
        .eq("is_active", true)
        .order("account_code");
      if (error) throw error;
      const rows = data || [];
      const hasChildren = rows.some((r: any) => r.parent_code === "1160");
      return hasChildren ? rows.filter((r: any) => r.account_code !== "1160") : rows;
    },
  });

  // When a bank is picked for a cheque, default the cheque-account to the bank's outgoing checks account
  useEffect(() => {
    if (method !== "cheque" || !bankAccountId) return;
    const b: any = (banksQ.data || []).find((x: any) => x.id === bankAccountId);
    if (b?.outgoing_checks_account_code && !chequeAccountCode) {
      setChequeAccountCode(b.outgoing_checks_account_code);
    }
  }, [bankAccountId, method, banksQ.data]); // eslint-disable-line

  const canSubmit =
    !isSubmitting &&
    !!paymentDate &&
    (
      (method === "cash" && !!cashAccountCode) ||
      (method === "bank" && !!bankAccountId) ||
      (method === "cheque" && chequeNumber.trim().length > 0 && !!chequeAccountCode)
    );

  const handle = () => {
    let paymentAccountCode: string | null = null;
    if (method === "cash") paymentAccountCode = cashAccountCode;
    else if (method === "cheque") paymentAccountCode = chequeAccountCode;
    // bank: leave null → RPC derives credit code from bank_accounts.gl_account_code

    onConfirm({
      paymentMethod: method,
      bankAccountId: method === "cash" ? null : bankAccountId,
      chequeNumber: method === "cheque" ? chequeNumber.trim() : null,
      chequeDueDate: method === "cheque" ? chequeDueDate || null : null,
      paymentDate,
      paymentAccountCode,
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

          {/* الصندوق (نقدي) */}
          {method === "cash" && (
            <div className="space-y-2">
              <Label>الصندوق / حساب النقد *</Label>
              {cashBoxesQ.isLoading ? (
                <div className="text-xs text-muted-foreground">جارٍ تحميل الصناديق...</div>
              ) : (cashBoxesQ.data || []).length === 0 ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    لا يوجد صندوق نقدي معرّف. يرجى تعريف صندوق من{" "}
                    <a href="/cash-boxes" className="underline" target="_blank" rel="noreferrer">
                      إعدادات الصناديق
                    </a>{" "}
                    أولاً.
                  </AlertDescription>
                </Alert>
              ) : (
                <Select
                  value={cashAccountCode ?? ""}
                  onValueChange={(v) => setCashAccountCode(v || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الصندوق..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(cashBoxesQ.data || []).map((b: any) => (
                      <SelectItem key={b.id} value={b.gl_account_code}>
                        {b.name} — {b.gl_account_code}
                        {b.currency ? ` (${b.currency})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* البنك */}
          {(method === "bank" || method === "cheque") && (
            <div className="space-y-2">
              <Label>
                {method === "bank" ? "الحساب البنكي *" : "البنك المُصدِر للشيك (اختياري)"}
              </Label>
              {method === "bank" && (banksQ.data || []).length === 0 && !banksQ.isLoading ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    لا يوجد حساب بنكي مُعرّف. يرجى تعريف حساب من{" "}
                    <a href="/bank-accounts" className="underline" target="_blank" rel="noreferrer">
                      البنوك
                    </a>{" "}
                    أولاً.
                  </AlertDescription>
                </Alert>
              ) : (
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
                        {b.gl_account_code ? ` (${b.gl_account_code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* حساب الشيكات الصادرة */}
          {method === "cheque" && (
            <div className="space-y-2">
              <Label>حساب الشيكات الصادرة *</Label>
              {(chequeAccountsQ.data || []).length === 0 && !chequeAccountsQ.isLoading ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    لا يوجد حساب شيكات صادرة معرّف. أضف حساباً تحت 1160 في دليل الحسابات.
                  </AlertDescription>
                </Alert>
              ) : (
                <Select
                  value={chequeAccountCode ?? ""}
                  onValueChange={(v) => setChequeAccountCode(v || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر حساب الشيكات..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(chequeAccountsQ.data || []).map((a: any) => (
                      <SelectItem key={a.account_code} value={a.account_code}>
                        {a.account_name} — {a.account_code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
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
