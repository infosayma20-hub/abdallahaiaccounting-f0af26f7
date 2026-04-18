import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, BarChart3, TrendingUp, Wallet, Package, Calculator,
  Truck, Loader2, Download, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface SalesRep {
  id: string;
  full_name: string;
  default_warehouse_id: string | null;
}

interface RepPerformance {
  rep_id: string;
  rep_name: string;
  warehouse_id: string | null;
  invoices_count: number;
  total_sales: number;
  total_collections: number;
  commissions_due: number;
  commissions_paid: number;
}

interface ProfitRow {
  rep_id: string;
  rep_name: string;
  sales: number;
  cogs: number;
  profit: number;
  margin_pct: number;
}

interface DayRow {
  id: string;
  day_number: string;
  day_date: string;
  status: string;
  rep_name: string;
  total_sales: number;
  total_collections: number;
  expected_cash: number | null;
  actual_cash_collected: number | null;
  cash_variance: number | null;
}

interface StockMoveRow {
  product_name: string;
  in_qty: number;
  out_qty: number;
  net: number;
}

interface CommissionLedgerRow {
  id: string;
  rep_name: string;
  commission_type: string;
  base_amount: number;
  commission_rate: number;
  commission_amount: number;
  is_paid: boolean;
  paid_date: string | null;
  created_at: string;
  reference_description: string | null;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("ar", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const todayISO = () => new Date().toISOString().slice(0, 10);

function downloadCSV(filename: string, rows: Record<string, any>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function VanReportsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [from, setFrom] = useState<string>(monthStart());
  const [to, setTo] = useState<string>(todayISO());
  const [loading, setLoading] = useState(false);
  const [reps, setReps] = useState<SalesRep[]>([]);

  const [performance, setPerformance] = useState<RepPerformance[]>([]);
  const [profit, setProfit] = useState<ProfitRow[]>([]);
  const [days, setDays] = useState<DayRow[]>([]);
  const [stock, setStock] = useState<StockMoveRow[]>([]);
  const [ledger, setLedger] = useState<CommissionLedgerRow[]>([]);
  const [stockRepId, setStockRepId] = useState<string>("");

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);

    // Load reps
    const { data: repsData } = await supabase
      .from("sales_representatives")
      .select("id, full_name, default_warehouse_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("full_name");
    const repsList = (repsData || []) as SalesRep[];
    setReps(repsList);
    if (!stockRepId && repsList.length > 0) setStockRepId(repsList[0].id);

    const repByWh = new Map<string, SalesRep>();
    repsList.forEach((r) => r.default_warehouse_id && repByWh.set(r.default_warehouse_id, r));
    const warehouseIds = repsList.map((r) => r.default_warehouse_id).filter(Boolean) as string[];

    // === Report 1 + 2: Performance & Profit ===
    const perfMap = new Map<string, RepPerformance>();
    const profitMap = new Map<string, ProfitRow>();
    repsList.forEach((r) => {
      perfMap.set(r.id, {
        rep_id: r.id,
        rep_name: r.full_name,
        warehouse_id: r.default_warehouse_id,
        invoices_count: 0,
        total_sales: 0,
        total_collections: 0,
        commissions_due: 0,
        commissions_paid: 0,
      });
      profitMap.set(r.id, {
        rep_id: r.id,
        rep_name: r.full_name,
        sales: 0,
        cogs: 0,
        profit: 0,
        margin_pct: 0,
      });
    });

    if (warehouseIds.length > 0) {
      const { data: invs } = await supabase
        .from("invoices")
        .select("id, total_amount, warehouse_id")
        .eq("user_id", user.id)
        .eq("invoice_type", "sale")
        .in("warehouse_id", warehouseIds)
        .gte("invoice_date", from)
        .lte("invoice_date", to)
        .neq("status", "cancelled");

      const invIds: string[] = [];
      const invToWh = new Map<string, string>();
      (invs || []).forEach((i: any) => {
        invIds.push(i.id);
        invToWh.set(i.id, i.warehouse_id);
        const rep = repByWh.get(i.warehouse_id);
        if (rep) {
          const p = perfMap.get(rep.id)!;
          p.invoices_count += 1;
          p.total_sales += Number(i.total_amount || 0);
          const pf = profitMap.get(rep.id)!;
          pf.sales += Number(i.total_amount || 0);
        }
      });

      // COGS via products.cost_price
      if (invIds.length > 0) {
        const { data: items } = await supabase
          .from("invoice_items")
          .select("invoice_id, product_id, quantity")
          .in("invoice_id", invIds);
        const productIds = Array.from(
          new Set((items || []).map((it: any) => it.product_id).filter(Boolean))
        );
        const { data: prods } = await supabase
          .from("products")
          .select("id, cost_price")
          .in("id", productIds.length > 0 ? productIds : ["00000000-0000-0000-0000-000000000000"]);
        const costMap = new Map<string, number>();
        (prods || []).forEach((p: any) => costMap.set(p.id, Number(p.cost_price || 0)));
        (items || []).forEach((it: any) => {
          const wh = invToWh.get(it.invoice_id);
          if (!wh) return;
          const rep = repByWh.get(wh);
          if (!rep) return;
          const cost = (costMap.get(it.product_id) || 0) * Number(it.quantity || 0);
          profitMap.get(rep.id)!.cogs += cost;
        });
      }

      // Collections: receipts linked to contacts whose invoices are in each rep's warehouse
      const customerByRep = new Map<string, Set<string>>();
      (invs || []).forEach((i: any) => {
        const rep = repByWh.get(i.warehouse_id);
        if (!rep) return;
        if (!customerByRep.has(rep.id)) customerByRep.set(rep.id, new Set());
        // Need contact_id - refetch with contact_id
      });
      // Refetch invoices with contact_id for collection mapping
      const { data: invsWithContact } = await supabase
        .from("invoices")
        .select("contact_id, warehouse_id")
        .eq("user_id", user.id)
        .in("warehouse_id", warehouseIds)
        .gte("invoice_date", from)
        .lte("invoice_date", to)
        .neq("status", "cancelled");
      (invsWithContact || []).forEach((i: any) => {
        const rep = repByWh.get(i.warehouse_id);
        if (!rep || !i.contact_id) return;
        if (!customerByRep.has(rep.id)) customerByRep.set(rep.id, new Set());
        customerByRep.get(rep.id)!.add(i.contact_id);
      });
      const allContactIds = Array.from(
        new Set(Array.from(customerByRep.values()).flatMap((s) => Array.from(s)))
      );
      if (allContactIds.length > 0) {
        const { data: rcps } = await supabase
          .from("transactions")
          .select("amount, contact_id")
          .eq("user_id", user.id)
          .in("transaction_type", ["receipt", "سند قبض"])
          .gte("transaction_date", from)
          .lte("transaction_date", to)
          .in("contact_id", allContactIds);
        (rcps || []).forEach((r: any) => {
          customerByRep.forEach((set, repId) => {
            if (set.has(r.contact_id)) {
              perfMap.get(repId)!.total_collections += Number(r.amount || 0);
            }
          });
        });
      }
    }

    // Compute profit margins
    profitMap.forEach((p) => {
      p.profit = p.sales - p.cogs;
      p.margin_pct = p.sales > 0 ? (p.profit / p.sales) * 100 : 0;
    });

    // === Report 5: Commissions ledger ===
    const { data: comms } = await supabase
      .from("commissions")
      .select("id, representative_id, commission_type, base_amount, commission_rate, commission_amount, is_paid, paid_date, created_at, reference_description")
      .eq("user_id", user.id)
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59`)
      .order("created_at", { ascending: false });
    const repNameById = new Map(repsList.map((r) => [r.id, r.full_name]));
    const ledgerRows: CommissionLedgerRow[] = (comms || []).map((c: any) => ({
      id: c.id,
      rep_name: repNameById.get(c.representative_id) || "—",
      commission_type: c.commission_type,
      base_amount: Number(c.base_amount || 0),
      commission_rate: Number(c.commission_rate || 0),
      commission_amount: Number(c.commission_amount || 0),
      is_paid: c.is_paid,
      paid_date: c.paid_date,
      created_at: c.created_at,
      reference_description: c.reference_description,
    }));
    setLedger(ledgerRows);
    // Aggregate into perfMap
    ledgerRows.forEach((c) => {
      const rep = repsList.find((r) => r.full_name === c.rep_name);
      if (!rep) return;
      const p = perfMap.get(rep.id);
      if (!p) return;
      if (c.is_paid) p.commissions_paid += c.commission_amount;
      else p.commissions_due += c.commission_amount;
    });

    setPerformance(Array.from(perfMap.values()));
    setProfit(Array.from(profitMap.values()));

    // === Report 3: Days ===
    const { data: daysData } = await supabase
      .from("van_sales_days")
      .select("id, day_number, day_date, status, sales_rep_id, total_sales, total_collections, expected_cash, actual_cash_collected, cash_variance")
      .eq("user_id", user.id)
      .gte("day_date", from)
      .lte("day_date", to)
      .order("day_date", { ascending: false });
    setDays(
      (daysData || []).map((d: any) => ({
        id: d.id,
        day_number: d.day_number,
        day_date: d.day_date,
        status: d.status,
        rep_name: repNameById.get(d.sales_rep_id) || "—",
        total_sales: Number(d.total_sales || 0),
        total_collections: Number(d.total_collections || 0),
        expected_cash: d.expected_cash,
        actual_cash_collected: d.actual_cash_collected,
        cash_variance: d.cash_variance,
      }))
    );

    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, [user, from, to]);

  // Stock movement per selected rep
  useEffect(() => {
    if (!user || !stockRepId) return;
    const rep = reps.find((r) => r.id === stockRepId);
    if (!rep?.default_warehouse_id) {
      setStock([]);
      return;
    }
    (async () => {
      const { data: moves } = await supabase
        .from("stock_movements")
        .select("product_id, movement_type, quantity, created_at")
        .eq("warehouse_id", rep.default_warehouse_id!)
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`);
      const productIds = Array.from(new Set((moves || []).map((m: any) => m.product_id)));
      const { data: prods } = await supabase
        .from("products")
        .select("id, name")
        .in("id", productIds.length > 0 ? productIds : ["00000000-0000-0000-0000-000000000000"]);
      const nameMap = new Map((prods || []).map((p: any) => [p.id, p.name]));
      const agg = new Map<string, StockMoveRow>();
      (moves || []).forEach((m: any) => {
        const key = m.product_id;
        if (!agg.has(key)) {
          agg.set(key, { product_name: nameMap.get(key) || "—", in_qty: 0, out_qty: 0, net: 0 });
        }
        const row = agg.get(key)!;
        const qty = Number(m.quantity || 0);
        // movement_type enum has 'in' / 'out' style values in this codebase
        if (String(m.movement_type).toLowerCase().includes("in") || String(m.movement_type).includes("وارد") || String(m.movement_type).includes("transfer_in")) {
          row.in_qty += qty;
        } else {
          row.out_qty += qty;
        }
        row.net = row.in_qty - row.out_qty;
      });
      setStock(Array.from(agg.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)));
    })();
  }, [stockRepId, from, to, user, reps]);

  const totalsKpi = useMemo(() => {
    return {
      sales: performance.reduce((s, p) => s + p.total_sales, 0),
      collections: performance.reduce((s, p) => s + p.total_collections, 0),
      profit: profit.reduce((s, p) => s + p.profit, 0),
      due: performance.reduce((s, p) => s + p.commissions_due, 0),
    };
  }, [performance, profit]);

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="container max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-bold">تقارير البائعين المتجولين</h1>
            </div>
          </div>
          {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        </div>
      </div>

      <div className="container max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Date filter */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-lg border bg-card">
          <div>
            <Label>من تاريخ</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>إلى تاريخ</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={loadAll} disabled={loading}>
              تحديث
            </Button>
          </div>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi icon={<TrendingUp className="h-5 w-5" />} label="إجمالي المبيعات" value={fmt(totalsKpi.sales)} tone="emerald" />
          <Kpi icon={<Wallet className="h-5 w-5" />} label="إجمالي التحصيلات" value={fmt(totalsKpi.collections)} tone="violet" />
          <Kpi icon={<Calculator className="h-5 w-5" />} label="صافي الربح" value={fmt(totalsKpi.profit)} tone="blue" />
          <Kpi icon={<FileText className="h-5 w-5" />} label="عمولات مستحقة" value={fmt(totalsKpi.due)} tone="amber" />
        </div>

        {/* Reports tabs */}
        <Tabs defaultValue="performance" className="w-full">
          <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full">
            <TabsTrigger value="performance">أداء البائعين</TabsTrigger>
            <TabsTrigger value="profit">الربحية</TabsTrigger>
            <TabsTrigger value="days">أيام البائعين</TabsTrigger>
            <TabsTrigger value="stock">حركة المخزون</TabsTrigger>
            <TabsTrigger value="commissions">العمولات</TabsTrigger>
          </TabsList>

          {/* 1. Performance */}
          <TabsContent value="performance" className="space-y-3">
            <SectionHeader
              title="أداء البائعين"
              onExport={() => downloadCSV("rep_performance.csv", performance.map((p) => ({
                البائع: p.rep_name,
                "عدد الفواتير": p.invoices_count,
                المبيعات: p.total_sales.toFixed(2),
                التحصيلات: p.total_collections.toFixed(2),
                "عمولات مستحقة": p.commissions_due.toFixed(2),
                "عمولات مدفوعة": p.commissions_paid.toFixed(2),
              })))}
            />
            <Table
              headers={["البائع", "الفواتير", "المبيعات", "التحصيلات", "عمولات مستحقة", "عمولات مدفوعة"]}
              rows={performance.map((p) => [
                p.rep_name,
                String(p.invoices_count),
                fmt(p.total_sales),
                fmt(p.total_collections),
                fmt(p.commissions_due),
                fmt(p.commissions_paid),
              ])}
            />
          </TabsContent>

          {/* 2. Profit */}
          <TabsContent value="profit" className="space-y-3">
            <SectionHeader
              title="ربحية مستودع كل بائع"
              note="تكلفة البضاعة محسوبة من سعر التكلفة في بطاقة الصنف (تقريبية)"
              onExport={() => downloadCSV("rep_profit.csv", profit.map((p) => ({
                البائع: p.rep_name,
                المبيعات: p.sales.toFixed(2),
                "تكلفة البضاعة": p.cogs.toFixed(2),
                "صافي الربح": p.profit.toFixed(2),
                "هامش %": p.margin_pct.toFixed(2),
              })))}
            />
            <Table
              headers={["البائع", "المبيعات", "تكلفة البضاعة", "صافي الربح", "هامش %"]}
              rows={profit.map((p) => [
                p.rep_name,
                fmt(p.sales),
                fmt(p.cogs),
                fmt(p.profit),
                `${p.margin_pct.toFixed(2)}%`,
              ])}
            />
          </TabsContent>

          {/* 3. Days */}
          <TabsContent value="days" className="space-y-3">
            <SectionHeader
              title="أيام البائعين والفروقات النقدية"
              onExport={() => downloadCSV("van_days.csv", days.map((d) => ({
                "رقم اليوم": d.day_number,
                التاريخ: d.day_date,
                البائع: d.rep_name,
                الحالة: d.status,
                المبيعات: d.total_sales.toFixed(2),
                التحصيلات: d.total_collections.toFixed(2),
                "نقدية متوقعة": (d.expected_cash || 0).toFixed(2),
                "نقدية فعلية": (d.actual_cash_collected || 0).toFixed(2),
                "الفرق": (d.cash_variance || 0).toFixed(2),
              })))}
            />
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {["رقم اليوم", "التاريخ", "البائع", "الحالة", "المبيعات", "التحصيلات", "الفرق النقدي"].map((h) => (
                      <th key={h} className="px-3 py-2 text-right font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">لا توجد بيانات</td></tr>
                  ) : days.map((d) => {
                    const v = Number(d.cash_variance || 0);
                    const tone = v === 0 ? "default" : v > 0 ? "secondary" : "destructive";
                    const label = v === 0 ? "مطابق" : v > 0 ? `فائض ${fmt(v)}` : `عجز ${fmt(Math.abs(v))}`;
                    return (
                      <tr key={d.id} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">{d.day_number}</td>
                        <td className="px-3 py-2">{d.day_date}</td>
                        <td className="px-3 py-2">{d.rep_name}</td>
                        <td className="px-3 py-2">
                          <Badge variant={d.status === "open" ? "default" : "outline"}>{d.status}</Badge>
                        </td>
                        <td className="px-3 py-2">{fmt(d.total_sales)}</td>
                        <td className="px-3 py-2">{fmt(d.total_collections)}</td>
                        <td className="px-3 py-2">
                          {d.status === "closed" ? <Badge variant={tone as any}>{label}</Badge> : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* 4. Stock */}
          <TabsContent value="stock" className="space-y-3">
            <div className="flex items-end gap-3">
              <div className="flex-1 max-w-xs">
                <Label>اختر البائع</Label>
                <select
                  className="w-full h-10 px-3 rounded-md border bg-background"
                  value={stockRepId}
                  onChange={(e) => setStockRepId(e.target.value)}
                >
                  {reps.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.full_name}{!r.default_warehouse_id && " (بدون مستودع)"}
                    </option>
                  ))}
                </select>
              </div>
              <SectionHeader
                title=""
                onExport={() => downloadCSV("stock_movement.csv", stock.map((s) => ({
                  الصنف: s.product_name,
                  "وارد (تحميل)": s.in_qty,
                  "صادر (بيع/إرجاع)": s.out_qty,
                  الصافي: s.net,
                })))}
              />
            </div>
            <Table
              headers={["الصنف", "وارد (تحميل)", "صادر (بيع/إرجاع)", "الصافي"]}
              rows={stock.map((s) => [s.product_name, fmt(s.in_qty), fmt(s.out_qty), fmt(s.net)])}
            />
          </TabsContent>

          {/* 5. Commissions */}
          <TabsContent value="commissions" className="space-y-3">
            <SectionHeader
              title="كشف العمولات"
              onExport={() => downloadCSV("commissions_ledger.csv", ledger.map((c) => ({
                التاريخ: new Date(c.created_at).toLocaleDateString("ar"),
                البائع: c.rep_name,
                النوع: c.commission_type,
                "الأساس": c.base_amount.toFixed(2),
                "النسبة": c.commission_rate.toFixed(2),
                "العمولة": c.commission_amount.toFixed(2),
                "الحالة": c.is_paid ? `مدفوعة ${c.paid_date || ""}` : "مستحقة",
                البيان: c.reference_description || "",
              })))}
            />
            <Table
              headers={["التاريخ", "البائع", "النوع", "الأساس", "النسبة", "العمولة", "الحالة"]}
              rows={ledger.map((c) => [
                new Date(c.created_at).toLocaleDateString("ar"),
                c.rep_name,
                c.commission_type,
                fmt(c.base_amount),
                `${c.commission_rate}%`,
                fmt(c.commission_amount),
                c.is_paid ? `مدفوعة ${c.paid_date || ""}` : "مستحقة",
              ])}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Kpi({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: string; tone: "blue" | "emerald" | "violet" | "amber" }) {
  const tones: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
  };
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-8 w-8 rounded-md flex items-center justify-center ${tones[tone]}`}>{icon}</div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function SectionHeader({ title, note, onExport }: { title: string; note?: string; onExport: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        {title && <h3 className="font-bold">{title}</h3>}
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      <Button variant="outline" size="sm" onClick={onExport}>
        <Download className="h-4 w-4 ml-1" />
        CSV
      </Button>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 text-right font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-3 py-8 text-center text-muted-foreground">
                لا توجد بيانات
              </td>
            </tr>
          ) : rows.map((r, idx) => (
            <tr key={idx} className="border-t">
              {r.map((c, i) => (
                <td key={i} className="px-3 py-2">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
