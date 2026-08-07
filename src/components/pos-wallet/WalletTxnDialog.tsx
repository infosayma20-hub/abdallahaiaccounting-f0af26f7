/**
 * WalletTxnDialog — تنفيذ حركة على محفظة زبون (شحن / صرف / مرتجع / تسوية).
 * يستخدم شكل Dynamics الموحّد ويستدعي الدالة الآمنة wallet_apply_transaction.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DynamicsDialog, DynamicsSection } from "@/components/ui/dynamics-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type WalletTxnType = "topup" | "spend" | "refund" | "adjustment";

const TYPE_LABEL: Record<WalletTxnType, string> = {
  topup: "شحن رصيد",
  spend: "صرف من الرصيد",
  refund: "إرجاع للمحفظة",
  adjustment: "تسوية يدوية",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contactId: string | null;
  contactName?: string;
  contactPhone?: string | null;
  currentBalance?: number;
  defaultType?: WalletTxnType;
  branches?: { id: string; name: string }[];
  onDone: () => void;
}

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function WalletTxnDialog({
  open, onOpenChange, contactId, contactName, contactPhone, currentBalance = 0,
  defaultType = "topup", branches = [], onDone,
}: Props) {
  const [type, setType] = useState<WalletTxnType>(defaultType);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [branchId, setBranchId] = useState<string>("none");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setType(defaultType); setAmount(""); setMethod("cash");
      setBranchId("none"); setReference(""); setNotes("");
    }
  }, [open, defaultType]);

  const numeric = Number(amount);
  const signed = type === "spend" ? -Math.abs(numeric) : type === "adjustment" ? numeric : Math.abs(numeric);
  const projected = currentBalance + (Number.isFinite(signed) ? signed : 0);
  const invalid = !contactId || !amount || !Number.isFinite(numeric) || numeric === 0 || projected < 0;

  const submit = async () => {
    if (invalid) {
      toast.error(projected < 0 ? "الرصيد غير كافٍ لتنفيذ هذه الحركة" : "الرجاء إدخال مبلغ صحيح");
      return;
    }
    setSaving(true);
    const { data, error } = await (supabase as any).rpc("wallet_apply_transaction", {
      _contact_id: contactId,
      _txn_type: type,
      _amount: type === "adjustment" ? numeric : Math.abs(numeric),
      _branch_id: branchId === "none" ? null : branchId,
      _pos_order_id: null,
      _payment_method: type === "topup" ? method : null,
      _reference: reference.trim() || null,
      _notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`تم تنفيذ الحركة — الرصيد الجديد ${fmt(Number((data as any)?.balance ?? projected))}`);
    onOpenChange(false);
    onDone();
  };

  return (
    <DynamicsDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${TYPE_LABEL[type]} — ${contactName || "زبون"}`}
      description="تُنفَّذ الحركة مباشرة على رصيد المحفظة ويُسجَّل لها أثر تدقيقي لا يمكن تعديله."
      className="max-w-2xl"
      facts={[
        { label: "الزبون", value: contactName || "—" },
        { label: "رقم الهاتف", value: contactPhone || "—" },
        { label: "الرصيد الحالي", value: fmt(currentBalance) },
        { label: "قيمة الحركة", value: Number.isFinite(signed) && amount ? fmt(signed) : "—", tone: signed < 0 ? "negative" : "positive" },
        { label: "الرصيد بعد الحركة", value: fmt(projected), tone: projected < 0 ? "negative" : "default" },
      ]}
      maxBodyHeight="55vh"
    >
      <DynamicsSection title="تفاصيل الحركة">
        <div className="grid gap-3 p-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-[11px]">نوع الحركة</Label>
            <Select value={type} onValueChange={(v) => setType(v as WalletTxnType)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABEL) as WalletTxnType[]).map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">{TYPE_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px]">
              المبلغ {type === "adjustment" ? "(سالب للخصم)" : "(₪)"}
            </Label>
            <Input
              type="number" step="0.01" inputMode="decimal" value={amount}
              onChange={(e) => setAmount(e.target.value)} className="h-9 text-xs tabular-nums"
              placeholder="0.00"
            />
          </div>

          {type === "topup" && (
            <div className="space-y-1.5">
              <Label className="text-[11px]">طريقة الشحن</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash" className="text-xs">نقداً</SelectItem>
                  <SelectItem value="card" className="text-xs">بطاقة</SelectItem>
                  <SelectItem value="bank" className="text-xs">تحويل بنكي</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-[11px]">الفرع</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="بدون" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">بدون تحديد</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id} className="text-xs">{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px]">المرجع</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} className="h-9 text-xs" placeholder="رقم سند / فاتورة" />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-[11px]">ملاحظات</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-xs" />
          </div>
        </div>
      </DynamicsSection>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>إلغاء</Button>
        <Button size="sm" disabled={invalid || saving} onClick={submit}>
          {saving ? "جاري التنفيذ..." : "تنفيذ الحركة"}
        </Button>
      </div>
    </DynamicsDialog>
  );
}
