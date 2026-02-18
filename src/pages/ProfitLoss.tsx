import { useState, useEffect } from "react";
import { ArrowRight, TrendingUp, TrendingDown, DollarSign, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid } from "recharts";
import { useAuth } from "@/hooks/useAuth";

interface TransactionRecord {
  id: string;
  fields: {
    Amount?: number;
    Currency?: string;
    "Transaction Type"?: string;
    "Credit Account Rollup"?: string;
    "Debit Account Rollup"?: string;
    Description?: string;
    Date?: string;
    Client?: string;
  };
}

const monthNames = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

const ProfitLoss = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchTx = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-transactions?clientId=${user.id}`,
          {
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
          }
        );
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        setTransactions(data.records || []);
      } catch (err) {
        console.error("Error fetching P&L data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchTx();
  }, [user]);

  // Compute totals
  const totalRevenue = transactions
    .filter((tx) => tx.fields["Debit Account Rollup"] === "Asset" && tx.fields["Credit Account Rollup"] === "Revenue")
    .reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);

  const totalExpenses = transactions
    .filter((tx) => tx.fields["Debit Account Rollup"] === "Expenses")
    .reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);

  const netProfit = totalRevenue - totalExpenses;

  // Build monthly chart data
  const monthlyMap: Record<number, { revenue: number; expenses: number }> = {};
  transactions.forEach((tx) => {
    if (!tx.fields.Date) return;
    const month = new Date(tx.fields.Date).getMonth();
    if (!monthlyMap[month]) monthlyMap[month] = { revenue: 0, expenses: 0 };
    if (tx.fields["Debit Account Rollup"] === "Asset" && tx.fields["Credit Account Rollup"] === "Revenue") {
      monthlyMap[month].revenue += tx.fields.Amount || 0;
    }
    if (tx.fields["Debit Account Rollup"] === "Expenses") {
      monthlyMap[month].expenses += tx.fields.Amount || 0;
    }
  });

  const monthlyData = Object.entries(monthlyMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([m, data]) => ({
      month: monthNames[Number(m)],
      revenue: data.revenue,
      expenses: data.expenses,
    }));

  return (
    <div className="px-4 pt-6 space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg hover:bg-muted transition-colors">
          <ArrowRight className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-lg font-bold text-foreground">الأرباح والخسائر</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Period Toggle */}
          <div className="flex gap-2 bg-muted p-1 rounded-xl">
            <button
              onClick={() => setPeriod("monthly")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                period === "monthly" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              شهري
            </button>
            <button
              onClick={() => setPeriod("yearly")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                period === "yearly" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              سنوي
            </button>
          </div>

          {/* Summary Cards */}
          <div className="space-y-3">
            <Card className="border-0 shadow-sm overflow-hidden">
              <div className="h-1 bg-primary" />
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">إجمالي الإيرادات</p>
                    <p className="text-xl font-bold text-foreground">₪{totalRevenue.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm overflow-hidden">
              <div className="h-1 bg-destructive" />
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-destructive/10">
                    <TrendingDown className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">إجمالي المصروفات</p>
                    <p className="text-xl font-bold text-foreground">₪{totalExpenses.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm overflow-hidden">
              <div className={`h-1 ${netProfit >= 0 ? "bg-primary" : "bg-destructive"}`} />
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${netProfit >= 0 ? "bg-primary/10" : "bg-destructive/10"}`}>
                    <DollarSign className={`h-5 w-5 ${netProfit >= 0 ? "text-primary" : "text-destructive"}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{netProfit >= 0 ? "صافي الربح" : "صافي الخسارة"}</p>
                    <p className={`text-2xl font-bold ${netProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                      ₪{Math.abs(netProfit).toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          {monthlyData.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-4">الإيرادات مقابل المصروفات</h3>
                <div className="h-48" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(220, 10%, 46%)" }} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(220, 10%, 46%)" }} />
                      <Bar dataKey="revenue" fill="hsl(152, 45%, 42%)" radius={[4, 4, 0, 0]} name="الإيرادات" />
                      <Bar dataKey="expenses" fill="hsl(0, 72%, 51%)" radius={[4, 4, 0, 0]} name="المصروفات" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-6 mt-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-primary" />
                    <span className="text-xs text-muted-foreground">الإيرادات</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-destructive" />
                    <span className="text-xs text-muted-foreground">المصروفات</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default ProfitLoss;
