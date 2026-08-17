import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Printer, FileSpreadsheet, MapPin, Truck, Store, ShoppingBag, UtensilsCrossed, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RtlDataTable, type RtlColumn } from "@/components/ui/RtlDataTable";
import { FinanceShell, FastTabs, type ActionTab } from "@/components/finance/shell";
import { exportToExcelBranded, formatPeriodLabel } from "@/lib/excel-export";
import { printReport } from "@/lib/printUtils";
import { toast } from "@/hooks/use-toast";

const CITY = "نابلس";
const CC_CANCELLED = ["cancelled", "cancelled_after_acceptance"];

const TYPE_LABELS: Record<string, string> = {
  dine_in: "طاولات (صالة)",
  takeaway: "استلام (تيك أواي)",
  delivery: "توصيل (دلفري)",
};
const TYPE_ICONS: Record<string, typeof Store> = {
  dine_in: UtensilsCrossed,
  takeaway: ShoppingBag,
  delivery: Truck,
};

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const iso = (d: Date) => d.toISOString().slice(0, 10);

interface PosRow {
  order_type: string | null;
  state: string;
  total: number | null;
  branch_id: string | null;
  created_at: string;
}
interface CcRow {
  total: number | null;
  delivery_fee: number | null;
  status: string | null;
  target_branch_name: string | null;
  delivery_info: any;
  created_at: string;
}

interface TypeRow {
  type: string;
  label: string;
  orders: number;
  gross: number;
  avg: number;
  cancelled: number;
  cancelledAmount: number;
  share: number;
}
interface BranchRow {
  branch: string;
  dine_in: number;
  takeaway: number;
  delivery: number;
  total: number;
  orders: number;
}
interface AreaRow {
  area: string;
  branches: string;
  orders: number;
  cancelled: number;
  gross: number;
  fee: number;
  net: number;
  avg: number;
  share: number;
}

export default function DeliveryAreaSalesPage({ defaultTab = "type" }: { defaultTab?: "type" | "area" }) {
  const navigate = useNavigate();
  const { dataOwnerId } = useDataOwnerId();
  const { settings } = useCompanySettings();
  const companyName = (settings as any)?.company_name || "الشركة";

  const today = new Date();
  const monthAgo = new Date(today.getTime() - 29 * 86400000);
  const [from, setFrom] = useState(iso(monthAgo));
  const [to, setTo] = useState(iso(today));
  const [branch, setBranch] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"net" | "orders" | "avg">("net");
  const [tab, setTab] = useState<"type" | "area">(defaultTab);

  const fromTs = `${from}T00:00:00`;
  const toTs = `${to}T23:59:59.999`;

  /* ── Branch directory ───────────────────────────────────────── */
  const { data: branchList = [] } = useQuery({
    queryKey: ["dsr-branches", dataOwnerId],
    enabled: !!dataOwnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name")
        .eq("user_id", dataOwnerId!)
        .order("name");
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
  });
  const branchName = useMemo(() => {
    const m = new Map<string, string>();
    branchList.forEach((b) => m.set(b.id, b.name));
    return m;
  }, [branchList]);

  /* ── POS orders (sales by type) ─────────────────────────────── */
  const { data: posOrders = [], isLoading: loadingPos, refetch: refetchPos } = useQuery({
    queryKey: ["dsr-pos", dataOwnerId, from, to],
    enabled: !!dataOwnerId,
    queryFn: async () => {
      const all: PosRow[] = [];
      const PAGE = 1000;
      for (let page = 0; page < 60; page++) {
        const { data, error } = await supabase
          .from("pos_orders")
          .select("order_type, state, total, branch_id, created_at")
          .eq("user_id", dataOwnerId!)
          .in("state", ["paid", "cancelled"])
          .eq("is_return", false)
          .gte("created_at", fromTs)
          .lte("created_at", toTs)
          .order("created_at", { ascending: false })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) throw error;
        const rows = (data || []) as PosRow[];
        all.push(...rows);
        if (rows.length < PAGE) break;
      }
      return all;
    },
  });

  /* ── Call center orders (Nablus areas) ──────────────────────── */
  const { data: ccOrders = [], isLoading: loadingCc, refetch: refetchCc } = useQuery({
    queryKey: ["dsr-cc", dataOwnerId, from, to],
    enabled: !!dataOwnerId,
    queryFn: async () => {
      const all: CcRow[] = [];
      const PAGE = 1000;
      for (let page = 0; page < 40; page++) {
        const { data, error } = await supabase
          .from("call_center_orders")
          .select("total, delivery_fee, status, target_branch_name, delivery_info, created_at")
          .eq("user_id", dataOwnerId!)
          .eq("delivery_info->>city", CITY)
          .gte("created_at", fromTs)
          .lte("created_at", toTs)
          .order("created_at", { ascending: false })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) throw error;
        const rows = (data || []) as CcRow[];
        all.push(...rows);
        if (rows.length < PAGE) break;
      }
      return all;
    },
  });

  const isLoading = tab === "type" ? loadingPos : loadingCc;

  /* ── Branch options (union of both sources) ─────────────────── */
  const branchOptions = useMemo(() => {
    const s = new Set<string>();
    posOrders.forEach((o) => {
      const n = o.branch_id ? branchName.get(o.branch_id) : null;
      if (n) s.add(n);
    });
    ccOrders.forEach((o) => o.target_branch_name && s.add(o.target_branch_name));
    return Array.from(s).sort();
  }, [posOrders, ccOrders, branchName]);

  /* ── Aggregation: sales by type ─────────────────────────────── */
  const typeAgg = useMemo(() => {
    const map = new Map<string, TypeRow>();
    const bmap = new Map<string, BranchRow>();
    let gGross = 0, gOrders = 0, gCancelled = 0, gCancelledAmt = 0;

    posOrders.forEach((o) => {
      const bName = (o.branch_id ? branchName.get(o.branch_id) : null) || "غير محدد";
      if (branch !== "all" && bName !== branch) return;
      const type = o.order_type || "dine_in";
      const amount = Number(o.total || 0);

      let r = map.get(type);
      if (!r) {
        r = { type, label: TYPE_LABELS[type] || type, orders: 0, gross: 0, avg: 0, cancelled: 0, cancelledAmount: 0, share: 0 };
        map.set(type, r);
      }
      if (o.state === "cancelled") {
        r.cancelled += 1; r.cancelledAmount += amount;
        gCancelled += 1; gCancelledAmt += amount;
        return;
      }
      r.orders += 1; r.gross += amount;
      gOrders += 1; gGross += amount;

      let b = bmap.get(bName);
      if (!b) { b = { branch: bName, dine_in: 0, takeaway: 0, delivery: 0, total: 0, orders: 0 }; bmap.set(bName, b); }
      if (type === "dine_in") b.dine_in += amount;
      else if (type === "takeaway") b.takeaway += amount;
      else if (type === "delivery") b.delivery += amount;
      b.total += amount; b.orders += 1;
    });

    const rows = Array.from(map.values())
      .map((r) => ({ ...r, avg: r.orders ? r.gross / r.orders : 0, share: gGross ? (r.gross / gGross) * 100 : 0 }))
      .sort((a, b) => b.gross - a.gross);
    const branchRows = Array.from(bmap.values()).sort((a, b) => b.total - a.total);

    return { rows, branchRows, totals: { gross: gGross, orders: gOrders, cancelled: gCancelled, cancelledAmount: gCancelledAmt, avg: gOrders ? gGross / gOrders : 0 } };
  }, [posOrders, branch, branchName]);

  /* ── Aggregation: Nablus areas ──────────────────────────────── */
  const areaAgg = useMemo(() => {
    const map = new Map<string, AreaRow & { branchSet: Set<string> }>();
    let gGross = 0, gFee = 0, gOrders = 0, gCancelled = 0;

    ccOrders.forEach((o) => {
      if (branch !== "all" && o.target_branch_name !== branch) return;
      const area = (o.delivery_info?.area || "").toString().trim() || "غير محدد";
      const isCancelled = CC_CANCELLED.includes((o.status || "").toLowerCase());
      const total = Number(o.total || 0);
      const fee = Number(o.delivery_fee ?? o.delivery_info?.final_fee ?? 0);

      let r = map.get(area);
      if (!r) {
        r = { area, branches: "", orders: 0, cancelled: 0, gross: 0, fee: 0, net: 0, avg: 0, share: 0, branchSet: new Set() };
        map.set(area, r);
      }
      if (o.target_branch_name) r.branchSet.add(o.target_branch_name);
      if (isCancelled) { r.cancelled += 1; gCancelled += 1; return; }
      r.orders += 1; r.gross += total; r.fee += fee;
      gOrders += 1; gGross += total; gFee += fee;
    });

    let list = Array.from(map.values()).map((r) => ({
      ...r,
      branches: Array.from(r.branchSet).join("، "),
      net: r.gross - r.fee,
      avg: r.orders ? r.gross / r.orders : 0,
      share: gGross ? (r.gross / gGross) * 100 : 0,
    }));
    const q = search.trim();
    if (q) list = list.filter((r) => r.area.includes(q));
    list.sort((a, b) => (sortBy === "orders" ? b.orders - a.orders : sortBy === "avg" ? b.avg - a.avg : b.gross - a.gross));

    return {
      rows: list as AreaRow[],
      totals: { gross: gGross, fee: gFee, net: gGross - gFee, orders: gOrders, cancelled: gCancelled, areas: list.length },
    };
  }, [ccOrders, branch, search, sortBy]);

  /* ── Columns ────────────────────────────────────────────────── */
  const typeColumns: RtlColumn<TypeRow>[] = [
    { key: "label", header: "نوع البيع", render: (r) => {
        const Icon = TYPE_ICONS[r.type] || Store;
        return <span className="flex items-center gap-2 font-medium"><Icon className="h-4 w-4 text-muted-foreground" />{r.label}</span>;
      } },
    { key: "orders", header: "عدد الطلبات", align: "center", render: (r) => r.orders.toLocaleString("en-US") },
    { key: "gross", header: "إجمالي المبيعات", align: "center", render: (r) => <span className="font-mono">{money(r.gross)}</span> },
    { key: "avg", header: "متوسط الطلب", align: "center", render: (r) => <span className="font-mono">{money(r.avg)}</span> },
    { key: "cancelled", header: "ملغاة", align: "center", render: (r) => (r.cancelled ? <span className="text-rose-600">{r.cancelled}</span> : "—") },
    { key: "cancelledAmount", header: "قيمة الملغاة", align: "center", render: (r) => <span className="font-mono text-rose-600">{r.cancelledAmount ? money(r.cancelledAmount) : "—"}</span> },
    { key: "share", header: "الحصة %", align: "center", render: (r) => `${r.share.toFixed(1)}%` },
  ];

  const branchColumns: RtlColumn<BranchRow>[] = [
    { key: "branch", header: "الفرع", render: (r) => <span className="font-medium">{r.branch}</span> },
    { key: "dine_in", header: "طاولات", align: "center", render: (r) => <span className="font-mono">{money(r.dine_in)}</span> },
    { key: "takeaway", header: "استلام", align: "center", render: (r) => <span className="font-mono">{money(r.takeaway)}</span> },
    { key: "delivery", header: "توصيل", align: "center", render: (r) => <span className="font-mono">{money(r.delivery)}</span> },
    { key: "orders", header: "عدد الطلبات", align: "center", render: (r) => r.orders.toLocaleString("en-US") },
    { key: "total", header: "الإجمالي", align: "center", render: (r) => <span className="font-mono font-bold text-emerald-600">{money(r.total)}</span> },
  ];

  const areaColumns: RtlColumn<AreaRow>[] = [
    { key: "idx", header: "#", align: "center", width: 48, render: (_r, i) => i + 1 },
    { key: "area", header: "المنطقة", render: (r) => <span className="font-medium">{r.area}</span> },
    { key: "branches", header: "الفرع", render: (r) => <span className="text-xs text-muted-foreground">{r.branches || "—"}</span> },
    { key: "orders", header: "عدد الطلبات", align: "center", render: (r) => r.orders },
    { key: "gross", header: "إجمالي المبيعات", align: "center", render: (r) => <span className="font-mono">{money(r.gross)}</span> },
    { key: "fee", header: "أجور التوصيل", align: "center", render: (r) => <span className="font-mono text-amber-600">{money(r.fee)}</span> },
    { key: "net", header: "صافي بدون التوصيل", align: "center", render: (r) => <span className="font-mono text-emerald-600">{money(r.net)}</span> },
    { key: "avg", header: "متوسط الطلب", align: "center", render: (r) => <span className="font-mono">{money(r.avg)}</span> },
    { key: "cancelled", header: "ملغاة", align: "center", render: (r) => (r.cancelled ? <span className="text-rose-600">{r.cancelled}</span> : "—") },
    { key: "share", header: "الحصة %", align: "center", render: (r) => `${r.share.toFixed(1)}%` },
  ];

  const period = formatPeriodLabel(from, to);
  const branchLabel = branch === "all" ? "كل الفروع" : branch;

  /* ── Excel ──────────────────────────────────────────────────── */
  const handleExcel = () => {
    if (tab === "type") {
      if (!typeAgg.rows.length) { toast({ title: "لا توجد بيانات للتصدير", variant: "destructive" }); return; }
      exportToExcelBranded({
        title: "تقرير المبيعات حسب نوع البيع",
        sheetName: "حسب النوع",
        fileName: `مبيعات-حسب-النوع-${from}_${to}`,
        companyName,
        currency: "شيكل ₪",
        period,
        extraInfo: [`الفرع: ${branchLabel}`],
        columns: ["نوع البيع", "عدد الطلبات", "إجمالي المبيعات", "متوسط الطلب", "ملغاة", "قيمة الملغاة", "الحصة %"],
        rows: typeAgg.rows.map((r) => [r.label, r.orders, Number(r.gross.toFixed(2)), Number(r.avg.toFixed(2)), r.cancelled, Number(r.cancelledAmount.toFixed(2)), Number(r.share.toFixed(1))]),
        totalsRow: ["الإجمالي", typeAgg.totals.orders, Number(typeAgg.totals.gross.toFixed(2)), Number(typeAgg.totals.avg.toFixed(2)), typeAgg.totals.cancelled, Number(typeAgg.totals.cancelledAmount.toFixed(2)), 100],
      });
    } else {
      if (!areaAgg.rows.length) { toast({ title: "لا توجد بيانات للتصدير", variant: "destructive" }); return; }
      exportToExcelBranded({
        title: `مبيعات الدلفري حسب المناطق — ${CITY}`,
        sheetName: "مناطق نابلس",
        fileName: `مبيعات-المناطق-نابلس-${from}_${to}`,
        companyName,
        currency: "شيكل ₪",
        period,
        extraInfo: [`الفرع: ${branchLabel}`],
        columns: ["#", "المنطقة", "الفرع", "عدد الطلبات", "إجمالي المبيعات", "أجور التوصيل", "صافي بدون التوصيل", "متوسط الطلب", "ملغاة", "الحصة %"],
        rows: areaAgg.rows.map((r, i) => [i + 1, r.area, r.branches, r.orders, Number(r.gross.toFixed(2)), Number(r.fee.toFixed(2)), Number(r.net.toFixed(2)), Number(r.avg.toFixed(2)), r.cancelled, Number(r.share.toFixed(1))]),
        totalsRow: ["", `الإجمالي (${areaAgg.totals.areas} منطقة)`, "", areaAgg.totals.orders, Number(areaAgg.totals.gross.toFixed(2)), Number(areaAgg.totals.fee.toFixed(2)), Number(areaAgg.totals.net.toFixed(2)), "", areaAgg.totals.cancelled, 100],
      });
    }
  };

  /* ── Print ──────────────────────────────────────────────────── */
  const handlePrint = () => {
    const headerBlock = (title: string, right: string) => `
      <div class="print-header">
        <div>
          <div class="company-name">${companyName}</div>
          <div class="report-title">${title}</div>
          <div class="report-title">الفترة: ${period} — الفرع: ${branchLabel}</div>
        </div>
        <div class="print-date">${right}</div>
      </div>`;

    let contentHtml = "";
    if (tab === "type") {
      if (!typeAgg.rows.length) { toast({ title: "لا توجد بيانات للطباعة", variant: "destructive" }); return; }
      const t = typeAgg.totals;
      contentHtml = `
        ${headerBlock("تقرير المبيعات حسب نوع البيع (طاولات / استلام / توصيل)", `${t.orders.toLocaleString("en-US")} طلب`)}
        <div class="summary-row">
          <div class="summary-card"><div class="summary-label">إجمالي المبيعات</div><div class="summary-value green">₪${money(t.gross)}</div></div>
          <div class="summary-card"><div class="summary-label">عدد الطلبات</div><div class="summary-value">${t.orders.toLocaleString("en-US")}</div></div>
          <div class="summary-card"><div class="summary-label">متوسط الطلب</div><div class="summary-value">₪${money(t.avg)}</div></div>
          <div class="summary-card"><div class="summary-label">طلبات ملغاة</div><div class="summary-value red">${t.cancelled} — ₪${money(t.cancelledAmount)}</div></div>
        </div>
        <table>
          <thead><tr><th>نوع البيع</th><th>عدد الطلبات</th><th>إجمالي المبيعات</th><th>متوسط الطلب</th><th>ملغاة</th><th>قيمة الملغاة</th><th>الحصة %</th></tr></thead>
          <tbody>${typeAgg.rows.map((r) => `
            <tr>
              <td>${r.label}</td>
              <td class="font-mono">${r.orders.toLocaleString("en-US")}</td>
              <td class="font-mono">${money(r.gross)}</td>
              <td class="font-mono">${money(r.avg)}</td>
              <td class="font-mono text-red">${r.cancelled || "—"}</td>
              <td class="font-mono text-red">${r.cancelledAmount ? money(r.cancelledAmount) : "—"}</td>
              <td class="font-mono">${r.share.toFixed(1)}%</td>
            </tr>`).join("")}</tbody>
          <tfoot><tr>
            <td>الإجمالي</td>
            <td class="font-mono">${t.orders.toLocaleString("en-US")}</td>
            <td class="font-mono">${money(t.gross)}</td>
            <td class="font-mono">${money(t.avg)}</td>
            <td class="font-mono">${t.cancelled}</td>
            <td class="font-mono">${money(t.cancelledAmount)}</td>
            <td class="font-mono">100.0%</td>
          </tr></tfoot>
        </table>
        <h3 style="margin:18px 0 8px;font-size:13px;color:#0D1B2E;">تفصيل حسب الفرع</h3>
        <table>
          <thead><tr><th>الفرع</th><th>طاولات</th><th>استلام</th><th>توصيل</th><th>عدد الطلبات</th><th>الإجمالي</th></tr></thead>
          <tbody>${typeAgg.branchRows.map((b) => `
            <tr>
              <td>${b.branch}</td>
              <td class="font-mono">${money(b.dine_in)}</td>
              <td class="font-mono">${money(b.takeaway)}</td>
              <td class="font-mono">${money(b.delivery)}</td>
              <td class="font-mono">${b.orders.toLocaleString("en-US")}</td>
              <td class="font-mono font-bold">${money(b.total)}</td>
            </tr>`).join("")}</tbody>
        </table>`;
    } else {
      if (!areaAgg.rows.length) { toast({ title: "لا توجد بيانات للطباعة", variant: "destructive" }); return; }
      const t = areaAgg.totals;
      contentHtml = `
        ${headerBlock(`مبيعات الدلفري حسب المناطق — ${CITY}`, `${t.areas} منطقة`)}
        <div class="summary-row">
          <div class="summary-card"><div class="summary-label">إجمالي المبيعات</div><div class="summary-value green">₪${money(t.gross)}</div></div>
          <div class="summary-card"><div class="summary-label">عدد الطلبات</div><div class="summary-value">${t.orders.toLocaleString("en-US")}</div></div>
          <div class="summary-card"><div class="summary-label">أجور التوصيل</div><div class="summary-value">₪${money(t.fee)}</div></div>
          <div class="summary-card"><div class="summary-label">صافي بدون التوصيل</div><div class="summary-value green">₪${money(t.net)}</div></div>
          <div class="summary-card"><div class="summary-label">طلبات ملغاة</div><div class="summary-value red">${t.cancelled}</div></div>
        </div>
        <table>
          <thead><tr><th>#</th><th>المنطقة</th><th>الفرع</th><th>عدد الطلبات</th><th>إجمالي المبيعات</th><th>أجور التوصيل</th><th>صافي بدون التوصيل</th><th>متوسط الطلب</th><th>ملغاة</th><th>الحصة %</th></tr></thead>
          <tbody>${areaAgg.rows.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${r.area}</td>
              <td>${r.branches || "—"}</td>
              <td class="font-mono">${r.orders}</td>
              <td class="font-mono">${money(r.gross)}</td>
              <td class="font-mono">${money(r.fee)}</td>
              <td class="font-mono">${money(r.net)}</td>
              <td class="font-mono">${money(r.avg)}</td>
              <td class="font-mono text-red">${r.cancelled || "—"}</td>
              <td class="font-mono">${r.share.toFixed(1)}%</td>
            </tr>`).join("")}</tbody>
          <tfoot><tr>
            <td colspan="3">الإجمالي (${t.areas} منطقة)</td>
            <td class="font-mono">${t.orders}</td>
            <td class="font-mono">${money(t.gross)}</td>
            <td class="font-mono">${money(t.fee)}</td>
            <td class="font-mono">${money(t.net)}</td>
            <td></td>
            <td class="font-mono">${t.cancelled}</td>
            <td class="font-mono">100.0%</td>
          </tr></tfoot>
        </table>`;
    }

    printReport({
      title: tab === "type" ? "تقرير المبيعات حسب نوع البيع" : `مبيعات الدلفري حسب المناطق — ${CITY}`,
      companyName,
      contentHtml,
    });
  };

  const actionTabs: ActionTab[] = [
    {
      key: "general",
      label: "عام",
      groups: [
        {
          key: "view",
          label: "عرض",
          items: [
            { key: "type", label: "حسب نوع البيع", icon: Store, onClick: () => setTab("type"), variant: tab === "type" ? "primary" : "default" },
            { key: "area", label: "مناطق نابلس", icon: MapPin, onClick: () => setTab("area"), variant: tab === "area" ? "primary" : "default" },
            { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: () => { refetchPos(); refetchCc(); } },
          ],
        },
        {
          key: "output",
          label: "إخراج",
          items: [
            { key: "print", label: "طباعة", icon: Printer, onClick: handlePrint },
            { key: "excel", label: "تصدير Excel", icon: FileSpreadsheet, onClick: handleExcel },
          ],
        },
        {
          key: "nav",
          label: "تنقّل",
          items: [{ key: "back", label: "التقارير", onClick: () => navigate("/reports") }],
        },
      ],
    },
  ];

  const kpis = tab === "type"
    ? [
        { label: "إجمالي المبيعات", value: money(typeAgg.totals.gross), tone: "text-emerald-600" },
        { label: "عدد الطلبات", value: typeAgg.totals.orders.toLocaleString("en-US"), tone: "text-sky-600" },
        { label: "متوسط الطلب", value: money(typeAgg.totals.avg), tone: "text-violet-600" },
        { label: "الملغاة (عدد / قيمة)", value: `${typeAgg.totals.cancelled} — ${money(typeAgg.totals.cancelledAmount)}`, tone: "text-rose-600" },
      ]
    : [
        { label: "إجمالي المبيعات", value: money(areaAgg.totals.gross), tone: "text-emerald-600" },
        { label: "عدد الطلبات", value: areaAgg.totals.orders.toLocaleString("en-US"), tone: "text-sky-600" },
        { label: "أجور التوصيل", value: money(areaAgg.totals.fee), tone: "text-amber-600" },
        { label: "عدد المناطق", value: areaAgg.totals.areas.toLocaleString("en-US"), tone: "text-violet-600" },
      ];

  return (
    <FinanceShell
      title="تقارير المبيعات — الأنواع والمناطق"
      subtitle={tab === "type" ? "طاولات / استلام / توصيل" : `مناطق التوصيل داخل ${CITY}`}
      breadcrumb={[{ label: "التقارير", href: "/reports" }, { label: "المبيعات حسب النوع والمنطقة" }]}
      actionTabs={actionTabs}
    >
      <div className="p-3 sm:p-4 space-y-3 overflow-auto" dir="rtl">
        {/* Filters */}
        <div className="rounded-lg border border-border bg-card p-3 grid grid-cols-2 lg:grid-cols-5 gap-2">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">من تاريخ</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">إلى تاريخ</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">الفرع</label>
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفروع</SelectItem>
                {branchOptions.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">الترتيب (المناطق)</label>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="net">الأعلى مبيعات</SelectItem>
                <SelectItem value="orders">الأكثر طلبات</SelectItem>
                <SelectItem value="avg">الأعلى متوسط طلب</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 col-span-2 lg:col-span-1">
            <label className="text-[11px] text-muted-foreground">بحث عن منطقة</label>
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pr-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="مثال: رفيديا" />
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] text-muted-foreground">{k.label}</div>
              <div className={`font-bold font-mono truncate ${k.tone}`}>{k.value}</div>
            </div>
          ))}
        </div>

        {tab === "type" ? (
          <FastTabs
            items={[
              {
                key: "by-type",
                title: "المبيعات حسب نوع البيع",
                summary: `${typeAgg.rows.length} أنواع • ₪${money(typeAgg.totals.gross)}`,
                children: (
                  <div className="overflow-hidden rounded-md border border-border">
                    <RtlDataTable
                      columns={typeColumns}
                      rows={typeAgg.rows}
                      rowKey={(r) => r.type}
                      loading={isLoading}
                      loadingMessage="جاري تحميل بيانات المبيعات..."
                      emptyMessage="لا توجد مبيعات ضمن الفترة المحددة"
                    />
                  </div>
                ),
              },
              {
                key: "by-branch",
                title: "تفصيل حسب الفرع",
                summary: `${typeAgg.branchRows.length} فرع`,
                children: (
                  <div className="overflow-hidden rounded-md border border-border">
                    <RtlDataTable
                      columns={branchColumns}
                      rows={typeAgg.branchRows}
                      rowKey={(r) => r.branch}
                      loading={isLoading}
                      emptyMessage="لا توجد بيانات فروع"
                    />
                  </div>
                ),
              },
            ]}
          />
        ) : (
          <FastTabs
            items={[
              {
                key: "areas",
                title: `مناطق التوصيل — ${CITY}`,
                summary: `${areaAgg.totals.areas} منطقة • ₪${money(areaAgg.totals.gross)}`,
                children: (
                  <div className="overflow-hidden rounded-md border border-border">
                    <RtlDataTable
                      columns={areaColumns}
                      rows={areaAgg.rows}
                      rowKey={(r) => r.area}
                      loading={isLoading}
                      loadingMessage="جاري تحميل بيانات المناطق..."
                      emptyMessage="لا توجد طلبات دلفري في نابلس ضمن الفترة المحددة"
                    />
                    {!!areaAgg.rows.length && (
                      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-t bg-muted/30 text-sm">
                        <span className="font-bold">الإجمالي ({areaAgg.totals.areas} منطقة)</span>
                        <span className="font-mono">مبيعات: {money(areaAgg.totals.gross)}</span>
                        <span className="font-mono text-amber-600">توصيل: {money(areaAgg.totals.fee)}</span>
                        <span className="font-mono text-emerald-600">صافي: {money(areaAgg.totals.net)}</span>
                        <span className="font-mono">طلبات: {areaAgg.totals.orders}</span>
                        <span className="font-mono text-rose-600">ملغاة: {areaAgg.totals.cancelled}</span>
                      </div>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>
    </FinanceShell>
  );
}
