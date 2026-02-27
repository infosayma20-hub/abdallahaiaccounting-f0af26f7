import { useState, useEffect, useMemo } from "react";
import { ArrowRight, Loader2, RefreshCw, Search, FileSpreadsheet, TrendingUp, TrendingDown, Wallet, FileText } from "lucide-react";
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
import { format, startOfMonth, endOfMonth } from "date-fns";

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

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [selectedAccountCode, setSelectedAccountCode] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));

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
      a.account_name.toLowerCase().includes(q) ||
      a.account_code.includes(q)
    );
  }, [accounts, accountSearch]);

  const { rows, openingBalance, closingBalance, totalDebit, totalCredit } = useMemo(() => {
    if (!selectedAccountCode) return { rows: [] as StatementRow[], openingBalance: 0, closingBalance: 0, totalDebit: 0, totalCredit: 0 };

    const related = transactions.filter(tx =>
      tx.debit_account_code === selectedAccountCode ||
      tx.credit_account_code === selectedAccountCode
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

    return {
      rows,
      openingBalance: openBal,
      closingBalance: runningBalance,
      totalDebit: sumDebit,
      totalCredit: sumCredit,
    };
  }, [transactions, selectedAccountCode, dateFrom, dateTo]);

  const typeColors: Record<string, string> = {
    "سند صرف": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    "سند قبض": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    "قيد يومية": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    "فاتورة مبيعات": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    "فاتورة مشتريات": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    "رصيد ابتدائي": "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };

  const handleExport = () => {
    if (!rows.length) return;
    const accName = selectedAccount ? `${selectedAccount.account_code} - ${selectedAccount.account_name}` : "";
    const exportRows = [
      { "التاريخ": "", "البيان": "رصيد أول المدة", "النوع": "", "المرجع": "", "مدين ₪": "", "دائن ₪": "", "الرصيد ₪": openingBalance, "الجانب": openingBalance >= 0 ? "مدين" : "دائن" },
      ...rows.map(r => ({
        "التاريخ": r.date,
        "البيان": r.description,
        "النوع": r.transaction_type,
        "المرجع": r.reference,
        "مدين ₪": r.debit || "",
        "دائن ₪": r.credit || "",
        "الرصيد ₪": r.balance,
        "الجانب": r.side,
      })),
      { "التاريخ": "", "البيان": "الإجمالي", "النوع": "", "المرجع": "", "مدين ₪": totalDebit, "دائن ₪": totalCredit, "الرصيد ₪": "", "الجانب": "" },
      { "التاريخ": "", "البيان": "رصيد آخر المدة", "النوع": "", "المرجع": "", "مدين ₪": "", "دائن ₪": "", "الرصيد ₪": closingBalance, "الجانب": closingBalance >= 0 ? "مدين" : "دائن" },
    ];
    const ws = XLSX.utils.json_to_sheet(exportRows);
    ws["!cols"] = [{ wch: 12 }, { wch: 40 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "كشف الحساب");
    XLSX.writeFile(wb, `كشف-حساب-${accName}-${dateFrom}-${dateTo}.xlsx`);
  };

  const formatAmount = (n: number) =>
    n === 0 ? "—" : `₪${Math.abs(n).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
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
              <Button variant="outline" size="sm" onClick={handleExport}>
                <FileSpreadsheet className="w-4 h-4 ml-1" />
                تصدير Excel
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 py-3 border-b bg-muted/30">
        <div className="space-y-3">
          {/* Account selector */}
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
                    <Input
                      placeholder="ابحث بالاسم أو الكود..."
                      value={accountSearch}
                      onChange={e => setAccountSearch(e.target.value)}
                      className="pr-9 h-9 text-sm"
                    />
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

          {/* Date filters */}
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

          {/* Quick period buttons */}
          <div className="flex gap-2 flex-wrap">
            {[
              { label: "هذا الشهر", from: format(startOfMonth(new Date()), "yyyy-MM-dd"), to: format(endOfMonth(new Date()), "yyyy-MM-dd") },
              { label: "هذا العام", from: `${new Date().getFullYear()}-01-01`, to: `${new Date().getFullYear()}-12-31` },
              { label: "كل الحركات", from: "2020-01-01", to: format(new Date(), "yyyy-MM-dd") },
            ].map(p => (
              <button
                key={p.label}
                onClick={() => { setDateFrom(p.from); setDateTo(p.to); }}
                className="px-2.5 py-1 rounded-full bg-secondary text-xs hover:bg-primary/10 hover:text-primary transition-all"
              >
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

      {/* Results */}
      {!loading && selectedAccountCode && (
        <>
          {/* Account info + Summary */}
          <div className="px-4 py-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-muted-foreground">الحساب</p>
                    <p className="text-lg font-bold text-foreground">{selectedAccount?.account_name}</p>
                    <p className="text-xs text-muted-foreground">{selectedAccount?.account_code} • {selectedAccount?.account_type}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    <FileText className="w-3 h-3 ml-1" />
                    {rows.length} حركة
                  </Badge>
                </div>

                {/* Balance cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">رصيد أول المدة</p>
                    <p className={`text-base font-bold ${openingBalance >= 0 ? "text-primary" : "text-destructive"}`}>
                      {formatAmount(openingBalance)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{openingBalance >= 0 ? "مدين" : "دائن"}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">رصيد آخر المدة</p>
                    <p className={`text-base font-bold ${closingBalance >= 0 ? "text-primary" : "text-destructive"}`}>
                      {formatAmount(closingBalance)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{closingBalance >= 0 ? "مدين" : "دائن"}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                      <TrendingUp className="w-3 h-3 text-green-500" /> إجمالي المدين
                    </p>
                    <p className="text-base font-bold text-foreground">{formatAmount(totalDebit)}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                      <TrendingDown className="w-3 h-3 text-red-500" /> إجمالي الدائن
                    </p>
                    <p className="text-base font-bold text-foreground">{formatAmount(totalCredit)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

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
                        <th className="p-2 text-right w-8">#</th>
                        <th className="p-2 text-right">التاريخ</th>
                        <th className="p-2 text-right">البيان</th>
                        <th className="p-2 text-right">النوع</th>
                        <th className="p-2 text-left">مدين ₪</th>
                        <th className="p-2 text-left">دائن ₪</th>
                        <th className="p-2 text-left">الرصيد ₪</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Opening balance */}
                      <tr className="border-b bg-muted/30 font-medium text-xs">
                        <td className="p-2 text-muted-foreground">—</td>
                        <td className="p-2">{dateFrom}</td>
                        <td className="p-2">رصيد أول المدة</td>
                        <td className="p-2"></td>
                        <td className="p-2 text-left">{openingBalance > 0 ? formatAmount(openingBalance) : "—"}</td>
                        <td className="p-2 text-left">{openingBalance < 0 ? formatAmount(openingBalance) : "—"}</td>
                        <td className="p-2 text-left">
                          <span className={openingBalance >= 0 ? "text-primary" : "text-destructive"}>
                            {formatAmount(openingBalance)}
                          </span>
                          <span className="text-[10px] text-muted-foreground mr-1">{openingBalance >= 0 ? "م" : "د"}</span>
                        </td>
                      </tr>

                      {/* Transactions */}
                      {rows.map((row, i) => (
                        <tr key={row.transaction_id} className="border-b hover:bg-muted/20 text-xs">
                          <td className="p-2 text-muted-foreground">{i + 1}</td>
                          <td className="p-2">{row.date}</td>
                          <td className="p-2">
                            <p className="font-medium text-foreground">{row.description}</p>
                            {row.reference && (
                              <p className="text-[10px] text-muted-foreground">مرجع: {row.reference}</p>
                            )}
                          </td>
                          <td className="p-2">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${typeColors[row.transaction_type] || "bg-muted text-muted-foreground"}`}>
                              {row.transaction_type}
                            </span>
                          </td>
                          <td className="p-2 text-left text-green-600 dark:text-green-400">
                            {row.debit > 0 ? formatAmount(row.debit) : "—"}
                          </td>
                          <td className="p-2 text-left text-red-600 dark:text-red-400">
                            {row.credit > 0 ? formatAmount(row.credit) : "—"}
                          </td>
                          <td className="p-2 text-left">
                            <span className={row.balance >= 0 ? "text-primary" : "text-destructive"}>
                              {formatAmount(row.balance)}
                            </span>
                            <span className="text-[10px] text-muted-foreground mr-1">{row.balance >= 0 ? "م" : "د"}</span>
                          </td>
                        </tr>
                      ))}

                      {/* Totals */}
                      <tr className="border-b bg-muted/50 font-bold text-xs">
                        <td className="p-2" colSpan={4}>الإجمالي</td>
                        <td className="p-2 text-left text-green-600 dark:text-green-400">{formatAmount(totalDebit)}</td>
                        <td className="p-2 text-left text-red-600 dark:text-red-400">{formatAmount(totalCredit)}</td>
                        <td className="p-2"></td>
                      </tr>

                      {/* Closing balance */}
                      <tr className="bg-primary/5 font-bold text-xs">
                        <td className="p-2" colSpan={4}>رصيد آخر المدة</td>
                        <td className="p-2 text-left">{closingBalance > 0 ? formatAmount(closingBalance) : "—"}</td>
                        <td className="p-2 text-left">{closingBalance < 0 ? formatAmount(Math.abs(closingBalance)) : "—"}</td>
                        <td className="p-2 text-left">
                          <span className={closingBalance >= 0 ? "text-primary" : "text-destructive"}>
                            {formatAmount(closingBalance)}
                          </span>
                          <Badge variant="outline" className="mr-1 text-[10px]">
                            {closingBalance >= 0 ? "مدين" : "دائن"}
                          </Badge>
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
