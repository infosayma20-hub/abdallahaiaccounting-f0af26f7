import { useState, useEffect, useMemo } from "react";
import { getAuthHeaders } from "@/lib/edge-helpers";
import {
  ArrowRight, Loader2, RefreshCw, Search, BookOpen, FileSpreadsheet,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Transaction {
  id: string;
  fields: {
    Description?: string;
    "Debit Account Name"?: string;
    "Credit Account Name"?: string;
    "Transaction Type"?: string;
    Amount?: number;
    Currency?: string;
    Date?: string;
    Deleted?: boolean;
  };
}

interface Account {
  id: string;
  fields: {
    "Account Name"?: string;
    "Account Code"?: string;
    "Account Type"?: string;
  };
}

interface LedgerRow {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

const GeneralLedgerPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");

  const [selectedAccount, setSelectedAccount] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [txRes, accRes, profileRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-transactions?clientId=${user.id}`, {
          headers: await getAuthHeaders(),
        }),
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-accounts?clientId=${user.id}`, {
          headers: await getAuthHeaders(),
        }),
        supabase.from("profiles").select("display_name, company_name").eq("user_id", user.id).maybeSingle(),
      ]);
      if (!txRes.ok) throw new Error("Failed to fetch transactions");
      const txData = await txRes.json();
      setTransactions(txData?.records || []);
      if (accRes.ok) {
        const accData = await accRes.json();
        setAccounts(accData?.records || []);
        // Auto-select first account if none selected
        if (!selectedAccount && accData?.records?.length > 0) {
          const firstName = accData.records[0]?.fields?.["Account Name"];
          if (firstName) setSelectedAccount(firstName);
        }
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

  useEffect(() => { fetchData(); }, [user]);

  // Account names sorted
  const accountNames = useMemo(() =>
    accounts
      .map(a => a.fields["Account Name"] || "")
      .filter(Boolean)
      .sort(),
    [accounts]
  );

  // Build ledger rows
  const { rows, openingBalance } = useMemo(() => {
    if (!selectedAccount) return { rows: [], openingBalance: 0 };

    const filtered = transactions.filter(tx => !tx.fields.Deleted);

    // Sort by date
    const sorted = [...filtered].sort((a, b) =>
      (a.fields.Date || "").localeCompare(b.fields.Date || "")
    );

    // Calculate opening balance (before dateFrom)
    let openBal = 0;
    const ledgerTx: { date: string; description: string; debit: number; credit: number }[] = [];

    for (const tx of sorted) {
      const amount = tx.fields.Amount || 0;
      const debitNames = (tx.fields["Debit Account Name"] || "").split(", ");
      const creditNames = (tx.fields["Credit Account Name"] || "").split(", ");
      const isDebit = debitNames.includes(selectedAccount);
      const isCredit = creditNames.includes(selectedAccount);

      if (!isDebit && !isCredit) continue;

      const txDate = tx.fields.Date || "";

      // Before period → opening balance
      if (dateFrom && txDate < dateFrom) {
        if (isDebit) openBal += amount;
        if (isCredit) openBal -= amount;
        continue;
      }

      // After period → skip
      if (dateTo && txDate > dateTo) continue;

      ledgerTx.push({
        date: txDate,
        description: tx.fields.Description || tx.fields["Transaction Type"] || "—",
        debit: isDebit ? amount : 0,
        credit: isCredit ? amount : 0,
      });
    }

    // Build rows with running balance
    let bal = openBal;
    const rows: LedgerRow[] = ledgerTx.map(tx => {
      bal += tx.debit - tx.credit;
      return { ...tx, balance: bal };
    });

    return { rows, openingBalance: openBal };
  }, [transactions, selectedAccount, dateFrom, dateTo]);

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const closingBalance = rows.length > 0 ? rows[rows.length - 1].balance : openingBalance;

  // Export
  const handleExport = () => {
    const data = [
      { "التاريخ": "", "البيان": "رصيد أول المدة", "مدين": "", "دائن": "", "الرصيد": openingBalance },
      ...rows.map(r => ({
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
    XLSX.writeFile(wb, `دفتر_الأستاذ_${selectedAccount}_${Date.now()}.xlsx`);
  };

  const dateRangeLabel = dateFrom && dateTo
    ? `${dateFrom} — ${dateTo}`
    : dateFrom ? `من ${dateFrom}` : dateTo ? `حتى ${dateTo}` : "جميع الفترات";

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-10" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              دفتر الأستاذ العام
            </h1>
            <p className="text-xs text-muted-foreground">
              {companyName && `${companyName} • `}{selectedAccount || "اختر حساب"} • {dateRangeLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> تحديث
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={rows.length === 0} className="gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5" /> تصدير Excel
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1 sm:col-span-2 lg:col-span-1">
            <label className="text-[11px] text-muted-foreground">الحساب</label>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="h-9 rounded-lg bg-secondary/50 border-0 text-sm">
                <SelectValue placeholder="اختر الحساب..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {accountNames.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">من تاريخ</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 rounded-lg bg-secondary/50 border-0 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">إلى تاريخ</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="h-9 rounded-lg bg-secondary/50 border-0 text-sm" />
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
          <p className="text-[11px] text-muted-foreground">رصيد أول المدة</p>
          <p className={`text-lg font-bold tabular-nums ${openingBalance >= 0 ? "text-primary" : "text-destructive"}`}>
            ₪{openingBalance.toLocaleString()}
          </p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
          <p className="text-[11px] text-muted-foreground">إجمالي المدين</p>
          <p className="text-lg font-bold text-primary tabular-nums">₪{totalDebit.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
          <p className="text-[11px] text-muted-foreground">إجمالي الدائن</p>
          <p className="text-lg font-bold text-destructive tabular-nums">₪{totalCredit.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
          <p className="text-[11px] text-muted-foreground">الرصيد الختامي</p>
          <p className={`text-lg font-bold tabular-nums ${closingBalance >= 0 ? "text-primary" : "text-destructive"}`}>
            ₪{closingBalance.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !selectedAccount ? (
        <div className="text-center py-20 space-y-3">
          <BookOpen className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">اختر حساباً لعرض حركاته</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <BookOpen className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">لا توجد حركات لهذا الحساب في الفترة المحددة</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl shadow-card border border-border/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-primary/20 bg-muted/40">
                  <th className="text-right px-4 py-3 text-[11px] font-bold text-muted-foreground w-[100px]">التاريخ</th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold text-muted-foreground min-w-[250px]">البيان</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-primary w-[120px]">مدين (₪)</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-destructive w-[120px]">دائن (₪)</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-foreground w-[130px]">الرصيد (₪)</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening Balance Row */}
                <tr className="bg-muted/20 border-b border-border/40">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">—</td>
                  <td className="px-4 py-2.5 text-xs font-bold text-foreground">رصيد أول المدة</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">—</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">—</td>
                  <td className={`px-4 py-2.5 text-xs font-bold tabular-nums ${openingBalance >= 0 ? "text-primary" : "text-destructive"}`}>
                    ₪{openingBalance.toLocaleString()}
                  </td>
                </tr>

                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-foreground tabular-nums whitespace-nowrap">{row.date}</td>
                    <td className="px-4 py-2.5 text-xs text-foreground font-medium">{row.description}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-primary tabular-nums text-left">
                      {row.debit > 0 ? `₪${row.debit.toLocaleString()}` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-bold text-destructive tabular-nums text-left">
                      {row.credit > 0 ? `₪${row.credit.toLocaleString()}` : ""}
                    </td>
                    <td className={`px-4 py-2.5 text-xs font-bold tabular-nums text-left ${row.balance >= 0 ? "text-primary" : "text-destructive"}`}>
                      ₪{row.balance.toLocaleString()}
                    </td>
                  </tr>
                ))}

                {/* Totals Row */}
                <tr className="bg-muted/30 border-t-2 border-primary/20">
                  <td className="px-4 py-3 text-xs font-bold text-foreground">—</td>
                  <td className="px-4 py-3 text-xs font-bold text-foreground">الإجمالي</td>
                  <td className="px-4 py-3 text-xs font-bold text-primary tabular-nums text-left">₪{totalDebit.toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs font-bold text-destructive tabular-nums text-left">₪{totalCredit.toLocaleString()}</td>
                  <td className={`px-4 py-3 text-xs font-bold tabular-nums text-left ${closingBalance >= 0 ? "text-primary" : "text-destructive"}`}>
                    ₪{closingBalance.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default GeneralLedgerPage;
