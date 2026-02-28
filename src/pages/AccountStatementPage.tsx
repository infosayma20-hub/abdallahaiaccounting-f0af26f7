import { useState, useEffect, useMemo, useRef } from "react";
import {
  ArrowRight, Loader2, RefreshCw, Search, FileSpreadsheet,
  TrendingUp, TrendingDown, Wallet, FileText, Printer,
  AlertTriangle, Calendar, Hash, BookOpen
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from "date-fns";

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
  is_opening_balance: boolean;
  contacts?: { contact_name: string } | null;
}

interface Account {
  account_code: string;
  account_name: string;
  account_type: string;
  parent_code: string | null;
}

interface StatementRow {
  date: string;
  description: string;
  transaction_type: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  side: "مدين" | "دائن" | "متوازن";
  transaction_id: string;
}

const AccountStatementPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [selectedAccountCode, setSelectedAccountCode] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [txSearch, setTxSearch] = useState("");

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [{ data: txData }, { data: accData }, profileRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("*, contacts(contact_name)")
          .eq("user_id", user.id)
          .eq("is_deleted", false)
          .order("transaction_date", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("accounts")
          .select("account_code, account_name, account_type, parent_code")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .order("account_code"),
        supabase.from("profiles").select("company_name, display_name").eq("user_id", user.id).maybeSingle(),
      ]);
      setTransactions((txData as any) || []);
      setAccounts((accData as any) || []);
      if (profileRes.data?.company_name) setCompanyName(profileRes.data.company_name);
    } catch (err: any) {
      toast({ title: "خطأ في جلب البيانات", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user]);

  const selectedAccount = useMemo(
    () => accounts.find(a => a.account_code === selectedAccountCode),
    [accounts, selectedAccountCode]
  );

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.toLowerCase().trim();
    if (!q) return accounts;
    return accounts.filter(a =>
      a.account_name.toLowerCase().includes(q) || a.account_code.includes(q)
    );
  }, [accounts, accountSearch]);

  const { rows, openingBalance, closingBalance, totalDebit, totalCredit } = useMemo(() => {
    if (!selectedAccountCode) return { rows: [] as StatementRow[], openingBalance: 0, closingBalance: 0, totalDebit: 0, totalCredit: 0 };

    const related = transactions.filter(tx =>
      tx.debit_account_code === selectedAccountCode || tx.credit_account_code === selectedAccountCode
    );

    let openBal = 0;
    const periodTx: Transaction[] = [];

    for (const tx of related) {
      const isDebit = tx.debit_account_code === selectedAccountCode;
      const isCredit = tx.credit_account_code === selectedAccountCode;
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
      const isDebit = tx.debit_account_code === selectedAccountCode;
      const amount = tx.amount || 0;
      const debit = isDebit ? amount : 0;
      const credit = !isDebit ? amount : 0;

      runningBalance += debit - credit;
      sumDebit += debit;
      sumCredit += credit;

      return {
        date: tx.transaction_date,
        description: tx.description || tx.transaction_type || "—",
        transaction_type: tx.transaction_type,
        reference: tx.reference || "",
        debit,
        credit,
        balance: runningBalance,
        side: runningBalance > 0 ? "مدين" : runningBalance < 0 ? "دائن" : "متوازن",
        transaction_id: tx.id,
      };
    });

    return { rows, openingBalance: openBal, closingBalance: runningBalance, totalDebit: sumDebit, totalCredit: sumCredit };
  }, [transactions, selectedAccountCode, dateFrom, dateTo]);

  const filteredRows = useMemo(() => {
    if (!txSearch.trim()) return rows;
    const q = txSearch.toLowerCase();
    return rows.filter(r =>
      r.description.toLowerCase().includes(q) ||
      r.reference.toLowerCase().includes(q) ||
      r.transaction_type.toLowerCase().includes(q)
    );
  }, [rows, txSearch]);

  const formatAmount = (n: number) =>
    n === 0 ? "—" : `₪${Math.abs(n).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatAmountRaw = (n: number) =>
    Math.abs(n).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleExport = () => {
    if (!rows.length) return;
    const accName = selectedAccount ? `${selectedAccount.account_code} - ${selectedAccount.account_name}` : "";
    const exportRows = [
      { "التاريخ": "", "المستند": "", "البيان": "رصيد أول المدة", "النوع": "", "مدين ₪": openingBalance > 0 ? openingBalance : "", "دائن ₪": openingBalance < 0 ? Math.abs(openingBalance) : "", "الرصيد التراكمي ₪": openingBalance, "الجانب": openingBalance >= 0 ? "مدين" : "دائن" },
      ...rows.map(r => ({
        "التاريخ": r.date,
        "المستند": r.reference,
        "البيان": r.description,
        "النوع": r.transaction_type,
        "مدين ₪": r.debit || "",
        "دائن ₪": r.credit || "",
        "الرصيد التراكمي ₪": r.balance,
        "الجانب": r.side,
      })),
      { "التاريخ": "", "المستند": "", "البيان": "الإجمالي", "النوع": "", "مدين ₪": totalDebit, "دائن ₪": totalCredit, "الرصيد التراكمي ₪": closingBalance, "الجانب": closingBalance >= 0 ? "مدين" : "دائن" },
    ];
    const ws = XLSX.utils.json_to_sheet(exportRows);
    ws["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 40 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "كشف الحساب");
    XLSX.writeFile(wb, `كشف-حساب-${accName}-${dateFrom}-${dateTo}.xlsx`);
  };

  const handlePrint = () => {
    window.print();
  };

  const quickPeriods = [
    { label: "هذا الشهر", from: format(startOfMonth(new Date()), "yyyy-MM-dd"), to: format(endOfMonth(new Date()), "yyyy-MM-dd") },
    { label: "الربع الحالي", from: format(startOfQuarter(new Date()), "yyyy-MM-dd"), to: format(endOfQuarter(new Date()), "yyyy-MM-dd") },
    { label: "هذه السنة", from: format(startOfYear(new Date()), "yyyy-MM-dd"), to: format(endOfYear(new Date()), "yyyy-MM-dd") },
    { label: "كل الفترات", from: "2020-01-01", to: format(new Date(), "yyyy-MM-dd") },
  ];

  const balanceColorClass = (val: number) => {
    if (val > 0) return "text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-950/30";
    if (val < 0) return "text-orange-700 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/30";
    return "text-muted-foreground bg-muted/30";
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; inset: 0; background: white; padding: 20px; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 no-print">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-muted transition-colors">
              <ArrowRight className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-foreground">كشف الحساب</h1>
              <p className="text-xs text-muted-foreground">{companyName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            {rows.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="w-4 h-4 ml-1" />
                  طباعة
                </Button>
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <FileSpreadsheet className="w-4 h-4 ml-1" />
                  Excel
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 py-3 border-b bg-muted/30 no-print">
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">اختر الحساب</label>
            <Select value={selectedAccountCode} onValueChange={setSelectedAccountCode}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="ابحث واختر حساباً..." />
              </SelectTrigger>
              <SelectContent>
                <div className="p-2 sticky top-0 bg-popover">
                  <div className="relative">
                    <Search className="absolute right-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="ابحث بالاسم أو الكود..." value={accountSearch} onChange={e => setAccountSearch(e.target.value)} className="pr-9 h-9 text-sm" />
                  </div>
                </div>
                {filteredAccounts.map(acc => (
                  <SelectItem key={acc.account_code} value={acc.account_code}>
                    <span className="font-mono text-xs ml-2">{acc.account_code}</span>
                    <span>{acc.account_name}</span>
                    <span className="text-muted-foreground text-xs mr-1">({acc.account_type})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">من تاريخ</label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">إلى تاريخ</label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {quickPeriods.map(p => (
              <button key={p.label} onClick={() => { setDateFrom(p.from); setDateTo(p.to); }}
                className="px-3 py-1.5 rounded-full bg-secondary text-xs font-medium hover:bg-primary/10 hover:text-primary transition-all">
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {/* Print area wrapper */}
      <div ref={printRef} className="print-area">

        {/* Results */}
        {!loading && selectedAccountCode && (
          <>
            {/* Account header for print */}
            <div className="hidden print:block mb-4 text-center">
              <h2 className="text-lg font-bold">{companyName}</h2>
              <p className="font-semibold">كشف حساب: {selectedAccount?.account_name} ({selectedAccount?.account_code})</p>
              <p className="text-sm">من {dateFrom} إلى {dateTo}</p>
            </div>

            {/* Summary Bar */}
            <div className="px-4 py-3 no-print">
              <div className="grid grid-cols-5 gap-2">
                <div className="bg-muted/50 rounded-lg p-3 text-center border">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Hash className="w-3 h-3 text-muted-foreground" />
                    <p className="text-[10px] text-muted-foreground font-medium">عدد السجلات</p>
                  </div>
                  <p className="text-lg font-bold text-foreground tabular-nums">{rows.length}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center border">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <BookOpen className="w-3 h-3 text-muted-foreground" />
                    <p className="text-[10px] text-muted-foreground font-medium">رصيد افتتاحي</p>
                  </div>
                  <p className="text-lg font-bold text-foreground tabular-nums">{formatAmount(openingBalance)}</p>
                  <p className="text-[10px] text-muted-foreground">{openingBalance >= 0 ? "مدين" : "دائن"}</p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-center border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <TrendingUp className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                    <p className="text-[10px] text-blue-700 dark:text-blue-400 font-medium">إجمالي المدين</p>
                  </div>
                  <p className="text-lg font-bold text-blue-700 dark:text-blue-400 tabular-nums">{formatAmount(totalDebit)}</p>
                </div>
                <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 text-center border border-green-200 dark:border-green-800">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <TrendingDown className="w-3 h-3 text-green-600 dark:text-green-400" />
                    <p className="text-[10px] text-green-700 dark:text-green-400 font-medium">إجمالي الدائن</p>
                  </div>
                  <p className="text-lg font-bold text-green-700 dark:text-green-400 tabular-nums">{formatAmount(totalCredit)}</p>
                </div>
                <div className={`rounded-lg p-3 text-center border ${
                  closingBalance > 0
                    ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                    : closingBalance < 0
                    ? "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800"
                    : "bg-muted/50"
                }`}>
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Wallet className="w-3 h-3" />
                    <p className="text-[10px] font-medium">صافي الرصيد</p>
                  </div>
                  <p className={`text-lg font-bold tabular-nums ${
                    closingBalance > 0 ? "text-green-700 dark:text-green-400" : closingBalance < 0 ? "text-orange-700 dark:text-orange-400" : "text-foreground"
                  }`}>
                    {formatAmount(closingBalance)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{closingBalance > 0 ? "مدين" : closingBalance < 0 ? "دائن" : "متوازن"}</p>
                </div>
              </div>
            </div>

            {/* Credit balance warning */}
            {closingBalance < 0 && (
              <div className="px-4 pb-2 no-print">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-300 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>تنبيه: هذا الحساب لديه رصيد دائن (₪{formatAmountRaw(closingBalance)}) — يحتاج مراجعة</span>
                </div>
              </div>
            )}

            {/* Search within transactions */}
            {rows.length > 0 && (
              <div className="px-4 py-2 no-print">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{filteredRows.length} سجل</span>
                  <div className="relative w-60">
                    <Search className="absolute right-2.5 top-2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="بحث في الحركات..." value={txSearch} onChange={e => setTxSearch(e.target.value)} className="pr-9 h-8 text-xs" />
                  </div>
                </div>
              </div>
            )}

            {/* Transactions table */}
            {rows.length === 0 ? (
              <div className="px-4">
                <Card className="py-12">
                  <p className="text-center text-muted-foreground">لا توجد حركات لهذا الحساب في الفترة المحددة</p>
                </Card>
              </div>
            ) : (
              <div className="px-4 pb-8">
                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                          <th className="p-2.5 text-right">التاريخ</th>
                          <th className="p-2.5 text-right">المستند</th>
                          <th className="p-2.5 text-right">النوع</th>
                          <th className="p-2.5 text-right">البيان</th>
                          <th className="p-2.5 text-left">مدين ₪</th>
                          <th className="p-2.5 text-left">دائن ₪</th>
                          <th className="p-2.5 text-left">الرصيد التراكمي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Opening balance row */}
                        <tr className="border-b bg-muted/20 font-medium text-xs">
                          <td className="p-2.5">{dateFrom}</td>
                          <td className="p-2.5 text-muted-foreground">—</td>
                          <td className="p-2.5"></td>
                          <td className="p-2.5 font-semibold">رصيد أول المدة</td>
                          <td className="p-2.5 text-left">{openingBalance > 0 ? formatAmount(openingBalance) : "—"}</td>
                          <td className="p-2.5 text-left">{openingBalance < 0 ? formatAmount(openingBalance) : "—"}</td>
                          <td className="p-2.5 text-left">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${balanceColorClass(openingBalance)}`}>
                              {formatAmount(openingBalance)}
                              <span className="text-[10px] font-normal">{openingBalance >= 0 ? "م" : "د"}</span>
                            </span>
                          </td>
                        </tr>

                        {/* Transaction rows */}
                        {filteredRows.map((row) => (
                          <tr key={row.transaction_id} className="border-b hover:bg-muted/20 text-xs transition-colors">
                            <td className="p-2.5 tabular-nums">{row.date}</td>
                            <td className="p-2.5">
                              {row.reference ? (
                                <button
                                  onClick={() => navigate(`/journal-entries`)}
                                  className="text-primary hover:underline font-medium"
                                >
                                  {row.reference}
                                </button>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="p-2.5">
                              <Badge variant="secondary" className="text-[10px] font-normal">
                                {row.transaction_type}
                              </Badge>
                            </td>
                            <td className="p-2.5">
                              <p className="font-medium text-foreground">{row.description}</p>
                            </td>
                            <td className="p-2.5 text-left tabular-nums text-blue-700 dark:text-blue-400 font-medium">
                              {row.debit > 0 ? formatAmount(row.debit) : "—"}
                            </td>
                            <td className="p-2.5 text-left tabular-nums text-green-700 dark:text-green-400 font-medium">
                              {row.credit > 0 ? formatAmount(row.credit) : "—"}
                            </td>
                            <td className="p-2.5 text-left">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${balanceColorClass(row.balance)}`}>
                                {formatAmount(row.balance)}
                                <span className="text-[10px] font-normal">{row.balance > 0 ? "م" : row.balance < 0 ? "د" : ""}</span>
                              </span>
                            </td>
                          </tr>
                        ))}

                        {/* Totals footer */}
                        <tr className="border-t-2 border-border bg-[hsl(var(--muted)/0.5)] font-bold text-xs">
                          <td className="p-2.5" colSpan={4}>
                            <span className="font-bold">الإجمالي</span>
                          </td>
                          <td className="p-2.5 text-left tabular-nums text-blue-700 dark:text-blue-400">{formatAmount(totalDebit)}</td>
                          <td className="p-2.5 text-left tabular-nums text-green-700 dark:text-green-400">{formatAmount(totalCredit)}</td>
                          <td className="p-2.5 text-left">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${balanceColorClass(closingBalance)}`}>
                              {formatAmount(closingBalance)}
                              <Badge variant="outline" className="text-[10px] mr-1 py-0">
                                {closingBalance > 0 ? "مدين" : closingBalance < 0 ? "دائن" : "متوازن"}
                              </Badge>
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}
          </>
        )}
      </div>

      {/* Empty state */}
      {!loading && !selectedAccountCode && (
        <div className="px-4 py-20">
          <div className="text-center space-y-3">
            <Wallet className="w-12 h-12 mx-auto text-muted-foreground/40" />
            <p className="text-lg font-medium text-muted-foreground">اختر حساباً لعرض كشفه المالي</p>
            <p className="text-sm text-muted-foreground/70">يمكنك البحث بالاسم أو الكود من القائمة أعلاه</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountStatementPage;
