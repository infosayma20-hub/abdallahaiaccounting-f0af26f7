import { useState, useEffect, useMemo, useRef } from "react";
import {
  ArrowRight, Loader2, RefreshCw, Search, FileSpreadsheet,
  TrendingUp, TrendingDown, Wallet, Printer, Calendar,
  BookOpen, Users, Truck, UserCheck, ChevronLeft, LayoutGrid,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from "date-fns";
import { cn } from "@/lib/utils";
import StatementPrintView from "@/components/StatementPrintView";

// ─── TYPES ───
interface Contact {
  id: string;
  contact_name: string;
  contact_type: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  linked_account_code: string | null;
}

interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
}

interface EmployeeEntity {
  id: string;
  full_name: string;
  department: string | null;
  job_title: string | null;
  phone: string | null;
  base_salary: number;
  account_code: string | null; // linked account code from accounts table
}

interface Transaction {
  id: string;
  description: string;
  transaction_type: string;
  amount: number;
  currency: string;
  transaction_date: string;
  debit_account_code: string;
  credit_account_code: string;
  reference: string | null;
  is_deleted: boolean;
  contact_id: string | null;
}

interface StatementRow {
  date: string;
  description: string;
  transaction_type: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  transaction_id: string;
}

type EntityTab = "customers" | "suppliers" | "employees" | "accounts";

// ─── CONSTANTS ───
const ENTITY_TABS: { key: EntityTab; label: string; icon: any; color: string; accountCode: string; type: string }[] = [
  { key: "customers", label: "العملاء", icon: Users, color: "text-blue-500", accountCode: "1130", type: "عميل" },
  { key: "suppliers", label: "الموردين", icon: Truck, color: "text-amber-500", accountCode: "2100", type: "مورد" },
  { key: "employees", label: "الموظفين", icon: UserCheck, color: "text-emerald-500", accountCode: "1180", type: "موظف" },
  { key: "accounts", label: "الحسابات", icon: LayoutGrid, color: "text-purple-500", accountCode: "", type: "account" },
];

const QUICK_PERIODS = [
  { label: "هذا الشهر", from: () => format(startOfMonth(new Date()), "yyyy-MM-dd"), to: () => format(endOfMonth(new Date()), "yyyy-MM-dd") },
  { label: "الربع الحالي", from: () => format(startOfQuarter(new Date()), "yyyy-MM-dd"), to: () => format(endOfQuarter(new Date()), "yyyy-MM-dd") },
  { label: "هذه السنة", from: () => format(startOfYear(new Date()), "yyyy-MM-dd"), to: () => format(endOfYear(new Date()), "yyyy-MM-dd") },
  { label: "كل الفترات", from: () => "2020-01-01", to: () => format(new Date(), "yyyy-MM-dd") },
];

// ─── FORMAT HELPERS ───
const fmtAmount = (n: number) =>
  n === 0 ? "—" : `₪${Math.abs(n).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d: string) => {
  if (!d) return "—";
  const parts = d.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
};

// ─── MAIN COMPONENT ───
const AccountStatementPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  // URL params
  const urlContactId = searchParams.get("contact_id") || "";
  const urlContactType = searchParams.get("contact_type") || "";
  const urlEmployeeName = searchParams.get("employee_name") || "";

  // State
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [employeeEntities, setEmployeeEntities] = useState<EmployeeEntity[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [companyInfo, setCompanyInfo] = useState({
    name: "", logo_url: "", address: "", phone: "", email: "", website: "", tax_number: "",
  });
  const [activeTab, setActiveTab] = useState<EntityTab>(
    urlEmployeeName ? "employees" : urlContactType === "مورد" ? "suppliers" : "customers"
  );
  const [selectedEntityId, setSelectedEntityId] = useState(urlContactId);
  const [entitySearch, setEntitySearch] = useState("");
  const [txSearch, setTxSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [activePeriod, setActivePeriod] = useState("");

  const activeTabConfig = ENTITY_TABS.find(t => t.key === activeTab)!;
  const isAccountsTab = activeTab === "accounts";
  const isEmployeesTab = activeTab === "employees";

  // ─── FETCH DATA ───
  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [{ data: contactData }, { data: accData }, { data: txData }, profileRes, { data: empData }, { data: csData }] = await Promise.all([
        supabase
          .from("contacts")
          .select("id, contact_name, contact_type, phone, email, address, linked_account_code")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .order("contact_name"),
        supabase
          .from("accounts")
          .select("id, account_code, account_name, account_type")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .order("account_code"),
        supabase
          .from("transactions")
          .select("id, description, transaction_type, amount, currency, transaction_date, debit_account_code, credit_account_code, reference, is_deleted, contact_id")
          .eq("user_id", user.id)
          .eq("is_deleted", false)
          .order("transaction_date", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase.from("profiles").select("company_name, display_name").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("employees")
          .select("id, full_name, department, job_title, phone, base_salary")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .order("full_name"),
        supabase
          .from("company_settings")
          .select("company_name, logo_url, address, phone, email, website, tax_number")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      setContacts((contactData as Contact[]) || []);
      setAccounts((accData as Account[]) || []);
      setTransactions((txData as Transaction[]) || []);
      if (profileRes.data?.company_name) setCompanyName(profileRes.data.company_name);

      // Company info from settings
      const cs = csData as any;
      if (cs) {
        setCompanyInfo({
          name: cs.company_name || profileRes.data?.company_name || "",
          logo_url: cs.logo_url || "",
          address: cs.address || "",
          phone: cs.phone || "",
          email: cs.email || "",
          website: cs.website || "",
          tax_number: cs.tax_number || "",
        });
      } else if (profileRes.data) {
        setCompanyInfo(prev => ({ ...prev, name: profileRes.data?.company_name || profileRes.data?.display_name || "" }));
      }

      // Map employees to their linked account codes (accounts under 1180)
      const allAccounts = (accData as Account[]) || [];
      const empList = ((empData as any[]) || []).map((emp: any) => {
        // Find a matching account: "ذمم موظف - {name}" under parent 1180
        const linkedAcc = allAccounts.find(
          a => a.account_name === `ذمم موظف - ${emp.full_name}` && a.account_type === "أصول"
        );
        return {
          ...emp,
          account_code: linkedAcc?.account_code || null,
        } as EmployeeEntity;
      });
      setEmployeeEntities(empList);

      // Auto-select employee from URL param
      if (urlEmployeeName && empList.length > 0) {
        const found = empList.find(e => e.full_name === urlEmployeeName);
        if (found) setSelectedEntityId(found.id);
      }
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user]);

  // ─── FILTERED CONTACTS BY TAB ───
  const tabContacts = useMemo(() => {
    if (isAccountsTab || isEmployeesTab) return [];
    const type = activeTabConfig.type;
    return contacts.filter(c => c.contact_type === type);
  }, [contacts, activeTab]);

  // ─── ACCOUNT BALANCES (for accounts tab) ───
  const accountBalances = useMemo(() => {
    if (!isAccountsTab) return {};
    const map: Record<string, number> = {};
    for (const acc of accounts) {
      let bal = 0;
      for (const tx of transactions) {
        if (tx.debit_account_code === acc.account_code) bal += tx.amount || 0;
        if (tx.credit_account_code === acc.account_code) bal -= tx.amount || 0;
      }
      map[acc.id] = bal;
    }
    return map;
  }, [accounts, transactions, isAccountsTab]);

  // ─── EMPLOYEE BALANCES ───
  const employeeBalances = useMemo(() => {
    if (!isEmployeesTab) return {};
    const map: Record<string, number> = {};
    for (const emp of employeeEntities) {
      if (!emp.account_code) { map[emp.id] = 0; continue; }
      let bal = 0;
      for (const tx of transactions) {
        if (tx.debit_account_code === emp.account_code) bal += tx.amount || 0;
        if (tx.credit_account_code === emp.account_code) bal -= tx.amount || 0;
      }
      map[emp.id] = bal;
    }
    return map;
  }, [employeeEntities, transactions, isEmployeesTab]);

  // ─── CONTACT BALANCES ───
  const contactBalances = useMemo(() => {
    if (isAccountsTab || isEmployeesTab) return {};
    const map: Record<string, number> = {};
    const accountCode = activeTabConfig.accountCode;
    for (const c of tabContacts) {
      let bal = 0;
      for (const tx of transactions) {
        if (tx.contact_id !== c.id) continue;
        if (tx.debit_account_code === accountCode) bal += tx.amount || 0;
        if (tx.credit_account_code === accountCode) bal -= tx.amount || 0;
      }
      map[c.id] = bal;
    }
    return map;
  }, [tabContacts, transactions, activeTab]);

  // ─── COMBINED ENTITY LIST FOR LEFT PANEL ───
  const entityList = useMemo(() => {
    if (isAccountsTab) {
      const q = entitySearch.toLowerCase().trim();
      const filtered = q
        ? accounts.filter(a => a.account_name.toLowerCase().includes(q) || a.account_code.includes(q))
        : accounts;
      return filtered.map(a => ({
        id: a.id,
        name: a.account_name,
        subtitle: `${a.account_code} · ${a.account_type}`,
        balance: accountBalances[a.id] || 0,
        accountCode: a.account_code,
      }));
    } else if (isEmployeesTab) {
      const q = entitySearch.toLowerCase().trim();
      const filtered = q
        ? employeeEntities.filter(e => e.full_name.toLowerCase().includes(q) || (e.department || "").toLowerCase().includes(q))
        : employeeEntities;
      return filtered.map(e => ({
        id: e.id,
        name: e.full_name,
        subtitle: `${e.job_title || e.department || "—"} · ${e.account_code || "بدون حساب"}`,
        balance: employeeBalances[e.id] || 0,
        accountCode: e.account_code || "",
      }));
    } else {
      const q = entitySearch.toLowerCase().trim();
      const filtered = q
        ? tabContacts.filter(c => c.contact_name.toLowerCase().includes(q) || (c.phone || "").includes(q))
        : tabContacts;
      return filtered.map(c => ({
        id: c.id,
        name: c.contact_name,
        subtitle: c.phone || c.address || "—",
        balance: contactBalances[c.id] || 0,
        accountCode: "",
      }));
    }
  }, [isAccountsTab, isEmployeesTab, accounts, employeeEntities, tabContacts, entitySearch, accountBalances, employeeBalances, contactBalances]);

  const selectedContact = useMemo(
    () => contacts.find(c => c.id === selectedEntityId),
    [contacts, selectedEntityId]
  );

  const selectedAccount = useMemo(
    () => accounts.find(a => a.id === selectedEntityId),
    [accounts, selectedEntityId]
  );

  const selectedEmployee = useMemo(
    () => employeeEntities.find(e => e.id === selectedEntityId),
    [employeeEntities, selectedEntityId]
  );

  const selectedEntityName = isAccountsTab
    ? selectedAccount?.account_name || ""
    : isEmployeesTab
    ? selectedEmployee?.full_name || ""
    : selectedContact?.contact_name || "";

  const selectedEntityInfo = isAccountsTab
    ? { type: selectedAccount?.account_type || "", code: selectedAccount?.account_code || "", phone: "", address: "" }
    : isEmployeesTab
    ? { type: "موظف", code: selectedEmployee?.account_code || "", phone: selectedEmployee?.phone || "", address: selectedEmployee?.job_title || selectedEmployee?.department || "" }
    : { type: selectedContact?.contact_type || "", code: "", phone: selectedContact?.phone || "", address: selectedContact?.address || "" };

  // ─── STATEMENT ROWS ───
  const { rows, openingBalance, closingBalance, totalDebit, totalCredit } = useMemo(() => {
    if (!selectedEntityId) return { rows: [] as StatementRow[], openingBalance: 0, closingBalance: 0, totalDebit: 0, totalCredit: 0 };

    let related: Transaction[];
    let resolveDebitCredit: (tx: Transaction) => { isDebit: boolean; isCredit: boolean };

    if (isAccountsTab && selectedAccount) {
      const code = selectedAccount.account_code;
      related = transactions.filter(tx =>
        tx.debit_account_code === code || tx.credit_account_code === code
      );
      resolveDebitCredit = (tx) => ({
        isDebit: tx.debit_account_code === code,
        isCredit: tx.credit_account_code === code,
      });
    } else if (isEmployeesTab && selectedEmployee?.account_code) {
      // Employee: use their linked account code from accounts tree
      const code = selectedEmployee.account_code;
      related = transactions.filter(tx =>
        tx.debit_account_code === code || tx.credit_account_code === code
      );
      resolveDebitCredit = (tx) => ({
        isDebit: tx.debit_account_code === code,
        isCredit: tx.credit_account_code === code,
      });
    } else if (isEmployeesTab && !selectedEmployee?.account_code) {
      // No linked account - no transactions
      return { rows: [] as StatementRow[], openingBalance: 0, closingBalance: 0, totalDebit: 0, totalCredit: 0 };
    } else {
      const accountCode = activeTabConfig.accountCode;
      related = transactions.filter(tx => tx.contact_id === selectedEntityId);
      resolveDebitCredit = (tx) => ({
        isDebit: tx.debit_account_code === accountCode,
        isCredit: tx.credit_account_code === accountCode,
      });
    }

    let openBal = 0;
    const periodTx: Transaction[] = [];

    for (const tx of related) {
      const { isDebit, isCredit } = resolveDebitCredit(tx);
      if (!isDebit && !isCredit) continue;
      const amount = tx.amount || 0;

      if (dateFrom && tx.transaction_date < dateFrom) {
        if (isDebit) openBal += amount;
        if (isCredit) openBal -= amount;
      } else if (!dateTo || tx.transaction_date <= dateTo) {
        periodTx.push(tx);
      }
    }

    let runningBalance = openBal;
    let sumDebit = 0;
    let sumCredit = 0;

    const rows: StatementRow[] = periodTx.map(tx => {
      const { isDebit } = resolveDebitCredit(tx);
      const amount = tx.amount || 0;
      const debit = isDebit ? amount : 0;
      const credit = !isDebit ? amount : 0;
      runningBalance += debit - credit;
      sumDebit += debit;
      sumCredit += credit;
      return {
        date: tx.transaction_date,
        description: tx.description || tx.transaction_type || "—",
        transaction_type: tx.transaction_type || "",
        reference: tx.reference || "",
        debit, credit,
        balance: runningBalance,
        transaction_id: tx.id,
      };
    });

    return { rows, openingBalance: openBal, closingBalance: runningBalance, totalDebit: sumDebit, totalCredit: sumCredit };
  }, [transactions, selectedEntityId, dateFrom, dateTo, activeTab, selectedAccount, selectedEmployee]);

  const filteredRows = useMemo(() => {
    if (!txSearch.trim()) return rows;
    const q = txSearch.toLowerCase();
    return rows.filter(r =>
      r.description.toLowerCase().includes(q) ||
      r.reference.toLowerCase().includes(q)
    );
  }, [rows, txSearch]);

  // ─── EXPORT ───
  const handleExport = () => {
    if (!rows.length || !selectedEntityName) return;
    const exportRows = [
      { "التاريخ": "", "المرجع": "", "البيان": "رصيد أول المدة", "مدين ₪": openingBalance > 0 ? openingBalance : "", "دائن ₪": openingBalance < 0 ? Math.abs(openingBalance) : "", "الرصيد ₪": openingBalance },
      ...rows.map(r => ({
        "التاريخ": r.date,
        "المرجع": r.reference,
        "البيان": r.description,
        "مدين ₪": r.debit || "",
        "دائن ₪": r.credit || "",
        "الرصيد ₪": r.balance,
      })),
      { "التاريخ": "", "المرجع": "", "البيان": "الإجمالي", "مدين ₪": totalDebit, "دائن ₪": totalCredit, "الرصيد ₪": closingBalance },
    ];
    const ws = XLSX.utils.json_to_sheet(exportRows);
    ws["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "كشف الحساب");
    XLSX.writeFile(wb, `كشف-حساب-${selectedEntityName}-${dateFrom}.xlsx`);
  };

  const allBalances = isAccountsTab ? accountBalances : isEmployeesTab ? employeeBalances : contactBalances;
  const totalBalance = useMemo(() => Object.values(allBalances).reduce((s, b) => s + b, 0), [allBalances]);
  const debitCount = useMemo(() => Object.values(allBalances).filter(b => b > 0).length, [allBalances]);
  const creditCount = useMemo(() => Object.values(allBalances).filter(b => b < 0).length, [allBalances]);

  // ─── RENDER ───
  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area {
            position: absolute; inset: 0; background: white; padding: 0;
            width: 210mm !important;
          }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .screen-table { display: none !important; }
          @page { size: A4 portrait; margin: 0; }
        }
        .print-only { display: none; }
      `}</style>

      {/* ─── TOP BAR ─── */}
      <div className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border no-print">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <ArrowRight className="w-5 h-5 text-foreground" />
            </button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>المحاسبة</span>
              <ChevronLeft className="w-3 h-3" />
              <span className="text-foreground font-semibold text-sm">كشف الحساب</span>
            </div>
          </div>

          {/* Entity type tabs */}
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
            {ENTITY_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setSelectedEntityId(""); setEntitySearch(""); }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                  activeTab === tab.key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <tab.icon className={cn("w-3.5 h-3.5", activeTab === tab.key && tab.color)} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" onClick={fetchData} disabled={loading} className="h-8 w-8">
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!selectedEntityId || rows.length === 0} className="h-8 gap-1.5 text-xs">
              <Printer className="w-3.5 h-3.5" /> طباعة
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!selectedEntityId || rows.length === 0} className="h-8 gap-1.5 text-xs">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
            </Button>
          </div>
        </div>
      </div>

      {/* ─── BODY: Left Panel + Main ─── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ─── LEFT PANEL ─── */}
        <div className="border-l border-border bg-card flex flex-col shrink-0 w-[280px] no-print">
          {/* Search */}
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute right-2.5 top-2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={isAccountsTab ? "ابحث بالاسم أو الكود..." : "ابحث بالاسم أو الرقم..."}
                value={entitySearch}
                onChange={e => setEntitySearch(e.target.value)}
                className="pr-9 h-8 text-xs bg-muted/50 border-0"
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
              <span>الرصيد الإجمالي: <strong className="text-foreground">{fmtAmount(totalBalance)}</strong></span>
              <span>
                <span className="text-emerald-500">↑{debitCount} مدين</span>
                {" "}
                <span className="text-red-400">↓{creditCount} دائن</span>
              </span>
            </div>
          </div>

          {/* Entity list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-3 space-y-3">
                {[1,2,3].map(i => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            ) : entityList.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                {isAccountsTab ? "لا توجد حسابات" : isEmployeesTab ? "لا يوجد موظفون" : "لا توجد جهات اتصال"}
              </div>
            ) : (
              entityList.map(entity => {
                const isActive = entity.id === selectedEntityId;
                return (
                  <button
                    key={entity.id}
                    onClick={() => setSelectedEntityId(entity.id)}
                    className={cn(
                      "w-full text-right px-3 py-2.5 border-b border-border/50 transition-all hover:bg-muted/50",
                      isActive && "bg-primary/5 border-r-2 border-r-primary"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={cn("text-xs font-semibold truncate", isActive ? "text-primary" : "text-foreground")}>
                          {entity.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                          {entity.subtitle}
                        </p>
                      </div>
                      <span className={cn(
                        "shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular-nums",
                        entity.balance > 0 ? "bg-emerald-500/10 text-emerald-500" :
                        entity.balance < 0 ? "bg-red-500/10 text-red-400" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {fmtAmount(entity.balance)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ─── MAIN CONTENT ─── */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          <div ref={printRef} className="print-area flex-1">

            {/* Print header */}
            <div className="print-only text-center mb-6">
              <h2 className="text-lg font-bold">{companyName}</h2>
              <p className="font-semibold">كشف حساب: {selectedEntityName}</p>
              <p className="text-sm text-muted-foreground">من {fmtDate(dateFrom)} إلى {fmtDate(dateTo)}</p>
            </div>

            {!selectedEntityId ? (
              <div className="flex-1 flex items-center justify-center py-32">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
                    <BookOpen className="w-8 h-8 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-semibold text-muted-foreground">اختر حساباً لعرض كشفه المالي</p>
                  <p className="text-xs text-muted-foreground/60">يمكنك البحث بالاسم أو الكود من القائمة</p>
                </div>
              </div>
            ) : (
              <>
                {/* ─── ENTITY INFO CARD ─── */}
                <div className="p-4 no-print">
                  <div className="bg-card rounded-xl border border-border p-4">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h2 className="text-base font-bold text-foreground">{selectedEntityName}</h2>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {isAccountsTab && selectedAccount && (
                            <>
                              <span className="font-mono">{selectedAccount.account_code}</span>
                              <Badge variant="secondary" className="text-[10px]">{selectedAccount.account_type}</Badge>
                            </>
                          )}
                          {isEmployeesTab && selectedEmployee && (
                            <>
                              {selectedEmployee.account_code && <span className="font-mono">{selectedEmployee.account_code}</span>}
                              {selectedEmployee.job_title && <span>💼 {selectedEmployee.job_title}</span>}
                              {selectedEmployee.department && <span>🏢 {selectedEmployee.department}</span>}
                              {selectedEmployee.phone && <span>📞 {selectedEmployee.phone}</span>}
                              <Badge variant="secondary" className="text-[10px]">موظف</Badge>
                              {!selectedEmployee.account_code && <Badge variant="destructive" className="text-[10px]">بدون حساب محاسبي</Badge>}
                            </>
                          )}
                          {!isAccountsTab && !isEmployeesTab && selectedContact && (
                            <>
                              {selectedContact.phone && <span>📞 {selectedContact.phone}</span>}
                              {selectedContact.address && <span>📍 {selectedContact.address}</span>}
                              <Badge variant="secondary" className="text-[10px]">{selectedContact.contact_type}</Badge>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 4 KPI cards */}
                    <div className="grid grid-cols-4 gap-3">
                      <KPIChip label="رصيد افتتاحي" value={openingBalance} icon={BookOpen} />
                      <KPIChip label="إجمالي مدين" value={totalDebit} icon={TrendingUp} variant="debit" />
                      <KPIChip label="إجمالي دائن" value={totalCredit} icon={TrendingDown} variant="credit" />
                      <KPIChip label="رصيد ختامي" value={closingBalance} icon={Wallet} variant="closing" />
                    </div>
                  </div>
                </div>

                {/* ─── FILTER BAR ─── */}
                <div className="px-4 pb-3 no-print">
                  <div className="bg-card rounded-xl border border-border p-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">من</label>
                        <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActivePeriod(""); }} className="h-8 w-36 text-xs bg-muted/50 border-0" />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">إلى</label>
                        <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActivePeriod(""); }} className="h-8 w-36 text-xs bg-muted/50 border-0" />
                      </div>

                      <div className="h-5 w-px bg-border" />

                      {QUICK_PERIODS.map(p => (
                        <button
                          key={p.label}
                          onClick={() => { setDateFrom(p.from()); setDateTo(p.to()); setActivePeriod(p.label); }}
                          className={cn(
                            "px-2.5 py-1 rounded-full text-[11px] font-medium transition-all",
                            activePeriod === p.label
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          {p.label}
                        </button>
                      ))}

                      <div className="flex-1" />

                      <div className="relative">
                        <Search className="absolute right-2 top-2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          placeholder="بحث في الحركات..."
                          value={txSearch}
                          onChange={e => setTxSearch(e.target.value)}
                          className="pr-8 h-8 w-48 text-xs bg-muted/50 border-0"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ─── TABLE ─── */}
                <div className="px-4 pb-4 flex-1">
                  {loading ? (
                    <div className="space-y-2">
                      {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                  ) : rows.length === 0 ? (
                    <div className="bg-card rounded-xl border border-border py-16 text-center">
                      <Calendar className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground font-medium">لا توجد حركات في هذه الفترة</p>
                      <button onClick={() => { setDateFrom("2020-01-01"); setDateTo(format(new Date(), "yyyy-MM-dd")); setActivePeriod("كل الفترات"); }}
                        className="mt-2 text-xs text-primary hover:underline">
                        عرض كل الفترات
                      </button>
                    </div>
                  ) : (
                    <div className="bg-card rounded-xl border border-border overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-[13px]" style={{ tableLayout: "fixed" }}>
                          <colgroup>
                            <col style={{ width: "100px" }} />
                            <col style={{ width: "120px" }} />
                            <col />
                            <col style={{ width: "80px" }} />
                            <col style={{ width: "110px" }} />
                            <col style={{ width: "110px" }} />
                            <col style={{ width: "130px" }} />
                          </colgroup>
                          <thead>
                            <tr className="border-b-2 border-border bg-muted/40">
                              <th className="text-right px-3 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">التاريخ</th>
                              <th className="text-right px-3 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">المرجع</th>
                              <th className="text-right px-3 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">البيان</th>
                              <th className="text-center px-3 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">النوع</th>
                              <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "hsl(var(--destructive))" }}>مدين ₪</th>
                              <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "hsl(var(--success))" }}>دائن ₪</th>
                              <th className="text-left px-3 py-2.5 text-[11px] font-bold text-foreground uppercase tracking-wider">الرصيد ₪</th>
                            </tr>
                          </thead>
                          <tbody>
                            {/* Opening balance */}
                            <tr className="bg-muted/20 border-b border-border/50">
                              <td className="px-3 py-2 text-xs text-muted-foreground italic">{fmtDate(dateFrom)}</td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">—</td>
                              <td className="px-3 py-2 text-xs font-semibold text-foreground italic">رصيد مُرحَّل</td>
                              <td className="px-3 py-2"></td>
                              <td className="px-3 py-2 text-xs text-left tabular-nums text-muted-foreground">
                                {openingBalance > 0 ? fmtAmount(openingBalance) : "—"}
                              </td>
                              <td className="px-3 py-2 text-xs text-left tabular-nums text-muted-foreground">
                                {openingBalance < 0 ? fmtAmount(openingBalance) : "—"}
                              </td>
                              <td className="px-3 py-2 text-xs text-left font-bold tabular-nums">
                                <BalanceCell value={openingBalance} />
                              </td>
                            </tr>

                            {/* Transaction rows */}
                            {filteredRows.map((row) => (
                              <tr key={row.transaction_id} className="border-b border-border/30 hover:bg-[hsl(210,80%,96%)]/10 transition-colors" style={{ height: "40px" }}>
                                <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{fmtDate(row.date)}</td>
                                <td className="px-3 py-2 text-xs">
                                  {row.reference ? (
                                    <button onClick={() => navigate("/journal-entries")} className="text-primary hover:underline font-mono text-[11px]">
                                      {row.reference}
                                    </button>
                                  ) : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="px-3 py-2 text-xs text-foreground truncate">{row.description}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className={cn(
                                    "inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border",
                                    row.debit > 0
                                      ? "border-red-500/30 text-red-500 bg-red-500/5"
                                      : "border-emerald-500/30 text-emerald-500 bg-emerald-500/5"
                                  )}>
                                    {row.debit > 0 ? "مدين" : "دائن"}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-left tabular-nums font-semibold" style={{ color: row.debit > 0 ? "hsl(var(--destructive))" : undefined }}>
                                  {row.debit > 0 ? fmtAmount(row.debit) : "—"}
                                </td>
                                <td className="px-3 py-2 text-left tabular-nums font-semibold" style={{ color: row.credit > 0 ? "hsl(var(--success))" : undefined }}>
                                  {row.credit > 0 ? fmtAmount(row.credit) : "—"}
                                </td>
                                <td className="px-3 py-2 text-left">
                                  <BalanceCell value={row.balance} />
                                </td>
                              </tr>
                            ))}

                            {/* Closing balance */}
                            <tr className="bg-primary/10 border-t-2 border-primary/30">
                              <td className="px-3 py-3 text-xs font-bold text-foreground">—</td>
                              <td className="px-3 py-3 text-xs font-bold text-foreground">—</td>
                              <td className="px-3 py-3 text-xs font-bold text-foreground">رصيد ختامي</td>
                              <td className="px-3 py-3"></td>
                              <td className="px-3 py-3 text-left tabular-nums font-bold" style={{ color: "hsl(var(--destructive))" }}>{fmtAmount(totalDebit)}</td>
                              <td className="px-3 py-3 text-left tabular-nums font-bold" style={{ color: "hsl(var(--success))" }}>{fmtAmount(totalCredit)}</td>
                              <td className="px-3 py-3 text-left">
                                <BalanceCell value={closingBalance} bold />
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Footer totals bar */}
                      <div className="bg-muted/60 border-t border-border px-4 py-2.5 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">إجمالي الحركات: <strong className="text-foreground">{filteredRows.length} قيد</strong></span>
                        <div className="flex items-center gap-4">
                          <span>مدين: <strong style={{ color: "hsl(var(--destructive))" }}>{fmtAmount(totalDebit)}</strong></span>
                          <span>دائن: <strong style={{ color: "hsl(var(--success))" }}>{fmtAmount(totalCredit)}</strong></span>
                          <span className="border-r border-border pr-4">رصيد الفترة: <strong className="text-foreground">{fmtAmount(totalDebit - totalCredit)}</strong></span>
                          <span>رصيد ختامي: <strong className="text-foreground">{fmtAmount(closingBalance)}</strong> ({closingBalance >= 0 ? "مدين" : "دائن"})</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Print footer */}
                <div className="print-only text-center mt-6 text-xs text-muted-foreground border-t pt-3">
                  طُبع بتاريخ: {fmtDate(format(new Date(), "yyyy-MM-dd"))} — نظام عبدالله AI للمحاسبة
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── SUB-COMPONENTS ───

function KPIChip({ label, value, icon: Icon, variant }: { label: string; value: number; icon: any; variant?: "debit" | "credit" | "closing" }) {
  const colorClass = variant === "debit"
    ? "border-red-500/20 bg-red-500/5"
    : variant === "credit"
    ? "border-emerald-500/20 bg-emerald-500/5"
    : variant === "closing"
    ? "border-primary/20 bg-primary/5"
    : "border-border bg-muted/30";

  const valueColor = variant === "debit"
    ? "text-red-500"
    : variant === "credit"
    ? "text-emerald-500"
    : variant === "closing"
    ? (value >= 0 ? "text-primary" : "text-red-500")
    : "text-foreground";

  return (
    <div className={cn("rounded-lg border p-3 text-center", colorClass)}>
      <div className="flex items-center justify-center gap-1 mb-1">
        <Icon className="w-3 h-3 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className={cn("text-lg font-bold tabular-nums", valueColor)}>{fmtAmount(value)}</p>
      {(variant === "closing" || !variant) && (
        <p className="text-[10px] text-muted-foreground mt-0.5">{value >= 0 ? "مدين" : "دائن"}</p>
      )}
    </div>
  );
}

function BalanceCell({ value, bold }: { value: number; bold?: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs tabular-nums",
      bold ? "font-bold text-sm" : "font-semibold",
      value > 0 ? "text-primary bg-primary/10" :
      value < 0 ? "text-red-500 bg-red-500/10" :
      "text-muted-foreground"
    )}>
      {fmtAmount(value)}
      <span className="text-[9px] font-normal opacity-70">{value > 0 ? "م" : value < 0 ? "د" : ""}</span>
    </span>
  );
}

export default AccountStatementPage;
