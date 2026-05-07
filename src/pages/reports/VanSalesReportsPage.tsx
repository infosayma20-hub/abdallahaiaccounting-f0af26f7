import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import {
  ArrowRight, Download, Truck, Wallet, Users, Package, Building2, Receipt,
  TrendingUp, AlertTriangle, ExternalLink,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fmtDateDisplay } from "@/lib/utils";
import { setNextExportBranding } from "@/lib/excel-export";
import { RtlDataTable, type RtlColumn } from "@/components/ui/RtlDataTable";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface RepInvoice {
  id: string;
  invoice_number: string | null;
  invoice_date: string;
  contact_id: string | null;
  contact_name: string | null;
  salesperson_id: string | null;
  payment_method: string | null;
  status: string | null;
  is_voided?: boolean | null;
  total_amount: number | null;
  payment_status: string | null;
}

interface RepItem {
  id: string;
  invoice_id: string;
  product_id: string | null;
  product_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  cost_price: number | null;
  line_profit: number | null;
  total_amount: number | null;
}

interface RepRow {
  id: string;
  full_name: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n || 0);

const isCash = (pm: string | null | undefined) => {
  const v = (pm || "").toString().toLowerCase();
  return v === "cash" || v === "نقد" || v === "نقدي";
};

const isVoid = (s: string | null | undefined) =>
  ["void", "cancelled", "reversed", "ملغي", "ملغى"].includes((s || "").toString().toLowerCase());

const safe = (n: number | null | undefined) => Number(n || 0);

/** ترجمة حالة الدفع/الفاتورة للعربي */
const statusLabel = (s: string | null | undefined): string => {
  const v = (s || "").toString().toLowerCase().trim();
  const map: Record<string, string> = {
    paid: "مدفوع",
    unpaid: "غير مدفوع",
    partial: "جزئي",
    partially_paid: "جزئي",
    draft: "مسودة",
    cancelled: "ملغي",
    canceled: "ملغي",
    void: "ملغي",
    voided: "ملغي",
    reversed: "معكوس",
    posted: "مرحَّل",
    approved: "معتمد",
    sent: "مرسل",
    overdue: "متأخر",
    pending: "قيد الانتظار",
  };
  if (!v) return "—";
  return map[v] || s || "—";
};

/** يرجّع قيمة الربح أو null إذا التكلفة غير محددة (cost_price NULL) */
const lineProfitOrNull = (it: RepItem): number | null => {
  if (it.cost_price === null || it.cost_price === undefined) return null;
  if (it.line_profit !== null && it.line_profit !== undefined)
    return Number(it.line_profit);
  // احتياطي إذا line_profit ما تحدّد بس التكلفة موجودة
  return safe(it.total_amount) - safe(it.cost_price) * safe(it.quantity);
};

const lineCost = (it: RepItem): number =>
  it.cost_price === null || it.cost_price === undefined
    ? 0
    : safe(it.cost_price) * safe(it.quantity);

const hasUndefinedCost = (items: RepItem[]) =>
  items.some((it) => it.cost_price === null || it.cost_price === undefined);

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function VanSalesReportsPage() {
  const navigate = useNavigate();

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return format(d, "yyyy-MM-dd");
  });
  const [dateTo, setDateTo] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [repFilter, setRepFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all"); // all|cash|credit
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tab, setTab] = useState<string>(() => {
    const h = (typeof window !== "undefined" ? window.location.hash : "").replace("#", "");
    return ["daily", "rep", "product", "customer", "supplier", "orders"].includes(h) ? h : "daily";
  });

  // Sync hash → tab when user navigates between cards on /reports
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace("#", "");
      if (["daily", "rep", "product", "customer", "supplier", "orders"].includes(h)) setTab(h);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  /* Reps list (for filter) */
  const { data: repsList } = useQuery<RepRow[]>({
    queryKey: ["van-rep-list-min"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("sales_representatives")
        .select("id, full_name, employee:employees!sales_representatives_employee_id_fkey(full_name)")
        .order("full_name");
      return ((data as any[]) || []).map((r) => ({
        id: r.id,
        full_name: r.employee?.full_name || r.full_name,
      }));
    },
  });

  /* Rep invoices + items in range */
  const { data: payload, isLoading } = useQuery({
    queryKey: ["van-sales-payload", dateFrom, dateTo],
    queryFn: async () => {
      const invQ: any = (supabase as any)
        .from("invoices")
        .select(
          "id, invoice_number, invoice_date, contact_id, contact_name, salesperson_id, payment_method, status, is_voided, total_amount, payment_status"
        )
        .eq("source", "rep")
        .eq("is_voided", false)
        .not("status", "in", "(cancelled,void,reversed)")
        .gte("invoice_date", dateFrom)
        .lte("invoice_date", dateTo)
        .order("invoice_date", { ascending: false });
      const { data: invs } = await invQ;
      const invoices = (invs as RepInvoice[]) || [];
      const ids = invoices.map((i) => i.id);
      let items: RepItem[] = [];
      if (ids.length) {
        const { data: it } = await (supabase as any)
          .from("invoice_items")
          .select(
            "id, invoice_id, product_id, product_name, quantity, unit_price, cost_price, line_profit, total_amount"
          )
          .in("invoice_id", ids);
        items = (it as RepItem[]) || [];
      }
      return { invoices, items };
    },
  });

  /* Apply filters */
  const filtered = useMemo(() => {
    const invs = (payload?.invoices || []).filter((i) => {
      if (i.is_voided || isVoid(i.status)) return false;
      if (repFilter !== "all" && i.salesperson_id !== repFilter) return false;
      if (customerFilter !== "all" && i.contact_id !== customerFilter)
        return false;
      if (paymentFilter === "cash" && !isCash(i.payment_method)) return false;
      if (paymentFilter === "credit" && isCash(i.payment_method)) return false;
      if (statusFilter !== "all" && (i.payment_status || "") !== statusFilter)
        return false;
      return true;
    });
    const ids = new Set(invs.map((i) => i.id));
    const its = (payload?.items || []).filter((it) => {
      if (!ids.has(it.invoice_id)) return false;
      if (productFilter !== "all" && it.product_id !== productFilter)
        return false;
      return true;
    });
    return { invoices: invs, items: its };
  }, [payload, repFilter, customerFilter, productFilter, paymentFilter, statusFilter]);

  /* Distinct lookup lists (for filters) */
  const customerOptions = useMemo(() => {
    const map = new Map<string, string>();
    (payload?.invoices || []).forEach((i) => {
      if (i.contact_id) map.set(i.contact_id, i.contact_name || "—");
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [payload]);

  const productOptions = useMemo(() => {
    const map = new Map<string, string>();
    (payload?.items || []).forEach((it) => {
      if (it.product_id) map.set(it.product_id, it.product_name || "—");
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [payload]);

  /* ----------- Aggregations per tab --------------------------------- */

  // 1) Daily summary (group by invoice_date)
  const daily = useMemo(() => {
    const byDate = new Map<
      string,
      { sales: number; cash: number; credit: number; cost: number; profit: number; orders: number; undefinedCost: boolean }
    >();
    const itemsByInv = new Map<string, RepItem[]>();
    filtered.items.forEach((it) => {
      const arr = itemsByInv.get(it.invoice_id) || [];
      arr.push(it);
      itemsByInv.set(it.invoice_id, arr);
    });
    filtered.invoices.forEach((inv) => {
      const cur = byDate.get(inv.invoice_date) || {
        sales: 0, cash: 0, credit: 0, cost: 0, profit: 0, orders: 0, undefinedCost: false,
      };
      const amt = safe(inv.total_amount);
      cur.sales += amt;
      cur.orders += 1;
      if (isCash(inv.payment_method)) cur.cash += amt;
      else cur.credit += amt;
      const its = itemsByInv.get(inv.id) || [];
      cur.cost += its.reduce((s, it) => s + lineCost(it), 0);
      its.forEach((it) => {
        const p = lineProfitOrNull(it);
        if (p !== null) cur.profit += p;
      });
      if (hasUndefinedCost(its)) cur.undefinedCost = true;
      byDate.set(inv.invoice_date, cur);
    });
    return Array.from(byDate.entries())
      .map(([date, v]) => ({ date, ...v, margin: v.sales > 0 ? (v.profit / v.sales) * 100 : 0 }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [filtered]);

  // 2) By rep
  const byRep = useMemo(() => {
    const map = new Map<string, any>();
    const itemsByInv = new Map<string, RepItem[]>();
    filtered.items.forEach((it) => {
      const arr = itemsByInv.get(it.invoice_id) || [];
      arr.push(it);
      itemsByInv.set(it.invoice_id, arr);
    });
    filtered.invoices.forEach((inv) => {
      const key = inv.salesperson_id || "_none";
      const cur = map.get(key) || {
        rep_id: inv.salesperson_id, name: "—", orders: 0, sales: 0, cost: 0, profit: 0,
        cash: 0, credit: 0, undefinedCost: false,
      };
      const amt = safe(inv.total_amount);
      cur.orders += 1;
      cur.sales += amt;
      if (isCash(inv.payment_method)) cur.cash += amt;
      else cur.credit += amt;
      const its = itemsByInv.get(inv.id) || [];
      cur.cost += its.reduce((s, it) => s + lineCost(it), 0);
      its.forEach((it) => {
        const p = lineProfitOrNull(it);
        if (p !== null) cur.profit += p;
      });
      if (hasUndefinedCost(its)) cur.undefinedCost = true;
      map.set(key, cur);
    });
    // attach names
    const nameMap = new Map((repsList || []).map((r) => [r.id, r.full_name]));
    return Array.from(map.values()).map((r) => ({
      ...r,
      name: nameMap.get(r.rep_id || "") || r.name,
      margin: r.sales > 0 ? (r.profit / r.sales) * 100 : 0,
    }));
  }, [filtered, repsList]);

  // 3) By product
  const byProduct = useMemo(() => {
    const map = new Map<string, any>();
    const repForInv = new Map<string, string | null>();
    filtered.invoices.forEach((i) => repForInv.set(i.id, i.salesperson_id));
    filtered.items.forEach((it) => {
      const key = it.product_id || `name:${it.product_name || "—"}`;
      const cur = map.get(key) || {
        product_id: it.product_id, name: it.product_name || "—",
        qty: 0, sales: 0, cost: 0, profit: 0, undefinedCost: false,
        repCount: new Map<string, number>(),
      };
      cur.qty += safe(it.quantity);
      cur.sales += safe(it.total_amount);
      cur.cost += lineCost(it);
      const p = lineProfitOrNull(it);
      if (p !== null) cur.profit += p;
      else cur.undefinedCost = true;
      const rid = repForInv.get(it.invoice_id) || "_none";
      cur.repCount.set(rid, (cur.repCount.get(rid) || 0) + safe(it.quantity));
      map.set(key, cur);
    });
    const nameMap = new Map((repsList || []).map((r) => [r.id, r.full_name]));
    return Array.from(map.values()).map((r) => {
      let topRep = "—";
      let max = -1;
      r.repCount.forEach((v: number, k: string) => {
        if (v > max) { max = v; topRep = nameMap.get(k) || "—"; }
      });
      return {
        ...r,
        topRep,
        margin: r.sales > 0 ? (r.profit / r.sales) * 100 : 0,
      };
    }).sort((a, b) => b.sales - a.sales);
  }, [filtered, repsList]);

  // 4) By customer (+ live balance via RPC)
  const byCustomer = useMemo(() => {
    const map = new Map<string, any>();
    const itemsByInv = new Map<string, RepItem[]>();
    filtered.items.forEach((it) => {
      const arr = itemsByInv.get(it.invoice_id) || [];
      arr.push(it);
      itemsByInv.set(it.invoice_id, arr);
    });
    filtered.invoices.forEach((inv) => {
      const key = inv.contact_id || `name:${inv.contact_name || "—"}`;
      const cur = map.get(key) || {
        contact_id: inv.contact_id, name: inv.contact_name || "—",
        orders: 0, sales: 0, profit: 0, undefinedCost: false,
      };
      cur.orders += 1;
      cur.sales += safe(inv.total_amount);
      const its = itemsByInv.get(inv.id) || [];
      its.forEach((it) => {
        const p = lineProfitOrNull(it);
        if (p !== null) cur.profit += p;
      });
      if (hasUndefinedCost(its)) cur.undefinedCost = true;
      map.set(key, cur);
    });
    return Array.from(map.values()).map((c) => ({
      ...c,
      avg: c.orders > 0 ? c.sales / c.orders : 0,
    })).sort((a, b) => b.sales - a.sales);
  }, [filtered]);

  // Fetch live contact balances for the customer list (top 50 to keep light)
  const { data: balances } = useQuery({
    queryKey: [
      "van-customer-balances",
      byCustomer.slice(0, 50).map((c: any) => c.contact_id).filter(Boolean).join(","),
    ],
    enabled: tab === "customer" && byCustomer.length > 0,
    queryFn: async () => {
      const result: Record<string, number> = {};
      const top = byCustomer.slice(0, 50).filter((c: any) => c.contact_id);
      await Promise.all(
        top.map(async (c: any) => {
          const { data } = await (supabase as any).rpc("get_contact_balance", {
            p_contact_id: c.contact_id,
          });
          result[c.contact_id] = Number(data || 0);
        })
      );
      return result;
    },
  });

  // 5) By supplier — derive supplier per product from latest purchase invoice
  const productIdsInRange = useMemo(
    () => Array.from(new Set(filtered.items.map((it) => it.product_id).filter(Boolean) as string[])),
    [filtered]
  );

  const { data: productSupplierMap } = useQuery({
    queryKey: ["van-product-supplier-map", productIdsInRange.join(",")],
    enabled: tab === "supplier" && productIdsInRange.length > 0,
    queryFn: async () => {
      // pull purchase invoice items for these products, join on invoice contact
      const { data: pItems } = await (supabase as any)
        .from("invoice_items")
        .select("product_id, invoice_id")
        .in("product_id", productIdsInRange);
      const invoiceIds = Array.from(
        new Set(((pItems as any[]) || []).map((r) => r.invoice_id))
      );
      if (!invoiceIds.length) return {} as Record<string, { id: string; name: string } | null>;
      const { data: pInvs } = await (supabase as any)
        .from("invoices")
        .select("id, invoice_type, contact_id, contact_name, invoice_date")
        .in("id", invoiceIds)
        .eq("invoice_type", "purchase")
        .order("invoice_date", { ascending: false });
      const invMap = new Map<string, any>();
      ((pInvs as any[]) || []).forEach((i) => invMap.set(i.id, i));
      const out: Record<string, { id: string; name: string } | null> = {};
      ((pItems as any[]) || []).forEach((it) => {
        const inv = invMap.get(it.invoice_id);
        if (!inv) return;
        if (!out[it.product_id]) {
          out[it.product_id] = inv.contact_id
            ? { id: inv.contact_id, name: inv.contact_name || "—" }
            : null;
        }
      });
      return out;
    },
  });

  const bySupplier = useMemo(() => {
    if (!productSupplierMap) return [];
    const map = new Map<string, any>();
    filtered.items.forEach((it) => {
      const sup = it.product_id ? productSupplierMap[it.product_id] : null;
      const key = sup?.id || "_none";
      const cur = map.get(key) || {
        supplier_id: sup?.id || null,
        name: sup?.name || "بدون مورد محدد",
        productCount: new Set<string>(),
        sales: 0, cost: 0, profit: 0, undefinedCost: false,
      };
      if (it.product_id) cur.productCount.add(it.product_id);
      cur.sales += safe(it.total_amount);
      cur.cost += lineCost(it);
      const p = lineProfitOrNull(it);
      if (p !== null) cur.profit += p;
      else cur.undefinedCost = true;
      map.set(key, cur);
    });
    return Array.from(map.values())
      .map((s) => ({
        ...s,
        products: s.productCount.size,
        margin: s.sales > 0 ? (s.profit / s.sales) * 100 : 0,
      }))
      .sort((a, b) => b.profit - a.profit);
  }, [filtered, productSupplierMap]);

  // 6) Orders list
  const orders = useMemo(() => {
    const itemsByInv = new Map<string, RepItem[]>();
    filtered.items.forEach((it) => {
      const arr = itemsByInv.get(it.invoice_id) || [];
      arr.push(it);
      itemsByInv.set(it.invoice_id, arr);
    });
    const nameMap = new Map((repsList || []).map((r) => [r.id, r.full_name]));
    return filtered.invoices.map((inv) => {
      const its = itemsByInv.get(inv.id) || [];
      const cost = its.reduce((s, it) => s + lineCost(it), 0);
      let profit = 0;
      let undefinedCost = false;
      its.forEach((it) => {
        const p = lineProfitOrNull(it);
        if (p !== null) profit += p;
        else undefinedCost = true;
      });
      return {
        ...inv,
        rep_name: inv.salesperson_id ? nameMap.get(inv.salesperson_id) || "—" : "—",
        cost,
        profit,
        undefinedCost,
      };
    });
  }, [filtered, repsList]);

  /* KPI cards (top) */
  const kpis = useMemo(() => {
    let sales = 0, cash = 0, credit = 0, cost = 0, profit = 0, undefinedCost = false;
    const itemsByInv = new Map<string, RepItem[]>();
    filtered.items.forEach((it) => {
      const arr = itemsByInv.get(it.invoice_id) || [];
      arr.push(it);
      itemsByInv.set(it.invoice_id, arr);
    });
    filtered.invoices.forEach((inv) => {
      const a = safe(inv.total_amount);
      sales += a;
      if (isCash(inv.payment_method)) cash += a;
      else credit += a;
      const its = itemsByInv.get(inv.id) || [];
      cost += its.reduce((s, it) => s + lineCost(it), 0);
      its.forEach((it) => {
        const p = lineProfitOrNull(it);
        if (p !== null) profit += p;
      });
      if (hasUndefinedCost(its)) undefinedCost = true;
    });
    return {
      orders: filtered.invoices.length,
      sales, cash, credit, cost, profit,
      margin: sales > 0 ? (profit / sales) * 100 : 0,
      undefinedCost,
    };
  }, [filtered]);

  /* Excel export */
  const exportExcel = () => {
    let rows: any[] = [];
    let title = "تقرير_البائع_المتجول";
    if (tab === "daily") {
      title = "ملخص_يومي";
      rows = daily.map((d) => ({
        "التاريخ": fmtDateDisplay(d.date),
        "عدد الطلبات": d.orders,
        "المبيعات": d.sales,
        "النقدي": d.cash,
        "الآجل": d.credit,
        "التكلفة": d.cost,
        "الربح": d.undefinedCost ? "تكلفة غير محددة" : d.profit,
        "الهامش %": d.undefinedCost ? "—" : d.margin.toFixed(1),
      }));
    } else if (tab === "rep") {
      title = "ربحية_المندوبين";
      rows = byRep.map((r) => ({
        "المندوب": r.name,
        "عدد الطلبات": r.orders,
        "المبيعات": r.sales,
        "التكلفة": r.cost,
        "الربح": r.undefinedCost ? "تكلفة غير محددة" : r.profit,
        "الهامش %": r.undefinedCost ? "—" : r.margin.toFixed(1),
        "النقدي": r.cash,
        "الآجل": r.credit,
      }));
    } else if (tab === "product") {
      title = "ربحية_الأصناف";
      rows = byProduct.map((p: any) => ({
        "الصنف": p.name,
        "الكمية": p.qty,
        "المبيعات": p.sales,
        "التكلفة": p.cost,
        "الربح": p.undefinedCost ? "تكلفة غير محددة" : p.profit,
        "الهامش %": p.undefinedCost ? "—" : p.margin.toFixed(1),
        "أكثر مندوب": p.topRep,
      }));
    } else if (tab === "customer") {
      title = "ربحية_الزبائن";
      rows = byCustomer.map((c: any) => ({
        "الزبون": c.name,
        "عدد الطلبات": c.orders,
        "المبيعات": c.sales,
        "الربح": c.undefinedCost ? "تكلفة غير محددة" : c.profit,
        "متوسط الفاتورة": c.avg,
        "الرصيد الحالي": c.contact_id && balances ? balances[c.contact_id] ?? "—" : "—",
      }));
    } else if (tab === "supplier") {
      title = "ربحية_الموردين";
      rows = bySupplier.map((s: any) => ({
        "المورد": s.name,
        "عدد الأصناف": s.products,
        "المبيعات": s.sales,
        "التكلفة": s.cost,
        "الربح": s.undefinedCost ? "تكلفة غير محددة" : s.profit,
        "الهامش %": s.undefinedCost ? "—" : s.margin.toFixed(1),
      }));
    } else if (tab === "orders") {
      title = "طلبات_البائع_المتجول";
      rows = orders.map((o) => ({
        "رقم الطلب": o.invoice_number || "—",
        "التاريخ": fmtDateDisplay(o.invoice_date),
        "المندوب": o.rep_name,
        "الزبون": o.contact_name || "—",
        "الدفع": isCash(o.payment_method) ? "نقدي" : "آجل",
        "الحالة": statusLabel(o.payment_status || o.status),
        "الإجمالي": safe(o.total_amount),
        "التكلفة": o.cost,
        "الربح": o.undefinedCost ? "تكلفة غير محددة" : o.profit,
      }));
    }
    if (!rows.length) return;
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 28));
    setNextExportBranding({ title });
    XLSX.writeFile(wb, `${title}_${dateFrom}_${dateTo}.xlsx`);
  };

  /* ------------------------------------------------------------------ */

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto pb-10" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => (window.history.length > 2 ? navigate(-1) : navigate("/reports"))}
            className="p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" /> تقارير البائع المتجول
          </h1>
        </div>
        <Button variant="outline" size="sm" onClick={exportExcel} disabled={isLoading}>
          <Download className="h-4 w-4 ml-1" /> Excel
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-3">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">من</span>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[150px] h-9 text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">إلى</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[150px] h-9 text-xs" />
          </div>

          <Select value={repFilter} onValueChange={setRepFilter}>
            <SelectTrigger className="w-[180px] h-9 text-xs"><SelectValue placeholder="المندوب" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المندوبين</SelectItem>
              {(repsList || []).map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="w-[180px] h-9 text-xs"><SelectValue placeholder="الزبون" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الزبائن</SelectItem>
              {customerOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="w-[180px] h-9 text-xs"><SelectValue placeholder="الصنف" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأصناف</SelectItem>
              {productOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue placeholder="الدفع" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل أنواع الدفع</SelectItem>
              <SelectItem value="cash">نقدي</SelectItem>
              <SelectItem value="credit">آجل</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue placeholder="الحالة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="paid">مسددة</SelectItem>
              <SelectItem value="partial">جزئي</SelectItem>
              <SelectItem value="unpaid">غير مسددة</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "عدد الطلبات", value: kpis.orders, icon: Receipt, color: "text-blue-500" },
          { label: "المبيعات", value: fmt(kpis.sales), icon: TrendingUp, color: "text-emerald-500" },
          { label: "التكلفة", value: fmt(kpis.cost), icon: Package, color: "text-amber-500" },
          {
            label: "الربح",
            value: kpis.undefinedCost ? "—" : fmt(kpis.profit),
            icon: TrendingUp,
            color: kpis.undefinedCost ? "text-amber-500" : "text-emerald-500",
          },
          {
            label: "الهامش %",
            value: kpis.undefinedCost ? "—" : `${kpis.margin.toFixed(1)}%`,
            icon: TrendingUp,
            color: "text-emerald-500",
          },
          { label: "النقدي", value: fmt(kpis.cash), icon: Wallet, color: "text-emerald-500" },
          { label: "الآجل", value: fmt(kpis.credit), icon: Wallet, color: "text-red-500" },
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

      {kpis.undefinedCost && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          بعض البنود لا تحتوي على تكلفة محددة (cost_price فارغ) — لا يتم احتسابها ضمن الربح وتظهر كـ "تكلفة غير محددة".
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="orders">الطلبات</TabsTrigger>
          <TabsTrigger value="supplier">حسب المورد</TabsTrigger>
          <TabsTrigger value="customer">حسب الزبون</TabsTrigger>
          <TabsTrigger value="product">حسب الصنف</TabsTrigger>
          <TabsTrigger value="rep">حسب المندوب</TabsTrigger>
          <TabsTrigger value="daily">ملخص يومي</TabsTrigger>
        </TabsList>

        {/* 1. Daily */}
        <TabsContent value="daily">
          <Card className="overflow-hidden mt-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="p-3 text-right font-semibold text-muted-foreground">التاريخ</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">عدد الطلبات</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">المبيعات</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">النقدي</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">الآجل</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">التكلفة</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">الربح</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">الهامش %</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr>
                  ) : !daily.length ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">لا توجد بيانات</td></tr>
                  ) : daily.map((d) => (
                    <tr key={d.date} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="p-3 font-medium">{fmtDateDisplay(d.date)}</td>
                      <td className="p-3">{d.orders}</td>
                      <td className="p-3">{fmt(d.sales)}</td>
                      <td className="p-3 text-emerald-600">{fmt(d.cash)}</td>
                      <td className="p-3 text-red-600">{fmt(d.credit)}</td>
                      <td className="p-3 text-amber-600">{fmt(d.cost)}</td>
                      <td className="p-3 font-bold">{d.undefinedCost ? <span className="text-amber-600">تكلفة غير محددة</span> : fmt(d.profit)}</td>
                      <td className="p-3">{d.undefinedCost ? "—" : `${d.margin.toFixed(1)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* 2. Rep */}
        <TabsContent value="rep">
          <Card className="overflow-hidden mt-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="p-3 text-right font-semibold text-muted-foreground">المندوب</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">عدد الطلبات</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">المبيعات</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">النقدي</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">الآجل</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">التكلفة</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">الربح</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">الهامش %</th>
                  </tr>
                </thead>
                <tbody>
                  {!byRep.length ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">لا توجد بيانات</td></tr>
                  ) : byRep.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="p-3 font-medium">{r.name}</td>
                      <td className="p-3">{r.orders}</td>
                      <td className="p-3">{fmt(r.sales)}</td>
                      <td className="p-3 text-emerald-600">{fmt(r.cash)}</td>
                      <td className="p-3 text-red-600">{fmt(r.credit)}</td>
                      <td className="p-3 text-amber-600">{fmt(r.cost)}</td>
                      <td className="p-3 font-bold">{r.undefinedCost ? <span className="text-amber-600">تكلفة غير محددة</span> : fmt(r.profit)}</td>
                      <td className="p-3">{r.undefinedCost ? "—" : `${r.margin.toFixed(1)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* 3. Product */}
        <TabsContent value="product">
          <Card className="overflow-hidden mt-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="p-3 text-right font-semibold text-muted-foreground">الصنف</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">الكمية</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">المبيعات</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">التكلفة</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">الربح</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">الهامش %</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">أكثر مندوب</th>
                    <th className="p-3 text-center font-semibold text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {!byProduct.length ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">لا توجد بيانات</td></tr>
                  ) : byProduct.map((p: any, i: number) => (
                    <tr key={i} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3">{fmt(p.qty)}</td>
                      <td className="p-3">{fmt(p.sales)}</td>
                      <td className="p-3 text-amber-600">{fmt(p.cost)}</td>
                      <td className="p-3 font-bold">{p.undefinedCost ? <span className="text-amber-600">تكلفة غير محددة</span> : fmt(p.profit)}</td>
                      <td className="p-3">{p.undefinedCost ? "—" : `${p.margin.toFixed(1)}%`}</td>
                      <td className="p-3">{p.topRep}</td>
                      <td className="p-3 text-center">
                        {p.product_id && (
                          <button onClick={() => navigate(`/products?focus=${p.product_id}`)} className="text-primary hover:underline inline-flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" /> فتح
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* 4. Customer */}
        <TabsContent value="customer">
          <Card className="overflow-hidden mt-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="p-3 text-right font-semibold text-muted-foreground">الزبون</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">عدد الطلبات</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">المبيعات</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">الربح</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">متوسط الفاتورة</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">الرصيد الحالي</th>
                    <th className="p-3 text-center font-semibold text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {!byCustomer.length ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">لا توجد بيانات</td></tr>
                  ) : byCustomer.map((c: any, i: number) => (
                    <tr key={i} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3">{c.orders}</td>
                      <td className="p-3">{fmt(c.sales)}</td>
                      <td className="p-3 font-bold">{c.undefinedCost ? <span className="text-amber-600">تكلفة غير محددة</span> : fmt(c.profit)}</td>
                      <td className="p-3">{fmt(c.avg)}</td>
                      <td className="p-3">
                        {c.contact_id && balances ? fmt(balances[c.contact_id] ?? 0) : "—"}
                      </td>
                      <td className="p-3 text-center">
                        {c.contact_id && (
                          <button onClick={() => navigate(`/account-statement?contact=${c.contact_id}`)} className="text-primary hover:underline inline-flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" /> كشف
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* 5. Supplier */}
        <TabsContent value="supplier">
          <Card className="overflow-hidden mt-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="p-3 text-right font-semibold text-muted-foreground">المورد</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">عدد الأصناف</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">المبيعات</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">التكلفة</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">الربح</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">الهامش %</th>
                  </tr>
                </thead>
                <tbody>
                  {!bySupplier.length ? (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">جاري حساب الموردين أو لا توجد بيانات...</td></tr>
                  ) : bySupplier.map((s: any, i: number) => (
                    <tr key={i} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="p-3 font-medium flex items-center gap-2"><Building2 className="h-3 w-3 text-muted-foreground" /> {s.name}</td>
                      <td className="p-3">{s.products}</td>
                      <td className="p-3">{fmt(s.sales)}</td>
                      <td className="p-3 text-amber-600">{fmt(s.cost)}</td>
                      <td className="p-3 font-bold">{s.undefinedCost ? <span className="text-amber-600">تكلفة غير محددة</span> : fmt(s.profit)}</td>
                      <td className="p-3">{s.undefinedCost ? "—" : `${s.margin.toFixed(1)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="text-[10px] text-muted-foreground mt-2">
            * يُحدَّد المورد لكل صنف من آخر فاتورة شراء له (لا يوجد ربط مباشر بين المنتج والمورد في الهيكلة الحالية).
          </p>
        </TabsContent>

        {/* 6. Orders */}
        <TabsContent value="orders">
          {/* Desktop table */}
          <Card className="overflow-hidden mt-3 hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="p-3 text-center font-semibold text-muted-foreground w-16">إجراء</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">رقم الطلب</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">التاريخ</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">المندوب</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">الزبون</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">الدفع</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">الحالة</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">الإجمالي</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">التكلفة</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">الربح</th>
                  </tr>
                </thead>
                <tbody>
                  {!orders.length ? (
                    <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">لا توجد طلبات</td></tr>
                  ) : orders.map((o) => (
                    <tr key={o.id} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="p-3 text-center">
                        <button onClick={() => navigate(`/invoice/${o.id}`)} className="text-primary hover:underline inline-flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" /> فتح
                        </button>
                      </td>
                      <td className="p-3 font-medium">{o.invoice_number || "—"}</td>
                      <td className="p-3">{fmtDateDisplay(o.invoice_date)}</td>
                      <td className="p-3">{o.rep_name}</td>
                      <td className="p-3">{o.contact_name || "—"}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${isCash(o.payment_method) ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {isCash(o.payment_method) ? "نقدي" : "آجل"}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">{statusLabel(o.payment_status || o.status)}</td>
                      <td className="p-3">{fmt(safe(o.total_amount))}</td>
                      <td className="p-3 text-amber-600">{fmt(o.cost)}</td>
                      <td className="p-3 font-bold">{o.undefinedCost ? <span className="text-amber-600">تكلفة غير محددة</span> : fmt(o.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile cards */}
          <div className="md:hidden mt-3 space-y-2">
            {!orders.length ? (
              <Card className="p-6 text-center text-muted-foreground text-sm">لا توجد طلبات</Card>
            ) : orders.map((o) => (
              <Card key={o.id} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{o.invoice_number || "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{fmtDateDisplay(o.invoice_date)}</div>
                  </div>
                  <button onClick={() => navigate(`/invoice/${o.id}`)} className="text-primary text-xs inline-flex items-center gap-1 px-2 py-1 rounded-md border border-primary/30 hover:bg-primary/5">
                    <ExternalLink className="h-3 w-3" /> فتح
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">المندوب:</span><span className="font-medium truncate">{o.rep_name}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">الزبون:</span><span className="font-medium truncate">{o.contact_name || "—"}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">الإجمالي:</span><span className="font-bold">{fmt(safe(o.total_amount))}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">الربح:</span><span className="font-bold text-emerald-600">{o.undefinedCost ? "—" : fmt(o.profit)}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">الدفع:</span><span className={isCash(o.payment_method) ? "text-emerald-600" : "text-red-600"}>{isCash(o.payment_method) ? "نقدي" : "آجل"}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">الحالة:</span><span>{statusLabel(o.payment_status || o.status)}</span></div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}