import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { ArrowRight, Download, MapPin, Truck, Receipt, TrendingUp, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RtlDataTable, type RtlColumn } from "@/components/ui/RtlDataTable";
import { setNextExportBranding } from "@/lib/excel-export";

const CITY = "نابلس";
const CANCELLED = ["cancelled", "cancelled_after_acceptance"];

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const iso = (d: Date) => d.toISOString().slice(0, 10);

interface RawOrder {
  total: number | null;
  delivery_fee: number | null;
  status: string | null;
  target_branch_name: string | null;
  delivery_info: any;
  created_at: string;
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

export default function DeliveryAreaSalesPage() {
  const navigate = useNavigate();
  const { dataOwnerId } = useDataOwnerId();

  const today = new Date();
  const monthAgo = new Date(today.getTime() - 29 * 86400000);
  const [from, setFrom] = useState(iso(monthAgo));
  const [to, setTo] = useState(iso(today));
  const [branch, setBranch] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"net" | "orders" | "avg">("net");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["delivery-area-sales", dataOwnerId, from, to],
    enabled: !!dataOwnerId,
    queryFn: async () => {
      const all: RawOrder[] = [];
      const PAGE = 1000;
      for (let page = 0; page < 40; page++) {
        const { data, error } = await supabase
          .from("call_center_orders")
          .select("total, delivery_fee, status, target_branch_name, delivery_info, created_at")
          .eq("user_id", dataOwnerId!)
          .eq("delivery_info->>city", CITY)
          .gte("created_at", `${from}T00:00:00`)
          .lte("created_at", `${to}T23:59:59.999`)
          .order("created_at", { ascending: false })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) throw error;
        const rows = (data || []) as RawOrder[];
        all.push(...rows);
        if (rows.length < PAGE) break;
      }
      return all;
    },
  });

  const branches = useMemo(() => {
    const s = new Set<string>();
    orders.forEach((o) => o.target_branch_name && s.add(o.target_branch_name));
    return Array.from(s).sort();
  }, [orders]);

  const { rows, totals } = useMemo(() => {
    const map = new Map<string, AreaRow & { branchSet: Set<string> }>();
    let gGross = 0, gFee = 0, gOrders = 0, gCancelled = 0;

    orders.forEach((o) => {
      if (branch !== "all" && o.target_branch_name !== branch) return;
      const area = (o.delivery_info?.area || "غير محدد").toString().trim() || "غير محدد";
      const isCancelled = CANCELLED.includes((o.status || "").toLowerCase());
      const total = Number(o.total || 0);
      const fee = Number(o.delivery_fee ?? o.delivery_info?.final_fee ?? 0);

      let r = map.get(area);
      if (!r) {
        r = { area, branches: "", orders: 0, cancelled: 0, gross: 0, fee: 0, net: 0, avg: 0, share: 0, branchSet: new Set() };
        map.set(area, r);
      }
      if (o.target_branch_name) r.branchSet.add(o.target_branch_name);
      if (isCancelled) { r.cancelled += 1; gCancelled += 1; return; }
      r.orders += 1;
      r.gross += total;
      r.fee += fee;
      gOrders += 1;
      gGross += total;
      gFee += fee;
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

    list.sort((a, b) =>
      sortBy === "orders" ? b.orders - a.orders : sortBy === "avg" ? b.avg - a.avg : b.gross - a.gross
    );

    return {
      rows: list as AreaRow[],
      totals: { gross: gGross, fee: gFee, net: gGross - gFee, orders: gOrders, cancelled: gCancelled, areas: list.length },
    };
  }, [orders, branch, search, sortBy]);

  const columns: RtlColumn<AreaRow>[] = [
    { key: "idx", header: "#", align: "center", width: 48, render: (_r, i) => i + 1 },
    { key: "area", header: "المنطقة", render: (r) => <span className="font-medium">{r.area}</span> },
    { key: "branches", header: "الفرع", render: (r) => <span className="text-xs text-muted-foreground">{r.branches || "—"}</span> },
    { key: "orders", header: "عدد الطلبات", align: "center", render: (r) => r.orders },
    { key: "gross", header: "إجمالي المبيعات", align: "center", render: (r) => <span className="font-mono">{fmt(r.gross)}</span> },
    { key: "fee", header: "أجور التوصيل", align: "center", render: (r) => <span className="font-mono text-amber-600">{fmt(r.fee)}</span> },
    { key: "net", header: "صافي بدون التوصيل", align: "center", render: (r) => <span className="font-mono text-emerald-600">{fmt(r.net)}</span> },
    { key: "avg", header: "متوسط الطلب", align: "center", render: (r) => <span className="font-mono">{fmt(r.avg)}</span> },
    { key: "cancelled", header: "ملغاة", align: "center", render: (r) => (r.cancelled ? <span className="text-rose-600">{r.cancelled}</span> : "—") },
    { key: "share", header: "الحصة %", align: "center", render: (r) => `${r.share.toFixed(1)}%` },
  ];

  const exportExcel = () => {
    setNextExportBranding({
      title: `مبيعات الدلفري حسب المناطق - ${CITY}`,
      currency: "شيكل ₪",
      period: `${from} → ${to}`,
    });
    const ws = XLSX.utils.json_to_sheet(
      rows.map((r, i) => ({
        "#": i + 1,
        "المنطقة": r.area,
        "الفرع": r.branches,
        "عدد الطلبات": r.orders,
        "إجمالي المبيعات": Number(r.gross.toFixed(2)),
        "أجور التوصيل": Number(r.fee.toFixed(2)),
        "صافي بدون التوصيل": Number(r.net.toFixed(2)),
        "متوسط الطلب": Number(r.avg.toFixed(2)),
        "ملغاة": r.cancelled,
        "الحصة %": Number(r.share.toFixed(1)),
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "مناطق نابلس");
    XLSX.writeFile(wb, `مبيعات-المناطق-نابلس-${from}_${to}.xlsx`);
  };

  const kpis = [
    { label: "إجمالي المبيعات", value: fmt(totals.gross), icon: TrendingUp, tone: "text-emerald-600" },
    { label: "عدد الطلبات", value: totals.orders.toLocaleString("en-US"), icon: Receipt, tone: "text-sky-600" },
    { label: "أجور التوصيل", value: fmt(totals.fee), icon: Truck, tone: "text-amber-600" },
    { label: "عدد المناطق", value: totals.areas.toLocaleString("en-US"), icon: MapPin, tone: "text-violet-600" },
  ];

  return (
    <div dir="rtl" className="p-3 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/reports")}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">مبيعات الدلفري حسب المناطق — {CITY}</h1>
            <p className="text-xs text-muted-foreground">تحليل طلبات الكول سنتر الموصّلة داخل نابلس حسب المنطقة والفرع</p>
          </div>
        </div>
        <Button onClick={exportExcel} disabled={!rows.length} className="gap-2">
          <Download className="h-4 w-4" /> تصدير Excel
        </Button>
      </div>

      <Card className="p-3 grid grid-cols-2 lg:grid-cols-5 gap-2">
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
              {branches.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">الترتيب</label>
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
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
                <Icon className={`h-5 w-5 ${k.tone}`} />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-muted-foreground">{k.label}</div>
                <div className="font-bold font-mono truncate">{k.value}</div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <RtlDataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.area}
          loading={isLoading}
          loadingMessage="جاري تحميل بيانات المناطق..."
          emptyMessage="لا توجد طلبات دلفري في نابلس ضمن الفترة المحددة"
        />
        {!!rows.length && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t bg-muted/30 text-sm">
            <span className="font-bold">الإجمالي ({totals.areas} منطقة)</span>
            <span className="font-mono">مبيعات: {fmt(totals.gross)}</span>
            <span className="font-mono text-amber-600">توصيل: {fmt(totals.fee)}</span>
            <span className="font-mono text-emerald-600">صافي: {fmt(totals.net)}</span>
            <span className="font-mono">طلبات: {totals.orders}</span>
            <span className="font-mono text-rose-600">ملغاة: {totals.cancelled}</span>
          </div>
        )}
      </Card>
    </div>
  );
}
