import { useState, useEffect, useMemo, useRef } from "react";
import PageHeader from "@/components/layout/PageHeader";
import {
  ArrowRight, Loader2, RefreshCw, Search, BookOpen, FileSpreadsheet,
  X, ArrowUpDown, ChevronLeft, ChevronRight, DollarSign, TrendingUp, TrendingDown,
  Check, ChevronsUpDown,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { multiWordMatchAny } from "@/lib/utils";
import { cn } from "@/lib/utils";

import { setNextExportBranding } from "@/lib/excel-export";
interface LedgerRow {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

type SortKey = "date" | "description" | "debit" | "credit" | "balance";
type SortDir = "asc" | "desc";
const PER_PAGE = 15;

const GeneralLedgerPage = () => {
  const [accountPopoverOpen, setAccountPopoverOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const { toast } = useToast();

  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");

  const [selectedAccount, setSelectedAccount] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);

  const accountMap = useMemo(() => {
    const map: Record<string, any> = {};
    accounts.forEach(a => { map[a.account_code] = a; });
    return map;
  }, [accounts]);

  const fetchData = async () => {
    if (!user || !dataOwnerId) return;
    setLoading(true);
    try {
      // Fetch ALL transactions (no limit) to ensure complete ledger
      const fetchAllTransactions = async () => {
        let allData: any[] = [];
        let from = 0;
        const batchSize = 1000;
        while (true) {
          const { data, error } = await supabase
            .from("transactions")
            .select("id, transaction_date, description, transaction_type, debit_account_code, credit_account_code, amount, currency, reference, payment_method, is_deleted, is_opening_balance, contact_id")
            .eq("user_id", dataOwnerId)
            .range(from, from + batchSize - 1)
            .order("transaction_date", { ascending: true });
          if (error) throw error;
          if (!data || data.length === 0) break;
          allData = allData.concat(data);
          if (data.length < batchSize) break;
          from += batchSize;
        }
        return allData;
      };

      const [txData, accRes, profileRes] = await Promise.all([
        fetchAllTransactions(),
        supabase.from("accounts").select("id, account_name, account_code, account_type, is_active, parent_code").eq("user_id", dataOwnerId).order("account_code"),
        supabase.from("profiles").select("display_name, company_name").eq("user_id", user.id).maybeSingle(),
      ]);
      setTransactions(txData);
      const accData = accRes.data || [];
      setAccounts(accData);
      if (!selectedAccount && accData.length > 0) {
        setSelectedAccount(accData[0].account_name);
      }
      if (profileRes.data) {
        setCompanyName(profileRes.data.company_name || profileRes.data.display_name || "");
      }
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user, dataOwnerId]);

  const accountNames = useMemo(() =>
    accounts.map(a => a.account_name).filter(Boolean).sort(),
    [accounts]
  );

  // Build ledger rows
  const { rows: allRows, openingBalance } = useMemo(() => {
    if (!selectedAccount) return { rows: [], openingBalance: 0 };

    const selectedAcc = accounts.find(a => a.account_name === selectedAccount);
    const selectedCode = selectedAcc?.account_code || "";

    const filtered = transactions.filter(tx => !tx.is_deleted);
    const sorted = [...filtered].sort((a, b) =>
      (a.transaction_date || "").localeCompare(b.transaction_date || "")
    );

    let openBal = 0;
    const ledgerTx: { date: string; description: string; debit: number; credit: number }[] = [];

    for (const tx of sorted) {
      const amount = tx.amount || 0;
      const isDebit = tx.debit_account_code === selectedCode;
      const isCredit = tx.credit_account_code === selectedCode;
      if (!isDebit && !isCredit) continue;

      const txDate = tx.transaction_date || "";

      if (dateFrom && txDate < dateFrom) {
        if (isDebit) openBal += amount;
        if (isCredit) openBal -= amount;
        continue;
      }
      if (dateTo && txDate > dateTo) continue;

      ledgerTx.push({
        date: txDate,
        description: tx.description || tx.transaction_type || "—",
        debit: isDebit ? amount : 0,
        credit: isCredit ? amount : 0,
      });
    }

    let bal = openBal;
    const rows: LedgerRow[] = ledgerTx.map(tx => {
      bal += tx.debit - tx.credit;
      return { ...tx, balance: bal };
    });

    return { rows, openingBalance: openBal };
  }, [transactions, accounts, selectedAccount, dateFrom, dateTo]);

  // Search filter
  const filteredRows = useMemo(() => {
    if (!searchQuery) return allRows;
    return allRows.filter(r => multiWordMatchAny(searchQuery, r.description, r.date));
  }, [allRows, searchQuery]);

  // Sorting
  const sortedRows = useMemo(() => {
    const arr = [...filteredRows];
    arr.sort((a, b) => {
      let av: any = a[sortKey], bv: any = b[sortKey];
      if (typeof av === "string") { av = av.toLowerCase(); bv = (bv || "").toLowerCase(); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filteredRows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PER_PAGE));
  const pagedRows = sortedRows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  useEffect(() => { setPage(1); }, [searchQuery, selectedAccount, dateFrom, dateTo]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(1);
  };

  const totalDebit = allRows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = allRows.reduce((s, r) => s + r.credit, 0);
  const closingBalance = allRows.length > 0 ? allRows[allRows.length - 1].balance : openingBalance;

  // Export
  const handleExport = () => {
    const data = [
      { "التاريخ": "", "البيان": "رصيد أول المدة", "مدين": "", "دائن": "", "الرصيد": openingBalance },
      ...allRows.map(r => ({
        "التاريخ": r.date,
        "البيان": r.description,
        "مدين": r.debit || "",
        "دائن": r.credit || "",
        "الرصيد": r.balance,
      })),
      { "التاريخ": "", "البيان": "الإجمالي", "مدين": totalDebit, "دائن": totalCredit, "الرصيد": closingBalance },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 12 }, { wch: 35 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, selectedAccount || "دفتر الأستاذ");
    setNextExportBranding({
      title: `دفتر الأستاذ — ${selectedAccount || "كل الحسابات"}`,
      currency: "شيكل ₪",
      period: dateFrom || dateTo ? `${dateFrom || "—"} → ${dateTo || "—"}` : "كل الفترات",
    });
    XLSX.writeFile(wb, `دفتر_الأستاذ_${selectedAccount}_${Date.now()}.xlsx`);
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <button onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-primary-foreground/80 transition-colors w-full">
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === field ? "opacity-100" : "opacity-30"}`} />
    </button>
  );

  return (
    <div className="p-4 md:p-6 pb-24 space-y-5" dir="rtl">
      <PageHeader title="دفتر الأستاذ العام" breadcrumb={["المحاسبة", "دفتر الأستاذ"]} />
      
      <div className="flex items-center gap-2 justify-start">
        <Button variant="outline" size="sm" className="gap-1.5 rounded-lg" onClick={fetchData}>
          <RefreshCw className="h-3.5 w-3.5" /> تحديث
        </Button>
        <Button className="gap-1.5 rounded-lg q-btn-primary" onClick={handleExport} disabled={allRows.length === 0}>
          <FileSpreadsheet className="h-4 w-4" /> تصدير Excel
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-2xl p-4 shadow-sm border border-border/40">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1 sm:col-span-2 lg:col-span-2">
            <label className="text-[11px] text-muted-foreground font-medium">الحساب</label>
            <Popover open={accountPopoverOpen} onOpenChange={setAccountPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={accountPopoverOpen}
                  className="h-9 w-full rounded-xl bg-muted/30 border-0 text-sm justify-between font-normal">
                  {selectedAccount || "اختر الحساب..."}
                  <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-50" align="start">
                <Command dir="rtl">
                  <CommandInput placeholder="ابحث عن حساب..." className="h-9 text-sm" />
                  <CommandList className="max-h-60">
                    <CommandEmpty>لا توجد نتائج</CommandEmpty>
                    <CommandGroup>
                      {accountNames.map(name => {
                        const acc = accounts.find(a => a.account_name === name);
                        return (
                          <CommandItem key={name} value={`${acc?.account_code || ''} ${name}`}
                            onSelect={() => { setSelectedAccount(name); setAccountPopoverOpen(false); }}>
                            <Check className={cn("ml-2 h-3.5 w-3.5", selectedAccount === name ? "opacity-100" : "opacity-0")} />
                            <span className="text-muted-foreground text-xs ml-2">{acc?.account_code}</span>
                            {name}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground font-medium">من تاريخ</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 rounded-xl bg-muted/30 border-0 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground font-medium">إلى تاريخ</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="h-9 rounded-xl bg-muted/30 border-0 text-sm" />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "رصيد أول المدة", value: `₪${openingBalance.toLocaleString()}`, icon: DollarSign, color: openingBalance >= 0 ? "text-primary" : "text-destructive", bg: "bg-primary/5 border-primary/10" },
          { label: "إجمالي المدين", value: `₪${totalDebit.toLocaleString()}`, icon: TrendingUp, color: "text-primary", bg: "bg-primary/5 border-primary/10" },
          { label: "إجمالي الدائن", value: `₪${totalCredit.toLocaleString()}`, icon: TrendingDown, color: "text-destructive", bg: "bg-destructive/5 border-destructive/10" },
          { label: "الرصيد الختامي", value: `₪${closingBalance.toLocaleString()}`, icon: DollarSign, color: closingBalance >= 0 ? "text-primary" : "text-destructive", bg: closingBalance >= 0 ? "bg-primary/5 border-primary/10" : "bg-destructive/5 border-destructive/10" },
        ].map((k, i) => (
          <div key={i} className={`rounded-2xl border p-4 ${k.bg}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground font-medium mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
              <k.icon className={`h-5 w-5 ${k.color} opacity-50`} />
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      {allRows.length > 0 && (
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
          <Input
            placeholder="ابحث في البيان أو التاريخ..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pr-10 rounded-xl bg-muted/30"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      )}

      {/* Empty - no account */}
      {!loading && !selectedAccount && (
        <div className="text-center py-16">
          <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="h-10 w-10 text-muted-foreground/40" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">اختر حساباً</h3>
          <p className="text-xs text-muted-foreground">اختر حساباً لعرض حركاته في دفتر الأستاذ</p>
        </div>
      )}

      {/* Empty - no rows */}
      {!loading && selectedAccount && allRows.length === 0 && (
        <div className="text-center py-16">
          <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="h-10 w-10 text-muted-foreground/40" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">لا توجد حركات</h3>
          <p className="text-xs text-muted-foreground">لا توجد حركات لهذا الحساب في الفترة المحددة</p>
        </div>
      )}

      {/* No search results */}
      {!loading && allRows.length > 0 && filteredRows.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <Search className="h-10 w-10 text-muted-foreground/20 mx-auto" />
          <p className="text-sm text-muted-foreground">لا توجد حركات تطابق البحث</p>
          <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>مسح البحث</Button>
        </div>
      )}

      {/* TABLE */}
      {!loading && pagedRows.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="px-3 py-3 text-right text-xs font-semibold w-[110px]"><SortHeader label="التاريخ" field="date" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold min-w-[250px]"><SortHeader label="البيان" field="description" /></th>
                  <th className="px-3 py-3 text-left text-xs font-semibold w-[120px]"><SortHeader label="مدين (₪)" field="debit" /></th>
                  <th className="px-3 py-3 text-left text-xs font-semibold w-[120px]"><SortHeader label="دائن (₪)" field="credit" /></th>
                  <th className="px-3 py-3 text-left text-xs font-semibold w-[130px]"><SortHeader label="الرصيد (₪)" field="balance" /></th>
                </tr>
              </thead>
              <tbody>
                {/* Opening Balance Row */}
                {page === 1 && (
                  <tr className="bg-muted/30 border-b border-border/50">
                    <td className="px-3 py-3 text-xs text-muted-foreground">—</td>
                    <td className="px-3 py-3 text-sm font-bold text-foreground">رصيد أول المدة</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">—</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">—</td>
                    <td className={`px-3 py-3 text-sm font-bold tabular-nums text-left ${openingBalance >= 0 ? "text-primary" : "text-destructive"}`}>
                      ₪{openingBalance.toLocaleString()}
                    </td>
                  </tr>
                )}

                {pagedRows.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-border/50 transition-colors ${i % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-primary/5`}
                  >
                    <td className="px-3 py-3 text-xs text-foreground tabular-nums whitespace-nowrap">{row.date}</td>
                    <td className="px-3 py-3 text-sm font-medium text-foreground">{row.description}</td>
                    <td className="px-3 py-3 text-sm font-bold text-primary tabular-nums text-left">
                      {row.debit > 0 ? `₪${row.debit.toLocaleString()}` : ""}
                    </td>
                    <td className="px-3 py-3 text-sm font-bold text-destructive tabular-nums text-left">
                      {row.credit > 0 ? `₪${row.credit.toLocaleString()}` : ""}
                    </td>
                    <td className={`px-3 py-3 text-sm font-bold tabular-nums text-left ${row.balance >= 0 ? "text-primary" : "text-destructive"}`}>
                      ₪{row.balance.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Footer totals */}
              <tfoot>
                <tr className="bg-primary/5 border-t-2 border-primary/20 font-bold text-sm">
                  <td className="px-3 py-3 text-right text-foreground">—</td>
                  <td className="px-3 py-3 text-right text-foreground">الإجمالي ({allRows.length} حركة)</td>
                  <td className="px-3 py-3 tabular-nums text-primary text-left">₪{totalDebit.toLocaleString()}</td>
                  <td className="px-3 py-3 tabular-nums text-destructive text-left">₪{totalCredit.toLocaleString()}</td>
                  <td className={`px-3 py-3 tabular-nums text-left ${closingBalance >= 0 ? "text-primary" : "text-destructive"}`}>
                    ₪{closingBalance.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pagination */}
          {sortedRows.length > PER_PAGE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 bg-muted/20">
              <p className="text-xs text-muted-foreground">
                عرض {Math.min((page - 1) * PER_PAGE + 1, sortedRows.length)}–{Math.min(page * PER_PAGE, sortedRows.length)} من {sortedRows.length}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let pg: number;
                  if (totalPages <= 5) pg = i + 1;
                  else if (page <= 3) pg = i + 1;
                  else if (page >= totalPages - 2) pg = totalPages - 4 + i;
                  else pg = page - 2 + i;
                  return (
                    <Button key={pg} variant={page === pg ? "default" : "ghost"} size="icon" className="h-7 w-7 text-xs" onClick={() => setPage(pg)}>
                      {pg}
                    </Button>
                  );
                })}
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GeneralLedgerPage;
