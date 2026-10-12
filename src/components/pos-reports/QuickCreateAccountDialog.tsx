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
  // تعريف حساب أب جديد
  const [newParentOpen, setNewParentOpen] = useState(false);
  const [gpCode, setGpCode] = useState("");
  const [npType, setNpType] = useState("مصاريف");
  const [npName, setNpName] = useState("");
  const [npCode, setNpCode] = useState("");

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

  const hasPostings = async (c: string) => {
    const { count } = await (supabase as any).from("transactions").select("id", { count: "exact", head: true })
      .eq("user_id", ownerId).eq("is_deleted", false)
      .or(`debit_account_code.eq.${c},credit_account_code.eq.${c}`);
    return (count || 0) > 0;
  };

  const gp = accounts.find(a => a.account_code === gpCode) || null;
  const npCodeError = !npCode ? "" : !/^\d{3,10}$/.test(npCode) ? "الرقم يجب أن يكون 3-10 أرقام" : usedCodes.has(npCode) ? "هذا الرقم مستخدم" : "";
  const createParent = async () => {
    if (!npName.trim() || !npCode || npCodeError) return;
    setSaving(true);
    try {
      if (gp && await hasPostings(gp.account_code)) {
        toast.error("الحساب الأعلى عليه قيود مرحّلة؛ اختر حسابًا رئيسيًا آخر");
        return;
      }
      const row = {
        user_id: ownerId, account_code: npCode, account_name: npName.trim(),
        account_type: gp ? gp.account_type : npType, parent_code: gp ? gp.account_code : null,
        currency: gp?.currency || "شيكل",
      };
      const { data: ins, error } = await (supabase as any).from("accounts").insert(row)
        .select("id, account_code, account_name, account_type, parent_code, is_active, currency").single();
      if (error) throw error;
      setAccounts(prev => [...prev, ins as Acc]);
      setUsedCodes(prev => new Set([...prev, npCode]));
      setParentCode(npCode); setCodeEdited(false);
      setNewParentOpen(false); setNpName(""); setNpCode(""); setGpCode("");
      toast.success(`تم تعريف الحساب الأب ${npCode} — ${row.account_name}`);
    } catch (e: any) { toast.error(e.message || "تعذر إنشاء الحساب الأب"); }
    finally { setSaving(false); }
  };

  const submit = async () => {
    if (!valid || !parent) return;
    setSaving(true);
    try {
      // الأب الذي عليه قيود يصبح رئيسيًا فتختفي حركاته عن الترحيل — نمنع ذلك
      if (await hasPostings(parent.account_code)) {
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
      <DialogContent dir="rtl" className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>حساب جديد في شجرة الحسابات</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <label className="text-xs text-muted-foreground">الحساب الأب *</label>
            <JournalAccountPicker lineId="qc-parent" value={parentCode} accountName={parent?.account_name || ""}
              accounts={parentOptions} onSelect={(a) => { setParentCode(a.account_code); setCodeEdited(false); }} />
            <button type="button" onClick={() => setNewParentOpen(o => !o)} className="text-xs text-primary mt-1.5 underline-offset-2 hover:underline">
              {newParentOpen ? "إخفاء تعريف حساب أب جديد" : "+ تعريف حساب أب جديد"}
            </button>
            {newParentOpen && (
              <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <div>
                  <label className="text-xs text-muted-foreground">يتبع لحساب رئيسي (اختياري)</label>
                  <JournalAccountPicker lineId="qc-gp" value={gpCode} accountName={gp?.account_name || ""}
                    accounts={parentOptions} onSelect={(a) => setGpCode(a.account_code)} />
                  {gpCode && <button type="button" className="text-[11px] text-muted-foreground mt-1" onClick={() => setGpCode("")}>بدون حساب رئيسي (مستوى أول)</button>}
                </div>
                {!gp && (
                  <div>
                    <label className="text-xs text-muted-foreground">نوع الحساب</label>
                    <select className="w-full h-10 rounded-md border border-input bg-background px-2" value={npType} onChange={e => setNpType(e.target.value)}>
                      <option value="مصاريف">مصروفات</option><option value="مشتريات">مشتريات</option>
                      <option value="إيرادات">إيرادات</option><option value="أصول">أصول</option>
                      <option value="خصوم">التزامات</option><option value="حقوق ملكية">حقوق ملكية</option>
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">اسم الحساب الأب *</label>
                    <Input value={npName} onChange={e => setNpName(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">رقم الحساب الأب *</label>
                    <Input dir="ltr" className="font-mono" value={npCode} onChange={e => setNpCode(e.target.value.trim())} />
                    {npCodeError && <p className="text-[11px] text-destructive mt-1">{npCodeError}</p>}
                  </div>
                </div>
                <Button size="sm" variant="secondary" disabled={saving || !npName.trim() || !npCode || !!npCodeError} onClick={createParent}>إنشاء الحساب الأب واختياره</Button>
              </div>
            )}
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
