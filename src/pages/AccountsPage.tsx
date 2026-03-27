import { useState, useEffect, useMemo, useCallback } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { Loader2, RefreshCw, Plus, ChevronDown, Search, Pencil, Eye, PlusCircle, Save, Trash2, FileSpreadsheet, Lock, Info, ArrowUpDown, Upload } from "lucide-react";
import { MoveAccountModal } from "@/components/accounting/MoveAccountModal";
import { ImportAccountsModal } from "@/components/accounting/ImportAccountsModal";
import { exportAccountsToExcel } from "@/lib/accountsExport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

// Inline edit form component
const EditAccountForm = ({ account, onSave, onCancel }: { account: { account_name: string; account_code: string }; onSave: (name: string, notes: string) => void; onCancel: () => void }) => {
  const [name, setName] = useState(account.account_name);
  const [notes, setNotes] = useState("");
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">رمز الحساب</Label>
        <Input value={account.account_code} disabled className="bg-muted" />
      </div>
      <div>
        <Label className="text-xs">اسم الحساب</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} dir="rtl" />
      </div>
      <div>
        <Label className="text-xs">ملاحظات</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} dir="rtl" placeholder="ملاحظات اختيارية" />
      </div>
      <div className="flex gap-2">
        <Button onClick={() => onSave(name, notes)} disabled={!name.trim()} className="flex-1 gap-1">
          <Save className="h-4 w-4" /> حفظ
        </Button>
        <Button variant="outline" onClick={onCancel}>إلغاء</Button>
      </div>
    </div>
  );
};
import { cn, multiWordMatchAny } from "@/lib/utils";

interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  is_system: boolean | null;
  parent_code: string | null;
  description_ar?: string | null;
  sub_group_label?: string | null;
  display_order?: number | null;
  is_system_protected?: boolean | null;
  system_role?: string | null;
}

// Calculate depth based on parent_code chain
function getAccountDepth(acc: Account, accountsByCode: Map<string, Account>): number {
  let depth = 0;
  let current = acc;
  while (current.parent_code && current.parent_code !== current.account_code && depth < 10) {
    depth++;
    const parent = accountsByCode.get(current.parent_code);
    if (!parent) break;
    current = parent;
  }
  return depth;
}

function hasChildAccounts(acc: Account, allAccounts: Account[]): boolean {
  return allAccounts.some(a => a.parent_code === acc.account_code && a.account_code !== acc.account_code);
}

// Build ordered tree from flat list using parent_code
function buildOrderedTree(accounts: Account[]): Account[] {
  const byCode = new Map<string, Account>();
  accounts.forEach(a => byCode.set(a.account_code, a));
  
  const childrenOf = new Map<string, Account[]>();
  const roots: Account[] = [];
  
  accounts.forEach(a => {
    if (!a.parent_code || a.parent_code === a.account_code || !byCode.has(a.parent_code)) {
      roots.push(a);
    } else {
      const siblings = childrenOf.get(a.parent_code) || [];
      siblings.push(a);
      childrenOf.set(a.parent_code, siblings);
    }
  });
  
  const sort = (arr: Account[]) => arr.sort((a, b) => a.account_code.localeCompare(b.account_code));
  sort(roots);
  childrenOf.forEach(children => sort(children));
  
  const result: Account[] = [];
  const walk = (node: Account) => {
    result.push(node);
    const children = childrenOf.get(node.account_code);
    if (children) children.forEach(walk);
  };
  roots.forEach(walk);
  return result;
}

const arabicTypeMap: Record<string, string> = {
  "إيرادات": "Revenue",
  "مصاريف": "Expenses",
  "مصروفات": "Expenses",
  "أصول": "Asset",
  "asset": "Asset",
  "Asset": "Asset",
  "التزامات": "Liability",
  "خصوم": "Liability",
  "حقوق ملكية": "Owner's Equity",
  "مشتريات": "Purchases",
};

function normalizeType(type: string): string {
  return arabicTypeMap[type] || type;
}

const typeOrder = ["Asset", "Liability", "Owner's Equity", "Equity", "Revenue", "Purchases", "Expenses"];

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
  "Purchases": [
    { label: "تكلفة المبيعات", prefixes: ["51"] },
    { label: "تكاليف استيراد", prefixes: ["52"] },
  ],
  "Expenses": [
    { label: "إدارية وعمومية", prefixes: ["51", "52", "53", "54", "55"] },
    { label: "بيعية وتسويقية", prefixes: ["56"] },
    { label: "استهلاكات وإطفاءات", prefixes: ["57"] },
    { label: "مصاريف أخرى", prefixes: ["58", "59", "60", "61"] },
  ],
};

const typeLabels: Record<string, string> = {
  "Asset": "الأصول",
  "Liability": "الالتزامات",
  "Owner's Equity": "حقوق الملكية",
  "Equity": "حقوق الملكية",
  "Revenue": "الإيرادات",
  "Purchases": "المشتريات",
  "Expenses": "المصروفات",
};

const typeBadgeStyles: Record<string, string> = {
  "Asset": "bg-blue-50 text-blue-700 border border-blue-200",
  "Liability": "bg-red-50 text-red-700 border border-red-200",
  "Owner's Equity": "bg-purple-50 text-purple-700 border border-purple-200",
  "Equity": "bg-purple-50 text-purple-700 border border-purple-200",
  "Revenue": "bg-green-50 text-green-700 border border-green-200",
  "Purchases": "bg-amber-50 text-amber-700 border border-amber-200",
  "Expenses": "bg-pink-50 text-pink-700 border border-pink-200",
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

const filterTabs = [
  { value: "all", label: "الكل" },
  { value: "Asset", label: "أصول" },
  { value: "Liability", label: "التزامات" },
  { value: "Owner's Equity", label: "ملكية" },
  { value: "Revenue", label: "إيرادات" },
  { value: "Purchases", label: "مشتريات" },
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
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [autoSetupAttempted, setAutoSetupAttempted] = useState(false);
  const [addSubParentCode, setAddSubParentCode] = useState<string | null>(null);
  const [moveModalAccount, setMoveModalAccount] = useState<Account | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

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

  const handleDeleteAccount = useCallback(async (acc: Account) => {
    if (!user) return;
    if (acc.is_system_protected) {
      toast({ 
        title: "⚠️ حساب محمي", 
        description: `لا يمكن حذف "${acc.account_name}" — هذا الحساب مرتبط بقيود محاسبية تلقائية.`,
        variant: "destructive",
        duration: 5000,
      });
      return;
    }
    if (acc.is_system) {
      toast({ title: "لا يمكن حذف حساب نظامي", variant: "destructive" });
      return;
    }
    const hasChildren = accounts.some(a => a.parent_code === acc.account_code);
    if (hasChildren) {
      toast({ title: "لا يمكن الحذف", description: "هذا الحساب يحتوي على حسابات فرعية", variant: "destructive" });
      return;
    }
    const { count } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_deleted", false)
      .or(`debit_account_code.eq.${acc.account_code},credit_account_code.eq.${acc.account_code}`);
    
    if (count && count > 0) {
      toast({ title: "لا يمكن الحذف", description: `هذا الحساب مرتبط بـ ${count} حركة مالية`, variant: "destructive" });
      return;
    }

    if (!confirm(`هل تريد حذف الحساب "${acc.account_code} - ${acc.account_name}"؟`)) return;

    const { error } = await supabase
      .from("accounts")
      .delete()
      .eq("id", acc.id)
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "خطأ في الحذف", description: error.message, variant: "destructive" });
    } else {
      setAccounts(prev => prev.filter(a => a.id !== acc.id));
      toast({ title: "✅ تم حذف الحساب بنجاح" });
    }
  }, [user, accounts, toast]);

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
        if (!multiWordMatchAny(searchQuery, a.account_name, a.account_code)) return false;
      }
      return true;
    }).sort((a, b) => a.account_code.localeCompare(b.account_code));
  }, [accounts, searchQuery, typeFilter]);

  type TreeRow = 
    | { type: 'account'; account: Account; level: number; isGroup: boolean; hasChildren: boolean; isCollapsed: boolean }
    | { type: 'subcategory'; label: string; count: number; parentType: string };

  const treeRows = useMemo(() => {
    const rows: TreeRow[] = [];
    const accountsByCode = new Map<string, Account>();
    filteredAccounts.forEach(a => accountsByCode.set(a.account_code, a));

    const byType: Record<string, Account[]> = {};
    filteredAccounts.forEach(acc => {
      const t = normalizeType(acc.account_type);
      if (!byType[t]) byType[t] = [];
      byType[t].push(acc);
    });

    const orderedTypes = typeOrder.filter(t => byType[t]?.length);

    const isHiddenByCollapse = (acc: Account): boolean => {
      let current = acc;
      while (current.parent_code && current.parent_code !== current.account_code) {
        if (collapsedGroups.has(current.parent_code)) return true;
        const parent = accountsByCode.get(current.parent_code);
        if (!parent) break;
        current = parent;
      }
      return false;
    };

    orderedTypes.forEach(type => {
      const typeAccs = byType[type];
      const subs = subCategories[type];

      const typeHeaderAcc: Account = {
        id: `type-${type}`,
        account_code: '',
        account_name: typeLabels[type] || type,
        account_type: type,
        is_system: null,
        parent_code: null,
      };
      const isTypeCollapsed = collapsedGroups.has(`type-${type}`);
      rows.push({ type: 'account', account: typeHeaderAcc, level: 0, isGroup: true, hasChildren: true, isCollapsed: isTypeCollapsed });

      if (isTypeCollapsed) return;

      const addAccountRows = (accs: Account[]) => {
        const ordered = buildOrderedTree(accs);
        ordered.forEach(acc => {
          if (isHiddenByCollapse(acc)) return;
          const depth = getAccountDepth(acc, accountsByCode);
          const hasKids = hasChildAccounts(acc, accs);
          rows.push({
            type: 'account',
            account: acc,
            level: depth + 1,
            isGroup: hasKids,
            hasChildren: hasKids,
            isCollapsed: collapsedGroups.has(acc.account_code),
          });
        });
      };

      if (subs) {
        subs.forEach(sub => {
          const subAccs = typeAccs.filter(a => sub.prefixes.some(p => a.account_code.startsWith(p)));
          if (subAccs.length === 0) return;
          rows.push({ type: 'subcategory', label: sub.label, count: subAccs.length, parentType: type });
          addAccountRows(subAccs);
        });
        const allPrefixes = subs.flatMap(s => s.prefixes);
        const unmatched = typeAccs.filter(a => !allPrefixes.some(p => a.account_code.startsWith(p)));
        if (unmatched.length > 0) {
          rows.push({ type: 'subcategory', label: 'أخرى', count: unmatched.length, parentType: type });
          addAccountRows(unmatched);
        }
      } else {
        addAccountRows(typeAccs);
      }
    });

    return rows;
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
    <TooltipProvider>
    <div className="min-h-screen bg-[hsl(210,20%,98%)] dark:bg-background" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 space-y-4">
        <PageHeader title="شجرة الحسابات" breadcrumb={["المحاسبة", "شجرة الحسابات"]} />

        {/* Action buttons toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={() => navigate("/accounts/new")} size="sm" className="h-9 gap-1.5 rounded-lg text-xs font-semibold">
            <Plus className="h-3.5 w-3.5" />
            إضافة حساب
          </Button>
          <Button variant="outline" size="sm" className="h-9 rounded-lg text-xs font-semibold gap-1.5"
            onClick={() => exportAccountsToExcel(accounts)}>
            <FileSpreadsheet className="h-3.5 w-3.5" />
            تصدير الحسابات
          </Button>
          <Button variant="outline" size="sm" className="h-9 rounded-lg text-xs font-semibold gap-1.5"
            onClick={() => setShowImportModal(true)}>
            <Upload className="h-3.5 w-3.5" />
            استيراد الحسابات
          </Button>
          <Button variant="ghost" size="icon" onClick={fetchAccounts} disabled={loading} className="h-9 w-9">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
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
            <div className="grid grid-cols-[80px_1fr_100px_70px_minmax(120px,1fr)] sm:grid-cols-[100px_1fr_110px_80px_minmax(140px,1fr)_80px] bg-[hsl(210,20%,97%)] dark:bg-muted/30 border-b border-[hsl(210,14%,89%)] dark:border-border px-3 py-2.5 text-[11px] font-bold text-[hsl(210,10%,42%)] dark:text-muted-foreground uppercase tracking-wide">
              <span>رمز الحساب</span>
              <span>اسم الحساب</span>
              <span className="hidden sm:block">النوع</span>
              <span>الطبيعة</span>
              <span>الوصف</span>
              <span className="hidden sm:block text-center">إجراءات</span>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-[hsl(210,14%,93%)] dark:divide-border">
              {treeRows.map((row, idx) => {
                // Subcategory separator row
                if (row.type === 'subcategory') {
                  return (
                    <div key={`sub-${row.label}-${idx}`} className="flex items-center gap-3 px-4 py-2 my-0 bg-[hsl(210,20%,98%)] dark:bg-muted/10">
                      <div className="h-px flex-1 max-w-[60px] bg-[hsl(210,14%,85%)]/30 dark:bg-border/30" />
                      <span className="text-[10px] font-medium text-[hsl(210,10%,50%)] dark:text-muted-foreground tracking-wide">
                        {row.label}
                      </span>
                      <span className="text-[10px] text-[hsl(210,10%,65%)] dark:text-muted-foreground/60">({row.count})</span>
                      <div className="h-px flex-1 bg-[hsl(210,14%,85%)]/30 dark:bg-border/30" />
                    </div>
                  );
                }

                const { account: acc, level, isGroup, hasChildren, isCollapsed } = row;
                const nType = normalizeType(acc.account_type);
                const isVirtualTypeHeader = acc.id.startsWith('type-');
                const isProtected = acc.is_system_protected;

                return (
                <div
                    key={acc.id}
                    className={cn(
                      "grid grid-cols-[80px_1fr_100px_70px_minmax(120px,1fr)] sm:grid-cols-[100px_1fr_110px_80px_minmax(140px,1fr)_80px] px-3 py-2 text-sm transition-colors items-center group",
                      level === 0 && "bg-[hsl(210,20%,96%)] dark:bg-muted/20 border-t-2 border-[hsl(210,14%,85%)] dark:border-border",
                      isGroup && level >= 1 && "bg-[hsl(210,20%,98.5%)] dark:bg-muted/10",
                      !isGroup && idx % 2 === 0 && "bg-white dark:bg-card",
                      !isGroup && idx % 2 !== 0 && "bg-[hsl(210,20%,99.5%)] dark:bg-card",
                      !isVirtualTypeHeader && "hover:bg-[hsl(142,71%,45%)]/[0.04] dark:hover:bg-primary/5",
                      (isVirtualTypeHeader || hasChildren) && "cursor-pointer"
                    )}
                    onClick={() => {
                      if (isVirtualTypeHeader) toggleGroup(acc.id);
                      else if (hasChildren) toggleGroup(acc.account_code);
                    }}
                    onMouseEnter={() => !isVirtualTypeHeader && setHoveredRow(acc.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    {/* Code */}
                    <span className="font-mono text-[12px] font-semibold text-[hsl(210,10%,42%)] dark:text-muted-foreground tabular-nums">
                      {isVirtualTypeHeader ? '' : acc.account_code}
                    </span>

                    {/* Name with hierarchy */}
                    <div
                      className="flex items-center gap-1.5 min-w-0"
                      style={{ paddingRight: isVirtualTypeHeader ? 0 : (level - 1) * 24 }}
                    >
                      {isGroup && hasChildren && (
                        <button
                          onClick={() => toggleGroup(isVirtualTypeHeader ? acc.id : acc.account_code)}
                          className="p-0.5 rounded hover:bg-[hsl(210,14%,89%)] dark:hover:bg-muted transition-colors shrink-0"
                        >
                          <ChevronDown className={cn("h-3.5 w-3.5 text-[hsl(210,10%,42%)] dark:text-muted-foreground transition-transform", isCollapsed && "-rotate-90 rtl:rotate-90")} />
                        </button>
                      )}
                      {!isGroup && level >= 2 && (
                        <span className="w-4 shrink-0 border-b border-[hsl(210,14%,89%)] dark:border-border mr-1" />
                      )}
                      <span className={cn(
                        "truncate",
                        level === 0 && "font-bold text-[hsl(240,10%,10%)] dark:text-foreground text-[14px]",
                        isGroup && level >= 1 && "font-semibold text-[hsl(240,10%,15%)] dark:text-foreground/90 text-[13px]",
                        !isGroup && "font-normal text-[hsl(240,10%,20%)] dark:text-foreground/80"
                      )}>
                        {acc.account_name}
                      </span>
                      {isProtected && !isVirtualTypeHeader && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Lock className="w-3 h-3 text-amber-500 shrink-0 mr-1" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            حساب محمي — مرتبط بقيود تلقائية
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {isVirtualTypeHeader && (
                        <span className="text-[11px] text-[hsl(210,10%,50%)] dark:text-muted-foreground font-medium mr-1">
                          ({typeCounts[nType] || 0})
                        </span>
                      )}
                    </div>

                    {/* Type Badge */}
                    <div className="hidden sm:flex items-center">
                      {!isVirtualTypeHeader && (
                        <span className={cn("inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap w-auto", typeBadgeStyles[nType] || "bg-muted text-muted-foreground")}>
                          {typeLabels[nType] || nType}
                        </span>
                      )}
                    </div>

                    {/* Natural Balance */}
                    <span className={cn(
                      "text-[11px] font-medium",
                      isVirtualTypeHeader && "hidden",
                      naturalBalance[nType] === "مدين"
                        ? "text-[hsl(142,71%,40%)] dark:text-green-400"
                        : "text-[hsl(0,72%,51%)] dark:text-red-400"
                    )}>
                      {isVirtualTypeHeader ? '' : (naturalBalance[nType] || "—")}
                    </span>

                    {/* Description */}
                    <div className="min-w-0">
                      {!isVirtualTypeHeader && acc.description_ar ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-[11px] text-[hsl(210,10%,50%)] dark:text-muted-foreground truncate block max-w-[200px] cursor-help">
                              {acc.description_ar}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs max-w-[300px] text-right" dir="rtl">
                            {acc.description_ar}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-[11px] text-[hsl(210,10%,70%)]">
                          {isVirtualTypeHeader ? '' : '—'}
                        </span>
                      )}
                    </div>

                    {/* Row Actions (hover) */}
                    {!isVirtualTypeHeader && (
                      <div className="hidden sm:flex items-center justify-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                        {!isProtected && (
                          <button className="p-1 rounded hover:bg-[hsl(210,14%,89%)] dark:hover:bg-muted transition-colors" title="نقل الحساب"
                            onClick={() => setMoveModalAccount(acc)}>
                            <ArrowUpDown className="h-3.5 w-3.5 text-[hsl(210,10%,42%)] dark:text-muted-foreground" />
                          </button>
                        )}
                        <button className="p-1 rounded hover:bg-[hsl(210,14%,89%)] dark:hover:bg-muted transition-colors" title="تعديل"
                          onClick={() => navigate(`/accounts/${acc.id}/edit`)}>
                          <Pencil className="h-3.5 w-3.5 text-[hsl(210,10%,42%)] dark:text-muted-foreground" />
                        </button>
                        <button className="p-1 rounded hover:bg-[hsl(210,14%,89%)] dark:hover:bg-muted transition-colors" title="عرض الحركات"
                          onClick={() => navigate(`/account-statement?code=${acc.account_code}&name=${encodeURIComponent(acc.account_name)}`)}>
                          <Eye className="h-3.5 w-3.5 text-[hsl(210,10%,42%)] dark:text-muted-foreground" />
                        </button>
                        <button className="p-1 rounded hover:bg-[hsl(210,14%,89%)] dark:hover:bg-muted transition-colors" title="إضافة فرعي"
                          onClick={() => navigate(`/accounts/new?parent=${acc.account_code}`)}>
                          <PlusCircle className="h-3.5 w-3.5 text-[hsl(210,10%,42%)] dark:text-muted-foreground" />
                        </button>
                        {!acc.is_system && !isProtected ? (
                          <button className="p-1 rounded hover:bg-destructive/10 transition-colors" title="حذف الحساب"
                            onClick={() => handleDeleteAccount(acc)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive/60 hover:text-destructive" />
                          </button>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="p-1 opacity-30 cursor-not-allowed"><Lock className="h-3.5 w-3.5 text-amber-500" /></span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">محمي</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    )}
                    {isVirtualTypeHeader && <span className="hidden sm:block" />}
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

      {/* Move Account Modal */}
      {user && (
        <MoveAccountModal
          account={moveModalAccount}
          allAccounts={accounts}
          isOpen={!!moveModalAccount}
          onClose={() => setMoveModalAccount(null)}
          onSuccess={fetchAccounts}
          userId={user.id}
        />
      )}

      {/* Import Accounts Modal */}
      {user && (
        <ImportAccountsModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onSuccess={fetchAccounts}
          existingAccounts={accounts}
          userId={user.id}
        />
      )}
    </div>
    </TooltipProvider>
  );
};

export default AccountsPage;
