import { useState, useEffect } from "react";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Transaction {
  id: string;
  fields: {
    Description?: string;
    "Debit Account"?: string;
    "Credit Account"?: string;
    "Transaction Type"?: string;
    Amount?: number;
    Currency?: string;
    Date?: string;
    Reference?: string;
  };
}

const typeColors: Record<string, string> = {
  "سند صرف": "bg-destructive/10 text-destructive",
  "سند قبض": "bg-primary/10 text-primary",
  "قيد يومية": "bg-warning/10 text-warning",
  "فاتورة مشتريات": "bg-accent text-accent-foreground",
  "فاتورة مبيعات": "bg-primary/10 text-primary",
};

const TransactionsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-transactions?clientId=${user.id}`,
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );
      if (!res.ok) throw new Error("Failed to fetch transactions");
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      setTransactions(data?.records || []);
    } catch (err: any) {
      setError(err.message || "خطأ في جلب البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTransactions(); }, [user]);

  return (
    <div className="px-4 pt-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">المعاملات</h1>
            <p className="text-xs text-muted-foreground">{transactions.length} معاملة</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchTransactions} disabled={loading}>
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
            <Button variant="outline" size="sm" className="mt-2" onClick={fetchTransactions}>إعادة المحاولة</Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <Card key={tx.id} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{tx.fields.Description || "بدون وصف"}</p>
                    {tx.fields.Date && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{tx.fields.Date}</p>
                    )}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-foreground">
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
                  {tx.fields["Debit Account"] && (
                    <span className="text-[10px] text-muted-foreground">مدين: {tx.fields["Debit Account"]}</span>
                  )}
                  {tx.fields["Credit Account"] && (
                    <span className="text-[10px] text-muted-foreground">دائن: {tx.fields["Credit Account"]}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default TransactionsPage;
