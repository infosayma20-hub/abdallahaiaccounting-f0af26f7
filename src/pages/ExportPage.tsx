import { useState, useEffect } from "react";
import { ArrowRight, Loader2, RefreshCw, Download, FileSpreadsheet } from "lucide-react";
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
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        }),
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-accounts?clientId=${user.id}`, {
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
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

  const handleExport = () => {
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

      // Auto-width columns
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

  const totalAmount = filteredTransactions.reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);

  return (
    <div className="px-4 pt-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/menu")} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">تصدير Excel</h1>
            <p className="text-xs text-muted-foreground">تصدير المعاملات إلى ملف Excel</p>
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

          {/* Export Button */}
          <Button
            onClick={handleExport}
            className="w-full gap-2 h-12 text-base"
            disabled={exporting || filteredTransactions.length === 0}
          >
            {exporting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-5 w-5" />
            )}
            تصدير {filteredTransactions.length} معاملة إلى Excel
          </Button>

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
