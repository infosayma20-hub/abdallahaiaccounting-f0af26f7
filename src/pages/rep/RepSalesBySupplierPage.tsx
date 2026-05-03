import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronLeft, RefreshCw } from "lucide-react";

type Row = {
  supplier_id: string | null;
  supplier_name: string | null;
  product_id: string;
  product_name: string;
  lines_count: number;
  total_qty: number;
  total_sales: number;
  total_cost: number;
  total_profit: number;
  total_discount: number;
  net_profit: number;
};

type LineDetail = {
  invoice_id: string;
  invoice_number: string | null;
  invoice_date: string;
  salesperson_id: string | null;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  line_profit: number;
  total_amount: number;
  supplier_id: string | null;
};

const fmt = (n: number) => `₪${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function RepSalesBySupplierPage() {
  const today = new Date().toISOString().split("T")[0];
  const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(firstDay);
  const [dateTo, setDateTo] = useState(today);
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [repFilter, setRepFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [lines, setLines] = useState<LineDetail[]>([]);
  const [totalDiscount, setTotalDiscount] = useState(0);
  const [reps, setReps] = useState<Array<{ id: string; full_name: string }>>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: repsData }, { data: supsData }] = await Promise.all([
        (supabase as any)
          .from("sales_representatives")
          .select("id, full_name")
          .eq("is_active", true)
          .order("full_name"),
        (supabase as any).rpc("get_rep_suppliers"),
      ]);
      setReps(repsData || []);
      setSuppliers(supsData || []);
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    // Get invoices in date range matching filter (rep)
    let invQ = (supabase as any)
      .from("invoices")
      .select("id, invoice_number, invoice_date, salesperson_id, status, is_voided, discount_amount")
      .eq("invoice_type", "sales")
      .gte("invoice_date", dateFrom)
      .lte("invoice_date", dateTo)
      .eq("is_voided", false)
      .not("status", "in", "(cancelled,void,reversed)")
      .neq("status", "draft");
    if (repFilter !== "all") invQ = invQ.eq("salesperson_id", repFilter);
    const { data: invs } = await invQ;
    const invMap = new Map<string, any>();
    (invs || [])
      .filter((i: any) => !Boolean(i.is_voided) && !["cancelled", "void", "reversed", "ملغي", "ملغى"].includes((i.status || "").toLowerCase()))
      .forEach((i: any) => invMap.set(i.id, i));
    const invIds = Array.from(invMap.keys());

    if (invIds.length === 0) {
      setRows([]); setLines([]); setTotalDiscount(0); setLoading(false); return;
    }

    let itemsQ = (supabase as any)
      .from("invoice_items")
      .select("invoice_id, product_id, product_name, quantity, unit_price, cost_price, line_profit, total_amount, supplier_id, supplier_name")
      .in("invoice_id", invIds);
    const { data: rawItems } = await itemsQ;

    // Fallback supplier from product.default_supplier_id when invoice_items.supplier_id is null
    const productIds = Array.from(new Set((rawItems || []).map((i: any) => i.product_id).filter(Boolean)));
    let prodSupMap = new Map<string, { id: string | null; name: string | null }>();
    if (productIds.length > 0) {
      const { data: prods } = await (supabase as any)
        .from("products")
        .select("id, default_supplier_id")
        .in("id", productIds);
      const supIds = Array.from(new Set((prods || []).map((p: any) => p.default_supplier_id).filter(Boolean)));
      const supNameMap = new Map<string, string>();
      if (supIds.length > 0) {
        const { data: cts } = await (supabase as any)
          .from("contacts")
          .select("id, contact_name")
          .in("id", supIds);
        (cts || []).forEach((c: any) => supNameMap.set(c.id, c.contact_name));
      }
      (prods || []).forEach((p: any) => {
        prodSupMap.set(p.id, {
          id: p.default_supplier_id || null,
          name: p.default_supplier_id ? (supNameMap.get(p.default_supplier_id) || null) : null,
        });
      });
    }

    // Apply supplier resolution + supplier filter (after fallback)
    const enriched = (rawItems || []).map((it: any) => {
      let sId = it.supplier_id || null;
      let sName = it.supplier_name || null;
      if (!sId) {
        const fb = prodSupMap.get(it.product_id);
        if (fb?.id) { sId = fb.id; sName = fb.name; }
      }
      return { ...it, _resolved_supplier_id: sId, _resolved_supplier_name: sName };
    });
    const items = enriched.filter((it: any) => {
      if (supplierFilter === "all") return true;
      if (supplierFilter === "none") return !it._resolved_supplier_id;
      return it._resolved_supplier_id === supplierFilter;
    });

    const detailRows: LineDetail[] = (items || []).map((it: any) => {
      const inv = invMap.get(it.invoice_id) || {};
      return {
        invoice_id: it.invoice_id,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        salesperson_id: inv.salesperson_id,
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: Number(it.quantity || 0),
        unit_price: Number(it.unit_price || 0),
        cost_price: Number(it.cost_price || 0),
        line_profit: Number(it.line_profit || ((Number(it.unit_price||0) - Number(it.cost_price||0)) * Number(it.quantity||0))),
        total_amount: Number(it.total_amount || 0),
        supplier_id: it._resolved_supplier_id,
      };
    });

    // aggregate per supplier
    const supMap = new Map<string, Row>();
    (items || []).forEach((it: any) => {
      const key = it._resolved_supplier_id || "__none__";
      const cur = supMap.get(key) || {
        supplier_id: it._resolved_supplier_id,
        supplier_name: it._resolved_supplier_name || "بدون مورد",
        product_id: "",
        product_name: "",
        lines_count: 0,
        total_qty: 0,
        total_sales: 0,
        total_cost: 0,
        total_profit: 0,
        total_discount: 0,
        net_profit: 0,
      };
      cur.lines_count += 1;
      cur.total_qty += Number(it.quantity || 0);
      cur.total_sales += Number(it.total_amount || 0);
      const cost = Number(it.cost_price || 0) * Number(it.quantity || 0);
      cur.total_cost += cost;
      cur.total_profit += Number(it.line_profit || (Number(it.total_amount || 0) - cost));
      supMap.set(key, cur);
    });

    // Compute total discount from filtered invoices (only those that contributed items after filter)
    const contributingInvIds = new Set<string>((items || []).map((i: any) => i.invoice_id as string));
    const discTotal = Array.from(contributingInvIds).reduce<number>((s, id) => {
      const inv = invMap.get(id);
      return s + Number(inv?.discount_amount || 0);
    }, 0);
    const totalSales = Array.from(supMap.values()).reduce((s, r) => s + r.total_sales, 0);
    const aggregated = Array.from(supMap.values()).map(r => {
      const share = totalSales > 0 ? (r.total_sales / totalSales) : 0;
      const supDisc = discTotal * share;
      return { ...r, total_discount: supDisc, net_profit: r.total_profit - supDisc };
    }).sort((a, b) => b.total_sales - a.total_sales);
    setRows(aggregated);
    setTotalDiscount(discTotal);
    setLines(detailRows);
    console.log("[SalesBySupplier] invoices:", invIds.length, "items:", (rawItems||[]).length, "after-filter:", items.length, "with-supplier:", items.filter((i:any)=>i._resolved_supplier_id).length, "fallback:", items.filter((i:any)=>!i.supplier_id && i._resolved_supplier_id).length);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const supplierOptions = useMemo(
    () => suppliers.map(s => [s.id, s.name] as const),
    [suppliers]
  );

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    sales: acc.sales + r.total_sales,
    cost: acc.cost + r.total_cost,
    profit: acc.profit + r.total_profit,
    qty: acc.qty + r.total_qty,
    lines: acc.lines + r.lines_count,
  }), { sales: 0, cost: 0, profit: 0, qty: 0, lines: 0 }), [rows]);

  const netProfit = totals.profit - totalDiscount;

  const repName = (id: string | null) => reps.find(r => r.id === id)?.full_name || "—";

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <h1 className="text-xl font-bold text-foreground">📊 المبيعات حسب المورد</h1>

      <Card className="p-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <Label className="text-xs">من</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 text-xs" />
          </div>
          <div>
            <Label className="text-xs">إلى</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 text-xs" />
          </div>
          <div>
            <Label className="text-xs">المندوب</Label>
            <Select value={repFilter} onValueChange={setRepFilter}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المندوبين</SelectItem>
                {reps.map(r => <SelectItem key={r.id} value={r.id}>{r.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">المورد</Label>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الموردين</SelectItem>
                <SelectItem value="none">بدون مورد</SelectItem>
                {supplierOptions
                  .map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={load} disabled={loading} size="sm" className="gap-2 h-9">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            تشغيل
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card className="p-3"><div className="text-[10px] text-muted-foreground">المبيعات</div><div className="font-bold">{fmt(totals.sales)}</div></Card>
        <Card className="p-3"><div className="text-[10px] text-muted-foreground">التكلفة</div><div className="font-bold">{fmt(totals.cost)}</div></Card>
        <Card className="p-3"><div className="text-[10px] text-muted-foreground">الخصم المسموح به</div><div className="font-bold text-orange-500">{fmt(totalDiscount)}</div></Card>
        <Card className="p-3">
          <div className="text-[10px] text-muted-foreground">الربح بعد الخصم</div>
          <div className="font-bold" style={{ color: netProfit >= 0 ? "#16A34A" : "#DC2626" }}>{fmt(netProfit)}</div>
          {totalDiscount > 0 && (
            <div className="text-[9px] text-muted-foreground mt-0.5">قبل الخصم: {fmt(totals.profit)} — الخصم: {fmt(totalDiscount)}</div>
          )}
        </Card>
        <Card className="p-3"><div className="text-[10px] text-muted-foreground">عدد البنود</div><div className="font-bold">{totals.lines}</div></Card>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
              <th className="text-right py-3 px-3 w-8"></th>
              <th className="text-right py-3 px-3">المورد</th>
              <th className="text-right py-3 px-2">عدد البنود</th>
              <th className="text-right py-3 px-2">إجمالي الكمية</th>
              <th className="text-right py-3 px-2">المبيعات</th>
              <th className="text-right py-3 px-2">التكلفة</th>
              <th className="text-right py-3 px-2">الخصم</th>
              <th className="text-right py-3 px-2">الربح بعد الخصم</th>
              <th className="text-right py-3 px-2">هامش %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const key = r.supplier_id || "__none__";
              const isOpen = expanded === key;
              const detail = lines.filter(l => (l.supplier_id || "__none__") === key);
              return (
                <>
                  <tr key={key} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => setExpanded(isOpen ? null : key)}>
                    <td className="py-2.5 px-3">{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}</td>
                    <td className="py-2.5 px-3 font-medium">{r.supplier_name || "بدون مورد"}</td>
                    <td className="py-2.5 px-2">{r.lines_count}</td>
                    <td className="py-2.5 px-2">{r.total_qty.toLocaleString()}</td>
                    <td className="py-2.5 px-2">{fmt(r.total_sales)}</td>
                    <td className="py-2.5 px-2">{fmt(r.total_cost)}</td>
                    <td className="py-2.5 px-2 text-orange-500">{fmt(r.total_discount)}</td>
                    <td className="py-2.5 px-2 font-medium" style={{ color: r.net_profit >= 0 ? "#16A34A" : "#DC2626" }}>{fmt(r.net_profit)}</td>
                    <td className="py-2.5 px-2">{r.total_sales > 0 ? ((r.net_profit / r.total_sales) * 100).toFixed(1) : 0}%</td>
                  </tr>
                  {isOpen && (
                    <tr key={key + "_d"} className="bg-muted/10">
                      <td colSpan={9} className="p-3">
                        <div className="overflow-x-auto rounded border border-border/60">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/40 text-[10px] text-muted-foreground">
                              <tr>
                                <th className="text-right py-2 px-2">التاريخ</th>
                                <th className="text-right py-2 px-2">رقم الفاتورة</th>
                                <th className="text-right py-2 px-2">المندوب</th>
                                <th className="text-right py-2 px-2">الصنف</th>
                                <th className="text-right py-2 px-2">الكمية</th>
                                <th className="text-right py-2 px-2">سعر البيع</th>
                                <th className="text-right py-2 px-2">التكلفة</th>
                                <th className="text-right py-2 px-2">الربح</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.map((l, i) => (
                                <tr key={i} className="border-t border-border/40">
                                  <td className="py-1.5 px-2">{l.invoice_date}</td>
                                  <td className="py-1.5 px-2 font-mono">{l.invoice_number || "—"}</td>
                                  <td className="py-1.5 px-2">{repName(l.salesperson_id)}</td>
                                  <td className="py-1.5 px-2">{l.product_name}</td>
                                  <td className="py-1.5 px-2">{l.quantity}</td>
                                  <td className="py-1.5 px-2">{fmt(l.unit_price)}</td>
                                  <td className="py-1.5 px-2">{fmt(l.cost_price)}</td>
                                  <td className="py-1.5 px-2" style={{ color: l.line_profit >= 0 ? "#16A34A" : "#DC2626" }}>{fmt(l.line_profit)}</td>
                                </tr>
                              ))}
                              {detail.length === 0 && (
                                <tr><td colSpan={9} className="text-center py-3 text-muted-foreground">لا بنود</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground text-center py-8">لا توجد مبيعات في الفترة المحددة</p>
        )}
      </Card>
    </div>
  );
}