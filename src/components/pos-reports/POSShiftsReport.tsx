import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Clock, AlertTriangle, TrendingUp, TrendingDown, User, Timer } from "lucide-react";

interface Session {
  id: string;
  cashier_name: string | null;
  cashier_pos_user_id: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  cash_variance: number | null;
  total_sales: number;
  total_orders: number;
  total_returns: number;
  terminal_id: string;
  state: string;
}

interface Props {
  sessions: Session[];
}

export default function POSShiftsReport({ sessions }: Props) {
  const sorted = useMemo(
    () => [...sessions].sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime()),
    [sessions]
  );

  const stats = useMemo(() => {
    const closed = sorted.filter(s => s.state === "closed");
    const totalVariance = closed.reduce((s, c) => s + (c.cash_variance ?? 0), 0);
    const deficits = closed.filter(s => (s.cash_variance ?? 0) < 0);
    const surpluses = closed.filter(s => (s.cash_variance ?? 0) > 0);

    // Avg shift duration
    const durations = closed
      .filter(s => s.closed_at)
      .map(s => (new Date(s.closed_at!).getTime() - new Date(s.opened_at).getTime()) / 3600000);
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    return {
      total: sorted.length,
      open: sorted.filter(s => s.state === "open").length,
      closed: closed.length,
      totalVariance,
      deficits: deficits.length,
      surpluses: surpluses.length,
      avgDuration,
    };
  }, [sorted]);

  const formatDuration = (openedAt: string, closedAt: string | null) => {
    if (!closedAt) return "—";
    const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}س ${m}د`;
  };

  if (sorted.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>لا توجد ورديات في الفترة المحددة</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">إجمالي الورديات</p>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
            <div className="flex justify-center gap-2 mt-1 text-[10px]">
              {stats.open > 0 && <Badge variant="outline" className="text-amber-600 border-amber-300">{stats.open} مفتوحة</Badge>}
              <Badge variant="outline" className="text-muted-foreground">{stats.closed} مغلقة</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">متوسط مدة الوردية</p>
            <p className="text-2xl font-bold mt-1">{stats.avgDuration.toFixed(1)}<span className="text-sm text-muted-foreground mr-1">ساعة</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">ورديات بعجز</p>
            <p className="text-2xl font-bold mt-1 text-destructive">{stats.deficits}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">صافي الفروقات</p>
            <p className={`text-2xl font-bold mt-1 ${stats.totalVariance < 0 ? "text-destructive" : stats.totalVariance > 0 ? "text-green-600" : ""}`}>
              ₪{Math.abs(stats.totalVariance).toFixed(2)}
              {stats.totalVariance !== 0 && (
                <span className="text-xs mr-1">{stats.totalVariance > 0 ? "فائض" : "عجز"}</span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Shifts Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            سجل الورديات
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                  <th className="p-3 text-right">الكاشير</th>
                  <th className="p-3 text-right">تاريخ الفتح</th>
                  <th className="p-3 text-right">وقت الفتح</th>
                  <th className="p-3 text-right">وقت الإغلاق</th>
                  <th className="p-3 text-right">المدة</th>
                  <th className="p-3 text-left">رصيد الفتح</th>
                  <th className="p-3 text-left">رصيد الإغلاق</th>
                  <th className="p-3 text-left">المتوقع</th>
                  <th className="p-3 text-left">الفرق</th>
                  <th className="p-3 text-left">المبيعات</th>
                  <th className="p-3 text-left">الطلبات</th>
                  <th className="p-3 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => {
                  const variance = s.cash_variance ?? 0;
                  return (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="p-3 font-medium">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          {s.cashier_name || "—"}
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {format(new Date(s.opened_at), "dd/MM/yyyy", { locale: ar })}
                      </td>
                      <td className="p-3 tabular-nums">
                        {format(new Date(s.opened_at), "hh:mm a", { locale: ar })}
                      </td>
                      <td className="p-3 tabular-nums">
                        {s.closed_at
                          ? format(new Date(s.closed_at), "hh:mm a", { locale: ar })
                          : <span className="text-amber-500">مفتوحة</span>
                        }
                      </td>
                      <td className="p-3 tabular-nums text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Timer className="h-3 w-3" />
                          {formatDuration(s.opened_at, s.closed_at)}
                        </div>
                      </td>
                      <td className="p-3 tabular-nums text-left">₪{s.opening_cash.toFixed(2)}</td>
                      <td className="p-3 tabular-nums text-left">
                        {s.closing_cash != null ? `₪${s.closing_cash.toFixed(2)}` : "—"}
                      </td>
                      <td className="p-3 tabular-nums text-left">
                        {s.expected_cash != null ? `₪${s.expected_cash.toFixed(2)}` : "—"}
                      </td>
                      <td className="p-3 tabular-nums text-left">
                        {s.state === "closed" ? (
                          <span className={`inline-flex items-center gap-1 font-bold ${
                            variance < 0 ? "text-destructive" : variance > 0 ? "text-green-600" : "text-muted-foreground"
                          }`}>
                            {variance < 0 ? <TrendingDown className="h-3 w-3" /> : variance > 0 ? <TrendingUp className="h-3 w-3" /> : null}
                            {variance < 0 ? `(₪${Math.abs(variance).toFixed(2)})` : variance > 0 ? `₪${variance.toFixed(2)}` : "₪0"}
                            {variance < 0 && <AlertTriangle className="h-3 w-3" />}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="p-3 tabular-nums text-left font-medium">₪{s.total_sales.toFixed(2)}</td>
                      <td className="p-3 tabular-nums text-left">{s.total_orders}</td>
                      <td className="p-3 text-center">
                        <Badge variant={s.state === "open" ? "default" : "secondary"} className="text-[10px]">
                          {s.state === "open" ? "مفتوحة" : "مغلقة"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
