import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import JournalAccountPicker, { type PickerAccount } from "@/components/journal/JournalAccountPicker";
import { pickTenantAccountCode, OPENING_BALANCE_CODES } from "@/lib/tenantAccountResolver";

type Acc = { id: string; account_code: string; account_name: string; account_type: string; parent_code: string | null; is_active: boolean | null; currency: string | null };

/**
 * إنشاء حساب فرعي كامل من شاشة تقرير الوردية — نفس مسار شاشة تعريف الحساب:
 * إدراج تحت مالك المستأجر، رمز فريد 3-10 أرقام، نوع موروث من الأب،
 * ورصيد افتتاحي عبر create_opening_balance_entry (مقابل حساب الأرصدة الافتتاحية).
 */
export default function QuickCreateAccountDialog({
  open, onOpenChange, ownerId, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; ownerId: string; onCreated: (a: PickerAccount) => void }) {
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [usedCodes, setUsedCodes] = useState<Set<string>>(new Set());
  const [parentCode, setParentCode] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeEdited, setCodeEdited] = useState(false);
  const [ob, setOb] = useState("");
  const [obType, setObType] = useState<"debit" | "credit">("debit");
  const [obDate, setObDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setParentCode(""); setName(""); setCode(""); setCodeEdited(false); setOb(""); setObType("debit");
    (async () => {
      const { data } = await (supabase as any).from("accounts")
        .select("id, account_code, account_name, account_type, parent_code, is_active, currency")
        .eq("user_id", ownerId).order("account_code").limit(5000);
      const all = (data as Acc[]) || [];
      setAccounts(all);
      setUsedCodes(new Set(all.map(a => a.account_code)));
    })();
  }, [open, ownerId]);

  const parent = accounts.find(a => a.account_code === parentCode) || null;
  const parentOptions: PickerAccount[] = useMemo(() =>
    accounts.filter(a => a.is_active !== false).map(a => ({ account_code: a.account_code, account_name: a.account_name, account_type: a.account_type })), [accounts]);

  // اقتراح الرقم: أكبر رقم بين الأبناء + 1 بنفس العرض، وإلا رقم الأب + "01"
  const suggested = useMemo(() => {
    if (!parentCode) return "";
    const kids = accounts.filter(a => a.parent_code === parentCode && a.account_code.startsWith(parentCode) && /^\d+$/.test(a.account_code)).map(a => a.account_code);
    if (!kids.length) { const c = parentCode + "01"; return /^\d{3,10}$/.test(c) && !usedCodes.has(c) ? c : ""; }
    const w = Math.max(...kids.map(k => k.length));
    let n = Math.max(...kids.filter(k => k.length === w).map(k => parseInt(k, 10))) + 1;
    while (usedCodes.has(String(n).padStart(w, "0"))) n++;
    return String(n).padStart(w, "0");
  }, [parentCode, accounts, usedCodes]);
  useEffect(() => { if (!codeEdited) setCode(suggested); }, [suggested, codeEdited]);

  const codeError = !code ? "" : !/^\d{3,10}$/.test(code) ? "الرقم يجب أن يكون 3-10 أرقام" : usedCodes.has(code) ? "هذا الرقم مستخدم" : "";
  const obAmount = Number(ob) || 0;
  const valid = !!parent && name.trim() && code && !codeError && obAmount >= 0;

  const submit = async () => {
    if (!valid || !parent) return;
    setSaving(true);
    try {
      // الأب الذي عليه قيود يصبح رئيسيًا فتختفي حركاته عن الترحيل — نمنع ذلك
      const { count } = await (supabase as any).from("transactions").select("id", { count: "exact", head: true })
        .eq("user_id", ownerId).eq("is_deleted", false)
        .or(`debit_account_code.eq.${parent.account_code},credit_account_code.eq.${parent.account_code}`);
      if ((count || 0) > 0) {
        toast.error("الحساب الأب عليه قيود مرحّلة؛ اختر حسابًا رئيسيًا لا تُرحّل عليه حركات");
        return;
      }
      const currency = parent.currency || "شيكل";
      const { data: ins, error } = await (supabase as any).from("accounts").insert({
        user_id: ownerId, account_code: code, account_name: name.trim(),
        account_type: parent.account_type, parent_code: parent.account_code, currency,
      }).select("id, account_code").single();
      if (error) throw error;

      if (obAmount > 0) {
        if (currency !== "شيكل") {
          toast.warning("أُنشئ الحساب؛ الرصيد الافتتاحي بعملة أجنبية يُسجل من شاشة الحساب (يتطلب سعر صرف)");
        } else {
          const ref = `OB-ACC-${ins.id}`;
          const obCode = await pickTenantAccountCode(ownerId, OPENING_BALANCE_CODES);
          const { data: r, error: obErr } = await supabase.rpc("create_opening_balance_entry", {
            p_user_id: ownerId,
            p_debit_account_code: obType === "debit" ? code : obCode,
            p_credit_account_code: obType === "debit" ? obCode : code,
            p_amount: obAmount, p_balance_date: obDate,
            p_description: `رصيد افتتاحي - ${name.trim()}`,
            p_currency: currency, p_contact_id: null, p_reference: ref,
            p_replace_existing: true, p_idempotency_key: `${ref}-${Date.now()}`,
            p_foreign_amount: null, p_exchange_rate: null,
          } as any);
          if (obErr || (r as any)?.success === false) {
            toast.error(`أُنشئ الحساب لكن فشل الرصيد الافتتاحي: ${obErr?.message || (r as any)?.error}`);
          }
        }
      }
      toast.success(`تم إنشاء الحساب ${code} — ${name.trim()}`);
      onCreated({ account_code: code, account_name: name.trim(), account_type: parent.account_type });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "تعذر إنشاء الحساب");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader><DialogTitle>حساب جديد في شجرة الحسابات</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <label className="text-xs text-muted-foreground">الحساب الأب *</label>
            <JournalAccountPicker lineId="qc-parent" value={parentCode} accountName={parent?.account_name || ""}
              accounts={parentOptions} onSelect={(a) => { setParentCode(a.account_code); setCodeEdited(false); }} />
            {parent && <p className="text-[11px] text-muted-foreground mt-1">النوع: {parent.account_type} · العملة: {parent.currency || "شيكل"}</p>}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">اسم الحساب *</label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">رقم الحساب *</label>
            <Input dir="ltr" className="font-mono" value={code} onChange={e => { setCode(e.target.value.trim()); setCodeEdited(true); }} />
            {codeError && <p className="text-[11px] text-destructive mt-1">{codeError}</p>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1">
              <label className="text-xs text-muted-foreground">رصيد افتتاحي</label>
              <Input dir="ltr" inputMode="decimal" className="font-mono" value={ob} onChange={e => setOb(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">الطبيعة</label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-2" value={obType} onChange={e => setObType(e.target.value as any)}>
                <option value="debit">مدين</option><option value="credit">دائن</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">التاريخ</label>
              <Input type="date" value={obDate} onChange={e => setObDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button onClick={submit} disabled={!valid || saving}>{saving ? "جاري الحفظ…" : "إنشاء واختيار"}</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
