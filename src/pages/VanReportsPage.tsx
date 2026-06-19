import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Download, TrendingUp, Wallet, Calculator, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { setNextExportBranding } from "@/lib/excel-export";
import { format } from "date-fns";

interface SalesRep { id: string; full_name: string; default_warehouse_id: string | null; }
interface RepPerformance { rep_id: string; rep_name: string; warehouse_id: string | null; invoices_count: number; total_sales: number; total_collections: number; commissions_due: number; commissions_paid: number; }
interface ProfitRow { rep_id: string; rep_name: string; sales: number; cogs: number; profit: number; margin_pct: number; }
interface DayRow { id: string; day_number: string; day_date: string; status: string; rep_name: string; total_sales: number; total_collections: number; expected_cash: number | null; actual_cash_collected: number | null; cash_variance: number | null; }
interface StockMoveRow { product_name: string; in_qty: number; out_qty: number; net: number; }
interface CommissionLedgerRow { id: string; rep_name: string; commission_type: string; base_amount: number; commission_rate: number; commission_amount: number; is_paid: boolean; paid_date: string | null; created_at: string; reference_description: string | null; }

const fmt = (n: number) => new Intl.NumberFormat("ar", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const todayISO = () => new Date().toISOString().slice(0, 10);

function exportExcel(filename: string, sheetName: string, rows: Record<string, any>[]) {
  if (!rows.length) return;
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = Object.keys(rows[0]).map(() => ({ wch: 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  setNextExportBranding({ title: sheetName });
  XLSX.writeFile(wb, filename);
}

export default function VanReportsPage() {
  const { user } = useAuth();
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

    const { data: repsData } = await supabase
      .from("sales_representatives")
      .select("id, full_name, default_warehouse_id")
      .eq("user_id", dataOwnerId!)
      .eq("is_active", true)
      .order("full_name");
    const repsList = (repsData || []) as SalesRep[];
    setReps(repsList);
    if (!stockRepId && repsList.length > 0) setStockRepId(repsList[0].id);

    const repByWh = new Map<string, SalesRep>();
    repsList.forEach((r) => r.default_warehouse_id && repByWh.set(r.default_warehouse_id, r));
    const warehouseIds = repsList.map((r) => r.default_warehouse_id).filter(Boolean) as string[];

    const perfMap = new Map<string, RepPerformance>();
    const profitMap = new Map<string, ProfitRow>();
    repsList.forEach((r) => {
      perfMap.set(r.id, { rep_id: r.id, rep_name: r.full_name, warehouse_id: r.default_warehouse_id, invoices_count: 0, total_sales: 0, total_collections: 0, commissions_due: 0, commissions_paid: 0 });
      profitMap.set(r.id, { rep_id: r.id, rep_name: r.full_name, sales: 0, cogs: 0, profit: 0, margin_pct: 0 });
    });

    if (warehouseIds.length > 0) {
      const { data: invs } = await supabase
        .from("invoices")
        .select("id, total_amount, warehouse_id, status, is_voided")
        .eq("user_id", dataOwnerId!)
        .eq("invoice_type", "sale")
        .in("warehouse_id", warehouseIds)
        .eq("is_voided", false)
        .gte("invoice_date", from)
        .lte("invoice_date", to)
        .not("status", "in", "(cancelled,void,reversed)");

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
          profitMap.get(rep.id)!.sales += Number(i.total_amount || 0);
        }
      });

      if (invIds.length > 0) {
        const { data: items } = await supabase
          .from("invoice_items")
          .select("invoice_id, product_id, quantity")
          .in("invoice_id", invIds);
        const productIds = Array.from(new Set((items || []).map((it: any) => it.product_id).filter(Boolean)));
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

      const customerByRep = new Map<string, Set<string>>();
      const { data: invsWithContact } = await supabase
        .from("invoices")
        .select("contact_id, warehouse_id, status, is_voided")
        .eq("user_id", dataOwnerId!)
        .in("warehouse_id", warehouseIds)
        .eq("is_voided", false)
        .gte("invoice_date", from)
        .lte("invoice_date", to)
        .not("status", "in", "(cancelled,void,reversed)");
      (invsWithContact || []).forEach((i: any) => {
        const rep = repByWh.get(i.warehouse_id);
        if (!rep || !i.contact_id) return;
        if (!customerByRep.has(rep.id)) customerByRep.set(rep.id, new Set());
        customerByRep.get(rep.id)!.add(i.contact_id);
      });
      const allContactIds = Array.from(new Set(Array.from(customerByRep.values()).flatMap((s) => Array.from(s))));
      if (allContactIds.length > 0) {
        const { data: rcps } = await supabase
          .from("transactions")
          .select("amount, contact_id")
          .eq("user_id", dataOwnerId!)
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

    profitMap.forEach((p) => {
      p.profit = p.sales - p.cogs;
      p.margin_pct = p.sales > 0 ? (p.profit / p.sales) * 100 : 0;
    });

    const { data: comms } = await supabase
      .from("commissions")
      .select("id, representative_id, commission_type, base_amount, commission_rate, commission_amount, is_paid, paid_date, created_at, reference_description")
      .eq("user_id", dataOwnerId!)
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

    const { data: daysData } = await supabase
      .from("van_sales_days")
      .select("id, day_number, day_date, status, sales_rep_id, total_sales, total_collections, expected_cash, actual_cash_collected, cash_variance")
      .eq("user_id", dataOwnerId!)
      .gte("day_date", from)
      .lte("day_date", to)
      .order("day_date", { ascending: false });
    setDays((daysData || []).map((d: any) => ({
      id: d.id, day_number: d.day_number, day_date: d.day_date, status: d.status,
      rep_name: repNameById.get(d.sales_rep_id) || "—",
      total_sales: Number(d.total_sales || 0), total_collections: Number(d.total_collections || 0),
      expected_cash: d.expected_cash, actual_cash_collected: d.actual_cash_collected, cash_variance: d.cash_variance,
    })));

    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [user, from, to]);

  useEffect(() => {
    if (!user || !stockRepId) return;
    const rep = reps.find((r) => r.id === stockRepId);
    if (!rep?.default_warehouse_id) { setStock([]); return; }
    (async () => {
      const { data: moves } = await supabase
        .from("stock_movements")
        .select("product_id, movement_type, quantity, created_at")
        .eq("warehouse_id", rep.default_warehouse_id!)
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`);
      const productIds = Array.from(new Set((moves || []).map((m: any) => m.product_id)));
      const { data: prods } = await supabase
        .from("products").select("id, name")
        .in("id", productIds.length > 0 ? productIds : ["00000000-0000-0000-0000-000000000000"]);
      const nameMap = new Map((prods || []).map((p: any) => [p.id, p.name]));
      const agg = new Map<string, StockMoveRow>();
      (moves || []).forEach((m: any) => {
        const key = m.product_id;
        if (!agg.has(key)) agg.set(key, { product_name: nameMap.get(key) || "—", in_qty: 0, out_qty: 0, net: 0 });
        const row = agg.get(key)!;
        const qty = Number(m.quantity || 0);
        if (String(m.movement_type).toLowerCase().includes("in") || String(m.movement_type).includes("وارد") || String(m.movement_type).includes("transfer_in")) {
          row.in_qty += qty;
        } else { row.out_qty += qty; }
        row.net = row.in_qty - row.out_qty;
      });
      setStock(Array.from(agg.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)));
    })();
  }, [stockRepId, from, to, user, reps]);

  const totalsKpi = useMemo(() => ({
    sales: performance.reduce((s, p) => s + p.total_sales, 0),
    collections: performance.reduce((s, p) => s + p.total_collections, 0),
    profit: profit.reduce((s, p) => s + p.profit, 0),
    due: performance.reduce((s, p) => s + p.commissions_due, 0),
  }), [performance, profit]);

  const dateRangeLabel = `${from}_${to}`;

  return (
    <div className="space-y-5 max-w-[1200px] mx-auto pb-10" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/")} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-xl font-bold text-foreground">تقارير البائعين المتجولين</h1>
        </div>
        {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      </div>

      {/* Date filter */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">من</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px] h-9 text-xs" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">إلى</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px] h-9 text-xs" />
        </div>
        <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>تحديث</Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "إجمالي المبيعات", value: fmt(totalsKpi.sales), icon: TrendingUp, color: "text-emerald-500" },
          { label: "إجمالي التحصيلات", value: fmt(totalsKpi.collections), icon: Wallet, color: "text-violet-500" },
          { label: "صافي الربح", value: fmt(totalsKpi.profit), icon: Calculator, color: "text-blue-500" },
          { label: "عمولات مستحقة", value: fmt(totalsKpi.due), icon: FileText, color: "text-amber-500" },
        ].map((s, i) => (
          <Card key={i} className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`h-4 w-4 ${s.color}`} />
              <span className="text-[10px] text-muted-foreground">{s.label}</span>
            </div>
            <p className="text-sm font-bold text-foreground">{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="performance" className="w-full" dir="rtl">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full">
          <TabsTrigger value="performance">أداء البائعين</TabsTrigger>
          <TabsTrigger value="profit">الربحية</TabsTrigger>
          <TabsTrigger value="days">أيام البائعين</TabsTrigger>
          <TabsTrigger value="stock">حركة المخزون</TabsTrigger>
          <TabsTrigger value="commissions">العمولات</TabsTrigger>
        </TabsList>

        {/* Performance */}
        <TabsContent value="performance" className="space-y-3 mt-3">
          <SectionBar title="أداء البائعين" onExport={() => exportExcel(`أداء_البائعين_${dateRangeLabel}.xlsx`, "أداء البائعين", performance.map(p => ({
            "البائع": p.rep_name, "الفواتير": p.invoices_count,
            "المبيعات": Number(p.total_sales.toFixed(2)), "التحصيلات": Number(p.total_collections.toFixed(2)),
            "عمولات مستحقة": Number(p.commissions_due.toFixed(2)), "عمولات مدفوعة": Number(p.commissions_paid.toFixed(2)),
          })))} />
          <DataTable
            headers={["البائع", "الفواتير", "المبيعات", "التحصيلات", "عمولات مستحقة", "عمولات مدفوعة"]}
            rows={performance.map(p => [p.rep_name, String(p.invoices_count), fmt(p.total_sales), fmt(p.total_collections), fmt(p.commissions_due), fmt(p.commissions_paid)])}
            loading={loading}
          />
        </TabsContent>

        {/* Profit */}
        <TabsContent value="profit" className="space-y-3 mt-3">
          <SectionBar title="ربحية مستودع كل بائع" note="تكلفة البضاعة محسوبة من سعر التكلفة في بطاقة الصنف (تقريبية)" onExport={() => exportExcel(`ربحية_البائعين_${dateRangeLabel}.xlsx`, "الربحية", profit.map(p => ({
            "البائع": p.rep_name, "المبيعات": Number(p.sales.toFixed(2)),
            "تكلفة البضاعة": Number(p.cogs.toFixed(2)), "صافي الربح": Number(p.profit.toFixed(2)),
            "هامش %": Number(p.margin_pct.toFixed(2)),
          })))} />
          <DataTable
            headers={["البائع", "المبيعات", "تكلفة البضاعة", "صافي الربح", "هامش %"]}
            rows={profit.map(p => [p.rep_name, fmt(p.sales), fmt(p.cogs), fmt(p.profit), `${p.margin_pct.toFixed(2)}%`])}
            loading={loading}
          />
        </TabsContent>

        {/* Days */}
        <TabsContent value="days" className="space-y-3 mt-3">
          <SectionBar title="أيام البائعين والفروقات النقدية" onExport={() => exportExcel(`أيام_البائعين_${dateRangeLabel}.xlsx`, "أيام البائعين", days.map(d => ({
            "رقم اليوم": d.day_number, "التاريخ": d.day_date, "البائع": d.rep_name, "الحالة": d.status,
            "المبيعات": Number(d.total_sales.toFixed(2)), "التحصيلات": Number(d.total_collections.toFixed(2)),
            "نقدية متوقعة": Number((d.expected_cash || 0).toFixed(2)),
            "نقدية فعلية": Number((d.actual_cash_collected || 0).toFixed(2)),
            "الفرق": Number((d.cash_variance || 0).toFixed(2)),
          })))} />
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    {["رقم اليوم", "التاريخ", "البائع", "الحالة", "المبيعات", "التحصيلات", "الفرق النقدي"].map(h => (
                      <th key={h} className="p-3 text-right font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr>
                  ) : days.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">لا توجد بيانات</td></tr>
                  ) : days.map((d) => {
                    const v = Number(d.cash_variance || 0);
                    const tone = v === 0 ? "default" : v > 0 ? "secondary" : "destructive";
                    const label = v === 0 ? "مطابق" : v > 0 ? `فائض ${fmt(v)}` : `عجز ${fmt(Math.abs(v))}`;
                    return (
                      <tr key={d.id} className="border-b border-border/40 hover:bg-muted/20">
                        <td className="p-3 font-mono text-[11px]">{d.day_number}</td>
                        <td className="p-3">{d.day_date}</td>
                        <td className="p-3 font-medium text-foreground">{d.rep_name}</td>
                        <td className="p-3"><Badge variant={d.status === "open" ? "default" : "outline"}>{d.status === "open" ? "مفتوح" : "مغلق"}</Badge></td>
                        <td className="p-3">{fmt(d.total_sales)}</td>
                        <td className="p-3">{fmt(d.total_collections)}</td>
                        <td className="p-3">{d.status === "closed" ? <Badge variant={tone as any}>{label}</Badge> : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* Stock */}
        <TabsContent value="stock" className="space-y-3 mt-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 max-w-xs">
              <span className="text-xs text-muted-foreground">اختر البائع</span>
              <select className="w-full h-9 px-3 rounded-md border bg-background text-xs" value={stockRepId} onChange={(e) => setStockRepId(e.target.value)}>
                {reps.map(r => <option key={r.id} value={r.id}>{r.full_name}{!r.default_warehouse_id && " (بدون مستودع)"}</option>)}
              </select>
            </div>
            <Button variant="outline" size="sm" onClick={() => exportExcel(`حركة_المخزون_${dateRangeLabel}.xlsx`, "حركة المخزون", stock.map(s => ({
              "الصنف": s.product_name, "وارد (تحميل)": s.in_qty, "صادر (بيع/إرجاع)": s.out_qty, "الصافي": s.net,
            })))} disabled={!stock.length}>
              <Download className="h-4 w-4 ml-1" /> Excel
            </Button>
          </div>
          <DataTable
            headers={["الصنف", "وارد (تحميل)", "صادر (بيع/إرجاع)", "الصافي"]}
            rows={stock.map(s => [s.product_name, fmt(s.in_qty), fmt(s.out_qty), fmt(s.net)])}
            loading={loading}
          />
        </TabsContent>

        {/* Commissions */}
        <TabsContent value="commissions" className="space-y-3 mt-3">
          <SectionBar title="كشف العمولات" onExport={() => exportExcel(`كشف_العمولات_${dateRangeLabel}.xlsx`, "العمولات", ledger.map(c => ({
            "التاريخ": format(new Date(c.created_at), "yyyy-MM-dd"),
            "البائع": c.rep_name, "النوع": c.commission_type,
            "الأساس": Number(c.base_amount.toFixed(2)), "النسبة": Number(c.commission_rate.toFixed(2)),
            "العمولة": Number(c.commission_amount.toFixed(2)),
            "الحالة": c.is_paid ? `مدفوعة ${c.paid_date || ""}` : "مستحقة",
            "البيان": c.reference_description || "",
          })))} />
          <DataTable
            headers={["التاريخ", "البائع", "النوع", "الأساس", "النسبة", "العمولة", "الحالة"]}
            rows={ledger.map(c => [
              format(new Date(c.created_at), "yyyy-MM-dd"),
              c.rep_name, c.commission_type,
              fmt(c.base_amount), `${c.commission_rate}%`, fmt(c.commission_amount),
              c.is_paid ? `مدفوعة ${c.paid_date || ""}` : "مستحقة",
            ])}
            loading={loading}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SectionBar({ title, note, onExport }: { title: string; note?: string; onExport: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div>
        {title && <h3 className="font-bold text-sm text-foreground">{title}</h3>}
        {note && <p className="text-[10px] text-muted-foreground">{note}</p>}
      </div>
      <Button variant="outline" size="sm" onClick={onExport}>
        <Download className="h-4 w-4 ml-1" /> Excel
      </Button>
    </div>
  );
}

function DataTable({ headers, rows, loading }: { headers: string[]; rows: string[][]; loading?: boolean }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {headers.map(h => (
                <th key={h} className="p-3 text-right font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={headers.length} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={headers.length} className="p-8 text-center text-muted-foreground">لا توجد بيانات</td></tr>
            ) : rows.map((r, idx) => (
              <tr key={idx} className="border-b border-border/40 hover:bg-muted/20">
                {r.map((c, i) => (
                  <td key={i} className={`p-3 ${i === 0 ? "font-medium text-foreground" : ""}`}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
