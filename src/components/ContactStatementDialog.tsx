import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, FileSpreadsheet, FileText, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

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
      // Sort by date
      const sorted = (data?.records || []).sort((a: Transaction, b: Transaction) => {
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

  // Calculate totals
  const totalDebit = transactions.reduce((sum, tx) => {
    // If contact appears in credit account (we received from them) → debit for them
    const desc = tx.fields.Description || "";
    const type = tx.fields["Transaction Type"] || "";
    if (type === "سند قبض" || desc.includes("قبض")) {
      return sum + (tx.fields.Amount || 0);
    }
    return sum;
  }, 0);

  const totalCredit = transactions.reduce((sum, tx) => {
    const desc = tx.fields.Description || "";
    const type = tx.fields["Transaction Type"] || "";
    if (type === "سند صرف" || desc.includes("صرف") || desc.includes("دفع")) {
      return sum + (tx.fields.Amount || 0);
    }
    return sum;
  }, 0);

  const otherTotal = transactions.reduce((sum, tx) => {
    const type = tx.fields["Transaction Type"] || "";
    const desc = tx.fields.Description || "";
    if (type !== "سند قبض" && type !== "سند صرف" && !desc.includes("قبض") && !desc.includes("صرف") && !desc.includes("دفع")) {
      return sum + (tx.fields.Amount || 0);
    }
    return sum;
  }, 0);

  const balance = totalDebit - totalCredit;
  const currency = transactions[0]?.fields.Currency || "شيكل";

  const exportToExcel = () => {
    if (transactions.length === 0) return;
    const rows = transactions.map((tx, i) => ({
      "#": i + 1,
      "التاريخ": tx.fields.Date || "",
      "الوصف": tx.fields.Description || "",
      "النوع": tx.fields["Transaction Type"] || "",
      "المدين": tx.fields["Debit Account Name"] || "",
      "الدائن": tx.fields["Credit Account Name"] || "",
      "المبلغ": tx.fields.Amount || 0,
      "العملة": tx.fields.Currency || "",
    }));
    // Add summary row
    rows.push({ "#": 0, "التاريخ": "", "الوصف": "الإجمالي", "النوع": "", "المدين": `مدين: ${totalDebit}`, "الدائن": `دائن: ${totalCredit}`, "المبلغ": balance, "العملة": currency } as any);

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "كشف حساب");
    XLSX.writeFile(wb, `كشف_حساب_${contactName}.xlsx`);
    toast({ title: "تم تصدير الملف بنجاح ✅" });
  };

  const exportToPDF = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    let rowsHtml = transactions.map((tx, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${tx.fields.Date || ""}</td>
        <td>${tx.fields.Description || ""}</td>
        <td>${tx.fields["Transaction Type"] || ""}</td>
        <td>${tx.fields["Debit Account Name"] || ""}</td>
        <td>${tx.fields["Credit Account Name"] || ""}</td>
        <td>${(tx.fields.Amount || 0).toLocaleString()}</td>
        <td>${tx.fields.Currency || ""}</td>
      </tr>
    `).join("");

    printWindow.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
      <title>كشف حساب - ${contactName}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 30px; direction: rtl; }
        h1 { text-align: center; margin-bottom: 5px; }
        .subtitle { text-align: center; color: #666; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: center; }
        th { background: #f5f5f5; font-weight: bold; }
        .summary { display: flex; justify-content: space-around; margin-top: 20px; padding: 15px; background: #f9f9f9; border-radius: 8px; }
        .summary-item { text-align: center; }
        .summary-item .label { font-size: 12px; color: #666; }
        .summary-item .value { font-size: 18px; font-weight: bold; margin-top: 4px; }
        .debit { color: #16a34a; }
        .credit { color: #dc2626; }
        @media print { body { padding: 10px; } }
      </style>
    </head><body>
      <h1>كشف حساب - ${contactName}</h1>
      <p class="subtitle">${contactType || ""} | التاريخ: ${new Date().toLocaleDateString("ar")}</p>
      <div class="summary">
        <div class="summary-item"><div class="label">إجمالي المقبوضات</div><div class="value debit">${totalDebit.toLocaleString()} ${currency}</div></div>
        <div class="summary-item"><div class="label">إجمالي المدفوعات</div><div class="value credit">${totalCredit.toLocaleString()} ${currency}</div></div>
        <div class="summary-item"><div class="label">الرصيد</div><div class="value">${balance.toLocaleString()} ${currency}</div></div>
      </div>
      <table>
        <thead><tr><th>#</th><th>التاريخ</th><th>الوصف</th><th>النوع</th><th>المدين</th><th>الدائن</th><th>المبلغ</th><th>العملة</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p style="text-align:center;margin-top:20px;color:#999;font-size:11px;">تم إنشاء هذا التقرير بواسطة AiAccounting</p>
    </body></html>`);
    printWindow.document.close();
    printWindow.print();
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
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center border border-emerald-200/30">
                <TrendingUp className="h-4 w-4 text-emerald-600 mx-auto mb-1" />
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{totalDebit.toLocaleString()}</p>
                <p className="text-[10px] text-emerald-600/70">مقبوضات</p>
              </div>
              <div className="rounded-xl bg-red-50 dark:bg-red-950/30 p-3 text-center border border-red-200/30">
                <TrendingDown className="h-4 w-4 text-red-600 mx-auto mb-1" />
                <p className="text-sm font-bold text-red-700 dark:text-red-400">{totalCredit.toLocaleString()}</p>
                <p className="text-[10px] text-red-600/70">مدفوعات</p>
              </div>
              <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 p-3 text-center border border-blue-200/30">
                <Wallet className="h-4 w-4 text-blue-600 mx-auto mb-1" />
                <p className={`text-sm font-bold ${balance >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                  {balance.toLocaleString()}
                </p>
                <p className="text-[10px] text-blue-600/70">الرصيد ({currency})</p>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="px-3 py-2 text-right font-semibold">#</th>
                      <th className="px-3 py-2 text-right font-semibold">التاريخ</th>
                      <th className="px-3 py-2 text-right font-semibold">الوصف</th>
                      <th className="px-3 py-2 text-right font-semibold">النوع</th>
                      <th className="px-3 py-2 text-right font-semibold">المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx, i) => (
                      <tr key={tx.id} className="border-t border-border/50 hover:bg-muted/20">
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">{tx.fields.Date || "-"}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate">{tx.fields.Description || "-"}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="text-[10px]">{tx.fields["Transaction Type"] || "-"}</Badge>
                        </td>
                        <td className="px-3 py-2 font-semibold">{(tx.fields.Amount || 0).toLocaleString()} {tx.fields.Currency || ""}</td>
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
