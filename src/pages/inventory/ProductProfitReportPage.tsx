import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FinanceShell } from "@/components/finance/shell";
import { ColumnHeaderMenu } from "@/components/finance/shell/ColumnHeaderMenu";
import type { ActionTab, FilterCondition, FilterField } from "@/components/finance/shell";
import { applyFilters } from "@/components/finance/shell";
import { ArrowRight, Download, RefreshCw, Search, Printer } from "lucide-react";
import { toast } from "sonner";

interface Row {
  productId: string | null;
  name: string;
  sku: string | null;
  category: string | null;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
  missingCost: boolean;
  posRevenue: number;
  invoiceRevenue: number;
  currentStock: number;
  buyPrice: number;
  sellPrice: number;
}

type SortKey = keyof Pick<Row, "sku" | "name" | "category" | "qty" | "revenue" | "cost" | "profit" | "marginPct" | "currentStock">;
type QuickOp = "begins_with" | "contains" | "equals";

const money = (n: number) => `₪${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "sku", label: "الكود" },
  { key: "name", label: "الصنف" },
  { key: "category", label: "الفئة" },
  { key: "qty", label: "الكمية", numeric: true },
  { key: "revenue", label: "الإيراد", numeric: true },
  { key: "cost", label: "التكلفة", numeric: true },
  { key: "profit", label: "الربح", numeric: true },
  { key: "marginPct", label: "الهامش %", numeric: true },
  { key: "currentStock", label: "الرصيد الحالي", numeric: true },
];

export default function ProductProfitReportPage() {
  const navigate = useNavigate();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [colFilters, setColFilters] = useState<Record<string, { value: string; operator: QuickOp }>>({});
  const [sortKey, setSortKey] = useState<SortKey>("profit");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("get_product_profitability", { p_from: from, p_to: to });
    setLoading(false);
    if (error) { toast.error("تعذّر تحميل التقرير: " + error.message); return; }
    setRows(((data as any[]) || []).map((r) => ({
      ...r,
      qty: Number(r.qty || 0), revenue: Number(r.revenue || 0), cost: Number(r.cost || 0),
      profit: Number(r.profit || 0), marginPct: Number(r.marginPct || 0),
      missingCost: Boolean(r.missingCost),
      posRevenue: Number(r.posRevenue || 0), invoiceRevenue: Number(r.invoiceRevenue || 0),
      currentStock: Number(r.currentStock || 0), buyPrice: Number(r.buyPrice || 0), sellPrice: Number(r.sellPrice || 0),
    })));
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const categories = useMemo(
    () => Array.from(new Set(rows.map(r => r.category).filter(Boolean))) as string[],
    [rows]
  );

  const filterFields: FilterField[] = useMemo(() => [
    { key: "sku", label: "الكود", type: "text" },
    { key: "name", label: "الصنف", type: "text" },
    { key: "category", label: "الفئة", type: "option", options: categories.map(c => ({ value: c, label: c })) },
    { key: "qty", label: "الكمية المباعة", type: "number" },
    { key: "revenue", label: "الإيراد", type: "number" },
    { key: "profit", label: "الربح", type: "number" },
    { key: "marginPct", label: "الهامش %", type: "number" },
    { key: "currentStock", label: "الرصيد الحالي", type: "number" },
  ], [categories]);

  const visible = useMemo(() => {
    let data = [...rows];
    const term = q.trim().toLowerCase();
    if (term) {
      data = data.filter(r =>
        (r.name || "").toLowerCase().includes(term) ||
        (r.sku || "").toLowerCase().includes(term) ||
        (r.category || "").toLowerCase().includes(term));
    }
    Object.entries(colFilters).forEach(([key, f]) => {
      if (!f?.value) return;
      const v = f.value.toLowerCase();
      data = data.filter(r => {
        const cell = String((r as any)[key] ?? "").toLowerCase();
        if (f.operator === "equals") return cell === v;
        if (f.operator === "contains") return cell.includes(v);
        return cell.startsWith(v);
      });
    });
    if (filters.length) data = applyFilters(data, filters);

    const dir = sortDir === "asc" ? 1 : -1;
    data.sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      if (typeof av === "number" || typeof bv === "number") return ((av || 0) - (bv || 0)) * dir;
      return String(av ?? "").localeCompare(String(bv ?? ""), "ar") * dir;
    });
    return data;
  }, [rows, q, colFilters, filters, sortKey, sortDir]);

  const totals = useMemo(() => visible.reduce((a, r) => ({
    qty: a.qty + r.qty, revenue: a.revenue + r.revenue, cost: a.cost + r.cost, profit: a.profit + r.profit,
  }), { qty: 0, revenue: 0, cost: 0, profit: 0 }), [visible]);

  const exportCsv = useCallback(() => {
    if (visible.length === 0) { toast.error("لا توجد بيانات للتصدير"); return; }
    const esc = (v: any) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const headers = COLUMNS.map(c => c.label);
    const body = visible.map(r => COLUMNS.map(c => (r as any)[c.key] ?? ""));
    const totalRow = COLUMNS.map(c => {
      if (c.key === "name") return "الإجمالي";
      if (c.key === "qty") return totals.qty;
      if (c.key === "revenue") return totals.revenue;
      if (c.key === "cost") return totals.cost;
      if (c.key === "profit") return totals.profit;
      if (c.key === "marginPct") return totals.revenue ? Number(((totals.profit / totals.revenue) * 100).toFixed(2)) : 0;
      return "";
    });
    const csv = "\uFEFF" + [headers, ...body, totalRow].map(r => r.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `product-profit-${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [visible, totals, from, to]);

  const actionTabs: ActionTab[] = useMemo(() => [{
    key: "general",
    label: "عام",
    groups: [
      {
        key: "data", label: "البيانات",
        items: [
          { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: load, variant: "primary" },
          { key: "back", label: "رجوع للمخزون", icon: ArrowRight, onClick: () => navigate("/inventory") },
        ],
      },
      {
        key: "out", label: "تصدير",
        items: [
          { key: "excel", label: "تصدير Excel", icon: Download, onClick: exportCsv, disabled: visible.length === 0 },
          { key: "print", label: "طباعة", icon: Printer, onClick: () => window.print(), disabled: visible.length === 0 },
        ],
      },
    ],
  }], [load, navigate, exportCsv, visible.length]);

  return (
    <FinanceShell
      title="تقرير ربحية الأصناف"
      subtitle="الإيراد والتكلفة والربح لكل صنف من نقاط البيع وفواتير المبيعات"
      breadcrumb={[{ label: "النظام", href: "/" }, { label: "المخزون", href: "/inventory" }, { label: "ربحية الأصناف" }]}
      actionTabs={actionTabs}
      filterFields={filterFields}
      storageKey="product-profit-report"
      filters={filters}
      onFiltersChange={setFilters}
    >
      <div className="space-y-3">
        <Card>
          <CardContent className="p-3 flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">من</label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 w-40" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">إلى</label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 w-40" />
            </div>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالصنف أو الكود..." className="h-9 pr-8" />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: "الكمية المباعة", value: totals.qty.toLocaleString() },
            { label: "إجمالي الإيراد", value: money(totals.revenue) },
            { label: "إجمالي التكلفة", value: money(totals.cost) },
            { label: "صافي الربح", value: money(totals.profit), negative: totals.profit < 0 },
          ].map((k, i) => (
            <div key={i} className="px-3 py-2 rounded border border-border bg-card">
              <p className={`text-sm font-semibold tabular-nums ${k.negative ? "text-destructive" : "text-foreground"}`}>{k.value}</p>
              <p className="text-[10px] text-muted-foreground">{k.label}</p>
            </div>
          ))}
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 border-b border-border">
                <tr>
                  {COLUMNS.map(c => (
                    <th
                      key={c.key}
                      className="px-2 py-2 text-right whitespace-nowrap [&_button]:text-primary-foreground [&_button:hover]:text-primary-foreground [&_svg]:text-primary-foreground"
                    >
                      <ColumnHeaderMenu
                        label={c.label}
                        active={sortKey === c.key}
                        direction={sortKey === c.key ? sortDir : null}
                        onSort={(dir) => { setSortKey(c.key); setSortDir(dir); }}
                        currentFilterValue={colFilters[c.key]?.value}
                        onFilter={(value, operator) => setColFilters(p => ({ ...p, [c.key]: { value, operator } }))}
                        onClear={() => setColFilters(p => { const n = { ...p }; delete n[c.key]; return n; })}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (<tr><td colSpan={COLUMNS.length} className="py-8 text-center text-muted-foreground">جارٍ التحميل…</td></tr>)}
                {!loading && visible.length === 0 && (<tr><td colSpan={COLUMNS.length} className="py-8 text-center text-muted-foreground">لا توجد بيانات للفترة المحددة</td></tr>)}
                {!loading && visible.map((r, i) => (
                  <tr key={(r.productId || r.name) + i} className="border-b border-border hover:bg-muted/40">
                    <td className="px-2 py-1.5 font-mono text-[11px]">{r.sku || "—"}</td>
                    <td className="px-2 py-1.5">{r.name}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{r.category || "—"}</td>
                    <td className="px-2 py-1.5 tabular-nums">{r.qty.toLocaleString()}</td>
                    <td className="px-2 py-1.5 tabular-nums">{money(r.revenue)}</td>
                    <td className="px-2 py-1.5 tabular-nums">{money(r.cost)}</td>
                    <td className={`px-2 py-1.5 tabular-nums font-semibold ${r.profit < 0 ? "text-destructive" : ""}`}>
                      {money(r.profit)}
                      {r.missingCost && (
                        <span className="mr-1 text-[10px] text-amber-600 dark:text-amber-400" title="بعض البنود بلا تكلفة محفوظة — الربح والهامش غير دقيقين لهذا الصنف">⚠ تكلفة ناقصة</span>
                      )}
                    </td>
                    <td className={`px-2 py-1.5 tabular-nums ${r.marginPct < 0 ? "text-destructive" : ""}`}>{r.marginPct.toFixed(1)}%</td>
                    <td className={`px-2 py-1.5 tabular-nums ${r.currentStock < 0 ? "text-destructive" : ""}`}>{r.currentStock.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              {!loading && visible.length > 0 && (
                <tfoot className="bg-muted/50 border-t-2 border-border font-semibold">
                  <tr>
                    <td className="px-2 py-2" colSpan={3}>الإجمالي ({visible.length} صنف)</td>
                    <td className="px-2 py-2 tabular-nums">{totals.qty.toLocaleString()}</td>
                    <td className="px-2 py-2 tabular-nums">{money(totals.revenue)}</td>
                    <td className="px-2 py-2 tabular-nums">{money(totals.cost)}</td>
                    <td className={`px-2 py-2 tabular-nums ${totals.profit < 0 ? "text-destructive" : ""}`}>{money(totals.profit)}</td>
                    <td className="px-2 py-2 tabular-nums">{totals.revenue ? ((totals.profit / totals.revenue) * 100).toFixed(1) : "0.0"}%</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </CardContent>
        </Card>
      </div>
    </FinanceShell>
  );
}
