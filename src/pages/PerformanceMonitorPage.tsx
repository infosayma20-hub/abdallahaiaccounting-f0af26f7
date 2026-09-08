/**
 * /settings/performance — مراقب سرعة البرنامج.
 *
 * يعرض قياسات الجلسة الحالية مباشرة (سرعة الردّ، أبطأ العمليات، تجمّد الواجهة)
 * إضافة إلى سجل العمليات البطيئة المسجّلة لكل المستخدمين (للمدير) خلال 24 ساعة،
 * حتى نعرف بالأرقام: هل البطء من الإنترنت أم من الخادم أم من جهاز المستخدم.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Gauge, RefreshCcw, ServerCog, Wifi, MonitorSmartphone, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getPerfSamples, subscribePerf, summarizePerf, type PerfKind } from "@/lib/perf-monitor";

interface DbSample {
  id: string;
  user_id: string;
  route: string | null;
  kind: string;
  label: string | null;
  duration_ms: number;
  status: number | null;
  ping_ms: number | null;
  connection: string | null;
  device: string | null;
  created_at: string;
}

const kindMeta: Record<PerfKind | string, { text: string; className: string }> = {
  server: { text: "الخادم", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  network: { text: "الإنترنت", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
  device: { text: "الجهاز", className: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  ok: { text: "سليم", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
};

const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} ث` : `${Math.round(n)} م.ث`);

export default function PerformanceMonitorPage() {
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const [rows, setRows] = useState<DbSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => subscribePerf(() => setTick((t) => t + 1)), []);

  const summary = useMemo(() => summarizePerf(getPerfSamples()), [tick]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("app_perf_samples")
      .select("*")
      .gte("created_at", since)
      .order("duration_ms", { ascending: false })
      .limit(200);
    const list = (data as DbSample[]) || [];
    setRows(list);

    const ids = [...new Set(list.map((r) => r.user_id))];
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name, display_name")
        .in("user_id", ids);
      const m = new Map<string, string>();
      (profs as any[] | null)?.forEach((p) => m.set(p.user_id, p.full_name || p.display_name || "—"));
      setNames(m);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const verdictMeta = kindMeta[summary.verdict.kind] || kindMeta.ok;

  const historyByRoute = useMemo(() => {
    const m = new Map<string, { route: string; count: number; worst: number }>();
    rows.forEach((r) => {
      const key = r.route || "—";
      const e = m.get(key) || { route: key, count: 0, worst: 0 };
      e.count += 1;
      e.worst = Math.max(e.worst, r.duration_ms);
      m.set(key, e);
    });
    return [...m.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  }, [rows]);

  return (
    <div dir="rtl" className="container mx-auto p-4 space-y-4 max-w-6xl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 rotate-180" />
          </Button>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" /> مراقب سرعة البرنامج
          </h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadHistory()} className="gap-1">
          <RefreshCcw className="h-4 w-4" /> تحديث
        </Button>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={verdictMeta.className}>{verdictMeta.text}</Badge>
            <span className="text-sm">{summary.verdict.text}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat icon={<Wifi className="h-4 w-4" />} title="زمن الوصول للخادم" value={summary.ping === null ? "لا يوجد" : ms(summary.ping)} hint="نبضة صغيرة كل دقيقة" />
        <Stat icon={<ServerCog className="h-4 w-4" />} title="متوسط الردّ" value={ms(summary.p50)} hint="نصف الطلبات أسرع من هذا" />
        <Stat icon={<Activity className="h-4 w-4" />} title="أبطأ 10%" value={ms(summary.p90)} hint={`أقصى ردّ: ${ms(summary.max)}`} />
        <Stat icon={<Activity className="h-4 w-4" />} title="طلبات بطيئة" value={`${summary.slowServer} / ${summary.total}`} hint="أكثر من 1.5 ثانية" />
        <Stat icon={<MonitorSmartphone className="h-4 w-4" />} title="تجمّد الواجهة" value={String(summary.freezes)} hint="مرات تعليق الجهاز" />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">أبطأ العمليات في هذه الجلسة</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">العملية</TableHead>
                <TableHead className="text-right">عدد النداءات</TableHead>
                <TableHead className="text-right">المتوسط</TableHead>
                <TableHead className="text-right">الأبطأ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.worst.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">لا توجد قياسات بعد — تنقّل بين الشاشات وارجع لهون.</TableCell></TableRow>
              )}
              {summary.worst.map((w) => (
                <TableRow key={w.label}>
                  <TableCell className="font-medium">{w.label}</TableCell>
                  <TableCell>{w.calls}</TableCell>
                  <TableCell>{ms(w.avg)}</TableCell>
                  <TableCell className={w.max >= 1500 ? "text-red-600 font-semibold" : ""}>{ms(w.max)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">الشاشات الأكثر بطئاً (آخر 24 ساعة — كل المستخدمين)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الشاشة</TableHead>
                <TableHead className="text-right">عدد حالات البطء</TableHead>
                <TableHead className="text-right">الأسوأ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyByRoute.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">{loading ? "جاري التحميل…" : "ما في حالات بطء مسجّلة."}</TableCell></TableRow>
              )}
              {historyByRoute.map((r) => (
                <TableRow key={r.route}>
                  <TableCell className="font-medium">{r.route}</TableCell>
                  <TableCell>{r.count}</TableCell>
                  <TableCell className="text-red-600 font-semibold">{ms(r.worst)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">آخر حالات البطء المسجّلة</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الوقت</TableHead>
                <TableHead className="text-right">المستخدم</TableHead>
                <TableHead className="text-right">الشاشة</TableHead>
                <TableHead className="text-right">العملية</TableHead>
                <TableHead className="text-right">المدة</TableHead>
                <TableHead className="text-right">السبب</TableHead>
                <TableHead className="text-right">الشبكة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 60).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString("en-GB")}</TableCell>
                  <TableCell className="text-xs">{names.get(r.user_id) || "—"}</TableCell>
                  <TableCell className="text-xs">{r.route || "—"}</TableCell>
                  <TableCell className="text-xs font-medium">{r.label || "—"}</TableCell>
                  <TableCell className="text-xs font-semibold text-red-600">{ms(r.duration_ms)}</TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className={kindMeta[r.kind]?.className}>{kindMeta[r.kind]?.text || r.kind}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.ping_ms !== null ? `نبضة ${r.ping_ms} م.ث` : "—"}{r.connection ? ` · ${r.connection}` : ""}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">{loading ? "جاري التحميل…" : "ما في تسجيلات."}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon, title, value, hint }: { icon: React.ReactNode; title: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}<span>{title}</span></div>
        <div className="text-lg font-bold mt-1">{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}
