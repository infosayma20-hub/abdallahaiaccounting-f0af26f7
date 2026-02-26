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
  fields: {
    "Account Name"?: string;
    "Account Type"?: string;
  };
}

// Parse account code and name from "1110 - الصندوق" format
function parseAccount(name: string): { code: string; label: string; codeNum: number } {
  const match = name.match(/^(\d{4})\s*[-–]\s*(.+)/);
  if (match) return { code: match[1], label: match[2].trim(), codeNum: parseInt(match[1]) };
  return { code: "", label: name, codeNum: 99999 };
}

// Determine hierarchy level from code: 1000=cat, 1100=group, 1110=leaf
function getLevel(code: string): number {
  if (!code) return 2;
  if (code.endsWith("00") && code[2] === "0") return 0; // e.g., 1000
  if (code.endsWith("00")) return 1; // e.g., 1100
  return 2; // e.g., 1110
}

// Subcategory grouping by code prefix
interface SubCategory {
  label: string;
  prefixes: string[]; // first 2 digits
}

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

// Get parent group code: 1110 → 1100, 1100 → 1000
function getParentCode(code: string): string {
  if (!code || code.length < 4) return "";
  const level = getLevel(code);
  if (level === 2) return code.substring(0, 2) + "00"; // 1110 → 1100
  if (level === 1) return code[0] + "000"; // 1100 → 1000
  return "";
}

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

// System accounts that cannot be deleted
// System accounts that cannot be deleted (used internally for protection)
const systemAccountCodes = [
  "1110", "1120", "1130", "1140", "2110", "3100", "3200", "3400", "4100", "5100",
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
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const fetchAccounts = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-accounts?clientId=${user.id}`,
        { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
      );
      if (!res.ok) throw new Error("Failed to fetch accounts");
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      setAccounts(data?.records || []);
    } catch (err: any) {
      setError(err.message || "خطأ في جلب البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAccounts(); }, [user]);

  useEffect(() => {
    if (accounts.length > 0) {
      const types = [...new Set(accounts.map(a => a.fields["Account Type"]).filter(Boolean))] as string[];
      const initial: Record<string, boolean> = {};
      types.forEach(t => { initial[t] = true; });
      setOpenSections(initial);
    }
  }, [accounts]);

  const handleAddAccount = async () => {
    if (!newAccountName.trim() || !newAccountType) return;
    setAdding(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("airtable-create-account", {
        body: { accountName: newAccountName.trim(), accountType: newAccountType, clientId: user?.id },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
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

  // Sorted account types
  const accountTypes = useMemo(() => {
    return [...new Set(accounts.map(a => a.fields["Account Type"]).filter(Boolean))]
      .sort((a, b) => (typeOrder.indexOf(a!) === -1 ? 99 : typeOrder.indexOf(a!)) - (typeOrder.indexOf(b!) === -1 ? 99 : typeOrder.indexOf(b!)));
  }, [accounts]);

  // Filter and search
  const filteredAccounts = useMemo(() => {
    return accounts.filter(a => {
      const name = a.fields["Account Name"] || "";
      const type = a.fields["Account Type"] || "";
      if (typeFilter !== "all" && type !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [accounts, searchQuery, typeFilter]);

  // Group by type
  const groupedAccounts = useMemo(() => {
    const grouped: Record<string, Account[]> = {};
    accountTypes.forEach(type => {
      const typeAccounts = filteredAccounts
        .filter(a => a.fields["Account Type"] === type)
        .sort((a, b) => {
          const pa = parseAccount(a.fields["Account Name"] || "");
          const pb = parseAccount(b.fields["Account Name"] || "");
          return pa.codeNum - pb.codeNum;
        });
      grouped[type!] = typeAccounts;
    });
    return grouped;
  }, [filteredAccounts, accountTypes]);

  const totalFiltered = filteredAccounts.length;

  const renderAccountRow = (acc: Account) => {
    const { code, label } = parseAccount(acc.fields["Account Name"] || "");
    const level = getLevel(code);
    const isGroup = level < 2;

    return (
      <div
        key={acc.id}
        className={`flex items-center justify-between rounded-lg px-3 py-2.5 transition-all duration-150 hover:bg-muted/50 ${isGroup ? "bg-muted/20" : ""}`}
        style={{ paddingRight: level === 2 ? "20px" : level === 1 ? "12px" : "4px" }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {code && (
            <span className="text-[11px] font-mono font-bold text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded shrink-0">
              {code}
            </span>
          )}
          <span className={`text-sm truncate ${isGroup ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
            {label}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 pt-6 space-y-4 pb-8" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">شجرة الحسابات</h1>
            <p className="text-xs text-muted-foreground">{totalFiltered} حساب</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={fetchAccounts} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      {!loading && !error && accounts.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بالكود أو الاسم..."
              className="pr-9 rounded-xl text-sm"
              dir="rtl"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter} dir="rtl">
            <SelectTrigger className="w-[130px] rounded-xl text-xs">
              <SelectValue placeholder="الكل" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="all">جميع الأنواع</SelectItem>
              {accountTypeOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={fetchAccounts}>إعادة المحاولة</Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && (
        <div className="space-y-3">
          {accountTypes.map((type) => {
            const typeAccounts = groupedAccounts[type!] || [];
            if ((searchQuery || typeFilter !== "all") && typeAccounts.length === 0) return null;
            const isOpen = openSections[type!] ?? true;
            const config = categoryConfig[type!] || categoryConfig["Expenses"];
            const Icon = config.icon;

            return (
              <Collapsible
                key={type}
                open={isOpen}
                onOpenChange={(open) => setOpenSections(prev => ({ ...prev, [type!]: open }))}
              >
                <CollapsibleTrigger className="w-full">
                  <div className={`flex items-center justify-between px-3.5 py-3 rounded-xl border transition-colors ${config.bgColor}`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.color} bg-white/60 dark:bg-black/20`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className={`text-sm font-bold ${config.color}`}>{config.label}</span>
                      <span className="text-xs text-muted-foreground font-medium">({typeAccounts.length})</span>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
                  <div className="space-y-1 mt-1.5 mr-4 border-r-2 border-border/50 pr-3">
                    {(() => {
                      const subs = subCategories[type!];
                      if (subs) {
                        // Group accounts by subcategory
                        return subs.map((sub) => {
                          const subAccounts = typeAccounts.filter((acc) => {
                            const { code } = parseAccount(acc.fields["Account Name"] || "");
                            const prefix = code.substring(0, 2);
                            return sub.prefixes.includes(prefix);
                          });
                          if (subAccounts.length === 0) return null;
                          return (
                            <div key={sub.label} className="mb-2">
                              <div className="flex items-center gap-2 py-1.5 px-2">
                                <div className="h-px flex-1 bg-border/40" />
                                <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wide shrink-0">{sub.label}</span>
                                <div className="h-px flex-1 bg-border/40" />
                              </div>
                              {subAccounts.map((acc) => renderAccountRow(acc))}
                            </div>
                          );
                        });
                      }
                      // No subcategories — render flat
                      return typeAccounts.map((acc) => renderAccountRow(acc));
                    })()}
                    {/* Accounts without matching subcategory */}
                    {(() => {
                      const subs = subCategories[type!];
                      if (!subs) return null;
                      const allPrefixes = subs.flatMap(s => s.prefixes);
                      const unmatched = typeAccounts.filter((acc) => {
                        const { code } = parseAccount(acc.fields["Account Name"] || "");
                        const prefix = code.substring(0, 2);
                        return !allPrefixes.includes(prefix) && code;
                      });
                      if (unmatched.length === 0) return null;
                      return (
                        <div className="mb-2">
                          <div className="flex items-center gap-2 py-1.5 px-2">
                            <div className="h-px flex-1 bg-border/40" />
                            <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wide shrink-0">أخرى</span>
                            <div className="h-px flex-1 bg-border/40" />
                          </div>
                          {unmatched.map((acc) => renderAccountRow(acc))}
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

      {/* Add Account Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة حساب جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input placeholder="اسم الحساب (مثال: 5910 - مصروف جديد)" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} dir="rtl" />
            <Select value={newAccountType} onValueChange={setNewAccountType} dir="rtl">
              <SelectTrigger><SelectValue placeholder="نوع الحساب" /></SelectTrigger>
              <SelectContent className="bg-background z-50">
                {accountTypeOptions.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
              </SelectContent>
            </Select>
            <Button onClick={handleAddAccount} className="w-full gap-2 rounded-xl" disabled={adding || !newAccountName.trim() || !newAccountType}>
              {adding && <Loader2 className="h-4 w-4 animate-spin" />}
              إضافة
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountsPage;
