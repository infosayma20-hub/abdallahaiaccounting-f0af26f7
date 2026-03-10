import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Plus, Landmark, Loader2, Settings, FileText, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

const PALESTINIAN_BANKS = [
  "البنك الإسلامي العربي", "بنك فلسطين", "البنك الأهلي الأردني", "بنك القدس",
  "البنك التجاري الفلسطيني", "بنك الاستثمار الفلسطيني", "البنك العربي",
  "البنك الأردني الكويتي", "بنك الإسكان للتجارة والتمويل", "المصرف الإسلامي الفلسطيني",
  "بنك الأردن", "البنك الوطني", "Cairo Amman Bank", "أخرى",
];

const BankAccountsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();

  const [banks, setBanks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

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
    const { data } = await supabase.from("bank_accounts").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setBanks(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchBanks(); }, [fetchBanks]);
  useEffect(() => { if (searchParams.get("new") === "1") setDrawerOpen(true); }, [searchParams]);

  const resetForm = () => {
    setBankName(""); setCustomBankName(""); setBranch(""); setAccountName("");
    setAccountNumber(""); setAccountType("current"); setCurrency("ILS");
    setGlAccountCode("1120"); setCommissionAccountCode(""); setOpeningBalance("");
    setOpeningBalanceDate(new Date().toISOString().split("T")[0]);
    setMinBalanceAlert(""); setNotes("");
  };

  const handleSave = async () => {
    if (!user) return;
    const finalBankName = bankName === "أخرى" ? customBankName : bankName;
    if (!finalBankName || !accountName) {
      toast({ title: "خطأ", description: "اسم البنك واسم الحساب مطلوبان", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("bank_accounts").insert({
      user_id: user.id,
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
    });

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `✅ تم إضافة حساب ${finalBankName} بنجاح` });
      setDrawerOpen(false);
      resetForm();
      fetchBanks();
    }
    setSaving(false);
  };

  const formatAmount = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const currencySymbol = (c: string) => c === "ILS" ? "₪" : c === "USD" ? "$" : "د.أ";

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/finance")} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold" style={{ color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}>الحسابات البنكية</h1>
        </div>
        <Button size="sm" className="gap-2 bg-[#0A2342] hover:bg-[#0D1B2A]" onClick={() => { resetForm(); setDrawerOpen(true); }}>
          <Plus className="h-4 w-4" />إضافة حساب بنكي
        </Button>
      </div>

      {/* Banks Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : banks.length === 0 ? (
        <div className="text-center py-20">
          <Landmark className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">لم تُعرَّف حسابات بنكية بعد</p>
          <Button onClick={() => { resetForm(); setDrawerOpen(true); }} className="gap-2 bg-[#0A2342]">
            <Plus className="h-4 w-4" />إضافة حساب بنكي
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {banks.map(bank => (
            <Card key={bank.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-4 text-white" style={{ background: "linear-gradient(135deg, #050F1E, #0A2342)", borderRadius: "12px 12px 0 0" }}>
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
                  <Button variant="ghost" size="sm" className="text-xs">
                    <Settings className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Bank Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full sm:w-[600px] p-0 overflow-y-auto">
          <div className="p-4 text-white" style={{ background: "linear-gradient(135deg, #050F1E, #0A2342)" }}>
            <div className="flex items-center gap-3" dir="rtl">
              <Landmark className="h-6 w-6" />
              <h2 className="text-base font-bold">إضافة حساب بنكي</h2>
            </div>
          </div>

          <div className="p-5 space-y-5" dir="rtl">
            {/* Bank Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-muted-foreground">معلومات البنك</h3>
              <div>
                <Label className="text-xs">البنك *</Label>
                <Select value={bankName} onValueChange={setBankName}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="اختر البنك..." /></SelectTrigger>
                  <SelectContent>
                    {PALESTINIAN_BANKS.map(b => <SelectItem key={b} value={b}>🏦 {b}</SelectItem>)}
                  </SelectContent>
                </Select>
                {bankName === "أخرى" && (
                  <Input value={customBankName} onChange={e => setCustomBankName(e.target.value)} placeholder="اسم البنك..." className="mt-2" />
                )}
              </div>
              <div>
                <Label className="text-xs">الفرع</Label>
                <Input value={branch} onChange={e => setBranch(e.target.value)} placeholder="مثال: رام الله الرئيسي" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">اسم الحساب *</Label>
                <Input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="اسم مميز يظهر في النظام" className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">رقم الحساب</Label>
                  <Input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className="mt-1 font-mono" />
                </div>
                <div>
                  <Label className="text-xs">نوع الحساب</Label>
                  <Select value={accountType} onValueChange={setAccountType}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current">جاري</SelectItem>
                      <SelectItem value="savings">توفير</SelectItem>
                      <SelectItem value="loan">قرض</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">العملة *</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ILS">₪ شيكل إسرائيلي</SelectItem>
                    <SelectItem value="USD">$ دولار أمريكي</SelectItem>
                    <SelectItem value="JOD">د.أ دينار أردني</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* GL Mapping */}
            <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/30 p-4">
              <h3 className="text-sm font-bold" style={{ color: "#E8A020" }}>⚡ الربط بشجرة الحسابات</h3>
              <p className="text-[11px] text-muted-foreground">ربط هذا الحساب البنكي بحسابات FINIX</p>
              <div>
                <Label className="text-xs">حساب البنك الرئيسي *</Label>
                <Input value={glAccountCode} onChange={e => setGlAccountCode(e.target.value)} placeholder="1120" className="mt-1 font-mono" />
                <p className="text-[10px] text-muted-foreground mt-1">جميع العمليات الواردة والصادرة تُسجَّل في هذا الحساب</p>
              </div>
              <div>
                <Label className="text-xs">حساب عمولات البنك</Label>
                <Input value={commissionAccountCode} onChange={e => setCommissionAccountCode(e.target.value)} placeholder="6130" className="mt-1 font-mono" />
                <p className="text-[10px] text-muted-foreground mt-1">يُستخدم تلقائياً عند تسجيل رسوم خدمات بنكية</p>
              </div>
            </div>

            {/* Opening Balance */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-muted-foreground">إعدادات إضافية</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">الرصيد الافتتاحي</Label>
                  <Input type="number" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} placeholder="0.00" className="mt-1 font-mono" />
                </div>
                <div>
                  <Label className="text-xs">تاريخ الرصيد</Label>
                  <Input type="date" value={openingBalanceDate} onChange={e => setOpeningBalanceDate(e.target.value)} className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-xs">حد التنبيه عند انخفاض الرصيد</Label>
                <Input type="number" value={minBalanceAlert} onChange={e => setMinBalanceAlert(e.target.value)} placeholder="مثال: 5000" className="mt-1 font-mono" />
              </div>
              <div>
                <Label className="text-xs">ملاحظات</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="mt-1" />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-background border-t p-4 flex items-center gap-2" dir="rtl">
            <Button variant="ghost" onClick={() => setDrawerOpen(false)} disabled={saving}>إلغاء</Button>
            <Button className="flex-1 bg-[#0A2342] hover:bg-[#0D1B2A]" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
              ✓ حفظ الحساب البنكي
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default BankAccountsPage;
