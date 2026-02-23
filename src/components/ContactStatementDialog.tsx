import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, FileSpreadsheet, FileText, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

// Accounting format: negative numbers shown as (1,000) instead of -1,000
function fmtNum(n: number): string {
  if (n < 0) return `(${Math.abs(n).toLocaleString()})`;
  return n.toLocaleString();
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

// Detect opening balance transactions
function isOpeningBalance(tx: Transaction): boolean {
  const type = (tx.fields["Transaction Type"] || "").trim();
  const desc = (tx.fields.Description || "").trim();
  return /رصيد\s*(ابتدائي|افتتاحي|مدور|أول\s*المدة)/i.test(desc) ||
    /رصيد\s*(ابتدائي|افتتاحي|مدور)/i.test(type) ||
    type === "رصيد ابتدائي";
}

// Map internal transaction types to customer-friendly descriptions
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

  // Check description-based hints first
  if (desc.includes("مردود")) return "مردود مبيعات";
  if (desc.includes("خصم")) return "خصم ممنوح";

  return typeMap[type] || desc || type || "-";
}

// Determine debit/credit from proper accounting perspective based on contact type
function classifyAmount(tx: Transaction, contactName: string, contactType?: string): { debit: number; credit: number } {
  const amount = tx.fields.Amount || 0;
  const type = (tx.fields["Transaction Type"] || "").trim();
  const desc = (tx.fields.Description || "").trim().toLowerCase();
  const debitAcc = (tx.fields["Debit Account Name"] || "").toLowerCase();
  const creditAcc = (tx.fields["Credit Account Name"] || "").toLowerCase();
  const nameL = contactName.toLowerCase();
  const isSupplier = (contactType || "").includes("مورد") || (contactType || "").toLowerCase().includes("supplier");

  // Check if this contact's account appears in debit or credit side
  const contactInDebit = debitAcc.includes(nameL) || debitAcc.includes("supplier " + nameL) || debitAcc.includes("customer " + nameL);
  const contactInCredit = creditAcc.includes(nameL) || creditAcc.includes("supplier " + nameL) || creditAcc.includes("customer " + nameL);

  // Also check generic account names
  const genericDebit = debitAcc.includes("العملاء") || debitAcc.includes("customer") || debitAcc.includes("الموردين") || debitAcc.includes("supplier");
  const genericCredit = creditAcc.includes("العملاء") || creditAcc.includes("customer") || creditAcc.includes("الموردين") || creditAcc.includes("supplier");

  // If the contact's personal account is explicitly in debit → debit entry for this contact
  if (contactInDebit) {
    return { debit: amount, credit: 0 };
  }
  // If the contact's personal account is explicitly in credit → credit entry for this contact
  if (contactInCredit) {
    return { debit: 0, credit: amount };
  }

  // Fallback: classify based on transaction type + contact type (proper accounting rules)
  if (isSupplier) {
    // SUPPLIER accounting:
    // فاتورة مشتريات (purchase invoice) → credit (we owe them more)
    // سند صرف (payment) → debit (we paid, balance decreases)
    // مردود مشتريات (purchase return) → debit (they owe us back)
    if (type === "فاتورة مشتريات" || desc.includes("شراء") || desc.includes("اشتري") || desc.includes("بضاعة")) {
      return { debit: 0, credit: amount };
    }
    if (type === "سند صرف" || desc.includes("صرف") || desc.includes("دفع") || desc.includes("سداد")) {
      return { debit: amount, credit: 0 };
    }
    if (desc.includes("مردود")) {
      return { debit: amount, credit: 0 };
    }
    // Default for supplier: credit (we owe them)
    return { debit: 0, credit: amount };
  } else {
    // CUSTOMER accounting:
    // فاتورة مبيعات (sales invoice) → debit (they owe us)
    // سند قبض (receipt) → credit (they paid, balance decreases)
    // مردود مبيعات (sales return) → credit
    // خصم → credit
    if (type === "فاتورة مبيعات" || desc.includes("بيع")) {
      return { debit: amount, credit: 0 };
    }
    if (type === "سند قبض" || desc.includes("قبض") || desc.includes("تحصيل")) {
      return { debit: 0, credit: amount };
    }
    if (desc.includes("مردود") || desc.includes("خصم")) {
      return { debit: 0, credit: amount };
    }
    // Default for customer: debit (they owe us)
    return { debit: amount, credit: 0 };
  }
}

const ContactStatementDialog = ({ open, onClose, contactId, contactName, contactType }: ContactStatementDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && contactId) fetchTransactions();
  }, [open, contactId]);

  const fetchTransactions = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-contact-transactions?contactId=${contactId}&clientId=${user.id}`,
        { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      const sorted = (data?.records || []).sort((a: Transaction, b: Transaction) => {
        // Opening balances always come first
        const aOB = isOpeningBalance(a) ? 0 : 1;
        const bOB = isOpeningBalance(b) ? 0 : 1;
        if (aOB !== bOB) return aOB - bOB;
        const da = a.fields.Date || "";
        const db = b.fields.Date || "";
        return da.localeCompare(db);
      });
      setTransactions(sorted);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Build statement rows with running balance
  const statementRows = (() => {
    let runningBalance = 0;
    return transactions.map((tx) => {
      const { debit, credit } = classifyAmount(tx, contactName, contactType);
      runningBalance += debit - credit;
      return {
        tx,
        description: friendlyDescription(tx),
        debit,
        credit,
        runningBalance,
      };
    });
  })();

  const totalDebit = statementRows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = statementRows.reduce((s, r) => s + r.credit, 0);
  const finalBalance = totalDebit - totalCredit;
  const currency = transactions[0]?.fields.Currency || "شيكل";

  const companyName = user?.user_metadata?.company_name || "شركتي";
  const companyEmail = user?.email || "";

  const exportToExcel = () => {
    if (statementRows.length === 0) return;
    const rows = statementRows.map((r, i) => ({
      "#": i + 1,
      "التاريخ": r.tx.fields.Date || "",
      "البيان": r.description,
      "ملاحظات": r.tx.fields.Description || "",
      "مدين": r.debit || "",
      "دائن": r.credit || "",
      "الرصيد الجاري": r.runningBalance,
    }));
    rows.push({
      "#": "" as any,
      "التاريخ": "",
      "البيان": "الإجمالي",
      "ملاحظات": "",
      "مدين": totalDebit as any,
      "دائن": totalCredit as any,
      "الرصيد الجاري": finalBalance,
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "كشف حساب");
    XLSX.writeFile(wb, `كشف_حساب_${contactName}.xlsx`);
    toast({ title: "تم تصدير الملف بنجاح ✅" });
  };

  const exportToPDF = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const today = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" });

    const rowsHtml = statementRows.map((r, i) => `
      <tr>
        <td style="color:#6b7280;">${i + 1}</td>
        <td>${r.tx.fields.Date || "-"}</td>
        <td style="text-align:right;font-weight:500;">${r.description}</td>
        <td style="text-align:right;font-size:11px;color:#6b7280;">${r.tx.fields.Description || "-"}</td>
        <td style="color:#047857;font-weight:600;">${r.debit ? r.debit.toLocaleString() : "-"}</td>
        <td style="color:#dc2626;font-weight:600;">${r.credit ? r.credit.toLocaleString() : "-"}</td>
        <td style="font-weight:700;color:${r.runningBalance >= 0 ? "#047857" : "#dc2626"};">
          ${fmtNum(r.runningBalance)}
        </td>
      </tr>
    `).join("");

    const isSupplier = (contactType || "").includes("مورد") || (contactType || "").toLowerCase().includes("supplier");
    const balanceColor = finalBalance >= 0 ? "#047857" : "#dc2626";
    const balanceLabel = isSupplier
      ? (finalBalance > 0 ? "مدين (دفعنا أكثر)" : finalBalance < 0 ? "دائن (مستحق للمورد)" : "مسدد بالكامل")
      : (finalBalance > 0 ? "مدين (مستحق لنا)" : finalBalance < 0 ? "دائن (دفع أكثر)" : "مسدد بالكامل");

    printWindow.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>كشف حساب - ${contactName}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Cairo', 'IBM Plex Arabic', sans-serif;
      direction: rtl;
      color: #1f2937;
      background: #fff;
      font-size: 13px;
      line-height: 1.6;
    }

    @page {
      size: A4;
      margin: 15mm 12mm 20mm 12mm;
    }

    .page-container {
      max-width: 210mm;
      margin: 0 auto;
      padding: 0 10px;
    }

    /* Top accent bar */
    .accent-bar {
      height: 6px;
      background: linear-gradient(90deg, #047857, #10b981, #047857);
      border-radius: 0 0 3px 3px;
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 20px 0 16px;
      border-bottom: 2px solid #e5e7eb;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .logo-placeholder {
      width: 64px;
      height: 64px;
      border: 2px dashed #d1d5db;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #9ca3af;
      font-size: 10px;
    }

    .company-info h1 {
      font-size: 20px;
      font-weight: 800;
      color: #047857;
      margin-bottom: 2px;
    }

    .company-info p {
      font-size: 11px;
      color: #6b7280;
    }

    .header-left {
      text-align: left;
      font-size: 11px;
      color: #6b7280;
    }

    .header-left .date-label {
      font-size: 10px;
      color: #9ca3af;
    }

    /* Title section */
    .title-section {
      text-align: center;
      padding: 18px 0;
      border-bottom: 1px solid #f3f4f6;
    }

    .title-section h2 {
      font-size: 22px;
      font-weight: 800;
      color: #1f2937;
      margin-bottom: 4px;
    }

    .title-section .client-meta {
      font-size: 12px;
      color: #6b7280;
    }

    .title-section .client-meta span {
      margin: 0 8px;
    }

    /* Summary boxes */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      padding: 16px 0;
    }

    .summary-box {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 12px 10px;
      text-align: center;
      background: #fafafa;
    }

    .summary-box .icon {
      font-size: 16px;
      margin-bottom: 4px;
    }

    .summary-box .label {
      font-size: 10px;
      color: #9ca3af;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .summary-box .value {
      font-size: 16px;
      font-weight: 800;
    }

    .summary-box .currency {
      font-size: 10px;
      color: #9ca3af;
      font-weight: 400;
    }

    .summary-box.balance {
      background: ${balanceColor}08;
      border-color: ${balanceColor}30;
    }

    .summary-box.balance .value {
      color: ${balanceColor};
      font-size: 20px;
    }

    .summary-box.balance .label {
      color: ${balanceColor};
    }

    .green { color: #047857; }
    .red { color: #dc2626; }
    .gray { color: #6b7280; }

    /* Table */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 12px;
    }

    thead tr {
      background: #f0fdf4;
      border-bottom: 2px solid #047857;
    }

    thead th {
      padding: 10px 12px;
      text-align: center;
      font-weight: 700;
      color: #047857;
      font-size: 12px;
    }

    tbody tr {
      border-bottom: 1px solid #f3f4f6;
    }

    tbody tr:nth-child(even) {
      background: #fafafa;
    }

    tbody td {
      padding: 9px 12px;
      text-align: center;
      vertical-align: middle;
    }

    /* Totals row */
    .totals-row {
      background: #f0fdf4 !important;
      border-top: 2px solid #047857;
      font-weight: 700;
    }

    .totals-row td {
      padding: 10px 12px;
      font-size: 13px;
    }

    /* Footer */
    .footer {
      margin-top: 30px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
    }

    .signatures {
      display: flex;
      justify-content: space-between;
      padding: 20px 40px;
    }

    .sig-block {
      text-align: center;
      width: 140px;
    }

    .sig-block .sig-line {
      border-bottom: 1px solid #d1d5db;
      height: 50px;
      margin-bottom: 6px;
    }

    .sig-block .sig-label {
      font-size: 11px;
      color: #6b7280;
    }

    .footer-brand {
      text-align: center;
      padding: 12px 0;
      font-size: 10px;
      color: #9ca3af;
      border-top: 1px solid #f3f4f6;
      margin-top: 10px;
    }

    /* Print-specific */
    @media print {
      body { padding: 0; }
      .page-container { max-width: 100%; padding: 0; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="page-container">

    <!-- Accent Bar -->
    <div class="accent-bar"></div>

    <!-- Header -->
    <div class="header">
      <div class="header-right">
        <div class="logo-placeholder">الشعار</div>
        <div class="company-info">
          <h1>${companyName}</h1>
          <p>${companyEmail}</p>
        </div>
      </div>
      <div class="header-left">
        <div class="date-label">تاريخ التقرير</div>
        <div style="font-weight:600;color:#1f2937;">${today}</div>
      </div>
    </div>

    <!-- Title -->
    <div class="title-section">
      <h2>كشف حساب</h2>
      <div class="client-meta">
        <span>${isSupplier ? "المورد" : "العميل"}: <strong>${contactName}</strong></span>
        ${contactType ? `<span> | ${contactType}</span>` : ""}
      </div>
    </div>

    <!-- Summary -->
    <div class="summary-grid">
      <div class="summary-box">
        <div class="icon">📂</div>
        <div class="label">الرصيد الافتتاحي</div>
        <div class="value gray">0 <span class="currency">${currency}</span></div>
      </div>
      <div class="summary-box">
        <div class="icon">📥</div>
        <div class="label">إجمالي المدين</div>
        <div class="value green">${totalDebit.toLocaleString()} <span class="currency">${currency}</span></div>
      </div>
      <div class="summary-box">
        <div class="icon">📤</div>
        <div class="label">إجمالي الدائن</div>
        <div class="value red">${totalCredit.toLocaleString()} <span class="currency">${currency}</span></div>
      </div>
      <div class="summary-box balance">
        <div class="icon">💰</div>
        <div class="label">الرصيد النهائي</div>
        <div class="value">${fmtNum(finalBalance)} <span class="currency">${currency}</span></div>
        <div style="font-size:9px;color:${balanceColor};margin-top:2px;">${balanceLabel}</div>
      </div>
    </div>

    <!-- Table -->
    <table>
      <thead>
        <tr>
          <th style="width:35px;">#</th>
          <th style="width:80px;">التاريخ</th>
          <th>البيان</th>
          <th>ملاحظات</th>
          <th style="width:80px;">مدين</th>
          <th style="width:80px;">دائن</th>
          <th style="width:90px;">الرصيد الجاري</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr class="totals-row">
          <td colspan="4" style="text-align:right;color:#047857;">الإجمالي</td>
          <td class="green">${totalDebit.toLocaleString()}</td>
          <td class="red">${totalCredit.toLocaleString()}</td>
          <td style="color:${balanceColor};font-size:14px;">${fmtNum(finalBalance)}</td>
        </tr>
      </tbody>
    </table>

    <!-- Footer -->
    <div class="footer">
      <div class="signatures">
        <div class="sig-block">
          <div class="sig-line"></div>
          <div class="sig-label">توقيع المحاسب</div>
        </div>
        <div class="sig-block">
          <div class="sig-line"></div>
          <div class="sig-label">ختم الشركة</div>
        </div>
        <div class="sig-block">
          <div class="sig-line"></div>
          <div class="sig-label">توقيع العميل</div>
        </div>
      </div>
      <div class="footer-brand">
        تم إنشاء هذا التقرير بواسطة AiAccounting — نظام المحاسبة الذكي
      </div>
    </div>

  </div>
</body>
</html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
    toast({ title: "تم فتح نافذة الطباعة ✅" });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-lg">كشف حساب - {contactName}</DialogTitle>
          {contactType && <Badge variant="secondary" className="w-fit">{contactType}</Badge>}
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">جاري تحميل المعاملات...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12">
            <Wallet className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">لا توجد معاملات مرتبطة بهذا الزبون</p>
            <p className="text-xs text-muted-foreground/70 mt-1">تأكد من ربط المعاملات بجهة الاتصال في حقل Contact</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-xl bg-muted/30 p-3 text-center border border-border/50">
                <p className="text-[10px] text-muted-foreground mb-1">الرصيد الافتتاحي</p>
                <p className="text-sm font-bold text-muted-foreground">0</p>
              </div>
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center border border-emerald-200/30">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600 mx-auto mb-1" />
                <p className="text-[10px] text-emerald-600/70 mb-1">إجمالي المدين</p>
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{totalDebit.toLocaleString()}</p>
              </div>
              <div className="rounded-xl bg-red-50 dark:bg-red-950/30 p-3 text-center border border-red-200/30">
                <TrendingDown className="h-3.5 w-3.5 text-red-600 mx-auto mb-1" />
                <p className="text-[10px] text-red-600/70 mb-1">إجمالي الدائن</p>
                <p className="text-sm font-bold text-red-700 dark:text-red-400">{totalCredit.toLocaleString()}</p>
              </div>
              <div className={`rounded-xl p-3 text-center border ${finalBalance >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300/50" : "bg-red-50 dark:bg-red-950/30 border-red-300/50"}`}>
                <Wallet className="h-3.5 w-3.5 mx-auto mb-1" style={{ color: finalBalance >= 0 ? "#047857" : "#dc2626" }} />
                <p className="text-[10px] text-muted-foreground mb-1">الرصيد النهائي</p>
                <p className={`text-sm font-bold ${finalBalance >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                  {fmtNum(finalBalance)} {currency}
                </p>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="px-3 py-2 text-center font-semibold w-8">#</th>
                      <th className="px-3 py-2 text-right font-semibold">التاريخ</th>
                      <th className="px-3 py-2 text-right font-semibold">البيان</th>
                      <th className="px-3 py-2 text-right font-semibold">ملاحظات</th>
                      <th className="px-3 py-2 text-center font-semibold">مدين</th>
                      <th className="px-3 py-2 text-center font-semibold">دائن</th>
                      <th className="px-3 py-2 text-center font-semibold">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementRows.map((r, i) => (
                      <tr key={r.tx.id} className="border-t border-border/50 hover:bg-muted/20">
                        <td className="px-3 py-2 text-center text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">{r.tx.fields.Date || "-"}</td>
                        <td className="px-3 py-2 max-w-[180px] truncate font-medium">{r.description}</td>
                        <td className="px-3 py-2 max-w-[150px] truncate text-muted-foreground text-[10px]">{r.tx.fields.Description || "-"}</td>
                        <td className="px-3 py-2 text-center text-emerald-700 dark:text-emerald-400 font-semibold">
                          {r.debit ? r.debit.toLocaleString() : "-"}
                        </td>
                        <td className="px-3 py-2 text-center text-red-700 dark:text-red-400 font-semibold">
                          {r.credit ? r.credit.toLocaleString() : "-"}
                        </td>
                        <td className={`px-3 py-2 text-center font-bold ${r.runningBalance >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                          {fmtNum(r.runningBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Export Buttons */}
            <div className="flex gap-2 justify-center pt-2">
              <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={exportToExcel}>
                <FileSpreadsheet className="h-4 w-4" />
                تصدير Excel
              </Button>
              <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={exportToPDF}>
                <FileText className="h-4 w-4" />
                تصدير PDF
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ContactStatementDialog;
