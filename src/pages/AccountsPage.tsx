import { useState, useEffect, useMemo } from "react";
import { ArrowRight, Loader2, RefreshCw, Plus, ChevronDown, Search, Wallet, TrendingUp, TrendingDown, Scale, DollarSign, Building2, Landmark, CreditCard, Package, Users, Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  is_system: boolean | null;
}

function getLevel(code: string): number {
  if (!code) return 2;
  if (code.endsWith("00") && code[2] === "0") return 0;
  if (code.endsWith("00")) return 1;
  return 2;
}

interface SubCategory { label: string; prefixes: string[]; }

const subCategories: Record<string, SubCategory[]> = {
  "Asset": [
    { label: "أصول متداولة", prefixes: ["11"] },
    { label: "أصول غير متداولة", prefixes: ["12", "13", "14", "15", "16", "17", "18", "19"] },
  ],
  "Liability": [
    { label: "التزامات متداولة", prefixes: ["21"] },
    { label: "التزامات غير متداولة", prefixes: ["22", "23", "24", "25", "26", "27", "28", "29"] },
  ],
  "Expenses": [
    { label: "مصاريف تشغيلية", prefixes: ["51"] },
    { label: "إدارية وعمومية", prefixes: ["52", "53", "54", "55"] },
    { label: "بيعية وتسويقية", prefixes: ["56"] },
    { label: "استهلاكات وإطفاءات", prefixes: ["57"] },
    { label: "مصاريف أخرى", prefixes: ["58", "59"] },
  ],
};

const categoryConfig: Record<string, { icon: typeof Wallet; color: string; bgColor: string; label: string }> = {
  "Asset": { icon: Wallet, color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800", label: "الأصول" },
  "Liability": { icon: CreditCard, color: "text-amber-600 dark:text-amber-400", bgColor: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800", label: "الالتزامات" },
  "Owner's Equity": { icon: Scale, color: "text-purple-600 dark:text-purple-400", bgColor: "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800", label: "حقوق الملكية" },
  "Equity": { icon: Scale, color: "text-purple-600 dark:text-purple-400", bgColor: "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800", label: "حقوق الملكية" },
  "Revenue": { icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", bgColor: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800", label: "الإيرادات" },
  "Expenses": { icon: TrendingDown, color: "text-red-600 dark:text-red-400", bgColor: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800", label: "المصروفات" },
  "Purchases": { icon: Package, color: "text-orange-600 dark:text-orange-400", bgColor: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800", label: "مشتريات" },
};

const accountTypeOptions = [
  { value: "Asset", label: "أصول" },
  { value: "Liability", label: "التزامات" },
  { value: "Owner's Equity", label: "حقوق الملكية" },
  { value: "Revenue", label: "إيرادات" },
  { value: "Expenses", label: "مصروفات" },
];

const typeOrder = ["Asset", "Liability", "Owner's Equity", "Equity", "Revenue", "Purchases", "Expenses"];

// Map Arabic account types to their English keys for consistent display
const arabicTypeMap: Record<string, string> = {
  "إيرادات": "Revenue",
  "مصاريف": "Expenses",
  "مصروفات": "Expenses",
  "أصول": "Asset",
  "التزامات": "Liability",
  "خصوم": "Liability",
  "حقوق ملكية": "Owner's Equity",
  "مشتريات": "Purchases",
};

function normalizeType(type: string): string {
  return arabicTypeMap[type] || type;
}

const AccountsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState("");
  const [adding, setAdding] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const [settingUp, setSettingUp] = useState(false);

  const fetchAccounts = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.from('accounts').select('*').eq('user_id', user.id).order('account_code');
      if (error) throw error;
      setAccounts(data || []);
    } catch (err: any) {
      setError(err.message || "خطأ في جلب البيانات");
    } finally {
      setLoading(false);
    }
  };

  const setupDefaultAccounts = async () => {
    if (!user) return;
    setSettingUp(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("غير مصرح");
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/setup-accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ userId: user.id, businessType: 'general', hasInventory: true, hasReceivables: true, hasEmployees: true }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "فشل الإعداد");
      toast({ title: "✅ تم الإعداد", description: result.message });
      await fetchAccounts();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSettingUp(false);
    }
  };

  useEffect(() => { fetchAccounts(); }, [user]);

  useEffect(() => {
    if (accounts.length > 0) {
      const types = [...new Set(accounts.map(a => normalizeType(a.account_type)).filter(Boolean))];
      const initial: Record<string, boolean> = {};
      types.forEach(t => { initial[t] = true; });
      setOpenSections(initial);
    }
  }, [accounts]);

  const handleAddAccount = async () => {
    if (!newAccountName.trim() || !newAccountType || !user) return;
    setAdding(true);
    try {
      // Parse code from name like "5910 - مصروف جديد"
      const match = newAccountName.match(/^(\d{4})\s*[-–]\s*(.+)/);
      const code = match ? match[1] : newAccountName.substring(0, 4);
      const name = match ? match[2].trim() : newAccountName;

      const { error } = await supabase.from('accounts').insert({
        user_id: user.id,
        account_code: code,
        account_name: name,
        account_type: newAccountType,
      });
      if (error) throw error;
      toast({ title: "تم إضافة الحساب بنجاح ✅" });
      setNewAccountName("");
      setNewAccountType("");
      setShowAddDialog(false);
      fetchAccounts();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const accountTypes = useMemo(() => {
    // Normalize types and deduplicate
    const normalizedTypes = [...new Set(accounts.map(a => normalizeType(a.account_type)).filter(Boolean))];
    return normalizedTypes.sort((a, b) => (typeOrder.indexOf(a) === -1 ? 99 : typeOrder.indexOf(a)) - (typeOrder.indexOf(b) === -1 ? 99 : typeOrder.indexOf(b)));
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter(a => {
      if (typeFilter !== "all" && normalizeType(a.account_type) !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!a.account_name.toLowerCase().includes(q) && !a.account_code.includes(q)) return false;
      }
      return true;
    });
  }, [accounts, searchQuery, typeFilter]);

  const groupedAccounts = useMemo(() => {
    const grouped: Record<string, Account[]> = {};
    accountTypes.forEach(type => {
      grouped[type] = filteredAccounts.filter(a => normalizeType(a.account_type) === type).sort((a, b) => a.account_code.localeCompare(b.account_code));
    });
    return grouped;
  }, [filteredAccounts, accountTypes]);

  const renderAccountRow = (acc: Account) => {
    const level = getLevel(acc.account_code);
    const isGroup = level < 2;
    return (
      <div key={acc.id} className={`flex items-center justify-between rounded-lg px-3 py-2.5 transition-all duration-150 hover:bg-muted/50 ${isGroup ? "bg-muted/20" : ""}`} style={{ paddingRight: level === 2 ? "20px" : level === 1 ? "12px" : "4px" }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[11px] font-mono font-bold text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded shrink-0">{acc.account_code}</span>
          <span className={`text-sm truncate ${isGroup ? "font-bold text-foreground" : "font-medium text-foreground"}`}>{acc.account_name}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 pt-6 space-y-4 pb-8" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-2 rounded-xl hover:bg-muted transition-colors"><ArrowRight className="h-5 w-5 text-foreground" /></button>
          <div>
            <h1 className="text-lg font-bold text-foreground">شجرة الحسابات</h1>
            <p className="text-xs text-muted-foreground">{filteredAccounts.length} حساب</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setShowAddDialog(true)}><Plus className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={fetchAccounts} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
        </div>
      </div>

      {!loading && !error && accounts.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="ابحث بالكود أو الاسم..." className="pr-9 rounded-xl text-sm" dir="rtl" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter} dir="rtl">
            <SelectTrigger className="w-[130px] rounded-xl text-xs"><SelectValue placeholder="الكل" /></SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="all">جميع الأنواع</SelectItem>
              {accountTypeOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {loading && <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
      {error && (
        <Card className="border-destructive/30 bg-destructive/5"><CardContent className="p-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={fetchAccounts}>إعادة المحاولة</Button>
        </CardContent></Card>
      )}

      {!loading && !error && accounts.length === 0 && (
        <Card className="border-dashed border-2 border-primary/30">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
              <Wallet className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">لا توجد حسابات بعد</h3>
              <p className="text-sm text-muted-foreground mt-1">اضغط الزر لإنشاء شجرة الحسابات الافتراضية تلقائياً</p>
            </div>
            <Button onClick={setupDefaultAccounts} disabled={settingUp} className="gap-2">
              {settingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {settingUp ? "جاري الإعداد..." : "إنشاء شجرة الحسابات"}
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && accounts.length > 0 && (
        <div className="space-y-3">
          {accountTypes.map((type) => {
            const typeAccounts = groupedAccounts[type] || [];
            if ((searchQuery || typeFilter !== "all") && typeAccounts.length === 0) return null;
            const isOpen = openSections[type] ?? true;
            const config = categoryConfig[type] || categoryConfig["Expenses"];
            const Icon = config.icon;
            return (
              <Collapsible key={type} open={isOpen} onOpenChange={(open) => setOpenSections(prev => ({ ...prev, [type]: open }))}>
                <CollapsibleTrigger className="w-full">
                  <div className={`flex items-center justify-between px-3.5 py-3 rounded-xl border transition-colors ${config.bgColor}`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.color} bg-white/60 dark:bg-black/20`}><Icon className="h-4 w-4" /></div>
                      <span className={`text-sm font-bold ${config.color}`}>{config.label}</span>
                      <span className="text-xs text-muted-foreground font-medium">({typeAccounts.length})</span>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
                  <div className="space-y-1 mt-1.5 mr-4 border-r-2 border-border/50 pr-3">
                    {(() => {
                      const subs = subCategories[type];
                      if (subs) {
                        return subs.map((sub) => {
                          const subAccounts = typeAccounts.filter((acc) => sub.prefixes.includes(acc.account_code.substring(0, 2)));
                          if (subAccounts.length === 0) return null;
                          return (
                            <div key={sub.label} className="mb-2">
                              <div className="flex items-center gap-2 py-1.5 px-2">
                                <div className="h-px flex-1 bg-border/40" />
                                <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wide shrink-0">{sub.label}</span>
                                <div className="h-px flex-1 bg-border/40" />
                              </div>
                              {subAccounts.map(renderAccountRow)}
                            </div>
                          );
                        });
                      }
                      return typeAccounts.map(renderAccountRow);
                    })()}
                    {(() => {
                      const subs = subCategories[type];
                      if (!subs) return null;
                      const allPrefixes = subs.flatMap(s => s.prefixes);
                      const unmatched = typeAccounts.filter(acc => !allPrefixes.includes(acc.account_code.substring(0, 2)));
                      if (unmatched.length === 0) return null;
                      return (
                        <div className="mb-2">
                          <div className="flex items-center gap-2 py-1.5 px-2">
                            <div className="h-px flex-1 bg-border/40" />
                            <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wide shrink-0">أخرى</span>
                            <div className="h-px flex-1 bg-border/40" />
                          </div>
                          {unmatched.map(renderAccountRow)}
                        </div>
                      );
                    })()}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>إضافة حساب جديد</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="اسم الحساب (مثال: 5910 - مصروف جديد)" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} dir="rtl" />
            <Select value={newAccountType} onValueChange={setNewAccountType} dir="rtl">
              <SelectTrigger><SelectValue placeholder="نوع الحساب" /></SelectTrigger>
              <SelectContent className="bg-background z-50">
                {accountTypeOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={handleAddAccount} disabled={adding || !newAccountName.trim() || !newAccountType} className="w-full rounded-xl">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "إضافة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountsPage;
