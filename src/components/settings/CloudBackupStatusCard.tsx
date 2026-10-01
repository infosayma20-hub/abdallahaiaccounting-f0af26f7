import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Cloud } from "lucide-react";

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  success: { label: "مكتملة", variant: "default" },
  partial: { label: "مكتملة مع ملاحظات", variant: "secondary" },
  running: { label: "قيد التنفيذ", variant: "outline" },
  failed: { label: "فشلت", variant: "destructive" },
};

const fmtSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

/** Daily automatic UNIFY cloud backup history (one organized folder per company). */
export function CloudBackupStatusCard() {
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["cloud-backup-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cloud_backup_runs")
        .select("id,company_name,backup_date,status,tables_count,records_count,files_count,size_bytes,started_at")
        .order("started_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div dir="rtl" className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Cloud className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">النسخ الاحتياطي السحابي اليومي</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        تُحفظ نسخة كاملة تلقائيًا كل ليلة الساعة 1:00 بملف خاص بكل شركة، مرتبة حسب القسم ثم التاريخ، مع الصور والمرفقات.
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">جارِ التحميل…</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد نسخ بعد — أول نسخة الليلة.</p>
      ) : (
        <div className="divide-y divide-border">
          {runs.map((r: any) => {
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
        </div>
      )}
    </div>
  );
}
