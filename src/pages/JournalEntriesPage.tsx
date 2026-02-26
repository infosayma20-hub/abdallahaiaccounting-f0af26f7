import { useState, useEffect, useMemo } from "react";
import {
  ArrowRight, Loader2, RefreshCw, Pencil, Search, Calendar,
  FileText, ChevronLeft, ChevronRight, Filter, FileSpreadsheet,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Transaction {
  id: string;
  fields: {
    Description?: string;
    "Debit Account"?: string | string[];
    "Credit Account"?: string | string[];
    "Debit Account Name"?: string;
    "Credit Account Name"?: string;
    "Debit Account Rollup"?: string;
    "Credit Account Rollup"?: string;
    "Transaction Type"?: string;
    Amount?: number;
    Currency?: string;
    Date?: string;
    Reference?: string;
    Deleted?: boolean;
  };
}

interface Account {
  id: string;
  fields: {
    "Account Name"?: string;
    "Account Type"?: string;
  };
}

const PAGE_SIZE = 20;

const JournalEntriesPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState<any>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Edit dialog
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editFields, setEditFields] = useState({
    Description: "",
    "Transaction Type": "",
    Amount: "",
    Currency: "",
    Date: "",
    "Debit Account Name": "",
    "Credit Account Name": "",
  });
  const [saving, setSaving] = useState(false);

  // Fetch data
  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [txRes, accRes, profileRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-transactions?clientId=${user.id}`, {
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        }),
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-accounts?clientId=${user.id}`, {
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        }),
        supabase.from("profiles").select("display_name, company_name").eq("user_id", user.id).maybeSingle(),
      ]);
      if (!txRes.ok) throw new Error("Failed to fetch");
      const txData = await txRes.json();
      setTransactions(txData?.records || []);
      if (accRes.ok) {
        const accData = await accRes.json();
        setAccounts(accData?.records || []);
      }
      if (profileRes.data) setProfileData(profileRes.data);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user]);

  // Filtered & sorted entries
  const filtered = useMemo(() => {
    let result = transactions.filter(tx => !tx.fields.Deleted);

    // Date filter
    if (dateFrom) result = result.filter(tx => (tx.fields.Date || "") >= dateFrom);
    if (dateTo) result = result.filter(tx => (tx.fields.Date || "") <= dateTo);

    // Type filter
    if (typeFilter !== "all") result = result.filter(tx => tx.fields["Transaction Type"] === typeFilter);

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(tx =>
        (tx.fields.Description || "").toLowerCase().includes(q) ||
        (tx.fields["Debit Account Name"] || "").toLowerCase().includes(q) ||
        (tx.fields["Credit Account Name"] || "").toLowerCase().includes(q) ||
        (tx.fields.Reference || "").toLowerCase().includes(q)
      );
    }

    // Sort by date descending
    return result.sort((a, b) => (b.fields.Date || "").localeCompare(a.fields.Date || ""));
  }, [transactions, dateFrom, dateTo, searchQuery, typeFilter]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setCurrentPage(1); }, [dateFrom, dateTo, searchQuery, typeFilter]);

  // Totals
  const totalDebit = filtered.reduce((s, tx) => s + (tx.fields.Amount || 0), 0);
  const totalCredit = totalDebit; // double-entry: debit always equals credit

  // Edit handlers
  const openEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setEditFields({
      Description: tx.fields.Description || "",
      "Transaction Type": tx.fields["Transaction Type"] || "",
      Amount: String(tx.fields.Amount || ""),
      Currency: tx.fields.Currency || "شيكل",
      Date: tx.fields.Date || "",
      "Debit Account Name": tx.fields["Debit Account Name"] || "",
      "Credit Account Name": tx.fields["Credit Account Name"] || "",
    });
  };

  const handleSave = async () => {
    if (!editingTx) return;
    setSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-update-transaction`, {
        method: "POST",
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: editingTx.id,
          fields: {
            Description: editFields.Description,
            "Transaction Type": editFields["Transaction Type"],
            Amount: Number(editFields.Amount),
            Currency: editFields.Currency,
            Date: editFields.Date,
            "Debit Account Name": editFields["Debit Account Name"],
            "Credit Account Name": editFields["Credit Account Name"],
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "فشل التحديث");
      toast({ title: "✅ تم تعديل القيد بنجاح" });
      setEditingTx(null);
      fetchData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Export Excel
  const handleExport = () => {
    const data = filtered.map(tx => ({
      "التاريخ": tx.fields.Date || "",
      "الوصف": tx.fields.Description || "",
      "النوع": tx.fields["Transaction Type"] || "",
      "الحساب المدين": tx.fields["Debit Account Name"] || "",
      "الحساب الدائن": tx.fields["Credit Account Name"] || "",
      "مدين": tx.fields.Amount || 0,
      "دائن": tx.fields.Amount || 0,
      "العملة": tx.fields.Currency || "شيكل",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "القيود المحاسبية");
    XLSX.writeFile(wb, `قيود_يومية_${dateFrom || "all"}_${dateTo || "all"}.xlsx`);
  };

  const companyName = profileData?.company_name || profileData?.display_name || "الشركة";
  const dateRangeLabel = dateFrom && dateTo
    ? `${dateFrom} — ${dateTo}`
    : dateFrom ? `من ${dateFrom}` : dateTo ? `حتى ${dateTo}` : "جميع الفترات";

  const transactionTypes = [
    { value: "all", label: "جميع الأنواع" },
    { value: "سند صرف", label: "سند صرف" },
    { value: "سند قبض", label: "سند قبض" },
    { value: "قيد يومية", label: "قيد يومية" },
    { value: "فاتورة مشتريات", label: "فاتورة مشتريات" },
    { value: "فاتورة مبيعات", label: "فاتورة مبيعات" },
  ];

  const accountNames = useMemo(() =>
    accounts.map(a => a.fields["Account Name"] || "").filter(Boolean).sort(),
    [accounts]
  );

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.length > 1 ? navigate(-1) : navigate("/")}
            className="p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              تقرير القيود المحاسبية
            </h1>
            <p className="text-xs text-muted-foreground">{companyName} • {dateRangeLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            تحديث
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0} className="gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            تصدير Excel
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
          <p className="text-[11px] text-muted-foreground">عدد القيود</p>
          <p className="text-xl font-bold text-foreground tabular-nums">{filtered.length}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
          <p className="text-[11px] text-muted-foreground">إجمالي المدين</p>
          <p className="text-xl font-bold text-primary tabular-nums">₪{totalDebit.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
          <p className="text-[11px] text-muted-foreground">إجمالي الدائن</p>
          <p className="text-xl font-bold text-destructive tabular-nums">₪{totalCredit.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
          <p className="text-[11px] text-muted-foreground">الميزان</p>
          <p className={`text-xl font-bold tabular-nums ${totalDebit === totalCredit ? "text-primary" : "text-destructive"}`}>
            {totalDebit === totalCredit ? "✅ متوازن" : "⚠️ غير متوازن"}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">فلاتر البحث</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">من تاريخ</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 rounded-lg bg-secondary/50 border-0 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">إلى تاريخ</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 rounded-lg bg-secondary/50 border-0 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">نوع العملية</label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 rounded-lg bg-secondary/50 border-0 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {transactionTypes.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">بحث</label>
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث في الوصف أو الحسابات..."
                className="h-9 pr-8 rounded-lg bg-secondary/50 border-0 text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">لا توجد قيود للفترة المحددة</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl shadow-card border border-border/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30">
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-10">#</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">التاريخ</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider min-w-[200px]">الوصف</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">النوع</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">الحساب المدين</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">الحساب الدائن</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-primary uppercase tracking-wider">مدين</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-destructive uppercase tracking-wider">دائن</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((tx, i) => {
                  const idx = (currentPage - 1) * PAGE_SIZE + i + 1;
                  const typeStyle: Record<string, string> = {
                    "سند صرف": "bg-destructive/10 text-destructive",
                    "سند قبض": "bg-primary/10 text-primary",
                    "قيد يومية": "bg-warning/10 text-warning",
                    "فاتورة مشتريات": "bg-accent text-accent-foreground",
                    "فاتورة مبيعات": "bg-primary/10 text-primary",
                  };
                  return (
                    <tr key={tx.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors group">
                      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{idx}</td>
                      <td className="px-4 py-3 text-xs text-foreground tabular-nums whitespace-nowrap">{tx.fields.Date || "—"}</td>
                      <td className="px-4 py-3 text-xs text-foreground font-medium max-w-[250px] truncate">{tx.fields.Description || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-1 rounded-lg ${typeStyle[tx.fields["Transaction Type"] || ""] || "bg-muted text-muted-foreground"}`}>
                          {tx.fields["Transaction Type"] || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground">{tx.fields["Debit Account Name"] || "—"}</td>
                      <td className="px-4 py-3 text-xs text-foreground">{tx.fields["Credit Account Name"] || "—"}</td>
                      <td className="px-4 py-3 text-xs font-bold text-primary tabular-nums text-left">
                        ₪{(tx.fields.Amount || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-destructive tabular-nums text-left">
                        ₪{(tx.fields.Amount || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openEdit(tx)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-primary/10 transition-all"
                          title="تعديل القيد"
                        >
                          <Pencil className="h-3.5 w-3.5 text-primary" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Totals footer */}
              <tfoot>
                <tr className="bg-muted/40 border-t-2 border-primary/20">
                  <td colSpan={6} className="px-4 py-3 text-xs font-bold text-foreground text-right">الإجمالي</td>
                  <td className="px-4 py-3 text-sm font-bold text-primary tabular-nums text-left">₪{totalDebit.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm font-bold text-destructive tabular-nums text-left">₪{totalCredit.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
              <p className="text-[11px] text-muted-foreground">
                عرض {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} من {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground px-2">{currentPage} / {totalPages}</span>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingTx} onOpenChange={(open) => { if (!open) setEditingTx(null); }}>
        <DialogContent className="max-w-lg rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              تعديل القيد
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">الوصف</label>
              <Input
                value={editFields.Description}
                onChange={(e) => setEditFields(f => ({ ...f, Description: e.target.value }))}
                className="h-10 rounded-xl bg-secondary/50 border-0"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">التاريخ</label>
                <Input
                  type="date"
                  value={editFields.Date}
                  onChange={(e) => setEditFields(f => ({ ...f, Date: e.target.value }))}
                  className="h-10 rounded-xl bg-secondary/50 border-0"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">المبلغ</label>
                <Input
                  type="number"
                  value={editFields.Amount}
                  onChange={(e) => setEditFields(f => ({ ...f, Amount: e.target.value }))}
                  className="h-10 rounded-xl bg-secondary/50 border-0 text-left"
                  dir="ltr"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">النوع</label>
                <Select value={editFields["Transaction Type"]} onValueChange={(v) => setEditFields(f => ({ ...f, "Transaction Type": v }))}>
                  <SelectTrigger className="h-10 rounded-xl bg-secondary/50 border-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["سند صرف", "سند قبض", "قيد يومية", "فاتورة مشتريات", "فاتورة مبيعات"].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">العملة</label>
                <Select value={editFields.Currency} onValueChange={(v) => setEditFields(f => ({ ...f, Currency: v }))}>
                  <SelectTrigger className="h-10 rounded-xl bg-secondary/50 border-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["شيكل", "دولار", "دينار", "يورو"].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-primary text-[11px]">الحساب المدين</label>
                <Select value={editFields["Debit Account Name"]} onValueChange={(v) => setEditFields(f => ({ ...f, "Debit Account Name": v }))}>
                  <SelectTrigger className="h-10 rounded-xl bg-secondary/50 border-0 text-xs">
                    <SelectValue placeholder="اختر حساب" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {accountNames.map(name => (
                      <SelectItem key={name} value={name} className="text-xs">{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-destructive text-[11px]">الحساب الدائن</label>
                <Select value={editFields["Credit Account Name"]} onValueChange={(v) => setEditFields(f => ({ ...f, "Credit Account Name": v }))}>
                  <SelectTrigger className="h-10 rounded-xl bg-secondary/50 border-0 text-xs">
                    <SelectValue placeholder="اختر حساب" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {accountNames.map(name => (
                      <SelectItem key={name} value={name} className="text-xs">{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full h-11 rounded-xl gap-2 font-bold">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              حفظ التعديلات
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default JournalEntriesPage;
