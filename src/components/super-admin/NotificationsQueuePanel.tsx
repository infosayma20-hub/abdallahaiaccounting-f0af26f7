import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Bell, RefreshCw, RotateCcw, Loader2, Send, Smartphone } from "lucide-react";

type Stats = {
  by_status: Record<string, number>;
  last_24h: { sent: number; failed: number; skipped: number; pending: number };
  top_events_24h: Array<{ event_type: string; c: number }>;
  active_tokens: number;
  inactive_tokens: number;
  generated_at: string;
};

type Row = {
  id: string;
  recipient_user_id: string;
  event_type: string;
  sensitivity: string;
  title: string;
  status: string;
  attempts: number;
  last_error: string | null;
  priority: number;
  scheduled_for: string;
  sent_at: string | null;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-blue-100 text-blue-700 border-blue-200",
  processing: "bg-amber-100 text-amber-700 border-amber-200",
  sent: "bg-emerald-100 text-emerald-700 border-emerald-200",
  failed: "bg-red-100 text-red-700 border-red-200",
  skipped: "bg-slate-100 text-slate-700 border-slate-200",
  deferred: "bg-purple-100 text-purple-700 border-purple-200",
};

export default function NotificationsQueuePanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: s, error: sErr }, { data: r, error: rErr }] = await Promise.all([
        supabase.rpc("notif_queue_stats" as any),
        supabase.rpc("notif_queue_recent" as any, {
          _limit: 100,
          _status: statusFilter === "all" ? null : statusFilter,
        }),
      ]);
      if (sErr) throw sErr;
      if (rErr) throw rErr;
      setStats(s as unknown as Stats);
      setRows((r as unknown as Row[]) ?? []);
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e?.message || "تعذّر تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const requeueSelected = async () => {
    if (selected.size === 0) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.rpc("notif_queue_requeue" as any, {
        _ids: Array.from(selected),
      });
      if (error) throw error;
      toast.success(`تمت إعادة جدولة ${data} إشعار`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "فشلت إعادة الجدولة");
    } finally {
      setRunning(false);
    }
  };

  const runWorkerNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("notifications-worker", {
        body: {},
      });
      if (error) throw error;
      toast.success(`تشغيل الـ worker: مُرسل ${data?.sent ?? 0}، فاشل ${data?.failed ?? 0}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "فشل تشغيل الـ worker");
    } finally {
      setRunning(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)),
    );
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="مُرسَل آخر 24س" value={stats?.last_24h?.sent ?? 0} tone="emerald" />
        <StatCard label="فاشل آخر 24س" value={stats?.last_24h?.failed ?? 0} tone="red" />
        <StatCard label="متخطّى آخر 24س" value={stats?.last_24h?.skipped ?? 0} tone="slate" />
        <StatCard label="قيد الانتظار" value={stats?.last_24h?.pending ?? 0} tone="blue" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Smartphone className="h-4 w-4" /> الأجهزة المسجّلة
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-end gap-3">
              <div>
                <div className="text-2xl font-bold text-emerald-600">{stats?.active_tokens ?? 0}</div>
                <div className="text-[11px] text-muted-foreground">نشط</div>
              </div>
              <div className="text-muted-foreground">/</div>
              <div>
                <div className="text-2xl font-bold text-slate-500">{stats?.inactive_tokens ?? 0}</div>
                <div className="text-[11px] text-muted-foreground">معطّل</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">أعلى 5 أحداث (آخر 24س)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {stats?.top_events_24h?.length ? (
              <div className="flex flex-wrap gap-2">
                {stats.top_events_24h.map((e) => (
                  <Badge key={e.event_type} variant="outline" className="text-[11px]">
                    {e.event_type} · {e.c}
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">لا توجد بيانات</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="pending">pending</SelectItem>
            <SelectItem value="processing">processing</SelectItem>
            <SelectItem value="sent">sent</SelectItem>
            <SelectItem value="failed">failed</SelectItem>
            <SelectItem value="skipped">skipped</SelectItem>
            <SelectItem value="deferred">deferred</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> تحديث
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={requeueSelected}
          disabled={running || selected.size === 0}
          className="gap-1.5"
        >
          <RotateCcw className="h-3.5 w-3.5" /> إعادة جدولة ({selected.size})
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={runWorkerNow}
          disabled={running}
          className="gap-1.5 mr-auto"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          تشغيل الـ Worker الآن
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={rows.length > 0 && selected.size === rows.length}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">الحدث</TableHead>
                  <TableHead className="text-right">العنوان</TableHead>
                  <TableHead className="text-right">المحاولات</TableHead>
                  <TableHead className="text-right">آخر خطأ</TableHead>
                  <TableHead className="text-right">مجدول</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">
                      لا توجد إشعارات
                    </TableCell>
                  </TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[r.status] || ""}`}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{r.event_type}</TableCell>
                    <TableCell className="text-xs max-w-[240px] truncate">{r.title}</TableCell>
                    <TableCell className="text-xs">{r.attempts}</TableCell>
                    <TableCell className="text-[11px] text-red-600 max-w-[160px] truncate" title={r.last_error || ""}>
                      {r.last_error || "—"}
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">
                      {new Date(r.scheduled_for).toLocaleString("ar-EG")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "emerald" | "red" | "slate" | "blue" }) {
  const toneClass = {
    emerald: "text-emerald-600",
    red: "text-red-600",
    slate: "text-slate-600",
    blue: "text-blue-600",
  }[tone];
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
        <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
          <Bell className="h-3 w-3" /> {label}
        </div>
      </CardContent>
    </Card>
  );
}