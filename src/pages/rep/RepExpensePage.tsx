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
import { Loader2, Save, Receipt, Coffee, Car, Utensils, Wallet, FileText, MoreHorizontal, Check, ChevronsUpDown, Search, Truck } from "lucide-react";
import { callCreatePaymentRpc } from "@/lib/voucher-rpc";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

// أكواد الحسابات الأكثر استخداماً للمندوب (Quick-pick)
const QUICK_PICK_CODES: Array<{ code: string; label: string }> = [
  { code: "5530", label: "نقل" },
  { code: "5520", label: "ضيافة" },
  { code: "5900", label: "نثرية" },
];

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
  { key: "supplier", label: "صرف لمورد", icon: Truck, defaultAccountCode: null, defaultAccountFallbacks: [] },
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

  // Supplier picker (for type "supplier")
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState<string>("");
  const [supPickerOpen, setSupPickerOpen] = useState(false);
  const [supSearch, setSupSearch] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: r } = await (supabase as any)
        .from("sales_representatives")
        .select("id, user_id, full_name, cash_box_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (!r) { setLoading(false); return; }
      let cashAccountCode: string | null = null;
      let cashBoxName: string | null = null;
      if (r.cash_box_id) {
        const { data: cb } = await (supabase as any)
          .from("cash_boxes")
          .select("id, name, gl_account_code, is_active")
          .eq("id", r.cash_box_id)
          .maybeSingle();
        if (cb && cb.is_active && cb.gl_account_code) {
          cashAccountCode = cb.gl_account_code;
          cashBoxName = cb.name;
        }
      }
      setRep({ ...r, cash_account_code: cashAccountCode, cash_box_name: cashBoxName });

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

      // Suppliers list (active, not archived)
      const { data: sups } = await (supabase as any)
        .from("contacts")
        .select("id, contact_name, contact_type")
        .eq("user_id", r.user_id)
        .in("contact_type", ["supplier", "both", "مورد", "كلاهما", "customer_supplier", "زبون ومورد", "عميل ومورد"])
        .eq("is_active", true)
        .eq("is_archived", false)
        .order("contact_name")
        .limit(500);
      setSuppliers(sups || []);

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
  const isSupplierMode = typeKey === "supplier";

  // Searchable account picker state
  const [accPickerOpen, setAccPickerOpen] = useState(false);
  const [accSearch, setAccSearch] = useState("");

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.account_code === accountCode) || null,
    [accounts, accountCode]
  );

  // فلترة + حد أعلى 10 نتائج، وتبدأ بعد حرفين
  const filteredAccounts = useMemo(() => {
    const q = accSearch.trim();
    if (q.length < 2) return [] as any[];
    const ql = q.toLowerCase();
    const out: any[] = [];
    for (const a of accounts) {
      const code = String(a.account_code || "");
      const name = String(a.account_name || "");
      if (code.toLowerCase().includes(ql) || name.toLowerCase().includes(ql)) {
        out.push(a);
        if (out.length >= 10) break;
      }
    }
    return out;
  }, [accounts, accSearch]);

  const quickPickAccounts = useMemo(() => {
    return QUICK_PICK_CODES
      .map((q) => {
        const a = accounts.find((x) => x.account_code === q.code);
        return a ? { ...a, quickLabel: q.label } : null;
      })
      .filter(Boolean) as any[];
  }, [accounts]);

  // ضبط الحساب الافتراضي عند تغيير النوع
  useEffect(() => {
    if (!accounts.length) return;
    if (typeKey === "supplier") { setAccountCode(""); return; }
    if (typeKey === "other") { setAccountCode(""); return; }
    const candidates = [currentType.defaultAccountCode, ...currentType.defaultAccountFallbacks].filter(Boolean) as string[];
    const picked = candidates.find((c) => accounts.some((a) => a.account_code === c));
    setAccountCode(picked || "");
  }, [typeKey, accounts.length]);

  const filteredSuppliers = useMemo(() => {
    const q = supSearch.trim().toLowerCase();
    if (!q) return suppliers.slice(0, 20);
    return suppliers.filter((s) =>
      String(s.contact_name || "").toLowerCase().includes(q)
    ).slice(0, 20);
  }, [suppliers, supSearch]);
  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) || null,
    [suppliers, supplierId]
  );

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
    if (isSupplierMode) {
      if (!supplierId) {
        toast({ title: "اختر المورد", variant: "destructive" });
        return;
      }
    } else {
      if (!accountCode) {
        toast({ title: "اختر الحساب المحاسبي", description: "يرجى اختيار حساب مصروف", variant: "destructive" });
        return;
      }
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
      const reference = isSupplierMode
        ? `REP-PV-${dateStr}-${rand}`
        : `REP-EXP-${dateStr}-${rand}`;
      const idem = `${reference}-${rep.id.slice(0, 8)}`;

      const tagNotes = JSON.stringify({
        tag: isSupplierMode ? "REP-PV-SUPPLIER" : "REP-EXP",
        rep_id: rep.id,
        day_id: openDay.id,
        type: typeKey,
        type_label: currentType.label,
        supplier_id: isSupplierMode ? supplierId : undefined,
        supplier_name: isSupplierMode ? (selectedSupplier?.contact_name || null) : undefined,
        user_note: notes || null,
      });

      const description = isSupplierMode
        ? `دفعة لمورد — ${selectedSupplier?.contact_name || ""}${notes ? ` — ${notes}` : ""}`
        : `مصروف مندوب — ${currentType.label}${notes ? ` — ${notes}` : ""}`;

      const result = await callCreatePaymentRpc({
        userId: rep.user_id,
        contactId: isSupplierMode ? supplierId : null,
        contactName: isSupplierMode ? (selectedSupplier?.contact_name || null) : rep.full_name,
        amount: amt,
        paymentMethod: isSupplierMode ? "نقدي" : "rep_expense",
        currency: "شيكل",
        cashAccountCode: rep.cash_account_code,
        contactAccountCode: isSupplierMode ? null : accountCode,
        description,
        reference,
        idempotencyKey: idem,
        notes: tagNotes,
      });
      if (!result.success) throw new Error(result.error || "فشل حفظ المصروف");

      // إنشاء سند صرف في جدول vouchers ليظهر في شاشة سندات الصرف
      if (!result.duplicate && result.transaction_id) {
        const { data: existingPV } = await (supabase as any)
          .from("vouchers")
          .select("id")
          .eq("user_id", rep.user_id)
          .eq("linked_transaction_id", result.transaction_id)
          .maybeSingle();
        if (!existingPV) {
          const { error: pvErr } = await (supabase as any)
            .from("vouchers")
            .insert({
              user_id: rep.user_id,
              type: "payment",
              subtype: isSupplierMode ? "rep_supplier_payment" : "rep_expense",
              ref_number: reference,
              date: new Date().toISOString().slice(0, 10),
              contact_id: isSupplierMode ? supplierId : null,
              payment_method: "نقدي",
              amount: amt,
              currency: "شيكل",
              amount_ils: amt,
              description,
              notes: tagNotes,
              status: "posted",
              linked_transaction_id: result.transaction_id,
            });
          if (pvErr) console.error("[RepExpense] voucher insert failed:", pvErr);
        }
      }

      toast({
        title: result.duplicate
          ? (isSupplierMode ? "هذا السند مسجّل مسبقاً" : "هذا المصروف مسجّل مسبقاً")
          : (isSupplierMode ? "تم تسجيل سند الصرف للمورد" : "تم تسجيل المصروف بنجاح"),
        description: `${amt.toFixed(2)} ₪ — ${isSupplierMode ? (selectedSupplier?.contact_name || "مورد") : currentType.label}`,
      });
      setAmount("");
      setNotes("");
      setSupplierId("");
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

  if (!rep?.cash_account_code) {
    return (
      <div className="p-4">
        <Card className="p-6 space-y-3 text-center">
          <Wallet className="w-10 h-10 text-destructive mx-auto" />
          <h3 className="font-bold text-foreground">لا يوجد صندوق نقدي مرتبط</h3>
          <p className="text-sm text-muted-foreground">
            يرجى ربط المندوب بصندوق نقدي من الإدارة قبل استخدام التحصيل أو المصاريف.
          </p>
          <Button variant="outline" className="w-full" onClick={() => navigate("/rep")}>رجوع</Button>
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

        {isSupplierMode ? (
          <div className="space-y-2">
            <Label>المورد</Label>
            <Popover open={supPickerOpen} onOpenChange={setSupPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={supPickerOpen}
                  className="w-full h-11 justify-between font-normal"
                >
                  {selectedSupplier ? (
                    <span className="truncate">{selectedSupplier.contact_name}</span>
                  ) : (
                    <span className="text-muted-foreground">— اختر المورد —</span>
                  )}
                  <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                <Command shouldFilter={false}>
                  <div className="flex items-center border-b px-3">
                    <Search className="w-4 h-4 ml-2 opacity-50 shrink-0" />
                    <CommandInput
                      value={supSearch}
                      onValueChange={setSupSearch}
                      placeholder="ابحث باسم المورد"
                      className="h-10"
                    />
                  </div>
                  <CommandList>
                    {filteredSuppliers.length === 0 ? (
                      <CommandEmpty>لا توجد نتائج</CommandEmpty>
                    ) : (
                      <CommandGroup heading={`الموردين (${filteredSuppliers.length})`}>
                        {filteredSuppliers.map((s) => (
                          <CommandItem
                            key={s.id}
                            value={s.id}
                            onSelect={() => {
                              setSupplierId(s.id);
                              setSupPickerOpen(false);
                              setSupSearch("");
                            }}
                            className="flex items-center gap-2"
                          >
                            <Check className={cn("w-4 h-4", supplierId === s.id ? "opacity-100" : "opacity-0")} />
                            <span className="truncate">{s.contact_name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-[11px] text-muted-foreground">
              يُسجَّل القيد: مدين ذمم المورد / دائن عهدة السيارة. لا يؤثر على قائمة الدخل.
            </p>
          </div>
        ) : (
        <div className="space-y-2">
          <Label>الحساب المحاسبي</Label>

          {quickPickAccounts.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-1">
              <span className="text-xs text-muted-foreground self-center">الأكثر استخداماً:</span>
              {quickPickAccounts.map((a) => {
                const active = accountCode === a.account_code;
                return (
                  <button
                    key={a.account_code}
                    type="button"
                    onClick={() => setAccountCode(a.account_code)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs border transition",
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card border-border text-foreground hover:border-primary/40"
                    )}
                  >
                    {a.quickLabel}
                  </button>
                );
              })}
            </div>
          )}

          <Popover open={accPickerOpen} onOpenChange={setAccPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={accPickerOpen}
                className="w-full h-11 justify-between font-normal"
              >
                {selectedAccount ? (
                  <span className="truncate">
                    <span className="font-mono text-xs text-muted-foreground ml-1">{selectedAccount.account_code}</span>
                    <span>— {selectedAccount.account_name}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">— اختر حساب مصروف —</span>
                )}
                <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
              <Command shouldFilter={false}>
                <div className="flex items-center border-b px-3">
                  <Search className="w-4 h-4 ml-2 opacity-50 shrink-0" />
                  <CommandInput
                    value={accSearch}
                    onValueChange={setAccSearch}
                    placeholder="ابحث بالاسم أو الرقم (مثال: نقل أو 5530)"
                    className="h-10"
                  />
                </div>
                <CommandList>
                  {accSearch.trim().length < 2 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      اكتب رقم أو اسم الحساب
                    </div>
                  ) : filteredAccounts.length === 0 ? (
                    <CommandEmpty>لا توجد نتائج</CommandEmpty>
                  ) : (
                    <CommandGroup heading={`أعلى ${filteredAccounts.length} نتيجة`}>
                      {filteredAccounts.map((a) => (
                        <CommandItem
                          key={a.account_code}
                          value={a.account_code}
                          onSelect={() => {
                            setAccountCode(a.account_code);
                            setAccPickerOpen(false);
                            setAccSearch("");
                          }}
                          className="flex items-center gap-2"
                        >
                          <Check
                            className={cn(
                              "w-4 h-4",
                              accountCode === a.account_code ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="font-mono text-xs text-muted-foreground w-14">{a.account_code}</span>
                          <span className="truncate">{a.account_name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        )}

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

        <Button
          className="w-full h-12 text-base"
          onClick={save}
          disabled={saving || !amount || (isSupplierMode ? !supplierId : !accountCode)}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 ml-2" /> {isSupplierMode ? "حفظ سند الصرف" : "حفظ المصروف"}</>}
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