import { useState, useEffect } from "react";
import { getAuthHeaders } from "@/lib/edge-helpers";
import { ArrowRight, Loader2, RefreshCw, Download, FileSpreadsheet, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
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
    Reference?: string;
    "Debit Account Rollup"?: string;
    "Credit Account Rollup"?: string;
  };
}

interface Account {
  id: string;
  fields: {
    "Account Name"?: string;
    "Account Type"?: string;
  };
}

const ExportPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [exporting, setExporting] = useState(false);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [txRes, accRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-transactions?clientId=${user.id}`, {
          headers: await getAuthHeaders(),
        }),
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-accounts?clientId=${user.id}`, {
          headers: await getAuthHeaders(),
        }),
      ]);
      const txData = await txRes.json();
      const accData = await accRes.json();
      setTransactions(txData?.records || []);
      setAccounts(accData?.records || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user]);

  const filteredTransactions = transactions.filter((tx) => {
    const txDate = tx.fields.Date || "";
    if (dateFrom && txDate < dateFrom) return false;
    if (dateTo && txDate > dateTo) return false;
    if (selectedAccount && selectedAccount !== "all") {
      const debit = tx.fields["Debit Account Name"] || "";
      const credit = tx.fields["Credit Account Name"] || "";
      if (!debit.includes(selectedAccount) && !credit.includes(selectedAccount)) return false;
    }
    return true;
  });

  const handleExportExcel = () => {
    if (filteredTransactions.length === 0) {
      toast({ title: "لا توجد بيانات للتصدير", variant: "destructive" });
      return;
    }
    setExporting(true);
    try {
      const data = filteredTransactions.map((tx) => ({
        "التاريخ": tx.fields.Date || "",
        "الوصف": tx.fields.Description || "",
        "النوع": tx.fields["Transaction Type"] || "",
        "المبلغ": tx.fields.Amount || 0,
        "العملة": tx.fields.Currency || "",
        "الحساب المدين": tx.fields["Debit Account Name"] || "",
        "الحساب الدائن": tx.fields["Credit Account Name"] || "",
        "المرجع": tx.fields.Reference || "",
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "المعاملات");
      const colWidths = Object.keys(data[0]).map((key) => ({
        wch: Math.max(key.length, ...data.map((row) => String((row as any)[key]).length)) + 2,
      }));
      ws["!cols"] = colWidths;
      const fileName = `معاملات_${dateFrom || "بداية"}_${dateTo || "نهاية"}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast({ title: "تم تصدير الملف بنجاح ✅" });
    } catch (err: any) {
      toast({ title: "خطأ في التصدير", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleExportPDF = () => {
    if (filteredTransactions.length === 0) {
      toast({ title: "لا توجد بيانات للتصدير", variant: "destructive" });
      return;
    }

    const totalRevenue = filteredTransactions
      .filter(tx => tx.fields["Debit Account Rollup"] === "Asset" && tx.fields["Credit Account Rollup"] === "Revenue")
      .reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
    const totalExpenses = filteredTransactions
      .filter(tx => tx.fields["Debit Account Rollup"] === "Expenses")
      .reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
    const netProfit = totalRevenue - totalExpenses;
    const totalAmount = filteredTransactions.reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);

    const rows = filteredTransactions.map((tx, i) => `
      <tr style="${i % 2 === 0 ? '' : 'background:#f9fafb;'}">
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;">${i + 1}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;">${tx.fields.Date || ""}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;">${tx.fields.Description || ""}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;">${tx.fields["Transaction Type"] || ""}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;">${tx.fields["Debit Account Name"] || ""}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;">${tx.fields["Credit Account Name"] || ""}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;font-weight:600;">₪${(tx.fields.Amount || 0).toLocaleString()}</td>
      </tr>
    `).join("");

    const html = `
      <html dir="rtl">
        <head>
          <title>تقرير مالي</title>
          <style>
            * { margin:0; padding:0; box-sizing:border-box; font-family:'IBM Plex Sans Arabic','Segoe UI',sans-serif; }
            body { padding:30px; color:#1a1a2e; }
            @media print { body { padding:15px; } }
          </style>
        </head>
        <body>
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:25px;border-bottom:3px solid #2d8a5e;padding-bottom:15px;">
            <div>
              <h1 style="font-size:24px;color:#2d8a5e;font-weight:700;">تقرير مالي</h1>
              <p style="font-size:12px;color:#666;margin-top:4px;">عبدالله AI للمحاسبة</p>
            </div>
            <div style="text-align:left;font-size:12px;color:#666;">
              <span style="display:block;">الفترة: ${dateFrom || "بداية"} - ${dateTo || "نهاية"}</span>
              <span style="display:block;">تاريخ التقرير: ${new Date().toLocaleDateString("en-GB")}</span>
            </div>
          </div>

          <div style="display:flex;gap:15px;margin-bottom:25px;">
            <div style="flex:1;background:#f0faf5;border-radius:10px;padding:15px;border:1px solid #d1fae5;">
              <p style="font-size:11px;color:#2d8a5e;">إجمالي الإيرادات</p>
              <p style="font-size:20px;font-weight:700;color:#2d8a5e;">₪${totalRevenue.toLocaleString()}</p>
            </div>
            <div style="flex:1;background:#fef2f2;border-radius:10px;padding:15px;border:1px solid #fee2e2;">
              <p style="font-size:11px;color:#dc2626;">إجمالي المصروفات</p>
              <p style="font-size:20px;font-weight:700;color:#dc2626;">₪${totalExpenses.toLocaleString()}</p>
            </div>
            <div style="flex:1;background:${netProfit >= 0 ? '#f0faf5' : '#fef2f2'};border-radius:10px;padding:15px;border:1px solid ${netProfit >= 0 ? '#d1fae5' : '#fee2e2'};">
              <p style="font-size:11px;color:${netProfit >= 0 ? '#2d8a5e' : '#dc2626'};">${netProfit >= 0 ? 'صافي الربح' : 'صافي الخسارة'}</p>
              <p style="font-size:20px;font-weight:700;color:${netProfit >= 0 ? '#2d8a5e' : '#dc2626'};">₪${Math.abs(netProfit).toLocaleString()}</p>
            </div>
          </div>

          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f0faf5;">
                <th style="padding:10px;text-align:right;font-size:12px;color:#2d8a5e;border-bottom:2px solid #2d8a5e;">#</th>
                <th style="padding:10px;text-align:right;font-size:12px;color:#2d8a5e;border-bottom:2px solid #2d8a5e;">التاريخ</th>
                <th style="padding:10px;text-align:right;font-size:12px;color:#2d8a5e;border-bottom:2px solid #2d8a5e;">الوصف</th>
                <th style="padding:10px;text-align:right;font-size:12px;color:#2d8a5e;border-bottom:2px solid #2d8a5e;">النوع</th>
                <th style="padding:10px;text-align:right;font-size:12px;color:#2d8a5e;border-bottom:2px solid #2d8a5e;">مدين</th>
                <th style="padding:10px;text-align:right;font-size:12px;color:#2d8a5e;border-bottom:2px solid #2d8a5e;">دائن</th>
                <th style="padding:10px;text-align:right;font-size:12px;color:#2d8a5e;border-bottom:2px solid #2d8a5e;">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
              <tr style="background:#f0faf5;font-weight:700;">
                <td colspan="6" style="padding:10px;border-top:2px solid #2d8a5e;font-size:13px;">الإجمالي (${filteredTransactions.length} معاملة)</td>
                <td style="padding:10px;border-top:2px solid #2d8a5e;font-size:15px;color:#2d8a5e;">₪${totalAmount.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          <div style="text-align:center;margin-top:30px;font-size:10px;color:#999;border-top:1px solid #e5e7eb;padding-top:15px;">
            تم إنشاؤه بواسطة عبدالله AI للمحاسبة • ${new Date().toLocaleDateString("en-GB")}
          </div>
        </body>
      </html>
    `;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    /* view only — no browser print */
    toast({ title: "تم فتح التقرير ✅" });
  };

  const totalAmount = filteredTransactions.reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);

  return (
    <div className="px-4 pt-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">التصدير</h1>
            <p className="text-xs text-muted-foreground">تصدير المعاملات إلى Excel أو PDF</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Filters */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">فلترة البيانات</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">من تاريخ</label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} dir="ltr" className="text-xs" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">إلى تاريخ</label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} dir="ltr" className="text-xs" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">الحساب</label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount} dir="rtl">
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="جميع الحسابات" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50 max-h-60">
                    <SelectItem value="all">جميع الحسابات</SelectItem>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.fields["Account Name"] || acc.id}>
                        {acc.fields["Account Name"]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">عدد المعاملات</p>
                <p className="text-lg font-bold text-foreground">{filteredTransactions.length}</p>
              </div>
              <div className="text-left">
                <p className="text-xs text-muted-foreground">إجمالي المبالغ</p>
                <p className="text-lg font-bold text-primary">₪{totalAmount.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>

          {/* Export Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={handleExportExcel}
              className="gap-2 h-12 text-sm rounded-xl"
              disabled={exporting || filteredTransactions.length === 0}
            >
              {exporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileSpreadsheet className="h-5 w-5" />}
              تصدير Excel
            </Button>
            <Button
              onClick={handleExportPDF}
              variant="outline"
              className="gap-2 h-12 text-sm rounded-xl"
              disabled={filteredTransactions.length === 0}
            >
              <FileText className="h-5 w-5" />
              تصدير PDF
            </Button>
          </div>

          {/* Preview */}
          {filteredTransactions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">معاينة (أول 5 معاملات)</p>
              {filteredTransactions.slice(0, 5).map((tx) => (
                <Card key={tx.id} className="border-0 shadow-sm">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-foreground">{tx.fields.Description || "بدون وصف"}</p>
                      <p className="text-[10px] text-muted-foreground">{tx.fields.Date}</p>
                    </div>
                    <p className="text-xs font-bold text-foreground">{tx.fields.Amount?.toLocaleString()} {tx.fields.Currency}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ExportPage;
