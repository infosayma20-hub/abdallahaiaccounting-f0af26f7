import { useState, useEffect, useMemo } from "react";
import { getAuthHeaders } from "@/lib/edge-helpers";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileSpreadsheet, FileText, TrendingUp, TrendingDown, Wallet, Calendar, Search, BarChart3, Clock, ArrowUpDown, Hash, Eye, Printer, X, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { generateProfessionalPDFHtml, openPrintWindow, useCompanyInfo } from "@/components/ReportPrintLayout";
import { multiWordMatchAny } from "@/lib/utils";

import { setNextExportBranding } from "@/lib/excel-export";
// Format balance with label instead of parentheses
function fmtBalance(n: number, currency: string): string {
  if (n === 0) return `0 ${currency}`;
  const abs = Math.abs(n).toLocaleString();
  return n > 0 ? `${abs} ${currency} (مدين)` : `${abs} ${currency} (دائن)`;
}

function fmtBalanceShort(n: number): string {
  if (n === 0) return "0";
  return Math.abs(n).toLocaleString();
}

function balanceDirection(n: number): string {
  if (n > 0) return "مدين";
  if (n < 0) return "دائن";
  return "مسدد";
}

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
  };
}

interface ContactStatementDialogProps {
  open: boolean;
  onClose: () => void;
  contactId: string;
  contactName: string;
  contactType?: string;
}

function isOpeningBalance(tx: Transaction): boolean {
  const type = (tx.fields["Transaction Type"] || "").trim();
  const desc = (tx.fields.Description || "").trim();
  return /رصيد\s*(ابتدائي|افتتاحي|مدور|أول\s*المدة)/i.test(desc) ||
    /رصيد\s*(ابتدائي|افتتاحي|مدور)/i.test(type) ||
    type === "رصيد ابتدائي";
}

function friendlyDescription(tx: Transaction): string {
  if (isOpeningBalance(tx)) return "رصيد ابتدائي";
  const type = (tx.fields["Transaction Type"] || "").trim();
  const desc = (tx.fields.Description || "").trim();
  const typeMap: Record<string, string> = {
    "سند قبض": "تحصيل نقدي",
    "سند صرف": "دفعة نقدية",
    "فاتورة مبيعات": "فاتورة مبيعات",
    "فاتورة مشتريات": "فاتورة مشتريات",
    "قيد يومية": desc.includes("خصم") ? "خصم ممنوح" : desc.includes("مردود") ? "مردود مبيعات" : "قيد تسوية",
    "مردود مبيعات": "مردود مبيعات",
    "مردود مشتريات": "مردود مشتريات",
  };
  if (desc.includes("مردود")) return "مردود مبيعات";
  if (desc.includes("خصم")) return "خصم ممنوح";
  return typeMap[type] || desc || type || "-";
}

function classifyAmount(tx: Transaction, contactName: string, contactType?: string): { debit: number; credit: number } {
  const amount = tx.fields.Amount || 0;
  const type = (tx.fields["Transaction Type"] || "").trim();
  const desc = (tx.fields.Description || "").trim().toLowerCase();
  const debitAcc = (tx.fields["Debit Account Name"] || "").toLowerCase();
  const creditAcc = (tx.fields["Credit Account Name"] || "").toLowerCase();
  const nameL = contactName.toLowerCase();
  const isSupplier = (contactType || "").includes("مورد") || (contactType || "").toLowerCase().includes("supplier");

  const contactInDebit = debitAcc.includes(nameL) || debitAcc.includes("supplier " + nameL) || debitAcc.includes("customer " + nameL) || debitAcc.includes("مورد " + nameL) || debitAcc.includes("زبون " + nameL);
  const contactInCredit = creditAcc.includes(nameL) || creditAcc.includes("supplier " + nameL) || creditAcc.includes("customer " + nameL) || creditAcc.includes("مورد " + nameL) || creditAcc.includes("زبون " + nameL);

  if (contactInDebit) return { debit: amount, credit: 0 };
  if (contactInCredit) return { debit: 0, credit: amount };

  if (isSupplier) {
    if (type === "فاتورة مشتريات" || desc.includes("شراء") || desc.includes("اشتري") || desc.includes("بضاعة")) return { debit: 0, credit: amount };
    if (type === "سند صرف" || desc.includes("صرف") || desc.includes("دفع") || desc.includes("سداد")) return { debit: amount, credit: 0 };
    if (desc.includes("مردود")) return { debit: amount, credit: 0 };
    return { debit: 0, credit: amount };
  } else {
    if (type === "فاتورة مبيعات" || desc.includes("بيع")) return { debit: amount, credit: 0 };
    if (type === "سند قبض" || desc.includes("قبض") || desc.includes("تحصيل")) return { debit: 0, credit: amount };
    if (desc.includes("مردود") || desc.includes("خصم")) return { debit: 0, credit: amount };
    return { debit: amount, credit: 0 };
  }
}

const ContactStatementDialog = ({ open, onClose, contactId, contactName, contactType }: ContactStatementDialogProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const companyInfo = useCompanyInfo();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPrintView, setIsPrintView] = useState(false);
  const [profileData, setProfileData] = useState<{ display_name?: string; company_name?: string } | null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const isSupplier = (contactType || "").includes("مورد") || (contactType || "").toLowerCase().includes("supplier");

  useEffect(() => {
    if (!user?.id) return;
    supabase.from("profiles").select("display_name, company_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setProfileData(data); });
  }, [user?.id]);

  useEffect(() => {
    if (open && contactId) fetchTransactions();
    if (!open) {
      setDateFrom("");
      setDateTo("");
      setTypeFilter("all");
      setSearchQuery("");
      setIsPrintView(false);
    }
  }, [open, contactId]);

  const fetchTransactions = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-contact-transactions?contactId=${contactId}&clientId=${user.id}`,
        { headers: await getAuthHeaders() }
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      const sorted = (data?.records || []).sort((a: Transaction, b: Transaction) => {
        const aOB = isOpeningBalance(a) ? 0 : 1;
        const bOB = isOpeningBalance(b) ? 0 : 1;
        if (aOB !== bOB) return aOB - bOB;
        return (a.fields.Date || "").localeCompare(b.fields.Date || "");
      });
      setTransactions(sorted);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Apply filters
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (dateFrom && (tx.fields.Date || "") < dateFrom) return false;
      if (dateTo && (tx.fields.Date || "") > dateTo) return false;
      if (typeFilter !== "all" && (tx.fields["Transaction Type"] || "") !== typeFilter) return false;
      if (searchQuery) {
        if (!multiWordMatchAny(searchQuery, tx.fields.Description, tx.fields["Transaction Type"])) return false;
      }
      return true;
    });
  }, [transactions, dateFrom, dateTo, typeFilter, searchQuery]);

  const statementRows = useMemo(() => {
    let runningBalance = 0;
    return filteredTransactions.map((tx) => {
      const { debit, credit } = classifyAmount(tx, contactName, contactType);
      runningBalance += debit - credit;
      return { tx, description: friendlyDescription(tx), debit, credit, runningBalance };
    });
  }, [filteredTransactions, contactName, contactType]);

  const totalDebit = statementRows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = statementRows.reduce((s, r) => s + r.credit, 0);
  const finalBalance = totalDebit - totalCredit;
  const currency = transactions[0]?.fields.Currency || "شيكل";
  const companyName = profileData?.company_name || profileData?.display_name || user?.user_metadata?.company_name || "شركتي";
  const companyEmail = user?.email || "";

  // Analytics
  const lastTxDate = filteredTransactions.length > 0
    ? filteredTransactions[filteredTransactions.length - 1].fields.Date || "-"
    : "-";
  const largestTx = filteredTransactions.reduce((max, tx) => Math.max(max, tx.fields.Amount || 0), 0);

  // Transaction types for filter
  const txTypes = useMemo(() => {
    const types = new Set(transactions.map(t => t.fields["Transaction Type"] || "").filter(Boolean));
    return Array.from(types);
  }, [transactions]);

  const exportToExcel = () => {
    if (statementRows.length === 0) return;
    const rows = statementRows.map((r, i) => ({
      "#": i + 1,
      "التاريخ": r.tx.fields.Date || "",
      "البيان": r.description,
      "ملاحظات": r.tx.fields.Description || "",
      "مدين": r.debit || "",
      "دائن": r.credit || "",
      "الرصيد": r.runningBalance,
    }));
    rows.push({
      "#": "" as any,
      "التاريخ": "",
      "البيان": "الإجمالي",
      "ملاحظات": "",
      "مدين": totalDebit as any,
      "دائن": totalCredit as any,
      "الرصيد": finalBalance as any,
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "كشف حساب");
    setNextExportBranding({ title: "كشف حساب" });
    XLSX.writeFile(wb, `كشف_حساب_${contactName}.xlsx`);
    toast({ title: "تم تصدير الملف بنجاح ✅" });
  };

  const exportToPDF = () => {
    const balanceDir = finalBalance > 0 ? "مدين" : finalBalance < 0 ? "دائن" : "مسدد";
    const company = companyInfo.name ? companyInfo : {
      name: companyName, logo_url: "", address: "", phone: "", email: companyEmail, website: "", tax_number: "",
    };

    const tableHeaders = ["#", "التاريخ", "البيان", "ملاحظات", "مدين", "دائن", "الرصيد"];
    const tableRows = [
      ...statementRows.map((r, i) => [
        String(i + 1),
        r.tx.fields.Date || "-",
        r.description,
        r.tx.fields.Description || "-",
        r.debit ? r.debit.toLocaleString() : "-",
        r.credit ? `<span style="color:#DC2626">${r.credit.toLocaleString()}</span>` : "-",
        `<span style="color:${r.runningBalance >= 0 ? '#16A34A' : '#DC2626'};font-weight:700">${Math.abs(r.runningBalance).toLocaleString()} ${r.runningBalance >= 0 ? 'م' : 'د'}</span>`,
      ]),
      // Totals row
      [`<td colspan="4" style="text-align:right;font-weight:700;background:#1B3A5C;color:#fff">الإجمالي</td>`,
       `<td style="background:#1B3A5C;color:#fff;font-weight:700">${totalDebit.toLocaleString()}</td>`,
       `<td style="background:#1B3A5C;color:#fff;font-weight:700">${totalCredit.toLocaleString()}</td>`,
       `<td style="background:#1B3A5C;color:#4A9EE8;font-weight:800">${Math.abs(finalBalance).toLocaleString()} ${balanceDir}</td>`
      ].map(c => c), // raw HTML cells handled via totals
    ];

    // Build a simpler approach - just the data rows, totals handled in template
    const dataRows = statementRows.map((r, i) => [
      String(i + 1),
      r.tx.fields.Date || "-",
      r.description,
      r.tx.fields.Description || "-",
      r.debit ? r.debit.toLocaleString() : "-",
      r.credit ? r.credit.toLocaleString() : "-",
      `${Math.abs(r.runningBalance).toLocaleString()} ${r.runningBalance >= 0 ? 'م' : 'د'}`,
    ]);

    const html = generateProfessionalPDFHtml({
      company,
      reportTitle: "كشف حساب",
      reportTitleEn: "STATEMENT OF ACCOUNT",
      periodLabel: `${isSupplier ? "المورد" : "العميل"}: ${contactName} | ${dateFrom || 'الكل'} — ${dateTo || 'الكل'}`,
      summaryItems: [
        { label: "الرصيد النهائي", value: `${Math.abs(finalBalance).toLocaleString()} ${currency}`, color: finalBalance >= 0 ? "#16A34A" : "#DC2626" },
        { label: "إجمالي المدين", value: `${totalDebit.toLocaleString()} ${currency}`, color: "#16A34A" },
        { label: "إجمالي الدائن", value: `${totalCredit.toLocaleString()} ${currency}`, color: "#DC2626" },
        { label: "عدد الحركات", value: String(statementRows.length), color: "#1B3A5C" },
      ],
      tableHeaders,
      tableRows: dataRows,
    });

    openPrintWindow(html);
    toast({ title: "تم فتح نافذة الطباعة ✅" });
  };

  const balanceColor = finalBalance > 0 ? "text-emerald-600" : finalBalance < 0 ? "text-red-500" : "text-foreground";
  const balanceBg = finalBalance > 0 ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800" : finalBalance < 0 ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" : "bg-muted/30 border-border";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 rounded-2xl gap-0" dir="rtl">
        
        {/* ═══ HEADER ═══ */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#003C71] flex items-center justify-center">
                <Wallet className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-foreground">كشف حساب</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm text-muted-foreground">{contactName}</span>
                  <Badge variant="outline" className={`text-[10px] px-2 py-0 ${isSupplier ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400" : "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-400"}`}>
                    {contactType || (isSupplier ? "مورد" : "عميل")}
                  </Badge>
                  {transactions.length > 0 && (
                    <Badge variant="outline" className={`text-[10px] px-2 py-0 ${finalBalance > 0 ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : finalBalance < 0 ? "border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-400" : "border-border"}`}>
                      {balanceDirection(finalBalance)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant={isPrintView ? "default" : "outline"}
                size="sm"
                className="gap-1.5 rounded-lg text-xs h-8"
                onClick={() => setIsPrintView(!isPrintView)}
              >
                {isPrintView ? <Eye className="h-3.5 w-3.5" /> : <Printer className="h-3.5 w-3.5" />}
                {isPrintView ? "عرض الشاشة" : "عرض الطباعة"}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">جاري تحميل المعاملات...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-20 px-4">
            <Wallet className="h-14 w-14 text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-sm font-medium text-muted-foreground">لا توجد معاملات مرتبطة بهذه الجهة</p>
            <p className="text-xs text-muted-foreground/60 mt-1">تأكد من ربط المعاملات بجهة الاتصال</p>
          </div>
        ) : (
          <div className={`px-5 py-4 space-y-4 ${isPrintView ? "bg-white text-black" : ""}`}>

            {/* ═══ BALANCE SUMMARY CARDS ═══ */}
            <div className="grid grid-cols-4 gap-2.5">
              {/* Final Balance - Primary */}
              <div className={`rounded-xl p-3.5 text-center border-2 shadow-sm ${balanceBg}`}>
                <Wallet className={`h-4 w-4 mx-auto mb-1.5 ${balanceColor}`} />
                <p className="text-[10px] font-semibold text-muted-foreground mb-1">الرصيد النهائي</p>
                <p className={`text-xl font-extrabold ${balanceColor}`}>
                  {fmtBalanceShort(finalBalance)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{currency} · {balanceDirection(finalBalance)}</p>
              </div>
              {/* Total Debit */}
              <div className="rounded-xl p-3 text-center border border-border bg-card">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600 mx-auto mb-1.5" />
                <p className="text-[10px] font-semibold text-muted-foreground mb-1">إجمالي المدين</p>
                <p className="text-base font-bold text-foreground">{totalDebit.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">{currency}</p>
              </div>
              {/* Total Credit */}
              <div className="rounded-xl p-3 text-center border border-border bg-card">
                <TrendingDown className="h-3.5 w-3.5 text-red-500 mx-auto mb-1.5" />
                <p className="text-[10px] font-semibold text-muted-foreground mb-1">إجمالي الدائن</p>
                <p className="text-base font-bold text-foreground">{totalCredit.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">{currency}</p>
              </div>
              {/* Opening Balance */}
              <div className="rounded-xl p-3 text-center border border-border bg-card">
                <Hash className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-1.5" />
                <p className="text-[10px] font-semibold text-muted-foreground mb-1">الرصيد الافتتاحي</p>
                <p className="text-base font-bold text-muted-foreground">0</p>
                <p className="text-[10px] text-muted-foreground">{currency}</p>
              </div>
            </div>

            {/* ═══ SMART ANALYTICS ═══ */}
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-lg bg-muted/40 p-2.5 text-center">
                <p className="text-[9px] text-muted-foreground font-semibold">عدد الحركات</p>
                <p className="text-sm font-bold text-foreground">{statementRows.length}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-2.5 text-center">
                <p className="text-[9px] text-muted-foreground font-semibold">آخر حركة</p>
                <p className="text-sm font-bold text-foreground">{lastTxDate}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-2.5 text-center">
                <p className="text-[9px] text-muted-foreground font-semibold">أكبر عملية</p>
                <p className="text-sm font-bold text-foreground">{largestTx.toLocaleString()} {currency}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-2.5 text-center">
                <p className="text-[9px] text-muted-foreground font-semibold">الفترة</p>
                <p className="text-sm font-bold text-foreground">{dateFrom || "–"} / {dateTo || "–"}</p>
              </div>
            </div>

            {/* ═══ FILTERS ═══ */}
            {!isPrintView && (
              <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-muted/30 border border-border">
                <div className="flex items-center gap-1.5">
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-8 w-[140px] text-xs rounded-lg"
                    placeholder="من تاريخ"
                  />
                  <span className="text-xs text-muted-foreground">—</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-8 w-[140px] text-xs rounded-lg"
                    placeholder="إلى تاريخ"
                  />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-8 w-[140px] text-xs rounded-lg">
                    <ArrowUpDown className="h-3 w-3 ml-1" />
                    <SelectValue placeholder="نوع العملية" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="all">الكل</SelectItem>
                    {txTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="relative flex-1 min-w-[120px]">
                  <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 text-xs rounded-lg pr-7"
                    placeholder="بحث في الملاحظات..."
                  />
                </div>
                <div className="flex gap-1.5 mr-auto">
                  <Button variant="outline" size="sm" className="gap-1.5 h-8 rounded-lg text-xs" onClick={exportToExcel}>
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Excel
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 h-8 rounded-lg text-xs" onClick={exportToPDF}>
                    <FileText className="h-3.5 w-3.5" />
                    PDF
                  </Button>
                </div>
              </div>
            )}

            {/* ═══ TABLE ═══ */}
            <div className="rounded-xl border border-border overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#003C71] dark:bg-[#003C71]">
                      <th className="px-3 py-2.5 text-center font-semibold text-white w-8">#</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-white">التاريخ</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-white">البيان</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-white">ملاحظات</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-white">مدين</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-white">دائن</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-white">الرصيد</th>
                      <th className="px-2 py-2.5 text-center font-semibold text-white w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementRows.map((r, i) => (
                      <tr key={r.tx.id} className={`border-t border-border/30 hover:bg-muted/30 transition-colors ${i % 2 === 1 ? "bg-muted/15" : ""}`}>
                        <td className="px-3 py-2.5 text-center text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2.5 text-xs">{r.tx.fields.Date || "-"}</td>
                        <td className="px-3 py-2.5 font-medium">{r.description}</td>
                        <td className="px-3 py-2.5 text-[10px] text-muted-foreground max-w-[160px] truncate">{r.tx.fields.Description || "-"}</td>
                        <td className="px-3 py-2.5 text-center font-semibold text-foreground">
                          {r.debit ? r.debit.toLocaleString() : "-"}
                        </td>
                        <td className="px-3 py-2.5 text-center font-semibold text-red-500">
                          {r.credit ? r.credit.toLocaleString() : "-"}
                        </td>
                        <td className={`px-3 py-2.5 text-center font-bold ${r.runningBalance > 0 ? "text-emerald-600" : r.runningBalance < 0 ? "text-red-500" : "text-foreground"}`}>
                          {fmtBalanceShort(r.runningBalance)}
                          <span className="text-[9px] opacity-60 mr-1">{balanceDirection(r.runningBalance)}</span>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <button
                            onClick={() => {
                              onClose();
                              navigate(`/transactions?search=${encodeURIComponent(r.tx.fields.Description || r.tx.fields["Transaction Type"] || "")}&highlight=${r.tx.id}`);
                            }}
                            className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-primary/10 transition-colors group"
                            title="فتح العملية المحاسبية"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {/* Totals Row */}
                    <tr className="bg-[#003C71]/5 dark:bg-[#003C71]/20 border-t-2 border-[#003C71]">
                      <td colSpan={4} className="px-3 py-3 text-left font-bold text-[#003C71] dark:text-blue-300 text-xs">الإجمالي</td>
                      <td className="px-3 py-3 text-center font-bold text-emerald-600 text-xs">{totalDebit.toLocaleString()}</td>
                      <td className="px-3 py-3 text-center font-bold text-red-500 text-xs">{totalCredit.toLocaleString()}</td>
                      <td className={`px-3 py-3 text-center font-extrabold text-sm ${balanceColor}`}>
                        {fmtBalanceShort(finalBalance)} <span className="text-[9px] opacity-70">{balanceDirection(finalBalance)}</span>
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ═══ PRINT VIEW EXPORT BUTTONS ═══ */}
            {isPrintView && (
              <div className="flex gap-2 justify-center pt-2">
                <Button variant="outline" size="sm" className="gap-1.5 rounded-lg" onClick={exportToExcel}>
                  <FileSpreadsheet className="h-4 w-4" />
                  تصدير Excel
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 rounded-lg" onClick={exportToPDF}>
                  <FileText className="h-4 w-4" />
                  تصدير PDF
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ContactStatementDialog;
