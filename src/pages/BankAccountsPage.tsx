import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Plus, Landmark, Loader2, Settings, FileText, X, Search, ChevronDown } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { multiWordMatchAny } from "@/lib/utils";

const PALESTINIAN_BANKS = [
  "البنك الإسلامي العربي", "بنك فلسطين", "البنك الأهلي الأردني", "بنك القدس",
  "البنك التجاري الفلسطيني", "بنك الاستثمار الفلسطيني", "البنك العربي",
  "البنك الأردني الكويتي", "بنك الإسكان للتجارة والتمويل", "المصرف الإسلامي الفلسطيني",
  "بنك الأردن", "البنك الوطني", "Cairo Amman Bank", "أخرى",
];

const AccountPicker = ({ accounts, value, onChange, placeholder }: {
  accounts: { account_code: string; account_name: string; account_type: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = accounts.find(a => a.account_code === value);
  const filtered = useMemo(() => {
    if (!search.trim()) return accounts;
    return accounts.filter(a => multiWordMatchAny(search, a.account_code, a.account_name));
  }, [accounts, search]);

  const typeColor: Record<string, string> = {
    "أصول": "text-blue-600", "التزامات": "text-red-500", "حقوق ملكية": "text-purple-600",
    "إيرادات": "text-green-600", "مصروفات": "text-orange-500",
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mt-1.5 w-full h-11 rounded-lg border border-border bg-background px-3 flex items-center justify-between text-sm hover:bg-muted/50 transition-colors"
          dir="rtl"
        >
          {selected ? (
            <span className="flex items-center gap-2 font-mono text-foreground">
              <span className="font-bold">{selected.account_code}</span>
              <span className="text-muted-foreground">-</span>
              <span className="text-foreground">{selected.account_name}</span>
            </span>
          ) : value ? (
            <span className="font-mono text-foreground">{value}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder || "اختر حساب..."}</span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-[var(--radix-popover-trigger-width)] p-0 rounded-xl max-h-[280px] overflow-hidden" dir="rtl">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث بالرقم أو الاسم..."
              className="w-full h-9 rounded-lg bg-muted/50 pr-8 pl-3 text-xs outline-none focus:ring-1 focus:ring-accent"
              autoFocus
            />
          </div>
        </div>
        <div className="overflow-y-auto max-h-[220px]">
          {filtered.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-4">لا توجد نتائج</p>
          ) : (
            filtered.map(acc => (
              <button
                key={acc.account_code}
                onClick={() => { onChange(acc.account_code); setOpen(false); setSearch(""); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-right text-xs hover:bg-muted transition-colors ${value === acc.account_code ? "bg-accent/10" : ""}`}
              >
                <span className="font-mono font-bold text-foreground min-w-[44px]">{acc.account_code}</span>
                <span className="flex-1 text-foreground truncate">{acc.account_name}</span>
                <span className={`text-[9px] ${typeColor[acc.account_type] || "text-muted-foreground"}`}>{acc.account_type}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const BankAccountsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();

  const [banks, setBanks] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<{ account_code: string; account_name: string; account_type: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);

  // Form
  const [bankName, setBankName] = useState("");
  const [customBankName, setCustomBankName] = useState("");
  const [branch, setBranch] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState("current");
  const [currency, setCurrency] = useState("ILS");
  const [glAccountCode, setGlAccountCode] = useState("1120");
  const [commissionAccountCode, setCommissionAccountCode] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingBalanceDate, setOpeningBalanceDate] = useState(new Date().toISOString().split("T")[0]);
  const [minBalanceAlert, setMinBalanceAlert] = useState("");
  const [notes, setNotes] = useState("");

  const fetchBanks = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: bankData }, { data: accData }] = await Promise.all([
      supabase.from("bank_accounts").select("*").eq("user_id", dataOwnerId!).order("created_at", { ascending: false }),
      supabase.from("accounts").select("account_code, account_name, account_type").eq("user_id", dataOwnerId!).eq("is_active", true).order("account_code"),
    ]);
    setBanks(bankData || []);
    setAccounts(accData || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchBanks(); }, [fetchBanks]);
  useEffect(() => { if (searchParams.get("new") === "1") setModalOpen(true); }, [searchParams]);

  const resetForm = () => {
    setBankName(""); setCustomBankName(""); setBranch(""); setAccountName("");
    setAccountNumber(""); setAccountType("current"); setCurrency("ILS");
    setGlAccountCode("1120"); setCommissionAccountCode(""); setOpeningBalance("");
    setOpeningBalanceDate(new Date().toISOString().split("T")[0]);
    setMinBalanceAlert(""); setNotes(""); setEditingBankId(null);
  };

  const openEditModal = (bank: any) => {
    const isPredefined = PALESTINIAN_BANKS.includes(bank.bank_name);
    setBankName(isPredefined ? bank.bank_name : "أخرى");
    setCustomBankName(isPredefined ? "" : bank.bank_name);
    setBranch(bank.branch || "");
    setAccountName(bank.name || "");
    setAccountNumber(bank.account_number || "");
    setAccountType(bank.account_type || "current");
    setCurrency(bank.currency || "ILS");
    setGlAccountCode(bank.gl_account_code || "1120");
    setCommissionAccountCode(bank.commission_account_code || "");
    setOpeningBalance(bank.opening_balance?.toString() || "");
    setOpeningBalanceDate(bank.opening_balance_date || new Date().toISOString().split("T")[0]);
    setMinBalanceAlert(bank.min_balance_alert?.toString() || "");
    setNotes(bank.notes || "");
    setEditingBankId(bank.id);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    const finalBankName = bankName === "أخرى" ? customBankName : bankName;
    if (!finalBankName || !accountName) {
      toast({ title: "خطأ", description: "اسم البنك واسم الحساب مطلوبان", variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload = {
      name: accountName,
      bank_name: finalBankName,
      branch: branch || null,
      account_number: accountNumber || null,
      account_type: accountType,
      currency,
      gl_account_code: glAccountCode || null,
      commission_account_code: commissionAccountCode || null,
      opening_balance: Number(openingBalance) || 0,
      opening_balance_date: openingBalanceDate || null,
      min_balance_alert: minBalanceAlert ? Number(minBalanceAlert) : null,
      notes: notes || null,
    };

    const isNew = !editingBankId;
    const { error } = isNew
      ? await supabase.from("bank_accounts").insert({ ...payload, user_id: dataOwnerId! })
      : await supabase.from("bank_accounts").update(payload).eq("id", editingBankId).eq("user_id", dataOwnerId!);

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      // Create opening balance transaction for new bank accounts
      if (isNew && Number(openingBalance) > 0 && glAccountCode) {
        const obDate = openingBalanceDate || new Date().toISOString().split("T")[0];
        await supabase.rpc("create_opening_balance_entry", {
          p_user_id: user.id,
          p_debit_account_code: glAccountCode,
          p_credit_account_code: "3200",
          p_amount: Number(openingBalance),
          p_balance_date: obDate,
          p_description: `رصيد افتتاحي — ${accountName}`,
          p_currency: currency || "ILS",
          p_contact_id: null,
          p_reference: `BANK-OB-${glAccountCode}`,
          p_replace_existing: false,
          p_idempotency_key: `BANK-OB-${glAccountCode}-${Date.now()}`,
        });
      }
      toast({ title: isNew ? `✅ تم إضافة حساب ${finalBankName} بنجاح` : `✅ تم تعديل حساب ${finalBankName} بنجاح` });
      setModalOpen(false);
      resetForm();
      fetchBanks();
    }
    setSaving(false);
  };

  const formatAmount = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const currencySymbol = (c: string) => c === "ILS" ? "₪" : c === "USD" ? "$" : "د.أ";

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto" dir="rtl">
      <PageHeader title="الحسابات البنكية" breadcrumb={["المالية", "الحسابات البنكية"]} />
      {banks.length > 0 && (
        <div className="flex items-center justify-start">
          <Button size="sm" className="gap-2" onClick={() => { resetForm(); setModalOpen(true); }}>
            <Plus className="h-4 w-4" />إضافة حساب بنكي
          </Button>
        </div>
      )}

      {/* Banks Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : banks.length === 0 ? (
        <div className="text-center py-20">
          <Landmark className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">لم تُعرَّف حسابات بنكية بعد</p>
          <Button onClick={() => { resetForm(); setModalOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" />إضافة حساب بنكي
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {banks.map(bank => (
            <Card key={bank.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-4 text-white rounded-t-xl" style={{ background: "#1B3A5C" }}>
                <div className="flex items-center gap-2">
                  <Landmark className="h-5 w-5" />
                  <span className="text-sm font-bold">{bank.bank_name}</span>
                </div>
                <p className="text-[11px] text-white/60 mt-0.5">{bank.name}</p>
              </div>
              <CardContent className="p-4">
                <p className="text-2xl font-bold font-mono" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                  {currencySymbol(bank.currency)}{formatAmount(Number(bank.opening_balance || 0))}
                </p>
                <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] text-muted-foreground">
                  <div><span className="font-medium">رقم الحساب:</span> {bank.account_number || "—"}</div>
                  <div><span className="font-medium">العملة:</span> {bank.currency}</div>
                  <div><span className="font-medium">النوع:</span> {bank.account_type === "savings" ? "توفير" : bank.account_type === "loan" ? "قرض" : "جاري"}</div>
                  <div><span className="font-medium">الفرع:</span> {bank.branch || "—"}</div>
                </div>
                <div className="flex gap-2 mt-4 pt-3 border-t">
                  <Button variant="ghost" size="sm" className="text-xs flex-1" onClick={() => navigate(`/account-statement?code=${bank.gl_account_code || "1120"}`)}>
                    <FileText className="h-3 w-3 ml-1" />كشف حساب
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => openEditModal(bank)}>
                     <Settings className="h-3 w-3" />
                   </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Bank Modal - Centered like Voucher */}
      {modalOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 transition-opacity" onClick={() => setModalOpen(false)} />

          <div
            className="fixed z-50 bg-background shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300 rounded-2xl"
            style={{ width: "min(680px, 95vw)", maxHeight: "min(92vh, 900px)", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
            dir="rtl"
          >
            {/* Header */}
            <div className="p-5 text-white shrink-0 rounded-t-2xl" style={{ background: "var(--gradient-navy, linear-gradient(135deg, #050F1E, #0A2342))" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                    <Landmark className="h-5 w-5" />
                  </div>
                  <div>
                     <h2 className="text-lg font-bold" style={{ fontFamily: "Tajawal, sans-serif" }}>{editingBankId ? "تعديل حساب بنكي" : "إضافة حساب بنكي"}</h2>
                     <p className="text-xs text-white/60">{editingBankId ? "تعديل بيانات الحساب البنكي" : "تعريف حساب بنكي جديد وربطه بشجرة الحسابات"}</p>
                  </div>
                </div>
                <button onClick={() => setModalOpen(false)} className="p-2 rounded-lg hover:bg-white/20 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Bank Info */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-muted-foreground flex items-center gap-2" style={{ fontFamily: "Tajawal, sans-serif" }}>
                  <span className="w-1 h-4 rounded-full bg-primary" />
                  معلومات البنك
                </h3>
                <div>
                  <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>البنك *</Label>
                  <Select value={bankName} onValueChange={setBankName}>
                    <SelectTrigger className="mt-1.5 h-11"><SelectValue placeholder="اختر البنك..." /></SelectTrigger>
                    <SelectContent>
                      {PALESTINIAN_BANKS.map(b => <SelectItem key={b} value={b}>🏦 {b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {bankName === "أخرى" && (
                    <Input value={customBankName} onChange={e => setCustomBankName(e.target.value)} placeholder="اسم البنك..." className="mt-2 h-11" />
                  )}
                </div>
                <div>
                  <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>الفرع</Label>
                  <Input value={branch} onChange={e => setBranch(e.target.value)} placeholder="مثال: رام الله الرئيسي" className="mt-1.5 h-11" />
                </div>
                <div>
                  <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>اسم الحساب *</Label>
                  <Input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="اسم مميز يظهر في النظام" className="mt-1.5 h-11" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>رقم الحساب</Label>
                    <Input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className="mt-1.5 h-11 font-mono" />
                  </div>
                  <div>
                    <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>نوع الحساب</Label>
                    <Select value={accountType} onValueChange={setAccountType}>
                      <SelectTrigger className="mt-1.5 h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="current">جاري</SelectItem>
                        <SelectItem value="savings">توفير</SelectItem>
                        <SelectItem value="loan">قرض</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>العملة *</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="mt-1.5 h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ILS">₪ شيكل إسرائيلي</SelectItem>
                      <SelectItem value="USD">$ دولار أمريكي</SelectItem>
                      <SelectItem value="JOD">د.أ دينار أردني</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* GL Mapping */}
              <div className="space-y-4 rounded-xl border p-5" style={{ borderColor: "hsl(40 80% 60% / 0.3)", background: "hsl(40 80% 60% / 0.05)" }}>
                <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: "#E8A020", fontFamily: "Tajawal, sans-serif" }}>
                  ⚡ الربط بشجرة الحسابات
                </h3>
                <p className="text-[11px] text-muted-foreground">ربط هذا الحساب البنكي بحسابات أموالي</p>
                <div>
                  <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>حساب البنك الرئيسي *</Label>
                  <AccountPicker accounts={accounts} value={glAccountCode} onChange={setGlAccountCode} placeholder="اختر حساب البنك..." />
                  <p className="text-[10px] text-muted-foreground mt-1">جميع العمليات الواردة والصادرة تُسجَّل في هذا الحساب</p>
                </div>
                <div>
                  <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>حساب عمولات البنك</Label>
                  <AccountPicker accounts={accounts} value={commissionAccountCode} onChange={setCommissionAccountCode} placeholder="اختر حساب العمولات..." />
                  <p className="text-[10px] text-muted-foreground mt-1">يُستخدم تلقائياً عند تسجيل رسوم خدمات بنكية</p>
                </div>
              </div>

              {/* Additional Settings */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-muted-foreground flex items-center gap-2" style={{ fontFamily: "Tajawal, sans-serif" }}>
                  <span className="w-1 h-4 rounded-full bg-primary" />
                  إعدادات إضافية
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>الرصيد الافتتاحي</Label>
                    <Input type="number" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} placeholder="0.00" className="mt-1.5 h-11 font-mono" />
                  </div>
                  <div>
                    <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>تاريخ الرصيد</Label>
                    <Input type="date" value={openingBalanceDate} onChange={e => setOpeningBalanceDate(e.target.value)} className="mt-1.5 h-11" />
                  </div>
                </div>
                <div>
                  <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>حد التنبيه عند انخفاض الرصيد</Label>
                  <Input type="number" value={minBalanceAlert} onChange={e => setMinBalanceAlert(e.target.value)} placeholder="مثال: 5000" className="mt-1.5 h-11 font-mono" />
                </div>
                <div>
                  <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>ملاحظات</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="mt-1.5" />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t bg-muted/30 p-4 flex items-center gap-3">
              <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving} className="h-11 px-6">
                إلغاء
              </Button>
              <Button
                className="flex-1 h-11 text-base font-bold gap-2 text-white"
                style={{ background: "var(--gradient-navy, linear-gradient(135deg, #050F1E, #0A2342))" }}
                onClick={handleSave}
                disabled={saving}
              >
                 {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}
                 {editingBankId ? "تحديث الحساب البنكي" : "حفظ الحساب البنكي"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default BankAccountsPage;