import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  RefreshCw, ChevronDown, ChevronLeft, Megaphone, Calendar, Store, Package,
  TrendingUp, TrendingDown, X, AlertCircle, Trophy, BarChart3, Check,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";

interface Props { theme?: "light" | "dark" }

type Campaign = {
  id: string;
  slug: string;
  name: string;
  year: number;
  season: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  is_live?: boolean;
  pos_category_id?: string | null;
};

type SaleRow = {
  campaign_id: string;
  sale_date: string;
  item_name: string;
  variant: string | null;
  qty_take_out: number;
  qty_dine_in: number;
  unit_price: number;
  total_amount: number;
  branch_name: string | null;
};

const ALL = "__all__";

const SEASON_LABEL: Record<string, string> = {
  ramadan: "رمضان", tawjihi: "توجيهي", winter: "الشتاء",
  eid: "عيد الفطر", opening: "افتتاح", other: "عرض",
};

const SEASON_STYLE: Record<string, { pill: string; bar: string; ring: string }> = {
  ramadan: { pill: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300", bar: "bg-violet-500", ring: "ring-violet-400" },
  tawjihi: { pill: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300", bar: "bg-sky-500", ring: "ring-sky-400" },
  winter:  { pill: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300", bar: "bg-cyan-500", ring: "ring-cyan-400" },
  eid:     { pill: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", bar: "bg-amber-500", ring: "ring-amber-400" },
  opening: { pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", bar: "bg-emerald-500", ring: "ring-emerald-400" },
  other:   { pill: "bg-muted text-muted-foreground", bar: "bg-slate-500", ring: "ring-slate-400" },
};

// hsl vars from index.css — use CSS variables so charts follow theme
const CHART_PALETTE = ["#8B5CF6", "#0EA5E9", "#06B6D4", "#F59E0B", "#10B981", "#EF4444", "#DB2777", "#0F766E", "#B45309"];

function fmtN(n: number) { return Math.round(Number(n) || 0).toLocaleString("en-US"); }
function fmtNIS(n: number) { return `₪${fmtN(n)}`; }
function fmtDate(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" });
}

// Weekday helpers — Sunday..Saturday, aligned with Arabic labels
const WEEKDAY_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
function weekdayIndex(iso: string): number {
  return new Date(iso + "T00:00:00").getDay();
}
function weekdayLabel(iso: string): string {
  return WEEKDAY_AR[weekdayIndex(iso)] || "";
}

// Fetch campaigns + sales (paginated) via supabase-js
async function fetchAll() {
  const { data: campaigns, error: cErr } = await supabase
    .from("marketing_campaigns")
    .select("id,slug,name,year,season,start_date,end_date,status,is_live,pos_category_id")
    .order("start_date", { ascending: true });
  if (cErr) throw cErr;

  const PAGE = 1000;
  const sales: SaleRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("marketing_campaign_sales")
      .select("campaign_id,sale_date,item_name,variant,qty_take_out,qty_dine_in,unit_price,total_amount,branch_name")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    sales.push(...(data as SaleRow[]));
    if (data.length < PAGE) break;
  }

  // Fetch live campaign daily aggregates from POS via RPC and merge as synthetic sale rows
  const liveCampaigns = (campaigns || []).filter((c: any) => c.is_live && c.pos_category_id);
  for (const lc of liveCampaigns) {
    const { data: rows, error: rErr } = await supabase.rpc("get_live_campaign_daily", {
      _pos_category_id: lc.pos_category_id,
    });
    if (rErr) throw rErr;
    for (const r of (rows || []) as Array<{ sale_date: string; branch_name: string; orders_count: number; qty: number; total: number }>) {
      sales.push({
        campaign_id: lc.id,
        sale_date: r.sale_date,
        item_name: "—",
        variant: null,
        qty_take_out: 0,
        qty_dine_in: Number(r.qty) || 0,
        unit_price: 0,
        total_amount: Number(r.total) || 0,
        branch_name: r.branch_name,
      });
    }
  }

  return { campaigns: (campaigns || []) as Campaign[], sales };
}

export default function PortalCampaignsTab({ theme }: Props) {
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["portal-campaigns"],
    queryFn: fetchAll,
    staleTime: 5 * 60 * 1000,
  });

  const campaigns = data?.campaigns || [];
  const sales = data?.sales || [];

  const [branchFilter, setBranchFilter] = useState<string>(ALL);
  const [yearFilter, setYearFilter] = useState<string>(ALL);
  const [selected, setSelected] = useState<string[]>([]);   // slugs to compare
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);

  const branches = useMemo(() => {
    const s = new Set<string>();
    sales.forEach(x => { if (x.branch_name) s.add(x.branch_name); });
    return Array.from(s).sort();
  }, [sales]);

  const years = useMemo(() => {
    const s = new Set<number>();
    campaigns.forEach(c => s.add(c.year));
    return Array.from(s).sort();
  }, [campaigns]);

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(c => yearFilter === ALL || String(c.year) === yearFilter);
  }, [campaigns, yearFilter]);

  // stats per campaign, respecting branch filter
  const stats = useMemo(() => {
    const map = new Map<string, {
      total: number; qty: number; qtyOut: number; qtyIn: number; days: Set<string>;
      byBranch: Map<string, number>;
      byItem: Map<string, { qty: number; total: number }>;
      byDate: Map<string, number>;
    }>();
    for (const s of sales) {
      if (branchFilter !== ALL && s.branch_name !== branchFilter) continue;
      let e = map.get(s.campaign_id);
      if (!e) {
        e = { total: 0, qty: 0, qtyOut: 0, qtyIn: 0, days: new Set(), byBranch: new Map(), byItem: new Map(), byDate: new Map() };
        map.set(s.campaign_id, e);
      }
      const t = Number(s.total_amount) || 0;
      const qo = Number(s.qty_take_out) || 0;
      const qi = Number(s.qty_dine_in) || 0;
      e.total += t; e.qtyOut += qo; e.qtyIn += qi; e.qty += qo + qi;
      e.days.add(s.sale_date);
      const br = s.branch_name || "—";
      e.byBranch.set(br, (e.byBranch.get(br) || 0) + t);
      const it = s.item_name || "بدون اسم";
      const cur = e.byItem.get(it) || { qty: 0, total: 0 };
      cur.qty += qo + qi; cur.total += t; e.byItem.set(it, cur);
      e.byDate.set(s.sale_date, (e.byDate.get(s.sale_date) || 0) + t);
    }
    return map;
  }, [sales, branchFilter]);

  // KPI totals (filtered by year+branch)
  const totals = useMemo(() => {
    let total = 0, qty = 0;
    for (const c of filteredCampaigns) {
      const st = stats.get(c.id);
      if (!st) continue;
      total += st.total; qty += st.qty;
    }
    return { total, qty, count: filteredCampaigns.length };
  }, [filteredCampaigns, stats]);

  // Best campaign
  const best = useMemo(() => {
    let winner: { c: Campaign; total: number } | null = null;
    for (const c of filteredCampaigns) {
      const t = stats.get(c.id)?.total || 0;
      if (!winner || t > winner.total) winner = { c, total: t };
    }
    return winner;
  }, [filteredCampaigns, stats]);

  // Year-over-year insights: group same season, compare newest vs prior
  const insights = useMemo(() => {
    const bySeason = new Map<string, Array<{ c: Campaign; total: number; qty: number; days: number }>>();
    for (const c of filteredCampaigns) {
      const st = stats.get(c.id);
      const arr = bySeason.get(c.season) || [];
      arr.push({ c, total: st?.total || 0, qty: st?.qty || 0, days: st?.days.size || 0 });
      bySeason.set(c.season, arr);
    }
    const rows: Array<{
      season: string; latest: Campaign; prior: Campaign;
      latestTotal: number; priorTotal: number; deltaPct: number;
      latestDaily: number; priorDaily: number; dailyDeltaPct: number;
    }> = [];
    for (const [season, arr] of bySeason) {
      if (arr.length < 2) continue;
      arr.sort((a, b) => b.c.year - a.c.year);
      const [latest, prior] = arr;
      if (latest.total === 0 || prior.total === 0) continue;
      const latestDaily = latest.days ? latest.total / latest.days : 0;
      const priorDaily = prior.days ? prior.total / prior.days : 0;
      rows.push({
        season, latest: latest.c, prior: prior.c,
        latestTotal: latest.total, priorTotal: prior.total,
        deltaPct: ((latest.total - prior.total) / prior.total) * 100,
        latestDaily, priorDaily,
        dailyDeltaPct: priorDaily ? ((latestDaily - priorDaily) / priorDaily) * 100 : 0,
      });
    }
    return rows;
  }, [filteredCampaigns, stats]);

  // Sort campaigns by total desc so best-performing sits on top for decision-makers
  const rankedCampaigns = useMemo(() => {
    return [...filteredCampaigns].sort((a, b) => (stats.get(b.id)?.total || 0) - (stats.get(a.id)?.total || 0));
  }, [filteredCampaigns, stats]);

  // Tawjihi live vs historical — weekday-fair comparison (Thu/Fri are the busy days)
  const tawjihiCompare = useMemo(() => {
    const live = campaigns.find(c => c.is_live && c.season === "tawjihi");
    if (!live) return null;
    const historical = campaigns.filter(c => c.season === "tawjihi" && !c.is_live);
    if (historical.length === 0) return null;

    // Per-day totals from `sales` (already respecting branch filter must be re-derived here)
    const inFilter = (b: string | null) => branchFilter === ALL || b === branchFilter;

    // day-level buckets: campaign_id -> date -> total
    const dayTotals = new Map<string, Map<string, number>>();
    for (const s of sales) {
      if (!inFilter(s.branch_name)) continue;
      const dm = dayTotals.get(s.campaign_id) || new Map<string, number>();
      dm.set(s.sale_date, (dm.get(s.sale_date) || 0) + (Number(s.total_amount) || 0));
      dayTotals.set(s.campaign_id, dm);
    }

    // aggregate historical across all historical tawjihi campaigns per (weekday, date)
    const histByDate = new Map<string, number>();
    for (const h of historical) {
      const dm = dayTotals.get(h.id);
      if (!dm) continue;
      for (const [d, t] of dm) histByDate.set(d, (histByDate.get(d) || 0) + t);
    }
    const liveByDate = dayTotals.get(live.id) || new Map<string, number>();

    // group by weekday
    type WD = { key: string; label: string; live: number; liveDays: number; hist: number; histDays: number };
    const weekdays: WD[] = WEEKDAY_AR.map((label, i) => ({ key: String(i), label, live: 0, liveDays: 0, hist: 0, histDays: 0 }));
    for (const [d, t] of liveByDate) {
      const w = weekdayIndex(d);
      weekdays[w].live += t; weekdays[w].liveDays += 1;
    }
    for (const [d, t] of histByDate) {
      const w = weekdayIndex(d);
      weekdays[w].hist += t; weekdays[w].histDays += 1;
    }
    const rows = weekdays.map(w => ({
      day: w.label,
      liveAvg: w.liveDays ? w.live / w.liveDays : 0,
      histAvg: w.histDays ? w.hist / w.histDays : 0,
      liveDays: w.liveDays,
      histDays: w.histDays,
    }));

    // totals for header
    let liveTotal = 0, liveDays = 0, histTotal = 0, histDays = 0;
    for (const [, t] of liveByDate) { liveTotal += t; liveDays += 1; }
    for (const [, t] of histByDate) { histTotal += t; histDays += 1; }
    const liveDaily = liveDays ? liveTotal / liveDays : 0;
    const histDaily = histDays ? histTotal / histDays : 0;

    // daily timeline for the live campaign — with weekday labels
    const liveTimeline = Array.from(liveByDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, t]) => ({ date: d.slice(5), day: weekdayLabel(d), label: `${weekdayLabel(d)} ${d.slice(5)}`, total: t }));

    // per-branch comparison (normalized branch names align between historical + live)
    const liveByBranch = new Map<string, { total: number; days: Set<string> }>();
    const histByBranch = new Map<string, { total: number; days: Set<string> }>();
    for (const s of sales) {
      if (!inFilter(s.branch_name)) continue;
      const br = s.branch_name || "—";
      if (s.campaign_id === live.id) {
        const e = liveByBranch.get(br) || { total: 0, days: new Set<string>() };
        e.total += Number(s.total_amount) || 0; e.days.add(s.sale_date);
        liveByBranch.set(br, e);
      } else if (historical.some(h => h.id === s.campaign_id)) {
        const e = histByBranch.get(br) || { total: 0, days: new Set<string>() };
        e.total += Number(s.total_amount) || 0; e.days.add(s.sale_date);
        histByBranch.set(br, e);
      }
    }
    const branchRows = Array.from(new Set([...liveByBranch.keys(), ...histByBranch.keys()])).map(br => {
      const l = liveByBranch.get(br); const h = histByBranch.get(br);
      const lAvg = l && l.days.size ? l.total / l.days.size : 0;
      const hAvg = h && h.days.size ? h.total / h.days.size : 0;
      return { branch: br, liveAvg: lAvg, histAvg: hAvg, delta: hAvg ? ((lAvg - hAvg) / hAvg) * 100 : 0 };
    }).sort((a, b) => b.liveAvg - a.liveAvg);

    return {
      live, historicalCount: historical.length,
      liveTotal, liveDays, liveDaily,
      histTotal, histDays, histDaily,
      rows, liveTimeline, branchRows,
    };
  }, [campaigns, sales, branchFilter]);

  const toggleSelect = (slug: string) => {
    setSelected(prev => prev.includes(slug) ? prev.filter(x => x !== slug) : [...prev, slug].slice(-6));
  };
  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const compareRows = useMemo(() => {
    return selected.map(slug => {
      const cp = campaigns.find(c => c.slug === slug); if (!cp) return null;
      const st = stats.get(cp.id);
      const days = st?.days.size || 1;
      return {
        slug, name: cp.name, season: cp.season,
        total: st?.total || 0,
        qty: st?.qty || 0,
        days,
        avg: (st?.total || 0) / days,
      };
    }).filter(Boolean) as Array<{ slug: string; name: string; season: string; total: number; qty: number; days: number; avg: number }>;
  }, [selected, campaigns, stats]);

  const compareDaily = useMemo(() => {
    if (selected.length < 2) return [];
    const selCamps = campaigns.filter(x => selected.includes(x.slug));
    const rows: Record<string, any>[] = [];
    const maxDays = Math.max(0, ...selCamps.map(cp => stats.get(cp.id)?.days.size || 0));
    for (let d = 0; d < maxDays; d++) rows.push({ day: d + 1 });
    selCamps.forEach(cp => {
      const st = stats.get(cp.id);
      if (!st) return;
      const sorted = Array.from(st.byDate.keys()).sort();
      sorted.forEach((date, idx) => {
        if (idx < rows.length) rows[idx][cp.slug] = st.byDate.get(date) || 0;
      });
    });
    return rows;
  }, [selected, campaigns, stats]);

  useEffect(() => {
    if (selected.length === 0) setShowCompare(false);
  }, [selected.length]);

  return (
    <div className="max-w-[1400px] mx-auto pb-8 space-y-4 px-2 sm:px-3" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
            <Megaphone className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-foreground truncate">العروض التسويقية</h1>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground tabular-nums">{fmtN(totals.count)} حملة · {fmtNIS(totals.total)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {selected.length > 0 && (
            <Button
              variant={showCompare ? "default" : "outline"}
              size="sm"
              onClick={() => setShowCompare(v => !v)}
              className="h-8 text-[11px] gap-1"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              مقارنة ({selected.length})
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-8 w-8 p-0">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue placeholder="السنة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>كل السنوات</SelectItem>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="الفرع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>كل الفروع</SelectItem>
            {branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card className="p-2.5">
          <p className="text-[10px] text-muted-foreground mb-1">عدد الحملات</p>
          <p className="text-lg sm:text-xl font-bold text-foreground tabular-nums">{fmtN(totals.count)}</p>
        </Card>
        <Card className="p-2.5">
          <p className="text-[10px] text-muted-foreground mb-1">إجمالي المبيعات</p>
          <p className="text-lg sm:text-xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{fmtNIS(totals.total)}</p>
        </Card>
        <Card className="p-2.5">
          <p className="text-[10px] text-muted-foreground mb-1">القطع المباعة</p>
          <p className="text-lg sm:text-xl font-bold text-foreground tabular-nums">{fmtN(totals.qty)}</p>
        </Card>
        <Card className="p-2.5">
          <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
            <Trophy className="h-3 w-3 text-amber-500" /> الأعلى مبيعاً
          </p>
          <p className="text-[13px] sm:text-sm font-bold text-foreground truncate" title={best?.c.name}>{best?.c.name || "—"}</p>
          <p className="text-[10px] text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">{fmtNIS(best?.total || 0)}</p>
        </Card>
      </div>

      {/* Year-over-Year insights strip */}
      {insights.length > 0 && (
        <Card className="p-2.5 sm:p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-[11px] sm:text-xs font-bold text-foreground">مقارنة سنوية — نفس الموسم</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {insights.map(i => {
              const up = i.deltaPct >= 0;
              const style = SEASON_STYLE[i.season] || SEASON_STYLE.other;
              return (
                <div key={i.season} className="rounded-md border border-border/50 p-2">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${style.pill}`}>
                      {SEASON_LABEL[i.season] || i.season}
                    </span>
                    <span className={`flex items-center gap-0.5 text-[11px] font-bold tabular-nums ${up ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {up ? "+" : ""}{i.deltaPct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                    <div>
                      <div className="text-muted-foreground">{i.latest.year}</div>
                      <div className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{fmtNIS(i.latestTotal)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">{i.prior.year}</div>
                      <div className="font-bold text-foreground/70 tabular-nums">{fmtNIS(i.priorTotal)}</div>
                    </div>
                  </div>
                  <div className="mt-1.5 pt-1.5 border-t border-border/40 text-[9px] text-muted-foreground tabular-nums">
                    متوسط/يوم: {fmtNIS(i.latestDaily)} مقابل {fmtNIS(i.priorDaily)} ({i.dailyDeltaPct >= 0 ? "+" : ""}{i.dailyDeltaPct.toFixed(0)}%)
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {error && (
        <Card className="p-3 border-destructive/40 bg-destructive/5 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> تعذر تحميل البيانات: {(error as Error).message}
        </Card>
      )}

      {/* Comparison panel */}
      {showCompare && selected.length > 0 && (
        <Card className="p-3 space-y-3 border-primary/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">مقارنة الحملات المختارة</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelected([])} className="h-7 text-[10px]">
              <X className="h-3 w-3 ml-1" /> مسح
            </Button>
          </div>

          {/* Bar chart totals */}
          <div className="rounded-lg border border-border/50 bg-muted/20 p-2">
            <p className="text-[10px] text-muted-foreground mb-1">إجمالي المبيعات</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={compareRows} margin={{ top: 5, right: 5, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 9 }} width={45} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip formatter={(v: any) => fmtNIS(Number(v))} contentStyle={{ fontSize: 11, fontFamily: "inherit" }} />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {compareRows.map((r, i) => <Cell key={r.slug} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Daily line aligned by day-offset */}
          {selected.length >= 2 && compareDaily.length > 0 && (
            <div className="rounded-lg border border-border/50 bg-muted/20 p-2">
              <p className="text-[10px] text-muted-foreground mb-1">المبيعات اليومية (اليوم N من بداية الحملة)</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={compareDaily} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} width={45} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                  <Tooltip formatter={(v: any) => fmtNIS(Number(v))} contentStyle={{ fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 9 }} />
                  {selected.map((slug, i) => {
                    const cp = campaigns.find(c => c.slug === slug);
                    return (
                      <Line key={slug} type="monotone" dataKey={slug}
                            stroke={CHART_PALETTE[i % CHART_PALETTE.length]} strokeWidth={2} dot={false}
                            name={cp?.name || slug} />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table */}
          <div className="rounded-lg border border-border/50 overflow-x-auto">
            <table className="w-full text-[10px] sm:text-[11px]">
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-1.5 text-right font-semibold">الحملة</th>
                  <th className="p-1.5 text-center font-semibold">أيام</th>
                  <th className="p-1.5 text-center font-semibold">قطع</th>
                  <th className="p-1.5 text-center font-semibold">مبيعات</th>
                  <th className="p-1.5 text-center font-semibold">متوسط/يوم</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map(r => (
                  <tr key={r.slug} className="border-t border-border/30">
                    <td className="p-1.5 font-medium text-foreground">{r.name}</td>
                    <td className="p-1.5 text-center tabular-nums">{r.days}</td>
                    <td className="p-1.5 text-center tabular-nums">{fmtN(r.qty)}</td>
                    <td className="p-1.5 text-center font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{fmtNIS(r.total)}</td>
                    <td className="p-1.5 text-center tabular-nums">{fmtNIS(r.avg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Campaign cards list */}
      {isFetching && !data ? (
        <Card className="p-8 text-center text-xs text-muted-foreground">جاري تحميل بيانات العروض...</Card>
      ) : filteredCampaigns.length === 0 ? (
        <Card className="p-8 text-center text-xs text-muted-foreground">لا توجد حملات بالمعايير المحددة</Card>
      ) : (
        <div className="flex flex-col gap-2">
          {rankedCampaigns.map((cp, rankIdx) => {
            const st = stats.get(cp.id);
            const days = st?.days.size || 0;
            const avg = days ? (st!.total / days) : 0;
            const isSel = selected.includes(cp.slug);
            const isOpen = expanded.has(cp.id);
            const style = SEASON_STYLE[cp.season] || SEASON_STYLE.other;

            return (
              <Card key={cp.id} className={`overflow-hidden ${isSel ? "ring-2 " + style.ring : ""}`}>
                {/* Header row */}
                <div className="flex items-stretch">
                  {/* Season accent bar */}
                  <div className={`w-1 ${style.bar}`} />
                  <button
                    onClick={() => toggleExpand(cp.id)}
                    className="flex-1 flex flex-col gap-1.5 px-2.5 py-2 hover:bg-muted/30 transition-colors text-right min-w-0"
                  >
                    {/* Name + season + expand */}
                    <div className="flex items-center justify-between gap-2 w-full">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-bold text-muted-foreground tabular-nums w-4 text-center shrink-0">#{rankIdx + 1}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${style.pill} whitespace-nowrap`}>
                          {SEASON_LABEL[cp.season] || cp.season} {cp.year}
                        </span>
                        <span className="font-bold text-[12px] sm:text-sm text-foreground truncate">{cp.name}</span>
                      </div>
                      {isOpen
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />}
                    </div>
                    {/* Date range */}
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Calendar className="h-2.5 w-2.5" />
                      {fmtDate(cp.start_date)} → {fmtDate(cp.end_date)} · {days} يوم
                    </div>
                    {/* KPIs row: 4 columns responsive */}
                    <div className="grid grid-cols-4 gap-1.5 w-full mt-1" dir="rtl">
                      <Stat label="مبيعات" value={fmtNIS(st?.total || 0)} tone="emerald" />
                      <Stat label="قطع" value={fmtN(st?.qty || 0)} tone="default" />
                      <Stat label="متوسط/يوم" value={fmtNIS(avg)} tone="default" />
                      <Stat label="أعلى فرع" value={topBranch(st?.byBranch)} tone="default" small />
                    </div>
                  </button>
                  {/* Select checkbox */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSelect(cp.slug); }}
                    className={`shrink-0 w-10 flex items-center justify-center border-r border-border/60 transition-colors ${isSel ? "bg-primary/10" : "hover:bg-muted/40"}`}
                    title={isSel ? "إزالة من المقارنة" : "أضف للمقارنة"}
                  >
                    <div className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${isSel ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>
                      {isSel && <Check className="h-3 w-3" />}
                    </div>
                  </button>
                </div>

                {/* Expanded panel */}
                {isOpen && st && (
                  <div className="border-t border-border/60 p-2.5 sm:p-3 space-y-3 bg-muted/10">
                    {/* Daily line */}
                    {st.byDate.size > 0 && (
                      <div className="rounded-lg border border-border/50 bg-background p-2">
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1">المبيعات اليومية</p>
                        <ResponsiveContainer width="100%" height={160}>
                          <LineChart data={Array.from(st.byDate.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([d, v]) => ({ date: d.slice(5), total: v }))}
                                     margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="date" tick={{ fontSize: 8 }} />
                            <YAxis tick={{ fontSize: 8 }} width={40} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                            <Tooltip formatter={(v: any) => fmtNIS(Number(v))} contentStyle={{ fontSize: 10 }} />
                            <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Branch distribution */}
                    {st.byBranch.size > 0 && (
                      <div className="rounded-lg border border-border/50 bg-background p-2">
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                          <Store className="h-3 w-3" /> توزيع الفروع
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-2 items-center">
                          <div className="space-y-1">
                            {Array.from(st.byBranch.entries())
                              .sort((a, b) => b[1] - a[1])
                              .map(([name, v], i) => {
                                const pct = st.total > 0 ? (v / st.total) * 100 : 0;
                                return (
                                  <div key={name} className="flex items-center gap-2 text-[10px]">
                                    <span className="flex-1 min-w-0 truncate text-foreground">{name}</span>
                                    <div className="w-24 sm:w-32 h-1.5 rounded-full bg-muted overflow-hidden">
                                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CHART_PALETTE[i % CHART_PALETTE.length] }} />
                                    </div>
                                    <span className="tabular-nums w-14 text-left font-semibold">{fmtNIS(v)}</span>
                                    <span className="tabular-nums w-10 text-left text-muted-foreground">{pct.toFixed(0)}%</span>
                                  </div>
                                );
                              })}
                          </div>
                          <ResponsiveContainer width="100%" height={130}>
                            <PieChart>
                              <Pie data={Array.from(st.byBranch.entries()).map(([n, v]) => ({ name: n, value: v }))}
                                   dataKey="value" nameKey="name" outerRadius={55} innerRadius={30}>
                                {Array.from(st.byBranch.entries()).map((_, i) => (
                                  <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(v: any) => fmtNIS(Number(v))} contentStyle={{ fontSize: 10 }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Top items */}
                    {st.byItem.size > 0 && (
                      <div className="rounded-lg border border-border/50 bg-background p-2">
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                          <Package className="h-3 w-3" /> أعلى الأصناف مبيعاً
                        </p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[10px]">
                            <thead className="bg-muted/40 text-muted-foreground">
                              <tr>
                                <th className="p-1.5 text-right font-semibold">#</th>
                                <th className="p-1.5 text-right font-semibold">الصنف</th>
                                <th className="p-1.5 text-center font-semibold">قطع</th>
                                <th className="p-1.5 text-center font-semibold">مبيعات</th>
                                <th className="p-1.5 text-center font-semibold">%</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Array.from(st.byItem.entries())
                                .sort((a, b) => b[1].total - a[1].total)
                                .slice(0, 12)
                                .map(([name, v], i) => (
                                  <tr key={name} className="border-t border-border/30">
                                    <td className="p-1.5 text-muted-foreground">{i + 1}</td>
                                    <td className="p-1.5 font-medium text-foreground max-w-[240px] truncate" title={name}>{name}</td>
                                    <td className="p-1.5 text-center tabular-nums">{fmtN(v.qty)}</td>
                                    <td className="p-1.5 text-center tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">{fmtNIS(v.total)}</td>
                                    <td className="p-1.5 text-center tabular-nums text-muted-foreground">{((v.total / st.total) * 100).toFixed(1)}%</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, small }: { label: string; value: string; tone: "default" | "emerald"; small?: boolean }) {
  const valueCls = tone === "emerald"
    ? "text-emerald-700 dark:text-emerald-400"
    : "text-foreground";
  return (
    <div className="rounded-md border border-border/50 bg-muted/20 px-1.5 py-1">
      <div className="text-[9px] text-muted-foreground truncate">{label}</div>
      <div className={`font-bold tabular-nums ${valueCls} ${small ? "text-[10px]" : "text-[11px] sm:text-[12px]"} truncate`} title={value}>{value}</div>
    </div>
  );
}

function topBranch(byBranch?: Map<string, number>): string {
  if (!byBranch || byBranch.size === 0) return "—";
  let name = "—"; let max = -1;
  for (const [n, v] of byBranch.entries()) if (v > max) { max = v; name = n; }
  // shorten common prefixes to fit on mobile
  return name.replace(/^(شارع|فرع)\s+/, "");
}