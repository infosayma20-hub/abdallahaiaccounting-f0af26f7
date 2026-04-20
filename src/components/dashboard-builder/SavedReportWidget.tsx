/**
 * SavedReportWidget — يشغّل تقرير محفوظ (custom_reports) ويعرض ملخصه (KPI شريط أو رسم بياني صغير).
 * Config: { reportId: string, mode: "kpi" | "chart" | "table" }
 */
import { useEffect, useState, useCallback } from "react";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, FileBarChart, ExternalLink } from "lucide-react";
import { runReport } from "@/lib/report-builder/query-engine";
import { getDataSource } from "@/lib/report-builder/data-sources";
import ReportChart, { ChartType } from "@/components/report-builder/ReportChart";
import { ColumnDef } from "@/components/reports/SortableReportTable";

interface Props {
  config: any;
  title?: string | null;
}

export default function SavedReportWidget({ config, title }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const reportId = config?.reportId as string | undefined;
  const mode = (config?.mode || "kpi") as "kpi" | "chart" | "table";

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any>(null);
  const [data, setData] = useState<any[]>([]);
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [total, setTotal] = useState<number>(0);

  const fetchReport = useCallback(async () => {
    if (!user || !reportId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: rec } = await supabase.from("custom_reports").select("*").eq("id", reportId).maybeSingle();
      if (!rec) return;
      setReport(rec);
      const source = getDataSource(rec.data_source);
      if (!source) return;
      const cols = (rec.columns as any) || [];
      const result = await runReport({
        source,
        userId: user.id,
        filters: (rec.filters as any) || {},
        groupBy: rec.group_by || "none",
        page: 1,
        pageSize: mode === "kpi" ? 500 : 50,
        selectedColumns: cols.map((c: any) => c.key),
      });
      setData(result.rows || []);
      const colDefs: ColumnDef[] = cols.map((c: any) => ({
        key: c.key, label: c.label || c.key, type: c.type as any,
      }));
      setColumns(colDefs);
      const moneyCol = cols.find((c: any) => c.type === "currency" || c.type === "number");
      if (moneyCol && result.rows?.length) {
        setTotal(result.rows.reduce((s: number, r: any) => s + Number(r[moneyCol.key] || 0), 0));
      } else {
        setTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }, [user, reportId, mode]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  // ── Realtime: refresh when source table changes ──
  const sourceTables = report?.data_source ? [report.data_source as string] : [];
  useRealtimeRefresh({ userId: user?.id, tables: sourceTables, onChange: fetchReport, enabled: !!report });


  if (!reportId) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-center p-4 rounded-2xl bg-card border border-dashed border-border/60">
        <FileBarChart className="h-6 w-6 text-muted-foreground mb-2" />
        <p className="text-xs text-muted-foreground">اختر تقرير محفوظ</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col p-4 rounded-2xl bg-card border border-border/40 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">{title || report?.name || "تقرير"}</p>
          {report?.description && <p className="text-[10px] text-muted-foreground truncate">{report.description}</p>}
        </div>
        <button
          onClick={() => navigate(`/reports/builder?id=${reportId}`)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          title="فتح التقرير"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : mode === "kpi" ? (
          <div className="h-full flex flex-col justify-center">
            <p className="text-[10px] text-muted-foreground">الإجمالي</p>
            <p className="text-2xl font-bold text-primary tabular-nums" style={{ fontFamily: "JetBrains Mono" }}>
              ₪{total.toLocaleString("en", { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">{data.length} سجل</p>
          </div>
        ) : mode === "chart" ? (
          <ReportChart
            data={data.slice(0, 12)}
            columns={columns}
            type={(report?.chart_type as ChartType) || "bar"}
            isGrouped={!!report?.group_by && report.group_by !== "none"}
          />
        ) : (
          <div className="h-full overflow-auto text-[10px]">
            <table className="w-full">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border/30">
                  {columns.slice(0, 4).map(c => (
                    <th key={c.key} className="text-right py-1.5 px-2 font-semibold text-muted-foreground">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-b border-border/20">
                    {columns.slice(0, 4).map(c => (
                      <td key={c.key} className="py-1 px-2 text-foreground">
                        {c.type === "currency" ? `₪${Number(r[c.key] || 0).toLocaleString("en", { maximumFractionDigits: 0 })}` : String(r[c.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
