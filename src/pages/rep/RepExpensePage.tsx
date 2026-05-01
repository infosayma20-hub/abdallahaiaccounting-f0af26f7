import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Receipt, Coffee, Car, Utensils, Wallet, FileText, MoreHorizontal } from "lucide-react";
import { callCreatePaymentRpc } from "@/lib/voucher-rpc";

/**
 * Rep Expense — تسجيل سند صرف مصروف يومي للمندوب.
 * - نوع المصروف يحدد حساب افتراضي من شجرة الحسابات (5xxx).
 * - يمكن تغيير الحساب يدوياً (postable accounts فقط).
 * - القيد: Dr expense / Cr 1110 (الصندوق) — تماماً مثل سند صرف عادي.
 * - reference: REP-EXP-YYYYMMDD-XXXX
 * - notes: JSON tag {tag:"REP-EXP", rep_id, day_id} لتسهيل الفلترة في التقارير.
 */

type ExpenseType = {
  key: string;
  label: string;
  icon: any;
  defaultAccountCode: string | null; // null => المستخدم يختار يدوياً
  defaultAccountFallbacks: string[]; // إذا لم يوجد الافتراضي
};

const EXPENSE_TYPES: ExpenseType[] = [
  { key: "transport", label: "نقل / مواصلات", icon: Car, defaultAccountCode: "5530", defaultAccountFallbacks: ["5810"] },
  { key: "misc", label: "نثرية", icon: Receipt, defaultAccountCode: "5900", defaultAccountFallbacks: ["5500"] },
  { key: "hospitality", label: "ضيافة", icon: Coffee, defaultAccountCode: "5520", defaultAccountFallbacks: ["55901"] },
  { key: "meal", label: "فطور / وجبة", icon: Utensils, defaultAccountCode: "5520", defaultAccountFallbacks: ["5900"] },
  { key: "personal", label: "مصروف شخصي", icon: Wallet, defaultAccountCode: "5150", defaultAccountFallbacks: ["5900"] },
  { key: "other", label: "أخرى", icon: MoreHorizontal, defaultAccountCode: null, defaultAccountFallbacks: [] },
];

export default function RepExpensePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [rep, setRep] = useState<any>(null);
  const [openDay, setOpenDay] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]); // postable expense accounts (5xxx)

  const [typeKey, setTypeKey] = useState<string>("transport");
  const [accountCode, setAccountCode] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // مصاريف اليوم
  const [todayExpenses, setTodayExpenses] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: r } = await (supabase as any)
        .from("sales_representatives")
        .select("id, user_id, full_name")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (!r) { setLoading(false); return; }
      setRep(r);

      const { data: day } = await (supabase as any)
        .from("van_sales_days")
        .select("id, day_number, opened_at, status")
        .eq("sales_rep_id", r.id)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setOpenDay(day);

      // postable expense accounts: 5xxx ولا يوجد له abna
      const { data: allAcc } = await (supabase as any)
        .from("accounts")
        .select("account_code, account_name, parent_code")
        .eq("user_id", r.user_id)
        .eq("is_active", true)
        .like("account_code", "5%")
        .order("account_code");
      const list = (allAcc as any[]) || [];
      const childCodes = new Set(list.filter((a) => a.parent_code).map((a) => a.parent_code));
      const postable = list.filter((a) => !childCodes.has(a.account_code));
      setAccounts(postable);

      // مصاريف اليوم (إن كان مفتوح)
      if (day) {
        const { data: txs } = await (supabase as any)
          .from("transactions")
          .select("id, amount, description, debit_account_code, reference, transaction_date, notes")
          .eq("user_id", r.user_id)
          .eq("payment_method", "rep_expense")
          .eq("is_deleted", false)
          .gte("transaction_date", new Date(day.opened_at).toISOString().slice(0, 10))
          .order("created_at", { ascending: false });
        const mine = ((txs as any[]) || []).filter((t) => {
          try {
            const n = JSON.parse(t.notes || "{}");
            return n?.rep_id === r.id;
          } catch { return false; }
        });
        setTodayExpenses(mine);
      }

      setLoading(false);
    })();
  }, [user?.id]);

  const currentType = EXPENSE_TYPES.find((t) => t.key === typeKey)!;

  // ضبط الحساب الافتراضي عند تغيير النوع
  useEffect(() => {
    if (!accounts.length) return;
    if (typeKey === "other") { setAccountCode(""); return; }
    const candidates = [currentType.defaultAccountCode, ...currentType.defaultAccountFallbacks].filter(Boolean) as string[];
    const picked = candidates.find((c) => accounts.some((a) => a.account_code === c));
    setAccountCode(picked || "");
  }, [typeKey, accounts.length]);

  const todayTotal = useMemo(
    () => todayExpenses.reduce((s, t) => s + Number(t.amount || 0), 0),
    [todayExpenses]
  );

  const save = async () => {
    if (!rep) return;
    if (!openDay) {
      toast({ title: "لا يوجد يوم عمل مفتوح", description: "افتح يوم عمل أولاً من الرئيسية", variant: "destructive" });
      return;
    }
    if (!accountCode) {
      toast({ title: "اختر الحساب المحاسبي", description: "يرجى اختيار حساب مصروف", variant: "destructive" });
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast({ title: "أدخل مبلغاً صحيحاً", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const rand = Math.floor(1000 + Math.random() * 9000);
      const reference = `REP-EXP-${dateStr}-${rand}`;
      const idem = `${reference}-${rep.id.slice(0, 8)}`;

      const tagNotes = JSON.stringify({
        tag: "REP-EXP",
        rep_id: rep.id,
        day_id: openDay.id,
        type: typeKey,
        type_label: currentType.label,
        user_note: notes || null,
      });

      const result = await callCreatePaymentRpc({
        userId: rep.user_id,
        contactId: null,
        contactName: rep.full_name,
        amount: amt,
        paymentMethod: "rep_expense",
        currency: "شيكل",
        cashAccountCode: rep.cash_account_code,
        contactAccountCode: accountCode,
        description: `مصروف مندوب — ${currentType.label}${notes ? ` — ${notes}` : ""}`,
        reference,
        idempotencyKey: idem,
        notes: tagNotes,
      });
      if (!result.success) throw new Error(result.error || "فشل حفظ المصروف");
      toast({
        title: result.duplicate ? "هذا المصروف مسجّل مسبقاً" : "تم تسجيل المصروف بنجاح",
        description: `${amt.toFixed(2)} ₪ — ${currentType.label}`,
      });
      setAmount("");
      setNotes("");
      navigate("/rep");
    } catch (e: any) {
      toast({ title: "تعذّر الحفظ", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  if (!openDay) {
    return (
      <div className="p-4">
        <Card className="p-6 space-y-3 text-center">
          <Receipt className="w-10 h-10 text-muted-foreground mx-auto" />
          <h3 className="font-bold text-foreground">لا يوجد يوم عمل مفتوح</h3>
          <p className="text-sm text-muted-foreground">لتسجيل المصاريف، عليك فتح يوم عمل أولاً.</p>
          <Button className="w-full" onClick={() => navigate("/rep")}>الذهاب للرئيسية</Button>
        </Card>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="p-4">
        <Card className="p-6 space-y-3 text-center">
          <FileText className="w-10 h-10 text-destructive mx-auto" />
          <h3 className="font-bold text-foreground">لا توجد حسابات مصروف متاحة</h3>
          <p className="text-sm text-muted-foreground">يرجى إعداد حساب مصروف من الإدارة.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Receipt className="w-5 h-5 text-primary" />
          <h2 className="font-bold text-foreground">تسجيل مصروف</h2>
        </div>

        <div className="space-y-2">
          <Label>نوع المصروف</Label>
          <div className="grid grid-cols-3 gap-2">
            {EXPENSE_TYPES.map((t) => {
              const Icon = t.icon;
              const active = typeKey === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTypeKey(t.key)}
                  className={`p-3 rounded-md border text-xs flex flex-col items-center gap-1 transition ${
                    active
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-card border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label>الحساب المحاسبي</Label>
          <select
            value={accountCode}
            onChange={(e) => setAccountCode(e.target.value)}
            className="w-full h-11 px-3 rounded-md border border-border bg-background text-sm"
          >
            <option value="">— اختر حساب مصروف —</option>
            {accounts.map((a) => (
              <option key={a.account_code} value={a.account_code}>
                {a.account_code} — {a.account_name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label>المبلغ (₪)</Label>
          <Input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="h-12 text-lg text-center font-bold"
          />
        </div>

        <div className="space-y-2">
          <Label>ملاحظات (اختياري)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="مثال: تنقّل من رام الله إلى نابلس"
          />
        </div>

        <Button className="w-full h-12 text-base" onClick={save} disabled={saving || !amount || !accountCode}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 ml-2" /> حفظ المصروف</>}
        </Button>
      </Card>

      {todayExpenses.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-foreground">مصاريف اليوم</h3>
            <div className="text-sm font-bold text-destructive">{todayTotal.toFixed(2)} ₪</div>
          </div>
          <div className="space-y-2">
            {todayExpenses.map((t) => {
              let label = "مصروف";
              try { label = JSON.parse(t.notes || "{}")?.type_label || label; } catch {}
              return (
                <div key={t.id} className="flex items-center justify-between p-2 rounded-md bg-muted/40 text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{label}</span>
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">{t.description}</span>
                  </div>
                  <div className="font-bold text-destructive">{Number(t.amount).toFixed(2)} ₪</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}