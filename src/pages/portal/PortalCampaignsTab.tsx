import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  RefreshCw, ChevronDown, ChevronLeft, Megaphone, Calendar, Store, Package,
  X, AlertCircle, Trophy, BarChart3, Check,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";

interface Props { theme?: "light" | "dark" }

type CampaignRow = {
  id: string;
  slug: string;
  name: string;
  year: number;
  season: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  is_live: boolean | null;
  pos_category_id: string | null;
  total_amount: number;
  qty_total: number;
  days_count: number;
  branches_count: number;
  top_branch: string | null;
  top_branch_total: number;
  top_item: string | null;
  top_item_qty: number;
  top_item_total: number;
};

type CampaignDetails = {
  by_date: Array<{ sale_date: string; total: number; qty: number }>;
  by_branch: Array<{ branch_name: string; total: number; qty: number }>;
  by_item: Array<{ item_name: string; total: number; qty: number }>;
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
  const dd = dt.getDate();
  const mm = dt.getMonth() + 1;
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Weekday helpers — Sunday..Saturday, aligned with Arabic labels
const WEEKDAY_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
function weekdayIndex(iso: string): number {
  return new Date(iso + "T00:00:00").getDay();
}
function weekdayLabel(iso: string): string {
  return WEEKDAY_AR[weekdayIndex(iso)] || "";
}

// Human-readable duration (e.g. "شهر و12 يوم" or "3 أشهر و5 يوم")
function fmtDuration(days: number): string {
  const d = Math.max(0, Math.round(days));
  if (d === 0) return "—";
  if (d < 30) return `${d} يوم`;
  const months = Math.floor(d / 30);
  const rem = d - months * 30;
  const mLabel = months === 1 ? "شهر" : months === 2 ? "شهران" : months <= 10 ? `${months} أشهر` : `${months} شهر`;
  return rem > 0 ? `${mLabel} و${rem} يوم` : mLabel;
}

// Small, indexed overview + branch list — no more 16k-row pull.
async function fetchOverview(branchFilter: string) {
  const branchArg = branchFilter === ALL ? null : branchFilter;
  const [ov, br] = await Promise.all([
    (supabase as any).rpc("get_campaigns_overview", { _branch: branchArg, _year: null }),
    (supabase as any).rpc("get_campaign_branches"),
  ]);
  if (ov.error) throw ov.error;
  if (br.error) throw br.error;
  return {
    campaigns: (ov.data || []) as CampaignRow[],
    branches: (br.data || []).map((r: any) => r.branch_name as string),
  };
}

async function fetchDetails(campaignId: string, branchFilter: string): Promise<CampaignDetails> {
  const branchArg = branchFilter === ALL ? null : branchFilter;
  // For a live campaign we still merge POS RPC (kept lightweight — one call).
  const { data, error } = await (supabase as any).rpc("get_campaign_details", { _campaign_id: campaignId, _branch: branchArg });
  if (error) throw error;
  return (data || { by_date: [], by_branch: [], by_item: [] }) as CampaignDetails;
}

export default function PortalCampaignsTab({ theme: _theme }: Props) {
  const [branchFilter, setBranchFilter] = useState<string>(ALL);
  const [yearFilter, setYearFilter] = useState<string>(ALL);
  const [selected, setSelected] = useState<string[]>([]);   // slugs to compare
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["portal-campaigns-overview", branchFilter],
    queryFn: () => fetchOverview(branchFilter),
    staleTime: 5 * 60 * 1000,
  });

  const campaigns = data?.campaigns || [];
  const branches = data?.branches || [];

  const years = useMemo(() => {
    const s = new Set<number>();
    campaigns.forEach(c => s.add(c.year));
    return Array.from(s).sort();
  }, [campaigns]);

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(c => yearFilter === ALL || String(c.year) === yearFilter);
  }, [campaigns, yearFilter]);

  // KPI totals (filtered by year; branch already applied server-side)
  const totals = useMemo(() => {
    let total = 0, qty = 0;
    for (const c of filteredCampaigns) {
      total += Number(c.total_amount) || 0;
      qty += Number(c.qty_total) || 0;
    }
    return { total, qty, count: filteredCampaigns.length };
  }, [filteredCampaigns]);

  // Best campaign
  const best = useMemo(() => {
    let winner: { c: CampaignRow; total: number } | null = null;
    for (const c of filteredCampaigns) {
      const t = Number(c.total_amount) || 0;
      if (!winner || t > winner.total) winner = { c, total: t };
    }
    return winner;
  }, [filteredCampaigns]);

  // Sort campaigns by total desc so best-performing sits on top for decision-makers
  const rankedCampaigns = useMemo(() => {
    return [...filteredCampaigns].sort((a, b) => (Number(b.total_amount) || 0) - (Number(a.total_amount) || 0));
  }, [filteredCampaigns]);

  // Tawjihi weekday-fair comparison — daily buckets fetched via a small RPC (no 16k row pull).
  const tawjihiIds = useMemo(() => campaigns.filter(c => c.season === "tawjihi").map(c => c.id), [campaigns]);
  const { data: tawjihiDaily } = useQuery({
    queryKey: ["portal-campaigns-tawjihi-daily", branchFilter, tawjihiIds.join(",")],
    enabled: tawjihiIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const branchArg = branchFilter === ALL ? null : branchFilter;
      const { data, error } = await (supabase as any).rpc("get_campaigns_daily", { _campaign_ids: tawjihiIds, _branch: branchArg });
      if (error) throw error;
      return (data || []) as Array<{ campaign_id: string; sale_date: string; branch_name: string | null; total_amount: number; qty_total: number }>;
    },
  });

  const tawjihiCompare = useMemo(() => {
    const live = campaigns.find(c => c.is_live && c.season === "tawjihi");
    if (!live) return null;
    const historical = campaigns.filter(c => c.season === "tawjihi" && !c.is_live);
    if (historical.length === 0) return null;
    const dailyRaw = tawjihiDaily || [];
    if (dailyRaw.length === 0) return null;

    // day-level buckets: campaign_id -> date -> total
    const dayTotals = new Map<string, Map<string, number>>();
    for (const s of dailyRaw) {
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
    const histIds = new Set(historical.map(h => h.id));
    for (const s of dailyRaw) {
      const br = s.branch_name || "—";
      if (s.campaign_id === live.id) {
        const e = liveByBranch.get(br) || { total: 0, days: new Set<string>() };
        e.total += Number(s.total_amount) || 0; e.days.add(s.sale_date);
        liveByBranch.set(br, e);
      } else if (histIds.has(s.campaign_id)) {
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
  }, [campaigns, tawjihiDaily]);

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
      const total = Number(cp.total_amount) || 0;
      const qty = Number(cp.qty_total) || 0;
      const days = Number(cp.days_count) || 1;
      return {
        slug, name: cp.name, season: cp.season,
        total,
        qty,
        days,
        avg: total / days,
      };
    }).filter(Boolean) as Array<{ slug: string; name: string; season: string; total: number; qty: number; days: number; avg: number }>;
  }, [selected, campaigns]);

  // Daily comparison for the "compare" panel — small RPC pull scoped to selected campaigns.
  const selectedIds = useMemo(
    () => selected.map(slug => campaigns.find(c => c.slug === slug)?.id).filter(Boolean) as string[],
    [selected, campaigns]
  );
  const { data: selectedDaily } = useQuery({
    queryKey: ["portal-campaigns-selected-daily", branchFilter, selectedIds.join(",")],
    enabled: showCompare && selectedIds.length >= 2,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const branchArg = branchFilter === ALL ? null : branchFilter;
      const { data, error } = await (supabase as any).rpc("get_campaigns_daily", { _campaign_ids: selectedIds, _branch: branchArg });
      if (error) throw error;
      return (data || []) as Array<{ campaign_id: string; sale_date: string; total_amount: number }>;
    },
  });

  const compareDaily = useMemo(() => {
    if (!selectedDaily || selected.length < 2) return [];
    const selCamps = campaigns.filter(x => selected.includes(x.slug));
    // group per campaign -> ordered days
    const per = new Map<string, Map<string, number>>();
    for (const r of selectedDaily) {
      const m = per.get(r.campaign_id) || new Map<string, number>();
      m.set(r.sale_date, (m.get(r.sale_date) || 0) + (Number(r.total_amount) || 0));
      per.set(r.campaign_id, m);
    }
    const maxDays = Math.max(0, ...selCamps.map(cp => per.get(cp.id)?.size || 0));
    const rows: Record<string, any>[] = [];
    for (let d = 0; d < maxDays; d++) rows.push({ day: d + 1 });
    selCamps.forEach(cp => {
      const m = per.get(cp.id);
      if (!m) return;
      const sorted = Array.from(m.keys()).sort();
      sorted.forEach((date, idx) => { if (idx < rows.length) rows[idx][cp.slug] = m.get(date) || 0; });
    });
    return rows;
  }, [selectedDaily, selected, campaigns]);

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

      {error && (
        <Card className="p-3 border-destructive/40 bg-destructive/5 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> تعذر تحميل البيانات: {(error as Error).message}
        </Card>
      )}

      {/* Tawjihi 2026 (live) vs historical — weekday-fair comparison */}
      {tawjihiCompare && (
        <Card className="p-2.5 sm:p-3 border-sky-300/40">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 whitespace-nowrap">مباشر</span>
              <h2 className="text-[11px] sm:text-xs font-bold text-foreground">توجيهي 2026 — مقارنة عادلة حسب اليوم مع 2025</h2>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground tabular-nums">
              <span>حتى الآن: <span className="font-bold text-emerald-700 dark:text-emerald-400">{fmtNIS(tawjihiCompare.liveTotal)}</span> / {tawjihiCompare.liveDays} يوم</span>
              <span className="text-muted-foreground/50">·</span>
              <span>متوسط/يوم: <span className="font-bold text-foreground">{fmtNIS(tawjihiCompare.liveDaily)}</span></span>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground mb-2">
            المقارنة بمتوسط المبيعات لنفس اليوم من الأسبوع (الخميس والجمعة عادةً أعلى)، ومحسوبة عبر {tawjihiCompare.histDays} يوم من عروض التوجيهي السابقة.
          </p>

          {/* Weekday grouped bars */}
          <div className="rounded-lg border border-border/50 bg-muted/20 p-2 mb-2">
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={tawjihiCompare.rows} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 9 }} width={45} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip
                  formatter={(v: any, name: any) => [fmtNIS(Number(v)), name]}
                  contentStyle={{ fontSize: 11 }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="histAvg" name="متوسط 2025 (لنفس اليوم)" fill="#94A3B8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="liveAvg" name="توجيهي 2026" fill="#0EA5E9" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Weekday table with sample sizes */}
          <div className="rounded-lg border border-border/50 overflow-x-auto mb-2">
            <table className="w-full text-[10px] sm:text-[11px]">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="p-1.5 text-right font-semibold">اليوم</th>
                  <th className="p-1.5 text-center font-semibold">متوسط 2026</th>
                  <th className="p-1.5 text-center font-semibold">متوسط 2025</th>
                  <th className="p-1.5 text-center font-semibold">الفرق</th>
                  <th className="p-1.5 text-center font-semibold text-muted-foreground/70">عيّنة</th>
                </tr>
              </thead>
              <tbody>
                {tawjihiCompare.rows.map(r => {
                  const delta = r.histAvg ? ((r.liveAvg - r.histAvg) / r.histAvg) * 100 : 0;
                  const hasLive = r.liveDays > 0;
                  const up = delta >= 0;
                  return (
                    <tr key={r.day} className="border-t border-border/30">
                      <td className="p-1.5 font-medium text-foreground">{r.day}</td>
                      <td className="p-1.5 text-center tabular-nums font-bold text-sky-700 dark:text-sky-400">{hasLive ? fmtNIS(r.liveAvg) : "—"}</td>
                      <td className="p-1.5 text-center tabular-nums text-foreground/70">{r.histDays ? fmtNIS(r.histAvg) : "—"}</td>
                      <td className={`p-1.5 text-center tabular-nums font-bold ${!hasLive || !r.histDays ? "text-muted-foreground" : up ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                        {hasLive && r.histDays ? `${up ? "+" : ""}${delta.toFixed(0)}%` : "—"}
                      </td>
                      <td className="p-1.5 text-center text-muted-foreground/70 tabular-nums text-[9px]">
                        {r.liveDays}/{r.histDays}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Live daily timeline with weekday names */}
          {tawjihiCompare.liveTimeline.length > 0 && (
            <div className="rounded-lg border border-border/50 bg-muted/20 p-2 mb-2">
              <p className="text-[10px] font-semibold text-muted-foreground mb-1">المبيعات اليومية للحملة الحالية</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={tawjihiCompare.liveTimeline} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} width={45} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                  <Tooltip formatter={(v: any) => fmtNIS(Number(v))} contentStyle={{ fontSize: 11 }} />
                  <Bar dataKey="total" fill="#0EA5E9" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Branch comparison */}
          {tawjihiCompare.branchRows.length > 0 && (
            <div className="rounded-lg border border-border/50 overflow-x-auto">
              <table className="w-full text-[10px] sm:text-[11px]">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="p-1.5 text-right font-semibold flex items-center gap-1"><Store className="h-3 w-3" /> الفرع</th>
                    <th className="p-1.5 text-center font-semibold">متوسط/يوم 2026</th>
                    <th className="p-1.5 text-center font-semibold">متوسط/يوم 2025</th>
                    <th className="p-1.5 text-center font-semibold">الفرق</th>
                  </tr>
                </thead>
                <tbody>
                  {tawjihiCompare.branchRows.map(br => {
                    const hasBoth = br.liveAvg > 0 && br.histAvg > 0;
                    const up = br.delta >= 0;
                    return (
                      <tr key={br.branch} className="border-t border-border/30">
                        <td className="p-1.5 font-medium text-foreground">{br.branch}</td>
                        <td className="p-1.5 text-center tabular-nums font-bold text-sky-700 dark:text-sky-400">{br.liveAvg > 0 ? fmtNIS(br.liveAvg) : "—"}</td>
                        <td className="p-1.5 text-center tabular-nums text-foreground/70">{br.histAvg > 0 ? fmtNIS(br.histAvg) : "—"}</td>
                        <td className={`p-1.5 text-center tabular-nums font-bold ${!hasBoth ? "text-muted-foreground" : up ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                          {hasBoth ? `${up ? "+" : ""}${br.delta.toFixed(0)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
          {rankedCampaigns.map((cp, rankIdx) => (
            <CampaignCard
              key={cp.id}
              cp={cp}
              rankIdx={rankIdx}
              isOpen={expanded.has(cp.id)}
              isSelected={selected.includes(cp.slug)}
              onToggleOpen={() => toggleExpand(cp.id)}
              onToggleSelect={() => toggleSelect(cp.slug)}
              branchFilter={branchFilter}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignCard({ cp, rankIdx, isOpen, isSelected, onToggleOpen, onToggleSelect, branchFilter }: {
  cp: CampaignRow;
  rankIdx: number;
  isOpen: boolean;
  isSelected: boolean;
  onToggleOpen: () => void;
  onToggleSelect: () => void;
  branchFilter: string;
}) {
  const style = SEASON_STYLE[cp.season] || SEASON_STYLE.other;
  const total = Number(cp.total_amount) || 0;
  const qty = Number(cp.qty_total) || 0;
  const days = Number(cp.days_count) || 0;
  const avg = days ? total / days : 0;

  const { data: details, isFetching } = useQuery({
    queryKey: ["portal-campaign-details", cp.id, branchFilter],
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchDetails(cp.id, branchFilter),
  });

  return (
    <Card className={`overflow-hidden ${isSelected ? "ring-2 " + style.ring : ""}`}>
      <div className="flex items-stretch">
        <div className={`w-1 ${style.bar}`} />
        <button
          onClick={onToggleOpen}
          className="flex-1 flex flex-col gap-1.5 px-2.5 py-2 hover:bg-muted/30 transition-colors text-right min-w-0"
        >
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
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground" dir="rtl">
            <Calendar className="h-2.5 w-2.5" />
            <bdi>{fmtDate(cp.start_date)}</bdi>
            <span>→</span>
            <bdi>{fmtDate(cp.end_date)}</bdi>
            <span>·</span>
            <bdi>{fmtDuration(days)}</bdi>
          </div>
          <div className="grid grid-cols-4 gap-1.5 w-full mt-1" dir="rtl">
            <Stat label="مبيعات" value={fmtNIS(total)} tone="emerald" />
            <Stat label="قطع" value={fmtN(qty)} tone="default" />
            <Stat label="متوسط/يوم" value={fmtNIS(avg)} tone="default" />
            <Stat label="أعلى فرع" value={(cp.top_branch || "—").replace(/^(شارع|فرع)\s+/, "")} tone="default" small />
          </div>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          className={`shrink-0 w-10 flex items-center justify-center border-r border-border/60 transition-colors ${isSelected ? "bg-primary/10" : "hover:bg-muted/40"}`}
          title={isSelected ? "إزالة من المقارنة" : "أضف للمقارنة"}
        >
          <div className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>
            {isSelected && <Check className="h-3 w-3" />}
          </div>
        </button>
      </div>

      {isOpen && (
        <div className="border-t border-border/60 p-2.5 sm:p-3 space-y-3 bg-muted/10">
          {isFetching && !details ? (
            <div className="text-center text-[11px] text-muted-foreground py-6">جاري تحميل التفاصيل…</div>
          ) : details ? (
            <>
              {details.by_date.length > 0 && (
                <div className="rounded-lg border border-border/50 bg-background p-2">
                  <p className="text-[10px] font-semibold text-muted-foreground mb-1">المبيعات اليومية</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={details.by_date.map(d => ({ date: d.sale_date.slice(5), total: Number(d.total) }))}
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

              {details.by_branch.length > 0 && (
                <div className="rounded-lg border border-border/50 bg-background p-2">
                  <p className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                    <Store className="h-3 w-3" /> توزيع الفروع
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-2 items-center">
                    <div className="space-y-1">
                      {details.by_branch.map((b, i) => {
                        const pct = total > 0 ? (Number(b.total) / total) * 100 : 0;
                        return (
                          <div key={b.branch_name} className="flex items-center gap-2 text-[10px]">
                            <span className="flex-1 min-w-0 truncate text-foreground">{b.branch_name}</span>
                            <div className="w-24 sm:w-32 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CHART_PALETTE[i % CHART_PALETTE.length] }} />
                            </div>
                            <span className="tabular-nums w-14 text-left font-semibold">{fmtNIS(Number(b.total))}</span>
                            <span className="tabular-nums w-10 text-left text-muted-foreground">{pct.toFixed(0)}%</span>
                          </div>
                        );
                      })}
                    </div>
                    <ResponsiveContainer width="100%" height={130}>
                      <PieChart>
                        <Pie data={details.by_branch.map(b => ({ name: b.branch_name, value: Number(b.total) }))}
                             dataKey="value" nameKey="name" outerRadius={55} innerRadius={30}>
                          {details.by_branch.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => fmtNIS(Number(v))} contentStyle={{ fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {details.by_item.length > 0 && (
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
                        {details.by_item.slice(0, 12).map((it, i) => (
                          <tr key={it.item_name} className="border-t border-border/30">
                            <td className="p-1.5 text-muted-foreground">{i + 1}</td>
                            <td className="p-1.5 font-medium text-foreground max-w-[240px] truncate" title={it.item_name}>{it.item_name}</td>
                            <td className="p-1.5 text-center tabular-nums">{fmtN(Number(it.qty))}</td>
                            <td className="p-1.5 text-center tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">{fmtNIS(Number(it.total))}</td>
                            <td className="p-1.5 text-center tabular-nums text-muted-foreground">{total > 0 ? ((Number(it.total) / total) * 100).toFixed(1) : "0.0"}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-[11px] text-muted-foreground py-6">لا توجد تفاصيل.</div>
          )}
        </div>
      )}
    </Card>
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