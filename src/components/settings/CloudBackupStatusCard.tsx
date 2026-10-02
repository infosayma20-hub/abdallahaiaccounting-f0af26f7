import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Cloud, Search } from "lucide-react";

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  success: { label: "مكتملة", variant: "default" },
  partial: { label: "مكتملة مع ملاحظات", variant: "secondary" },
  running: { label: "قيد التنفيذ", variant: "outline" },
  failed: { label: "فشلت", variant: "destructive" },
};
const ORDER: Record<string, number> = { failed: 0, partial: 1, running: 2, success: 3 };

const fmtSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

/** Daily automatic UNIFY cloud backup — all subscribers for the latest backup day. */
export function CloudBackupStatusCard() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["cloud-backup-runs-latest-day"],
    queryFn: async () => {
      const { data: last, error: e1 } = await supabase
        .from("cloud_backup_runs")
        .select("backup_date")
        .order("backup_date", { ascending: false })
        .limit(1);
      if (e1) throw e1;
      const day = last?.[0]?.backup_date;
      if (!day) return { day: null as string | null, runs: [] as any[] };
      const { data: runs, error } = await supabase
        .from("cloud_backup_runs")
        .select("id,company_name,backup_date,status,tables_count,records_count,files_count,size_bytes,started_at")
        .eq("backup_date", day)
        .limit(1000);
      if (error) throw error;
      return { day, runs: runs ?? [] };
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
      {isLoading ? (
        <p className="text-sm text-muted-foreground">جارِ التحميل…</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد نسخ بعد — أول نسخة الليلة.</p>
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
