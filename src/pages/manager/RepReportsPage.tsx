import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Download, CheckCircle2, AlertTriangle, BarChart3 } from "lucide-react";
import * as XLSX from "xlsx";

const fmt = (n: number) => `₪${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const num = (n: any) => Number(n || 0);

const SALES_TYPES = ["sale", "sales"];
const STATUS_EXCLUDE = ["cancelled", "void", "reversed", "draft", "ملغي", "ملغى"];

type Row = Record<string, any>;

type Filters = {
  from: string;
  to: string;
  repId: string;
  contactId: string;
  supplierId: string;
  productId: string;
};

function exportXlsx(rows: Row[], cols: { key: string; label: string }[], name: string) {
  const data = rows.map((r) => {
    const o: Row = {};
    cols.forEach((c) => (o[c.label] = r[c.key]));
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `${name}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function RepReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [filters, setFilters] = useState<Filters>({
    from: monthStart,
    to: today,
    repId: "all",
    contactId: "all",
    supplierId: "all",
    productId: "all",
  });
  const [reps, setReps] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("by_rep");

  // Raw working set for the period (filtered by from/to + rep/contact)
  const [invs, setInvs] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [returns, setReturns] = useState<any[]>([]);
  const [collTxs, setCollTxs] = useState<any[]>([]);
  const [expenseTxs, setExpenseTxs] = useState<any[]>([]);
  const [productSupMap, setProductSupMap] = useState<Map<string, { id: string | null; name: string | null }>>(new Map());

  // Load lookups once
  useEffect(() => {
    (async () => {
      const [{ data: r }, { data: c }, { data: s }, { data: p }] = await Promise.all([
        (supabase as any).from("sales_representatives").select("id, full_name, user_id, auth_user_id").eq("is_active", true).order("full_name"),
        (supabase as any).from("contacts").select("id, contact_name, contact_type").in("contact_type", ["customer", "both"]).eq("is_archived", false).order("contact_name").limit(2000),
        (supabase as any).from("contacts").select("id, contact_name").in("contact_type", ["supplier", "both"]).eq("is_archived", false).order("contact_name").limit(2000),
        (supabase as any).from("products").select("id, name_ar, name").order("name_ar").limit(3000),
      ]);
      setReps(r || []);
      setContacts(c || []);
      setSuppliers(s || []);
      setProducts(p || []);
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      // 1) Invoices in window
      let invQ = (supabase as any)
        .from("invoices")
        .select("id, invoice_number, invoice_date, salesperson_id, contact_id, contact_name, status, is_voided, discount_amount, subtotal, total_amount, payment_method, invoice_type, created_at, user_id")
        .in("invoice_type", SALES_TYPES)
        .gte("invoice_date", filters.from)
        .lte("invoice_date", filters.to)
        .eq("is_voided", false);
      if (filters.repId !== "all") invQ = invQ.eq("salesperson_id", filters.repId);
      if (filters.contactId !== "all") invQ = invQ.eq("contact_id", filters.contactId);
      const { data: rawInvs } = await invQ;
      const invList = (rawInvs || []).filter(
        (i: any) => !STATUS_EXCLUDE.includes((i.status || "").toLowerCase()),
      );
      const invIds = invList.map((i: any) => i.id);
      const invMap = new Map<string, any>(invList.map((i: any) => [i.id, i]));

      // 2) Items
      let rawItems: any[] = [];
      if (invIds.length) {
        const { data } = await (supabase as any)
          .from("invoice_items")
          .select("id, invoice_id, product_id, product_name, quantity, unit_price, cost_price, line_profit, total_amount, supplier_id, supplier_name");
        // chunk-safer: just do .in
        const { data: items2 } = await (supabase as any)
          .from("invoice_items")
          .select("id, invoice_id, product_id, product_name, quantity, unit_price, cost_price, line_profit, total_amount, supplier_id, supplier_name")
          .in("invoice_id", invIds);
        rawItems = items2 || [];
      }
      // product->supplier fallback
      const pids = Array.from(new Set(rawItems.map((i) => i.product_id).filter(Boolean)));
      const pSupMap = new Map<string, { id: string | null; name: string | null }>();
      if (pids.length) {
        const { data: prods } = await (supabase as any).from("products").select("id, default_supplier_id").in("id", pids);
        const supIds = Array.from(new Set((prods || []).map((p: any) => p.default_supplier_id).filter(Boolean)));
        const supName = new Map<string, string>();
        if (supIds.length) {
          const { data: cts } = await (supabase as any).from("contacts").select("id, contact_name").in("id", supIds);
          (cts || []).forEach((c: any) => supName.set(c.id, c.contact_name));
        }
        (prods || []).forEach((p: any) =>
          pSupMap.set(p.id, { id: p.default_supplier_id || null, name: p.default_supplier_id ? supName.get(p.default_supplier_id) || null : null }),
        );
      }
      // apply supplier/product filter
      let filteredItems = rawItems.map((it) => {
        let sId = it.supplier_id || null;
        let sName = it.supplier_name || null;
        if (!sId) {
          const fb = pSupMap.get(it.product_id);
          if (fb?.id) { sId = fb.id; sName = fb.name; }
        }
        return { ...it, _sid: sId, _sname: sName };
      });
      if (filters.supplierId !== "all") {
        filteredItems = filteredItems.filter((i) =>
          filters.supplierId === "none" ? !i._sid : i._sid === filters.supplierId,
        );
      }
      if (filters.productId !== "all") {
        filteredItems = filteredItems.filter((i) => i.product_id === filters.productId);
      }

      // 3) Returns
      let retQ = (supabase as any)
        .from("returns")
        .select("id, return_number, return_date, contact_id, contact_name, related_invoice_id, total_amount, status, is_deleted")
        .gte("return_date", filters.from)
        .lte("return_date", filters.to)
        .eq("is_deleted", false)
        .eq("return_type", "sales_return");
      const { data: rawReturns } = await retQ;
      let retList = (rawReturns || []).filter((r: any) => !STATUS_EXCLUDE.includes((r.status || "").toLowerCase()));
      // restrict returns by linked invoice's salesperson if rep filter active
      if (filters.repId !== "all" || filters.contactId !== "all") {
        const validInvIds = new Set(invIds);
        retList = retList.filter((r: any) => !r.related_invoice_id || validInvIds.has(r.related_invoice_id));
      }

      // 4) Transactions for collections / expenses (use notes JSON tag)
      const { data: rawTxs } = await (supabase as any)
        .from("transactions")
        .select("id, amount, notes, payment_method, debit_account_code, credit_account_code, transaction_type, reversed_by_id, transaction_date, description, contact_id, expense_category, is_deleted")
        .gte("transaction_date", filters.from)
        .lte("transaction_date", filters.to)
        .eq("is_deleted", false);

      const allowedRepIds = new Set<string>(
        filters.repId === "all" ? reps.map((r) => r.id) : [filters.repId],
      );
      const tagged = (rawTxs || []).filter((t: any) => {
        if (t.reversed_by_id) return false;
        if (t.transaction_type === "reversal") return false;
        try {
          const meta = JSON.parse(t.notes || "{}");
          if (!meta?.rep_id) return false;
          return allowedRepIds.has(meta.rep_id);
        } catch {
          return false;
        }
      });
      const expensesTx = tagged.filter((t: any) => t.payment_method === "rep_expense");
      const collectionsTx = tagged.filter((t: any) => {
        try {
          const m = JSON.parse(t.notes || "{}");
          return m?.tag === "REP-RECEIPT" || m?.tag === "REP-COLLECTION" || (t.transaction_type === "receipt");
        } catch { return false; }
      });

      setInvs(invList);
      setItems(filteredItems);
      setReturns(retList);
      setCollTxs(collectionsTx);
      setExpenseTxs(expensesTx);
      setProductSupMap(pSupMap);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const repName = (id: string | null) => reps.find((r) => r.id === id)?.full_name || "—";

  // ===== Aggregations =====
  const itemsByInvoice = useMemo(() => {
    const m = new Map<string, any[]>();
    items.forEach((it) => {
      if (!m.has(it.invoice_id)) m.set(it.invoice_id, []);
      m.get(it.invoice_id)!.push(it);
    });
    return m;
  }, [items]);

  // KPIs (period-wide)
  const kpi = useMemo(() => {
    const sales = items.reduce((s, i) => s + num(i.total_amount), 0);
    const cost = items.reduce((s, i) => s + num(i.cost_price) * num(i.quantity), 0);
    const grossProfit = items.reduce((s, i) => s + num(i.line_profit ?? num(i.total_amount) - num(i.cost_price) * num(i.quantity)), 0);
    const contributingInv = new Set(items.map((i) => i.invoice_id));
    const discount = Array.from(contributingInv).reduce((s, id) => s + num(invMap(id, invs)?.discount_amount), 0);
    const netProfit = grossProfit - discount;
    const returnsTotal = returns.reduce((s, r) => s + num(r.total_amount), 0);
    const collTotal = collTxs.reduce((s, t) => s + num(t.amount), 0);
    const expTotal = expenseTxs.reduce((s, t) => s + num(t.amount), 0);
    return {
      invoices: contributingInv.size,
      lines: items.length,
      sales, cost, discount, grossProfit, netProfit,
      returns: returnsTotal,
      collections: collTotal,
      expenses: expTotal,
    };
  }, [items, invs, returns, collTxs, expenseTxs]);

  // ===== Reports =====
  const byRep = useMemo(() => {
    const m = new Map<string, any>();
    items.forEach((it) => {
      const inv = invMap(it.invoice_id, invs);
      if (!inv) return;
      const k = inv.salesperson_id || "__none__";
      if (!m.has(k)) m.set(k, {
        rep_id: inv.salesperson_id, rep_name: repName(inv.salesperson_id),
        invoices: new Set<string>(), customers: new Set<string>(),
        lines: 0, qty: 0, sales: 0, cost: 0, discount: 0, profit: 0,
      });
      const r = m.get(k);
      r.invoices.add(inv.id);
      if (inv.contact_id) r.customers.add(inv.contact_id);
      r.lines += 1;
      r.qty += num(it.quantity);
      r.sales += num(it.total_amount);
      r.cost += num(it.cost_price) * num(it.quantity);
      r.profit += num(it.line_profit ?? num(it.total_amount) - num(it.cost_price) * num(it.quantity));
    });
    // distribute discounts per invoice once
    invs.forEach((inv) => {
      if (!num(inv.discount_amount)) return;
      const k = inv.salesperson_id || "__none__";
      if (!m.has(k)) return;
      // only count if some item from this invoice contributed
      if (!items.some((it) => it.invoice_id === inv.id)) return;
      m.get(k).discount += num(inv.discount_amount);
    });
    return Array.from(m.values()).map((r) => ({
      ...r,
      invoices: r.invoices.size,
      customers: r.customers.size,
      net_profit: r.profit - r.discount,
      margin: r.sales > 0 ? ((r.profit - r.discount) / r.sales) * 100 : 0,
    })).sort((a, b) => b.sales - a.sales);
  }, [items, invs, reps]);

  const byCustomer = useMemo(() => {
    const m = new Map<string, any>();
    items.forEach((it) => {
      const inv = invMap(it.invoice_id, invs);
      if (!inv) return;
      const k = inv.contact_id || "__none__";
      if (!m.has(k)) m.set(k, {
        contact_id: inv.contact_id,
        contact_name: inv.contact_name || (inv.contact_id ? "—" : "نقدي/عابر"),
        invoices: new Set<string>(), last_date: inv.invoice_date,
        sales: 0, cost: 0, discount: 0, profit: 0, qty: 0,
        topProductMap: new Map<string, number>(),
      });
      const r = m.get(k);
      r.invoices.add(inv.id);
      if (inv.invoice_date > r.last_date) r.last_date = inv.invoice_date;
      r.qty += num(it.quantity);
      r.sales += num(it.total_amount);
      r.cost += num(it.cost_price) * num(it.quantity);
      r.profit += num(it.line_profit ?? num(it.total_amount) - num(it.cost_price) * num(it.quantity));
      r.topProductMap.set(it.product_name, (r.topProductMap.get(it.product_name) || 0) + num(it.total_amount));
    });
    invs.forEach((inv) => {
      if (!num(inv.discount_amount)) return;
      const k = inv.contact_id || "__none__";
      if (!m.has(k)) return;
      if (!items.some((it) => it.invoice_id === inv.id)) return;
      m.get(k).discount += num(inv.discount_amount);
    });
    // collections by customer
    const collByContact = new Map<string, number>();
    collTxs.forEach((t) => {
      if (!t.contact_id) return;
      collByContact.set(t.contact_id, (collByContact.get(t.contact_id) || 0) + num(t.amount));
    });
    return Array.from(m.values()).map((r) => {
      const top = Array.from(r.topProductMap.entries() as Iterable<[string, number]>).sort((a, b) => b[1] - a[1])[0];
      return {
        ...r,
        invoices: r.invoices.size,
        net_profit: r.profit - r.discount,
        margin: r.sales > 0 ? ((r.profit - r.discount) / r.sales) * 100 : 0,
        collections: r.contact_id ? collByContact.get(r.contact_id) || 0 : 0,
        balance: r.sales - r.discount - (r.contact_id ? collByContact.get(r.contact_id) || 0 : 0),
        top_product: top ? top[0] : "—",
      };
    }).sort((a, b) => b.sales - a.sales);
  }, [items, invs, collTxs]);

  const byProduct = useMemo(() => {
    const m = new Map<string, any>();
    items.forEach((it) => {
      const k = it.product_id || it.product_name;
      if (!m.has(k)) m.set(k, {
        product_id: it.product_id, product_name: it.product_name,
        supplier: it._sname || "—",
        invoices: new Set<string>(),
        qty: 0, sales: 0, cost: 0, profit: 0,
        priceSum: 0, costSum: 0, n: 0,
      });
      const r = m.get(k);
      r.invoices.add(it.invoice_id);
      r.qty += num(it.quantity);
      r.sales += num(it.total_amount);
      r.cost += num(it.cost_price) * num(it.quantity);
      r.profit += num(it.line_profit ?? num(it.total_amount) - num(it.cost_price) * num(it.quantity));
      r.priceSum += num(it.unit_price);
      r.costSum += num(it.cost_price);
      r.n += 1;
    });
    return Array.from(m.values()).map((r) => ({
      ...r,
      invoices: r.invoices.size,
      avg_price: r.n ? r.priceSum / r.n : 0,
      avg_cost: r.n ? r.costSum / r.n : 0,
      margin: r.sales > 0 ? (r.profit / r.sales) * 100 : 0,
    })).sort((a, b) => b.sales - a.sales);
  }, [items]);

  const bySupplier = useMemo(() => {
    const m = new Map<string, any>();
    items.forEach((it) => {
      const k = it._sid || "__none__";
      if (!m.has(k)) m.set(k, {
        supplier_id: it._sid, supplier_name: it._sname || "بدون مورد",
        lines: 0, qty: 0, sales: 0, cost: 0, profit: 0,
      });
      const r = m.get(k);
      r.lines += 1;
      r.qty += num(it.quantity);
      r.sales += num(it.total_amount);
      r.cost += num(it.cost_price) * num(it.quantity);
      r.profit += num(it.line_profit ?? num(it.total_amount) - num(it.cost_price) * num(it.quantity));
    });
    const totalSales = Array.from(m.values()).reduce((s, r) => s + r.sales, 0);
    const contributingInv = new Set(items.map((i) => i.invoice_id));
    const discTotal = Array.from(contributingInv).reduce((s, id) => s + num(invMap(id, invs)?.discount_amount), 0);
    return Array.from(m.values()).map((r) => {
      const share = totalSales > 0 ? r.sales / totalSales : 0;
      const supDisc = discTotal * share;
      return {
        ...r,
        discount: supDisc,
        net_profit: r.profit - supDisc,
        margin: r.sales > 0 ? ((r.profit - supDisc) / r.sales) * 100 : 0,
      };
    }).sort((a, b) => b.sales - a.sales);
  }, [items, invs]);

  const collectionsRpt = useMemo(() => {
    const m = new Map<string, any>();
    collTxs.forEach((t) => {
      let repId = "__none__";
      try { repId = JSON.parse(t.notes || "{}")?.rep_id || "__none__"; } catch {}
      if (!m.has(repId)) m.set(repId, {
        rep_id: repId, rep_name: repName(repId),
        cash: 0, cheque: 0, bank: 0, other: 0, count: 0, total: 0,
      });
      const r = m.get(repId);
      r.count += 1; r.total += num(t.amount);
      const meth = (t.payment_method || "").toLowerCase();
      if (meth === "cash") r.cash += num(t.amount);
      else if (meth === "cheque" || meth === "check") r.cheque += num(t.amount);
      else if (meth === "bank" || meth === "transfer") r.bank += num(t.amount);
      else r.other += num(t.amount);
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [collTxs, reps]);

  const expensesRpt = useMemo(() => {
    const m = new Map<string, any>();
    expenseTxs.forEach((t) => {
      const cat = t.expense_category || (() => { try { return JSON.parse(t.notes || "{}")?.expense_type || "أخرى"; } catch { return "أخرى"; } })();
      const acc = t.debit_account_code || "—";
      const k = `${cat}|${acc}`;
      if (!m.has(k)) m.set(k, { category: cat, account: acc, count: 0, total: 0 });
      const r = m.get(k);
      r.count += 1; r.total += num(t.amount);
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [expenseTxs]);

  const returnsRpt = useMemo(() => {
    const byCust = new Map<string, any>();
    returns.forEach((r) => {
      const k = r.contact_id || "__none__";
      if (!byCust.has(k)) byCust.set(k, { contact_id: r.contact_id, contact_name: r.contact_name || "—", count: 0, total: 0 });
      const o = byCust.get(k);
      o.count += 1; o.total += num(r.total_amount);
    });
    return Array.from(byCust.values()).sort((a, b) => b.total - a.total);
  }, [returns]);

  // ===== Reconciliation: cards vs table =====
  const recon = useMemo(() => {
    const tableSales = byRep.reduce((s, r) => s + r.sales, 0);
    return {
      sales: { card: kpi.sales, table: tableSales, drift: Math.abs(kpi.sales - tableSales) > 0.01 },
    };
  }, [byRep, kpi]);

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          تقارير البائع المتجول
        </h1>
        <div className="flex items-center gap-2 text-xs">
          {recon.sales.drift ? (
            <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" /> DRIFT</Badge>
          ) : (
            <Badge variant="secondary" className="gap-1 bg-emerald-500/15 text-emerald-700"><CheckCircle2 className="w-3 h-3" /> تدقيق الأرقام: OK</Badge>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card className="p-3">
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end">
          <div>
            <Label className="text-xs">من</Label>
            <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="h-9 text-xs" />
          </div>
          <div>
            <Label className="text-xs">إلى</Label>
            <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="h-9 text-xs" />
          </div>
          <div>
            <Label className="text-xs">المندوب</Label>
            <Select value={filters.repId} onValueChange={(v) => setFilters({ ...filters, repId: v })}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المندوبين</SelectItem>
                {reps.map((r) => <SelectItem key={r.id} value={r.id}>{r.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">الزبون</Label>
            <Select value={filters.contactId} onValueChange={(v) => setFilters({ ...filters, contactId: v })}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الزبائن</SelectItem>
                {contacts.slice(0, 500).map((c) => <SelectItem key={c.id} value={c.id}>{c.contact_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">المورد</Label>
            <Select value={filters.supplierId} onValueChange={(v) => setFilters({ ...filters, supplierId: v })}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الموردين</SelectItem>
                <SelectItem value="none">بدون مورد</SelectItem>
                {suppliers.slice(0, 500).map((s) => <SelectItem key={s.id} value={s.id}>{s.contact_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">الصنف</Label>
            <Select value={filters.productId} onValueChange={(v) => setFilters({ ...filters, productId: v })}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأصناف</SelectItem>
                {products.slice(0, 500).map((p) => <SelectItem key={p.id} value={p.id}>{p.name_ar || p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={load} disabled={loading} size="sm" className="gap-2 h-9">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            تشغيل
          </Button>
        </div>
      </Card>

      {/* Global KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Kpi title="المبيعات" value={fmt(kpi.sales)} />
        <Kpi title="التكلفة" value={fmt(kpi.cost)} />
        <Kpi title="الخصم" value={fmt(kpi.discount)} color="#f97316" />
        <Kpi title="صافي الربح" value={fmt(kpi.netProfit)} color={kpi.netProfit >= 0 ? "#16A34A" : "#DC2626"} />
        <Kpi title="الفواتير" value={String(kpi.invoices)} />
        <Kpi title="عدد الأسطر" value={String(kpi.lines)} />
        <Kpi title="المرتجعات" value={fmt(kpi.returns)} color="#DC2626" />
        <Kpi title="التحصيل" value={fmt(kpi.collections)} color="#16A34A" />
        <Kpi title="المصاريف" value={fmt(kpi.expenses)} color="#DC2626" />
        <Kpi title="هامش %" value={kpi.sales > 0 ? `${((kpi.netProfit / kpi.sales) * 100).toFixed(1)}%` : "—"} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto justify-start">
          <TabsTrigger value="by_rep">حسب المندوب</TabsTrigger>
          <TabsTrigger value="by_customer">حسب الزبون</TabsTrigger>
          <TabsTrigger value="by_product">حسب الصنف</TabsTrigger>
          <TabsTrigger value="by_supplier">حسب المورد</TabsTrigger>
          <TabsTrigger value="collections">التحصيل</TabsTrigger>
          <TabsTrigger value="expenses">المصاريف</TabsTrigger>
          <TabsTrigger value="returns">المرتجعات</TabsTrigger>
        </TabsList>

        <TabsContent value="by_rep">
          <ReportTable
            title="المبيعات حسب المندوب"
            rows={byRep}
            cols={[
              { key: "rep_name", label: "المندوب" },
              { key: "invoices", label: "الفواتير" },
              { key: "customers", label: "الزبائن" },
              { key: "lines", label: "الأسطر" },
              { key: "qty", label: "الكمية", format: "num" },
              { key: "sales", label: "المبيعات", format: "money" },
              { key: "cost", label: "التكلفة", format: "money" },
              { key: "discount", label: "الخصم", format: "money" },
              { key: "net_profit", label: "صافي الربح", format: "money", color: true },
              { key: "margin", label: "هامش %", format: "pct" },
            ]}
          />
        </TabsContent>

        <TabsContent value="by_customer">
          <ReportTable
            title="المبيعات حسب الزبون"
            rows={byCustomer}
            cols={[
              { key: "contact_name", label: "الزبون" },
              { key: "invoices", label: "الفواتير" },
              { key: "last_date", label: "آخر بيع" },
              { key: "qty", label: "الكمية", format: "num" },
              { key: "sales", label: "المبيعات", format: "money" },
              { key: "discount", label: "الخصم", format: "money" },
              { key: "collections", label: "التحصيل", format: "money" },
              { key: "balance", label: "المتبقي", format: "money", color: true },
              { key: "net_profit", label: "صافي الربح", format: "money", color: true },
              { key: "margin", label: "هامش %", format: "pct" },
              { key: "top_product", label: "أكثر صنف" },
            ]}
          />
        </TabsContent>

        <TabsContent value="by_product">
          <ReportTable
            title="المبيعات حسب الصنف"
            rows={byProduct}
            cols={[
              { key: "product_name", label: "الصنف" },
              { key: "supplier", label: "المورد" },
              { key: "invoices", label: "الفواتير" },
              { key: "qty", label: "الكمية", format: "num" },
              { key: "sales", label: "المبيعات", format: "money" },
              { key: "cost", label: "التكلفة", format: "money" },
              { key: "profit", label: "الربح", format: "money", color: true },
              { key: "margin", label: "هامش %", format: "pct" },
              { key: "avg_price", label: "متوسط السعر", format: "money" },
              { key: "avg_cost", label: "متوسط التكلفة", format: "money" },
            ]}
          />
        </TabsContent>

        <TabsContent value="by_supplier">
          <ReportTable
            title="المبيعات حسب المورد"
            rows={bySupplier}
            cols={[
              { key: "supplier_name", label: "المورد" },
              { key: "lines", label: "الأسطر" },
              { key: "qty", label: "الكمية", format: "num" },
              { key: "sales", label: "المبيعات", format: "money" },
              { key: "cost", label: "التكلفة", format: "money" },
              { key: "discount", label: "الخصم", format: "money" },
              { key: "net_profit", label: "صافي الربح", format: "money", color: true },
              { key: "margin", label: "هامش %", format: "pct" },
            ]}
          />
        </TabsContent>

        <TabsContent value="collections">
          <ReportTable
            title="التحصيل حسب المندوب"
            rows={collectionsRpt}
            cols={[
              { key: "rep_name", label: "المندوب" },
              { key: "count", label: "السندات" },
              { key: "cash", label: "نقد", format: "money" },
              { key: "cheque", label: "شيكات", format: "money" },
              { key: "bank", label: "بنك", format: "money" },
              { key: "other", label: "أخرى", format: "money" },
              { key: "total", label: "الإجمالي", format: "money", color: true },
            ]}
          />
        </TabsContent>

        <TabsContent value="expenses">
          <ReportTable
            title="مصاريف المندوب حسب النوع/الحساب"
            rows={expensesRpt}
            cols={[
              { key: "category", label: "النوع" },
              { key: "account", label: "الحساب المحاسبي" },
              { key: "count", label: "عدد القيود" },
              { key: "total", label: "الإجمالي", format: "money", color: true },
            ]}
          />
        </TabsContent>

        <TabsContent value="returns">
          <ReportTable
            title="المرتجعات حسب الزبون"
            rows={returnsRpt}
            cols={[
              { key: "contact_name", label: "الزبون" },
              { key: "count", label: "العدد" },
              { key: "total", label: "الإجمالي", format: "money", color: true },
            ]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function invMap(id: string, invs: any[]) {
  return invs.find((i) => i.id === id);
}

function Kpi({ title, value, color }: { title: string; value: string; color?: string }) {
  return (
    <Card className="p-3">
      <div className="text-[10px] text-muted-foreground">{title}</div>
      <div className="font-bold text-base" style={{ color }}>{value}</div>
    </Card>
  );
}

type Col = { key: string; label: string; format?: "money" | "num" | "pct"; color?: boolean };

function ReportTable({ title, rows, cols }: { title: string; rows: any[]; cols: Col[] }) {
  const totals = useMemo(() => {
    const t: Row = {};
    cols.forEach((c) => {
      if (c.format === "money" || c.format === "num") {
        t[c.key] = rows.reduce((s, r) => s + num(r[c.key]), 0);
      }
    });
    return t;
  }, [rows, cols]);

  const formatCell = (v: any, c: Col) => {
    if (v === null || v === undefined || v === "") return "—";
    if (c.format === "money") return fmt(num(v));
    if (c.format === "num") return num(v).toLocaleString();
    if (c.format === "pct") return `${num(v).toFixed(1)}%`;
    return String(v);
  };

  return (
    <Card className="overflow-hidden mt-2">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="font-bold text-sm">{title}</div>
        <Button size="sm" variant="outline" className="gap-2 h-8" onClick={() => exportXlsx(rows, cols, title)}>
          <Download className="w-3.5 h-3.5" /> تصدير Excel
        </Button>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-xs text-muted-foreground border-b">
              {cols.map((c) => <th key={c.key} className="text-right py-2.5 px-3">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                {cols.map((c) => (
                  <td key={c.key} className="py-2 px-3" style={c.color && (c.format === "money" || c.format === "num") ? { color: num(r[c.key]) >= 0 ? "#16A34A" : "#DC2626", fontWeight: 500 } : undefined}>
                    {formatCell(r[c.key], c)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="bg-muted/40 font-bold text-xs border-t-2">
                {cols.map((c, i) => (
                  <td key={c.key} className="py-2 px-3">
                    {i === 0 ? "الإجمالي" : (c.format === "money" || c.format === "num") ? formatCell(totals[c.key], c) : ""}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y">
        {rows.map((r, i) => (
          <div key={i} className="p-3 space-y-1">
            <div className="font-semibold text-sm">{r[cols[0].key] || "—"}</div>
            <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
              {cols.slice(1).map((c) => (
                <div key={c.key} className="flex justify-between gap-2">
                  <span>{c.label}:</span>
                  <span className="font-medium" style={c.color && (c.format === "money") ? { color: num(r[c.key]) >= 0 ? "#16A34A" : "#DC2626" } : undefined}>
                    {formatCell(r[c.key], c)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">لا توجد بيانات في الفترة المحددة</p>
      )}
    </Card>
  );
}