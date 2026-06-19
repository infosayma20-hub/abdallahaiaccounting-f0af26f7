import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, BarChart3, Loader2, FileSpreadsheet, FileText, Calendar, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { fmtDateDisplay, multiWordMatchAny } from "@/lib/utils";

import { setNextExportBranding } from "@/lib/excel-export";
interface Account {
  account_code: string;
  account_name: string;
  account_type: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const PERIOD_OPTIONS = [
  { label: "هذا الشهر", value: "this_month" },
  { label: "الشهر الماضي", value: "last_month" },
  { label: "هذا الربع", value: "this_quarter" },
  { label: "هذه السنة", value: "this_year" },
  { label: "مخصص", value: "custom" },
];

function getDateRange(period: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  switch (period) {
    case "last_month": {
      const d = new Date(y, m - 1, 1);
      return { from: fmt(d), to: fmt(new Date(y, m, 0)) };
    }
    case "this_quarter": {
      const qm = Math.floor(m / 3) * 3;
      return { from: fmt(new Date(y, qm, 1)), to: fmt(new Date(y, qm + 3, 0)) };
    }
    case "this_year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    default:
      return { from: fmt(new Date(y, m, 1)), to: fmt(new Date(y, m + 1, 0)) };
  }
}
function fmt(d: Date) { return d.toISOString().split("T")[0]; }

function typeLabel(t: string) {
  const map: Record<string, string> = { "Asset": "أصول", "أصول": "أصول", "Liability": "التزامات", "التزامات": "التزامات", "Equity": "حقوق ملكية", "Revenue": "إيرادات", "إيرادات": "إيرادات", "Expenses": "مصروفات", "مصروفات": "مصروفات" };
  return map[t] || t;
}

const AccountStatementModal = ({ open, onClose }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [period, setPeriod] = useState("this_month");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [showStatement, setShowStatement] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    supabase.from("accounts").select("account_code, account_name, account_type")
      .eq("user_id", dataOwnerId!).eq("is_active", true).order("account_code")
      .then(({ data }) => setAccounts(data || []));
    setSelectedAccount(null);
    setShowStatement(false);
    setSearch("");
  }, [open, user]);

  const filteredAccounts = useMemo(() => {
    if (!search.trim()) return accounts.slice(0, 20);
    return accounts.filter(a => multiWordMatchAny(search, a.account_code, a.account_name, typeLabel(a.account_type))).slice(0, 20);
  }, [accounts, search]);

  // Group accounts by type
  const groupedAccounts = useMemo(() => {
    const groups: Record<string, Account[]> = {};
    filteredAccounts.forEach(a => {
      const t = typeLabel(a.account_type);
      if (!groups[t]) groups[t] = [];
      groups[t].push(a);
    });
    return groups;
  }, [filteredAccounts]);

  const fetchStatement = async () => {
    if (!selectedAccount || !user) return;
    setLoading(true);
    try {
      const range = period === "custom" ? { from: dateFrom, to: dateTo } : getDateRange(period);
      const { data, error } = await supabase
        .from("transactions")
        .select("id, transaction_date, description, transaction_type, amount, currency, debit_account_code, credit_account_code, reference")
        .eq("user_id", dataOwnerId!)
        .eq("is_deleted", false)
        .gte("transaction_date", range.from)
        .lte("transaction_date", range.to)
        .or(`debit_account_code.eq.${selectedAccount.account_code},credit_account_code.eq.${selectedAccount.account_code}`)
        .order("transaction_date", { ascending: true });
      if (error) throw error;

      let balance = 0;
      const mapped = (data || []).map(tx => {
        const isDebit = tx.debit_account_code === selectedAccount.account_code;
        const debit = isDebit ? tx.amount : 0;
        const credit = !isDebit ? tx.amount : 0;
        balance += debit - credit;
        return { ...tx, debit, credit, balance };
      });
      setRows(mapped);
      setShowStatement(true);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const finalBalance = totalDebit - totalCredit;
  const currency = rows[0]?.currency || "₪";

  const exportExcel = () => {
    const data = rows.map((r, i) => ({
      "#": i + 1,
      "التاريخ": r.transaction_date,
      "البيان": r.description,
      "مدين": r.debit || "",
      "دائن": r.credit || "",
      "الرصيد": r.balance,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "كشف حساب");
    setNextExportBranding({ title: "كشف حساب" });
    XLSX.writeFile(wb, `كشف_${selectedAccount?.account_code}_${selectedAccount?.account_name}.xlsx`);
    toast({ title: "تم التصدير ✅" });
  };

  const goToFullPage = () => {
    onClose();
    navigate(`/account-statement?account=${selectedAccount?.account_code}`);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
        {!showStatement ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                كشف حساب محاسبي
              </DialogTitle>
            </DialogHeader>

            {/* Search */}
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ابحث برقم أو اسم الحساب..."
                  className="pr-10 text-right"
                  autoFocus
                />
              </div>

              {/* Accounts list */}
              <div className="border border-border/30 rounded-xl max-h-[240px] overflow-y-auto">
                {Object.entries(groupedAccounts).map(([type, accs]) => (
                  <div key={type}>
                    <div className="px-3 py-1.5 bg-secondary/30 text-[11px] font-bold text-muted-foreground sticky top-0">
                      {type}
                    </div>
                    {accs.map(a => (
                      <button
                        key={a.account_code}
                        onClick={() => setSelectedAccount(a)}
                        className={`w-full flex items-center justify-between px-4 py-2.5 text-right hover:bg-secondary/50 transition-colors ${
                          selectedAccount?.account_code === a.account_code ? "bg-primary/5 border-r-2 border-primary" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">{a.account_code}</span>
                          <span className="text-sm text-foreground">{a.account_name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ))}
                {filteredAccounts.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-6">لا توجد نتائج</p>
                )}
              </div>

              {/* Period */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">الفترة</label>
                <div className="flex gap-2 flex-wrap">
                  {PERIOD_OPTIONS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setPeriod(p.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        period === p.value ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-foreground hover:bg-secondary"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {period === "custom" && (
                  <div className="flex gap-2">
                    <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-sm" />
                    <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-sm" />
                  </div>
                )}
              </div>

              <Button
                onClick={fetchStatement}
                disabled={!selectedAccount || loading}
                className="w-full"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <BarChart3 className="h-4 w-4 ml-2" />}
                عرض الكشف الآن
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Statement View */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <button onClick={() => setShowStatement(false)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                  رجوع
                </button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={exportExcel}>
                    <FileSpreadsheet className="h-3.5 w-3.5 ml-1" /> Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={goToFullPage}>
                    <FileText className="h-3.5 w-3.5 ml-1" /> عرض كامل
                  </Button>
                </div>
              </div>

              <div className="text-center space-y-1">
                <h3 className="text-lg font-bold text-foreground">
                  {selectedAccount?.account_code} - {selectedAccount?.account_name}
                </h3>
                <Badge variant="secondary">{typeLabel(selectedAccount?.account_type || "")}</Badge>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-secondary/30 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">إجمالي مدين</p>
                  <p className="text-sm font-bold text-primary">{totalDebit.toLocaleString()}</p>
                </div>
                <div className="bg-secondary/30 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">إجمالي دائن</p>
                  <p className="text-sm font-bold text-destructive">{totalCredit.toLocaleString()}</p>
                </div>
                <div className={`rounded-xl p-3 text-center ${finalBalance >= 0 ? "bg-primary/5" : "bg-destructive/5"}`}>
                  <p className="text-[10px] text-muted-foreground">الرصيد</p>
                  <p className={`text-sm font-bold ${finalBalance >= 0 ? "text-primary" : "text-destructive"}`}>
                    {Math.abs(finalBalance).toLocaleString()} {finalBalance >= 0 ? "مدين" : "دائن"}
                  </p>
                </div>
              </div>

              {/* Table */}
              <div className="border border-border/30 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-secondary/50">
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">التاريخ</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">البيان</th>
                      <th className="px-3 py-2 text-center font-semibold text-muted-foreground">مدين</th>
                      <th className="px-3 py-2 text-center font-semibold text-muted-foreground">دائن</th>
                      <th className="px-3 py-2 text-center font-semibold text-muted-foreground">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">لا توجد حركات</td></tr>
                    ) : rows.map((r, i) => (
                      <tr key={r.id} className={i % 2 === 1 ? "bg-secondary/20" : ""}>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{fmtDateDisplay(r.transaction_date)}</td>
                        <td className="px-3 py-2 text-foreground">{r.description}</td>
                        <td className="px-3 py-2 text-center text-primary font-semibold">{r.debit ? r.debit.toLocaleString() : "-"}</td>
                        <td className="px-3 py-2 text-center text-destructive font-semibold">{r.credit ? r.credit.toLocaleString() : "-"}</td>
                        <td className={`px-3 py-2 text-center font-bold ${r.balance >= 0 ? "text-primary" : "text-destructive"}`}>
                          {Math.abs(r.balance).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {rows.length > 0 && (
                      <tr className="bg-secondary/40 border-t-2 border-primary/20 font-bold">
                        <td className="px-3 py-2" colSpan={2}>الإجمالي</td>
                        <td className="px-3 py-2 text-center text-primary">{totalDebit.toLocaleString()}</td>
                        <td className="px-3 py-2 text-center text-destructive">{totalCredit.toLocaleString()}</td>
                        <td className={`px-3 py-2 text-center ${finalBalance >= 0 ? "text-primary" : "text-destructive"}`}>
                          {Math.abs(finalBalance).toLocaleString()}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AccountStatementModal;
