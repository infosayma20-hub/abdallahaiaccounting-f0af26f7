import { useState } from "react";
import { ArrowRight, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid } from "recharts";

const monthlyData = [
  { month: "يناير", revenue: 35000, expenses: 20000 },
  { month: "فبراير", revenue: 42000, expenses: 25000 },
  { month: "مارس", revenue: 38000, expenses: 22000 },
  { month: "أبريل", revenue: 48000, expenses: 22300 },
  { month: "مايو", revenue: 45000, expenses: 28000 },
  { month: "يونيو", revenue: 52000, expenses: 30000 },
];

const ProfitLoss = () => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");

  const totalRevenue = 48000;
  const totalExpenses = 22300;
  const netProfit = totalRevenue - totalExpenses;

  return (
    <div className="px-4 pt-6 space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-muted transition-colors">
          <ArrowRight className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-lg font-bold text-foreground">الأرباح والخسائر</h1>
      </div>

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
          <div className="h-1 bg-primary" />
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">صافي الربح</p>
                <p className="text-2xl font-bold text-primary">₪{netProfit.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
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
    </div>
  );
};

export default ProfitLoss;
