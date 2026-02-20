import { useState, useEffect } from "react";
import { ArrowRight, TrendingUp, TrendingDown, DollarSign, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { useCountUp } from "@/hooks/useCountUp";

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
          { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
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

  // Filter out opening balance transactions from P&L
  const plTransactions = transactions.filter((tx) => {
    const type = (tx.fields["Transaction Type"] || "").trim();
    const desc = (tx.fields.Description || "").trim();
    const isOB = /رصيد\s*(ابتدائي|افتتاحي|مدور|أول\s*المدة)/i.test(desc) ||
      /رصيد\s*(ابتدائي|افتتاحي|مدور)/i.test(type) ||
      type === "رصيد ابتدائي";
    return !isOB;
  });

  const totalRevenue = plTransactions
    .filter((tx) => tx.fields["Debit Account Rollup"] === "Asset" && tx.fields["Credit Account Rollup"] === "Revenue")
    .reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const totalExpenses = plTransactions
    .filter((tx) => tx.fields["Debit Account Rollup"] === "Expenses")
    .reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const netProfit = totalRevenue - totalExpenses;

  const animRevenue = useCountUp(totalRevenue, 1200, !loading);
  const animExpenses = useCountUp(totalExpenses, 1200, !loading);
  const animNet = useCountUp(Math.abs(netProfit), 1200, !loading);

  // Pie data
  const pieData = totalRevenue > 0 || totalExpenses > 0
    ? [
        { name: "الإيرادات", value: totalRevenue },
        { name: "المصروفات", value: totalExpenses },
      ]
    : [];
  const COLORS = ["hsl(152, 45%, 42%)", "hsl(0, 72%, 51%)"];

  // Monthly chart
  const monthlyMap: Record<number, { revenue: number; expenses: number }> = {};
  plTransactions.forEach((tx) => {
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
    .map(([m, data]) => ({ month: monthNames[Number(m)], revenue: data.revenue, expenses: data.expenses }));

  return (
    <div className="px-4 pt-6 space-y-6 pb-8">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/")} className="p-2 rounded-xl hover:bg-muted transition-colors">
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
          <div className="flex gap-1 bg-muted/60 p-1 rounded-2xl">
            <button
              onClick={() => setPeriod("monthly")}
              className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
                period === "monthly" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              شهري
            </button>
            <button
              onClick={() => setPeriod("yearly")}
              className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
                period === "yearly" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              سنوي
            </button>
          </div>

          {/* Circular Chart */}
          {pieData.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 flex flex-col items-center">
                <h3 className="text-sm font-semibold text-foreground mb-3">نسبة الإيرادات للمصروفات</h3>
                <div className="h-40 w-40 relative" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={65}
                        paddingAngle={4}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {pieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className={`text-lg font-bold ${netProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                      {netProfit >= 0 ? "ربح" : "خسارة"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6 mt-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-primary" />
                    <span className="text-xs text-muted-foreground">إيرادات</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-destructive" />
                    <span className="text-xs text-muted-foreground">مصروفات</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary Cards */}
          <div className="space-y-3">
            <Card className="border-0 shadow-sm overflow-hidden hover:shadow-md transition-all duration-200">
              <div className="h-1 bg-gradient-to-l from-primary to-primary/50" />
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-primary/10">
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">إجمالي الإيرادات</p>
                    <p className="text-xl font-bold text-foreground tabular-nums">₪{animRevenue.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm overflow-hidden hover:shadow-md transition-all duration-200">
              <div className="h-1 bg-gradient-to-l from-destructive to-destructive/50" />
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-destructive/10">
                    <TrendingDown className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">إجمالي المصروفات</p>
                    <p className="text-xl font-bold text-foreground tabular-nums">₪{animExpenses.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm overflow-hidden hover:shadow-md transition-all duration-200">
              <div className={`h-1 ${netProfit >= 0 ? "bg-gradient-to-l from-primary to-primary/50" : "bg-gradient-to-l from-destructive to-destructive/50"}`} />
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${netProfit >= 0 ? "bg-primary/10" : "bg-destructive/10"}`}>
                    <DollarSign className={`h-5 w-5 ${netProfit >= 0 ? "text-primary" : "text-destructive"}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{netProfit >= 0 ? "صافي الربح" : "صافي الخسارة"}</p>
                    <p className={`text-2xl font-bold tabular-nums ${netProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                      ₪{animNet.toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bar Chart */}
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
                      <Bar dataKey="revenue" fill="hsl(152, 45%, 42%)" radius={[6, 6, 0, 0]} name="الإيرادات" />
                      <Bar dataKey="expenses" fill="hsl(0, 72%, 51%)" radius={[6, 6, 0, 0]} name="المصروفات" />
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
