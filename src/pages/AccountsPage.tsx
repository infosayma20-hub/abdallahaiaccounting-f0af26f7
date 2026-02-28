import { useState, useEffect, useMemo, useCallback } from "react";
import { ArrowRight, Loader2, RefreshCw, Plus, ChevronDown, ChevronLeft, Search, Pencil, Eye, PlusCircle, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

const typeOrder = ["Asset", "Liability", "Owner's Equity", "Equity", "Revenue", "Purchases", "Expenses"];

const typeLabels: Record<string, string> = {
  "Asset": "أصول",
  "Liability": "التزامات",
  "Owner's Equity": "حقوق ملكية",
  "Equity": "حقوق ملكية",
  "Revenue": "إيرادات",
  "Purchases": "مشتريات",
  "Expenses": "مصروفات",
};

const naturalBalance: Record<string, string> = {
  "Asset": "مدين",
  "Liability": "دائن",
  "Owner's Equity": "دائن",
  "Equity": "دائن",
  "Revenue": "دائن",
  "Purchases": "مدين",
  "Expenses": "مدين",
};

const accountTypeOptions = [
  { value: "Asset", label: "أصول" },
  { value: "Liability", label: "التزامات" },
  { value: "Owner's Equity", label: "حقوق الملكية" },
  { value: "Revenue", label: "إيرادات" },
  { value: "Expenses", label: "مصروفات" },
];

const filterTabs = [
  { value: "all", label: "الكل" },
  { value: "Asset", label: "أصول" },
  { value: "Liability", label: "التزامات" },
  { value: "Owner's Equity", label: "ملكية" },
  { value: "Revenue", label: "إيرادات" },
  { value: "Expenses", label: "مصروفات" },
];

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
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [autoSetupAttempted, setAutoSetupAttempted] = useState(false);

  const fetchAccounts = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.from('accounts').select('*').eq('user_id', user.id).order('account_code');
      if (error) throw error;
      setAccounts(data || []);
      return data || [];
    } catch (err: any) {
      setError(err.message || "خطأ في جلب البيانات");
      return [];
    } finally {
      setLoading(false);
    }
  };

  const setupDefaultAccounts = async (silent = false) => {
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
      if (!silent) toast({ title: "✅ تم الإعداد", description: result.message });
      await fetchAccounts();
      await supabase.from('profiles').update({ setup_completed: true }).eq('user_id', user.id);
    } catch (err: any) {
      if (!silent) toast({ title: "خطأ", description: err.message, variant: "destructive" });
      console.error("Setup accounts error:", err);
    } finally {
      setSettingUp(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    const init = async () => {
      const data = await fetchAccounts();
      if (data && data.length === 0 && !autoSetupAttempted) {
        setAutoSetupAttempted(true);
        await setupDefaultAccounts(true);
      }
    };
    init();
  }, [user]);

  const handleAddAccount = async () => {
    if (!newAccountName.trim() || !newAccountType || !user) return;
    setAdding(true);
    try {
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

  const toggleGroup = useCallback((code: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }, []);

  const filteredAccounts = useMemo(() => {
    return accounts.filter(a => {
      if (typeFilter !== "all" && normalizeType(a.account_type) !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!a.account_name.toLowerCase().includes(q) && !a.account_code.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => a.account_code.localeCompare(b.account_code));
  }, [accounts, searchQuery, typeFilter]);

  // Build tree structure: group accounts under their parent (level 0/1)
  const treeRows = useMemo(() => {
    const rows: { account: Account; level: number; isGroup: boolean; hasChildren: boolean; isCollapsed: boolean; isVisible: boolean }[] = [];
    let currentL0: string | null = null;
    let currentL1: string | null = null;

    filteredAccounts.forEach(acc => {
      const level = getLevel(acc.account_code);
      const isGroup = level < 2;

      if (level === 0) {
        currentL0 = acc.account_code;
        currentL1 = null;
        const children = filteredAccounts.filter(a => a.account_code.startsWith(acc.account_code.substring(0, 2)) && a.account_code !== acc.account_code);
        rows.push({ account: acc, level: 0, isGroup: true, hasChildren: children.length > 0, isCollapsed: collapsedGroups.has(acc.account_code), isVisible: true });
      } else if (level === 1) {
        currentL1 = acc.account_code;
        const parentL0 = filteredAccounts.find(a => getLevel(a.account_code) === 0 && acc.account_code.startsWith(a.account_code.substring(0, 2)));
        const parentCollapsed = parentL0 ? collapsedGroups.has(parentL0.account_code) : false;
        const children = filteredAccounts.filter(a => a.account_code.startsWith(acc.account_code.substring(0, 3)) && a.account_code !== acc.account_code && getLevel(a.account_code) === 2);
        rows.push({ account: acc, level: 1, isGroup: true, hasChildren: children.length > 0, isCollapsed: collapsedGroups.has(acc.account_code), isVisible: !parentCollapsed });
      } else {
        const parentL1Code = filteredAccounts.find(a => getLevel(a.account_code) === 1 && acc.account_code.startsWith(a.account_code.substring(0, 3)));
        const parentL0Code = filteredAccounts.find(a => getLevel(a.account_code) === 0 && acc.account_code.startsWith(a.account_code.substring(0, 2)));
        const l0Collapsed = parentL0Code ? collapsedGroups.has(parentL0Code.account_code) : false;
        const l1Collapsed = parentL1Code ? collapsedGroups.has(parentL1Code.account_code) : false;
        rows.push({ account: acc, level: 2, isGroup: false, hasChildren: false, isCollapsed: false, isVisible: !l0Collapsed && !l1Collapsed });
      }
    });

    return rows.filter(r => r.isVisible);
  }, [filteredAccounts, collapsedGroups]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    accounts.forEach(a => {
      const t = normalizeType(a.account_type);
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }, [accounts]);

  return (
    <div className="min-h-screen bg-[hsl(210,20%,98%)] dark:bg-background" dir="rtl">
      {/* Top Header */}
      <div className="bg-white dark:bg-card border-b border-[hsl(210,14%,89%)] dark:border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate("/")} className="p-1.5 rounded-lg hover:bg-[hsl(210,20%,96%)] dark:hover:bg-muted transition-colors">
                <ArrowRight className="h-5 w-5 text-[hsl(240,10%,10%)] dark:text-foreground" />
              </button>
              <div>
                <h1 className="text-base font-bold text-[hsl(240,10%,10%)] dark:text-foreground">شجرة الحسابات</h1>
                <p className="text-[11px] text-[hsl(210,10%,42%)] dark:text-muted-foreground">{accounts.length} حساب</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={fetchAccounts} disabled={loading} className="h-8 w-8">
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
              <Button onClick={() => setShowAddDialog(true)} size="sm" className="h-8 bg-[hsl(142,71%,45%)] hover:bg-[hsl(142,71%,38%)] text-white gap-1.5 rounded-lg text-xs font-semibold">
                <Plus className="h-3.5 w-3.5" />
                إضافة حساب
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 space-y-4">
        {/* Summary Cards */}
        {!loading && accounts.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {typeOrder.filter(t => typeCounts[t]).map(t => (
              <div key={t} className="bg-white dark:bg-card rounded-lg border border-[hsl(210,14%,89%)] dark:border-border px-3 py-2.5 text-center">
                <p className="text-[10px] text-[hsl(210,10%,42%)] dark:text-muted-foreground font-medium">{typeLabels[t]}</p>
                <p className="text-lg font-bold text-[hsl(240,10%,10%)] dark:text-foreground tabular-nums">{typeCounts[t]}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filter Tabs + Search */}
        {!loading && accounts.length > 0 && (
          <div className="bg-white dark:bg-card rounded-lg border border-[hsl(210,14%,89%)] dark:border-border">
            <div className="flex items-center border-b border-[hsl(210,14%,89%)] dark:border-border overflow-x-auto">
              {filterTabs.map(tab => (
                <button
                  key={tab.value}
                  onClick={() => setTypeFilter(tab.value)}
                  className={cn(
                    "px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors relative",
                    typeFilter === tab.value
                      ? "text-[hsl(142,71%,45%)]"
                      : "text-[hsl(210,10%,42%)] dark:text-muted-foreground hover:text-[hsl(240,10%,10%)] dark:hover:text-foreground"
                  )}
                >
                  {tab.label}
                  {tab.value !== "all" && typeCounts[tab.value] ? ` (${typeCounts[tab.value]})` : ""}
                  {typeFilter === tab.value && (
                    <span className="absolute bottom-0 inset-x-0 h-[2px] bg-[hsl(142,71%,45%)] rounded-t" />
                  )}
                </button>
              ))}
            </div>
            <div className="px-3 py-2">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(210,10%,42%)] dark:text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث بالكود أو الاسم..."
                  className="pr-9 border-0 bg-[hsl(210,20%,98%)] dark:bg-muted/30 rounded-lg text-sm h-9 focus-visible:ring-1 focus-visible:ring-[hsl(142,71%,45%)]"
                  dir="rtl"
                />
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[hsl(142,71%,45%)]" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-white dark:bg-card rounded-lg border border-destructive/30 p-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={fetchAccounts}>إعادة المحاولة</Button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && accounts.length === 0 && (
          <div className="bg-white dark:bg-card rounded-lg border border-dashed border-[hsl(210,14%,89%)] dark:border-border p-10 text-center">
            <div className="w-14 h-14 mx-auto rounded-xl bg-[hsl(142,71%,45%)]/10 flex items-center justify-center mb-4">
              <Plus className="h-7 w-7 text-[hsl(142,71%,45%)]" />
            </div>
            <h3 className="text-base font-bold text-[hsl(240,10%,10%)] dark:text-foreground">لا توجد حسابات بعد</h3>
            <p className="text-sm text-[hsl(210,10%,42%)] dark:text-muted-foreground mt-1 mb-4">اضغط الزر لإنشاء شجرة الحسابات الافتراضية</p>
            <Button onClick={() => setupDefaultAccounts(false)} disabled={settingUp} className="gap-2 bg-[hsl(142,71%,45%)] hover:bg-[hsl(142,71%,38%)] text-white">
              {settingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {settingUp ? "جاري الإعداد..." : "إنشاء شجرة الحسابات"}
            </Button>
          </div>
        )}

        {/* Table */}
        {!loading && !error && accounts.length > 0 && (
          <div className="bg-white dark:bg-card rounded-lg border border-[hsl(210,14%,89%)] dark:border-border overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-[80px_1fr_100px_90px] sm:grid-cols-[100px_1fr_120px_100px_80px] bg-[hsl(210,20%,97%)] dark:bg-muted/30 border-b border-[hsl(210,14%,89%)] dark:border-border px-3 py-2.5 text-[11px] font-bold text-[hsl(210,10%,42%)] dark:text-muted-foreground uppercase tracking-wide">
              <span>رمز الحساب</span>
              <span>اسم الحساب</span>
              <span className="hidden sm:block">النوع</span>
              <span>الرصيد الطبيعي</span>
              <span className="hidden sm:block text-center">إجراءات</span>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-[hsl(210,14%,93%)] dark:divide-border">
              {treeRows.map((row, idx) => {
                const { account: acc, level, isGroup, hasChildren, isCollapsed } = row;
                const nType = normalizeType(acc.account_type);
                const isHovered = hoveredRow === acc.id;

                return (
                  <div
                    key={acc.id}
                    className={cn(
                      "grid grid-cols-[80px_1fr_100px_90px] sm:grid-cols-[100px_1fr_120px_100px_80px] px-3 py-2 text-sm transition-colors items-center group",
                      isGroup && level === 0 && "bg-[hsl(210,20%,97%)] dark:bg-muted/20",
                      isGroup && level === 1 && "bg-[hsl(210,20%,98.5%)] dark:bg-muted/10",
                      !isGroup && idx % 2 === 0 && "bg-white dark:bg-card",
                      !isGroup && idx % 2 !== 0 && "bg-[hsl(210,20%,99.5%)] dark:bg-card",
                      "hover:bg-[hsl(142,71%,45%)]/[0.04] dark:hover:bg-primary/5"
                    )}
                    onMouseEnter={() => setHoveredRow(acc.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    {/* Code */}
                    <span className="font-mono text-[12px] font-semibold text-[hsl(210,10%,42%)] dark:text-muted-foreground tabular-nums">
                      {acc.account_code}
                    </span>

                    {/* Name with hierarchy */}
                    <div
                      className="flex items-center gap-1.5 min-w-0"
                      style={{ paddingRight: level === 2 ? 40 : level === 1 ? 20 : 0 }}
                    >
                      {isGroup && hasChildren && (
                        <button
                          onClick={() => toggleGroup(acc.account_code)}
                          className="p-0.5 rounded hover:bg-[hsl(210,14%,89%)] dark:hover:bg-muted transition-colors shrink-0"
                        >
                          <ChevronDown className={cn("h-3.5 w-3.5 text-[hsl(210,10%,42%)] dark:text-muted-foreground transition-transform", isCollapsed && "-rotate-90 rtl:rotate-90")} />
                        </button>
                      )}
                      {!isGroup && level === 2 && (
                        <span className="w-4 shrink-0 border-b border-[hsl(210,14%,89%)] dark:border-border mr-1" />
                      )}
                      <span className={cn(
                        "truncate",
                        isGroup && level === 0 && "font-bold text-[hsl(240,10%,10%)] dark:text-foreground text-[13px]",
                        isGroup && level === 1 && "font-semibold text-[hsl(240,10%,15%)] dark:text-foreground/90 text-[13px]",
                        !isGroup && "font-normal text-[hsl(240,10%,20%)] dark:text-foreground/80"
                      )}>
                        {acc.account_name}
                      </span>
                    </div>

                    {/* Type */}
                    <span className="hidden sm:block text-[11px] text-[hsl(210,10%,42%)] dark:text-muted-foreground font-medium">
                      {typeLabels[nType] || nType}
                    </span>

                    {/* Natural Balance */}
                    <span className={cn(
                      "text-[11px] font-medium",
                      naturalBalance[nType] === "مدين"
                        ? "text-[hsl(142,71%,40%)] dark:text-green-400"
                        : "text-[hsl(0,72%,51%)] dark:text-red-400"
                    )}>
                      {naturalBalance[nType] || "—"}
                    </span>

                    {/* Row Actions (hover) */}
                    <div className="hidden sm:flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="p-1 rounded hover:bg-[hsl(210,14%,89%)] dark:hover:bg-muted transition-colors"
                        title="تعديل"
                      >
                        <Pencil className="h-3.5 w-3.5 text-[hsl(210,10%,42%)] dark:text-muted-foreground" />
                      </button>
                      <button
                        className="p-1 rounded hover:bg-[hsl(210,14%,89%)] dark:hover:bg-muted transition-colors"
                        title="عرض الحركات"
                        onClick={() => navigate(`/account-statement?code=${acc.account_code}&name=${encodeURIComponent(acc.account_name)}`)}
                      >
                        <Eye className="h-3.5 w-3.5 text-[hsl(210,10%,42%)] dark:text-muted-foreground" />
                      </button>
                      <button
                        className="p-1 rounded hover:bg-[hsl(210,14%,89%)] dark:hover:bg-muted transition-colors"
                        title="إضافة فرعي"
                      >
                        <PlusCircle className="h-3.5 w-3.5 text-[hsl(210,10%,42%)] dark:text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="border-t border-[hsl(210,14%,89%)] dark:border-border px-3 py-2 bg-[hsl(210,20%,97%)] dark:bg-muted/30">
              <p className="text-[11px] text-[hsl(210,10%,42%)] dark:text-muted-foreground">
                إجمالي: {filteredAccounts.length} حساب
                {searchQuery && ` (من ${accounts.length})`}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Add Account Dialog */}
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
            <Button onClick={handleAddAccount} disabled={adding || !newAccountName.trim() || !newAccountType} className="w-full rounded-xl bg-[hsl(142,71%,45%)] hover:bg-[hsl(142,71%,38%)] text-white">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "إضافة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountsPage;
