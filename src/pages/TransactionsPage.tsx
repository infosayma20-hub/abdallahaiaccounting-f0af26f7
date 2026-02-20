import { useState, useEffect } from "react";
import { ArrowRight, Loader2, RefreshCw, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface Transaction {
  id: string;
  fields: {
    Description?: string;
    "Debit Account"?: string | string[];
    "Credit Account"?: string | string[];
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

const typeColors: Record<string, string> = {
  "سند صرف": "bg-destructive/10 text-destructive",
  "سند قبض": "bg-primary/10 text-primary",
  "قيد يومية": "bg-warning/10 text-warning",
  "فاتورة مشتريات": "bg-accent text-accent-foreground",
  "فاتورة مبيعات": "bg-primary/10 text-primary",
};

const paymentMethodTags: Record<string, { label: string; emoji: string }> = {
  "سند صرف": { label: "نقدي", emoji: "🟢" },
  "سند قبض": { label: "نقدي", emoji: "🟢" },
  "قيد يومية": { label: "تحويل", emoji: "💳" },
  "فاتورة مشتريات": { label: "بنك", emoji: "🏦" },
  "فاتورة مبيعات": { label: "بنك", emoji: "🏦" },
};

const transactionTypes = [
  { value: "سند صرف", label: "سند صرف" },
  { value: "سند قبض", label: "سند قبض" },
  { value: "قيد يومية", label: "قيد يومية" },
  { value: "فاتورة مشتريات", label: "فاتورة مشتريات" },
  { value: "فاتورة مبيعات", label: "فاتورة مبيعات" },
];

const TransactionsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [txRes, accRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-transactions?clientId=${user.id}`, {
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        }),
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-accounts?clientId=${user.id}`, {
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        }),
      ]);
      if (!txRes.ok) throw new Error("Failed to fetch transactions");
      const txData = await txRes.json();
      if (txData?.error) throw new Error(txData.error);
      setTransactions(txData?.records || []);
      if (accRes.ok) {
        const accData = await accRes.json();
        setAccounts(accData?.records || []);
      }
    } catch (err: any) {
      setError(err.message || "خطأ في جلب البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user]);

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
      toast({ title: "تم تعديل المعاملة بنجاح ✅" });
      setEditingTx(null);
      fetchData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const accountNames = accounts.map(a => a.fields["Account Name"]).filter(Boolean) as string[];

  return (
    <div className="px-4 pt-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/menu")} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">المعاملات</h1>
            <p className="text-xs text-muted-foreground">{transactions.length} معاملة</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={fetchData}>إعادة المحاولة</Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && (
        <div className="space-y-2.5">
          {transactions.map((tx) => {
            const payTag = paymentMethodTags[tx.fields["Transaction Type"] || ""];
            return (
              <Card
                key={tx.id}
                className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 overflow-hidden"
                onClick={() => openEdit(tx)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2.5">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{tx.fields.Description || "بدون وصف"}</p>
                        <Pencil className="h-3 w-3 text-muted-foreground opacity-50" />
                      </div>
                      {tx.fields.Date && (
                        <p className="text-[10px] text-muted-foreground mt-1">{tx.fields.Date}</p>
                      )}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-foreground tabular-nums">
                        {tx.fields.Amount?.toLocaleString()} {tx.fields.Currency || ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {tx.fields["Transaction Type"] && (
                      <Badge variant="secondary" className={`text-[10px] ${typeColors[tx.fields["Transaction Type"]] || ""}`}>
                        {tx.fields["Transaction Type"]}
                      </Badge>
                    )}
                    {payTag && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground">
                        {payTag.emoji} {payTag.label}
                      </span>
                    )}
                    {tx.fields["Debit Account Name"] && (
                      <span className="text-[10px] text-muted-foreground">مدين: {tx.fields["Debit Account Name"]}</span>
                    )}
                    {tx.fields["Credit Account Name"] && (
                      <span className="text-[10px] text-muted-foreground">دائن: {tx.fields["Credit Account Name"]}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingTx} onOpenChange={(open) => !open && setEditingTx(null)}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل المعاملة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الوصف</label>
              <Input value={editFields.Description} onChange={(e) => setEditFields(f => ({ ...f, Description: e.target.value }))} dir="rtl" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">نوع المعاملة</label>
              <Select value={editFields["Transaction Type"]} onValueChange={(v) => setEditFields(f => ({ ...f, "Transaction Type": v }))} dir="rtl">
                <SelectTrigger><SelectValue placeholder="اختر النوع" /></SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {transactionTypes.map(t => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">المبلغ</label>
                <Input type="number" value={editFields.Amount} onChange={(e) => setEditFields(f => ({ ...f, Amount: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">العملة</label>
                <Input value={editFields.Currency} onChange={(e) => setEditFields(f => ({ ...f, Currency: e.target.value }))} dir="rtl" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">التاريخ</label>
              <Input type="date" value={editFields.Date} onChange={(e) => setEditFields(f => ({ ...f, Date: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الحساب المدين</label>
              <Select value={editFields["Debit Account Name"]} onValueChange={(v) => setEditFields(f => ({ ...f, "Debit Account Name": v }))} dir="rtl">
                <SelectTrigger><SelectValue placeholder="اختر الحساب المدين" /></SelectTrigger>
                <SelectContent className="bg-background z-50 max-h-48">
                  {accountNames.map(name => (<SelectItem key={name} value={name}>{name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الحساب الدائن</label>
              <Select value={editFields["Credit Account Name"]} onValueChange={(v) => setEditFields(f => ({ ...f, "Credit Account Name": v }))} dir="rtl">
                <SelectTrigger><SelectValue placeholder="اختر الحساب الدائن" /></SelectTrigger>
                <SelectContent className="bg-background z-50 max-h-48">
                  {accountNames.map(name => (<SelectItem key={name} value={name}>{name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSave} className="w-full gap-2 rounded-xl" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ التعديلات
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TransactionsPage;
