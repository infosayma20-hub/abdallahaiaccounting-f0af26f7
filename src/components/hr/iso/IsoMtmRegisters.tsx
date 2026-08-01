import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FileSpreadsheet, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Row = Record<string, any>;

const flat = (formData: any): Row => {
  const out: Row = {};
  if (!formData || typeof formData !== "object") return out;
  for (const [k, v] of Object.entries(formData)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Row)) out[k2] = v2;
    } else out[k] = v;
  }
  return out;
};

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export default function IsoMtmRegisters() {
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [forms, setForms] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const { data: tpls } = await supabase
        .from("form_templates")
        .select("id")
        .eq("iso_code", "MTM-02")
        .eq("is_deleted", false);
      const ids = (tpls || []).map((t: any) => t.id);
      if (!ids.length) { setForms([]); return; }
      const { data, error } = await supabase
        .from("employee_forms")
        .select("id, form_data, workflow_status, created_at, employees(full_name)")
        .in("template_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setForms(data || []);
    } catch (err: any) {
      toast({ title: "تعذر توليد السجل", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    return forms
      .map((f) => {
        const d = flat(f.form_data);
        const date = d.request_date || String(f.created_at).slice(0, 10);
        return { date, d, f };
      })
      .filter(({ date }) => !year || String(date).slice(0, 4) === year)
      .map(({ date, d, f }) => ({
        "التاريخ": date,
        "الماكينة": d.machine || "—",
        "الخلل وأسبابه": d.fault || "—",
        "مهام الصيانة": d.tasks || "—",
        "حالة الماكينة": d.machine_state || "—",
        "التكلفة (شيكل)": num(d.total_cost) || num(d.parts_cost),
        "جهة التنفيذ": d.executor_type || "—",
        "منفذ الصيانة": d.executor_name || "—",
        "توقيع منفذ الصيانة": d.tech_manager_signature || "—",
        "تاريخ انتهاء الصيانة": d.end_date || "—",
        "وقت التعطل (ساعة)": num(d.downtime_hours),
        "نظافة الماكينة وملاءمتها للتشغيل": d.cleanliness_result || "—",
        "توقيع قائد فريق السلامة الغذائية": d.fs_team_leader || "—",
        "حالة النموذج": f.workflow_status === "approved" ? "معتمد" : f.workflow_status === "rejected" ? "مرفوض" : "قيد المراجعة",
      }));
  }, [forms, year]);

  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "لا توجد بيانات": "" }]);
    XLSX.utils.book_append_sheet(wb, ws, "MTM-03");
    XLSX.writeFile(wb, `MTM-03-${year}.xlsx`);
  };

  const cols = rows.length ? Object.keys(rows[0]) : [];
  const totalCost = rows.reduce((s, r) => s + Number(r["التكلفة (شيكل)"] || 0), 0);
  const totalDown = rows.reduce((s, r) => s + Number(r["وقت التعطل (ساعة)"] || 0), 0);

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base flex items-center gap-2">
          سجل مُولّد تلقائياً
          <Badge variant="secondary">MTM-03 سجل الصيانة الطارئة</Badge>
        </CardTitle>
        <div className="flex items-center gap-2">
          <Input className="w-24 h-8" value={year} onChange={(e) => setYear(e.target.value)} placeholder="السنة" />
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="outline" onClick={exportXlsx}>
            <FileSpreadsheet className="h-4 w-4 ml-1" /> تصدير Excel
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="px-3 pb-2 text-xs text-muted-foreground">
          مُجمّع من نماذج MTM-02 ({rows.length} عملية صيانة) — إجمالي التكلفة: {totalCost.toLocaleString()} ₪ · إجمالي التعطل: {totalDown} ساعة
        </div>
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">لا توجد بيانات لهذه السنة.</p>
        ) : (
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-primary text-primary-foreground">
                <tr>{cols.map((c) => <th key={c} className="px-2 py-2 text-right whitespace-nowrap font-semibold">{c}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b hover:bg-muted/40">
                    {cols.map((c) => <td key={c} className="px-2 py-1.5 whitespace-nowrap max-w-[280px] truncate" title={String((r as Row)[c] ?? "")}>{String((r as Row)[c] ?? "—")}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
