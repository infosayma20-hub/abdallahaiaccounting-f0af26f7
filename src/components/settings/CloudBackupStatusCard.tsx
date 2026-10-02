import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cloud, HardDrive, RefreshCw, Search } from "lucide-react";

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  success: { label: "مكتملة", variant: "default" },
  partial: { label: "مكتملة مع ملاحظات", variant: "secondary" },
  running: { label: "قيد التنفيذ", variant: "outline" },
  failed: { label: "فشلت", variant: "destructive" },
};
const ORDER: Record<string, number> = { failed: 0, partial: 1, running: 2, success: 3 };

const fmtSize = (b: number) =>
  b > 1073741824 ? `${(b / 1073741824).toFixed(2)} GB` : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;

/** Daily automatic UNIFY cloud backup — all subscribers, filterable by backup day. */
export function CloudBackupStatusCard() {
  const [q, setQ] = useState("");
  const [day, setDay] = useState<string | null>(null);

  const { data: days } = useQuery({
    queryKey: ["cloud-backup-days"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cloud_backup_runs")
        .select("backup_date")
        .order("backup_date", { ascending: false })
        .limit(4000);
      if (error) throw error;
      return [...new Set((data ?? []).map((r: any) => r.backup_date as string))].slice(0, 30);
    },
  });
  const activeDay = day ?? days?.[0] ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["cloud-backup-runs", activeDay],
    enabled: !!activeDay,
    queryFn: async () => {
      const { data: runs, error } = await supabase
        .from("cloud_backup_runs")
        .select("id,company_name,backup_date,status,tables_count,records_count,files_count,size_bytes,started_at")
        .eq("backup_date", activeDay!)
        .limit(1000);
      if (error) throw error;
      return { day: activeDay!, runs: runs ?? [] };
    },
  });

  const usage = useQuery({
    queryKey: ["cloud-backup-b2-usage"],
    enabled: false,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("cloud-backup", { body: { action: "usage" } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "usage failed");
      return data as { bytes: number; objects: number; truncated: boolean };
    },
  });

  const runs = data?.runs ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    runs.forEach((r: any) => (c[r.status] = (c[r.status] ?? 0) + 1));
    return c;
  }, [runs]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return runs
      .filter((r: any) => !t || (r.company_name ?? "").toLowerCase().includes(t))
      .sort((a: any, b: any) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || (a.company_name ?? "").localeCompare(b.company_name ?? "", "ar"));
  }, [runs, q]);

  return (
    <div dir="rtl" className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Cloud className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">النسخ الاحتياطي السحابي اليومي</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        تُحفظ نسخة كاملة تلقائيًا كل يوم الساعة 5:00 صباحًا بتوقيت فلسطين بملف خاص بكل شركة، مرتبة حسب القسم ثم التاريخ، مع الصور والمرفقات.
      </p>

      {/* Backblaze storage usage KPI */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
        <HardDrive className="h-4 w-4 text-primary" />
        <span className="font-medium text-foreground">استهلاك التخزين (Backblaze):</span>
        {usage.data ? (
          <span className="text-foreground">
            {fmtSize(usage.data.bytes)} · {usage.data.objects.toLocaleString("en-US")} ملف
            {usage.data.truncated && <span className="text-muted-foreground"> (تقدير جزئي)</span>}
          </span>
        ) : (
          <span className="text-muted-foreground">اضغط تحديث لحساب الاستهلاك</span>
        )}
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          disabled={usage.isFetching}
          onClick={() => usage.refetch()}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${usage.isFetching ? "animate-spin" : ""}`} />
          {usage.isFetching ? "جارِ الحساب…" : "تحديث"}
        </Button>
        {usage.isError && <span className="text-destructive">تعذّر حساب الاستهلاك</span>}
      </div>

      {/* Day filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">يوم النسخة:</span>
        <Select dir="rtl" value={activeDay ?? ""} onValueChange={(v) => setDay(v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="اختر اليوم" />
          </SelectTrigger>
          <SelectContent>
            {(days ?? []).map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">جارِ التحميل…</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد نسخ لهذا اليوم.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-foreground">نسخة {data?.day} — {runs.length} شركة:</span>
            {Object.entries(counts).map(([k, n]) => (
              <Badge key={k} variant={(STATUS[k] ?? STATUS.running).variant}>
                {(STATUS[k] ?? STATUS.running).label} {n}
              </Badge>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم الشركة…" className="pr-9" />
          </div>
          <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
            {shown.map((r: any) => {
              const s = STATUS[r.status] ?? STATUS.running;
              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{r.company_name || "—"}</span>
                    <span className="text-muted-foreground">
                      {r.backup_date} · {Number(r.records_count).toLocaleString("en-US")} سجل · {r.files_count} ملف · {fmtSize(Number(r.size_bytes))}
                    </span>
                  </div>
                  <Badge variant={s.variant}>{s.label}</Badge>
                </div>
              );
            })}
            {shown.length === 0 && <p className="py-3 text-sm text-muted-foreground">لا توجد نتائج.</p>}
          </div>
        </>
      )}
    </div>
  );
}
