import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Truck } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";
import * as XLSX from "xlsx";
import { toast } from "sonner";

interface AppRow {
  app: string;
  orders: number;
  net_sales: number;
  delivery_fees: number;
  collected: number;
  cancelled_orders: number;
  cancelled_amount: number;
  returns_orders: number;
  returns_amount: number;
  cash_amount: number;
  card_amount: number;
  other_amount: number;
}

interface DailyRow { day: string; app: string; orders: number; net_sales: number }

interface Props {
  dateFrom: Date;
  dateTo: Date;
  /** Empty ⇢ all branches. */
  branchIds: string[];
}

const COLORS = [
  "hsl(var(--primary))", "#E8A020", "#10B981", "#0EA5E9",
  "#8B5CF6", "#EF4444", "#F59E0B", "#14B8A6",
];

const n = (v: unknown) => Number(v) || 0;
const money = (v: number) => `₪${Math.round(v).toLocaleString()}`;

const POSDeliveryAppsReport = ({ dateFrom, dateTo, branchIds }: Props) => {
  const [loading, setLoading] = useState(true);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const branchKey = branchIds.join(",");

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .rpc("get_delivery_apps_report", {
          p_from: format(dateFrom, "yyyy-MM-dd"),
          p_to: format(dateTo, "yyyy-MM-dd"),
          p_branch: null,
          p_branches: branchIds.length ? branchIds : null,
        } as any)
        .abortSignal(ac.signal);
      if (cancelled) return;
      if (error) {
        if (ac.signal.aborted || (error as any)?.name === "AbortError" || (error as any)?.code === "20") return;
        console.error("[delivery-apps-report]", error);
        toast.error(`تعذّر تحميل تقرير شركات التوصيل: ${error.message}`);
        setApps([]); setDaily([]); setLoading(false);
        return;
      }
      const payload = (data || {}) as any;
      setApps(((payload.apps || []) as any[]).map(r => ({
        app: String(r.app),
        orders: n(r.orders),
        net_sales: n(r.net_sales),
        delivery_fees: n(r.delivery_fees),
        collected: n(r.collected),
        cancelled_orders: n(r.cancelled_orders),
        cancelled_amount: n(r.cancelled_amount),
        returns_orders: n(r.returns_orders),
        returns_amount: n(r.returns_amount),
        cash_amount: n(r.cash_amount),
        card_amount: n(r.card_amount),
        other_amount: n(r.other_amount),
      })));
      setDaily(((payload.daily || []) as any[]).map(r => ({
        day: String(r.day), app: String(r.app), orders: n(r.orders), net_sales: n(r.net_sales),
      })));
      setLoading(false);
    })();
    return () => { cancelled = true; ac.abort(); };
  }, [dateFrom, dateTo, branchKey]);

  const totals = useMemo(() => apps.reduce((a, r) => ({
    orders: a.orders + r.orders,
    net_sales: a.net_sales + r.net_sales,
    delivery_fees: a.delivery_fees + r.delivery_fees,
    collected: a.collected + r.collected,
    cancelled_orders: a.cancelled_orders + r.cancelled_orders,
    cash_amount: a.cash_amount + r.cash_amount,
    card_amount: a.card_amount + r.card_amount,
  }), { orders: 0, net_sales: 0, delivery_fees: 0, collected: 0, cancelled_orders: 0, cash_amount: 0, card_amount: 0 }), [apps]);

  const appNames = useMemo(() => apps.slice(0, 8).map(a => a.app), [apps]);

  const trend = useMemo(() => {
    const byDay = new Map<string, Record<string, number | string>>();
    daily.forEach(d => {
      if (!appNames.includes(d.app)) return;
      const row = byDay.get(d.day) || { day: d.day };
      row[d.app] = n(row[d.app]) + d.net_sales;
      byDay.set(d.day, row);
    });
    return Array.from(byDay.values()).sort((a, b) => String(a.day).localeCompare(String(b.day)));
  }, [daily, appNames]);

  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(apps.map(r => ({
      "الشركة / التطبيق": r.app,
      "الطلبات": r.orders,
      "صافي المبيعات": Math.round(r.net_sales * 100) / 100,
      "رسوم التوصيل": Math.round(r.delivery_fees * 100) / 100,
      "إجمالي التحصيل": Math.round(r.collected * 100) / 100,
      "نقدي": Math.round(r.cash_amount * 100) / 100,
      "بطاقة / فيزا": Math.round(r.card_amount * 100) / 100,
      "أخرى": Math.round(r.other_amount * 100) / 100,
      "متوسط الفاتورة": r.orders > 0 ? Math.round(r.net_sales / r.orders) : 0,
      "طلبات ملغاة": r.cancelled_orders,
      "مرتجعات": r.returns_orders,
      "نسبة المساهمة %": totals.net_sales > 0 ? Math.round((r.net_sales / totals.net_sales) * 1000) / 10 : 0,
    })));
    XLSX.utils.book_append_sheet(wb, ws, "شركات التوصيل");
    if (daily.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(daily.map(d => ({
        "التاريخ": d.day, "الشركة / التطبيق": d.app, "الطلبات": d.orders,
        "صافي المبيعات": Math.round(d.net_sales * 100) / 100,
      })));
      XLSX.utils.book_append_sheet(wb, ws2, "تفصيل يومي");
    }
    XLSX.writeFile(wb, `شركات-التوصيل-${format(dateFrom, "yyyy-MM-dd")}.xlsx`);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-[90px] rounded-lg" />
        <Skeleton className="h-[280px] rounded-lg" />
        <Skeleton className="h-[220px] rounded-lg" />
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-10 text-center">
        <Truck className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-foreground font-medium">لا توجد طلبات لشركات التوصيل في هذه الفترة</p>
        <p className="text-xs text-muted-foreground mt-1">
          يعتمد التقرير على مصدر الطلب من الكول سنتر أو على ملاحظة الطلب (شني جو، ويلز، يمي…)
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <Tile title="إجمالي طلبات التوصيل" value={totals.orders.toLocaleString()} />
        <Tile title="صافي المبيعات" value={money(totals.net_sales)} />
        <Tile title="رسوم التوصيل" value={money(totals.delivery_fees)} hint="لشركات التوصيل" />
        <Tile title="إجمالي التحصيل" value={money(totals.collected)} />
        <Tile title="نقدي / بطاقة" value={`${money(totals.cash_amount)} · ${money(totals.card_amount)}`} />
        <Tile title="طلبات ملغاة" value={totals.cancelled_orders.toLocaleString()} />
      </div>

      {/* Comparison chart */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">مقارنة أداء شركات التوصيل</h3>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 text-[11px] px-2 h-7 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground"
          >
            <Download className="w-3.5 h-3.5" /> تصدير Excel
          </button>
        </div>
        <div className="p-4 h-[280px]" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={apps.slice(0, 10).map(a => ({ name: a.app, sales: Math.round(a.net_sales) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--primary))", border: "none", borderRadius: 6, color: "white", fontSize: 12 }}
                formatter={(v: number) => [`₪${v.toLocaleString()}`, "صافي المبيعات"]}
              />
              <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">تفصيل حسب الشركة</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <Th className="text-right">الشركة / التطبيق</Th>
                <Th>الطلبات</Th>
                <Th>صافي المبيعات</Th>
                <Th>المساهمة</Th>
                <Th>متوسط الفاتورة</Th>
                <Th>رسوم التوصيل</Th>
                <Th>نقدي</Th>
                <Th>بطاقة / فيزا</Th>
                <Th>ملغاة</Th>
                <Th>مرتجعات</Th>
              </tr>
            </thead>
            <tbody>
              {apps.map((r, i) => {
                const share = totals.net_sales > 0 ? (r.net_sales / totals.net_sales) * 100 : 0;
                return (
                  <tr key={r.app} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-foreground font-medium">{r.app}</span>
                      </span>
                    </td>
                    <Td>{r.orders.toLocaleString()}</Td>
                    <Td strong>{money(r.net_sales)}</Td>
                    <Td>{share.toFixed(1)}%</Td>
                    <Td>{r.orders > 0 ? money(r.net_sales / r.orders) : "—"}</Td>
                    <Td>{money(r.delivery_fees)}</Td>
                    <Td>{money(r.cash_amount)}</Td>
                    <Td>{money(r.card_amount)}</Td>
                    <Td className={r.cancelled_orders > 0 ? "text-destructive" : undefined}>{r.cancelled_orders}</Td>
                    <Td className={r.returns_orders > 0 ? "text-destructive" : undefined}>{r.returns_orders}</Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-muted/40">
              <tr className="border-t border-border font-semibold text-foreground">
                <td className="px-3 py-2 text-right">الإجمالي</td>
                <Td>{totals.orders.toLocaleString()}</Td>
                <Td>{money(totals.net_sales)}</Td>
                <Td>100%</Td>
                <Td>{totals.orders > 0 ? money(totals.net_sales / totals.orders) : "—"}</Td>
                <Td>{money(totals.delivery_fees)}</Td>
                <Td>{money(totals.cash_amount)}</Td>
                <Td>{money(totals.card_amount)}</Td>
                <Td>{totals.cancelled_orders}</Td>
                <Td>—</Td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Daily trend */}
      {trend.length > 1 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">التطور اليومي لكل شركة</h3>
          </div>
          <div className="p-4 h-[300px]" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--primary))", border: "none", borderRadius: 6, color: "white", fontSize: 12 }}
                  formatter={(v: number, name: string) => [`₪${Number(v).toLocaleString()}`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {appNames.map((name, i) => (
                  <Line key={name} type="monotone" dataKey={name} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        يُصنَّف الطلب حسب مصدره من الكول سنتر، وإذا لم يوجد مصدر يتم التعرف على الشركة من ملاحظة الطلب
        (شني جو، ويلز، يمي، فود اون تايم، بال ايت). «صافي المبيعات» لا يشمل رسوم التوصيل لأنها مستحقة لشركة التوصيل.
      </p>
    </div>
  );
};

const Tile = ({ title, value, hint }: { title: string; value: string; hint?: string }) => (
  <div className="bg-card border border-border rounded px-3 py-2">
    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate">{title}</p>
    <p className="text-[15px] font-semibold text-foreground mt-0.5 font-mono tabular-nums leading-tight truncate">{value}</p>
    {hint && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
  </div>
);

const Th = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <th className={`px-3 py-2 font-medium text-center whitespace-nowrap ${className || ""}`}>{children}</th>
);

const Td = ({ children, strong, className }: { children: React.ReactNode; strong?: boolean; className?: string }) => (
  <td className={`px-3 py-2 text-center font-mono tabular-nums whitespace-nowrap ${strong ? "font-semibold text-foreground" : "text-muted-foreground"} ${className || ""}`}>
    {children}
  </td>
);

export default POSDeliveryAppsReport;
