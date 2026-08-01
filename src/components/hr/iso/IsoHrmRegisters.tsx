import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileSpreadsheet, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Row = Record<string, any>;

const HRM06_CRITERIA: { key: string; label: string }[] = [
  { key: "speed", label: "السرعة" },
  { key: "accuracy", label: "الدقة" },
  { key: "cooperation", label: "التعاون" },
  { key: "fsms_commitment", label: "الالتزام بالسلامة الغذائية" },
  { key: "fsms_goals", label: "المساهمة بالأهداف" },
  { key: "guidance", label: "تقبل التوجيهات" },
  { key: "attendance", label: "الالتزام بالدوام" },
  { key: "time_use", label: "استغلال الوقت" },
  { key: "pressure", label: "العمل تحت الضغط" },
  { key: "assets", label: "المحافظة على الممتلكات" },
];

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

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

const exportXlsx = async (sheets: { name: string; rows: Row[] }[], fileName: string) => {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  sheets.forEach((s) => {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ "لا توجد بيانات": "" }]);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 30));
  });
  XLSX.writeFile(wb, fileName);
};

export default function IsoHrmRegisters() {
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [evals, setEvals] = useState<any[]>([]);
  const [trainReq, setTrainReq] = useState<any[]>([]);
  const [trainEval, setTrainEval] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const { data: tpls } = await supabase
        .from("form_templates")
        .select("id, iso_code")
        .in("iso_code", ["HRM-06", "HRM-08", "HRM-10"])
        .eq("is_deleted", false);
      const byCode: Record<string, string[]> = {};
      (tpls || []).forEach((t: any) => {
        if (!t.iso_code) return;
        (byCode[t.iso_code] ||= []).push(t.id);
      });
      const ids = Object.values(byCode).flat();
      if (!ids.length) { setEvals([]); setTrainReq([]); setTrainEval([]); return; }

      const { data: forms, error } = await supabase
        .from("employee_forms")
        .select("id, template_id, employee_id, form_data, workflow_status, created_at, submitted_at, employees(full_name, job_title)")
        .in("template_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const pick = (code: string) =>
        (forms || []).filter((f: any) => (byCode[code] || []).includes(f.template_id));
      setEvals(pick("HRM-06"));
      setTrainReq(pick("HRM-08"));
      setTrainEval(pick("HRM-10"));
    } catch (err: any) {
      toast({ title: "تعذر توليد السجلات", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const empName = (f: any, fallbackKey = "employee_name") =>
    f.employees?.full_name || flat(f.form_data)[fallbackKey] || "—";

  // HRM-07 — تقرير التقييم السنوي الكلي (مجمّع من HRM-06)
  const hrm07 = useMemo(() => {
    const map = new Map<string, Row>();
    evals.forEach((f) => {
      const d = flat(f.form_data);
      const y = String(d.year || new Date(f.created_at).getFullYear());
      if (year && y !== year) return;
      const name = empName(f);
      const key = `${name}|${y}`;
      const scores = HRM06_CRITERIA.map((c) => num(d[c.key]));
      const total = num(d.total) || scores.reduce((a, b) => a + b, 0);
      const prev = map.get(key);
      const entry: Row = prev || {
        "الموظف": name,
        "المسمى الوظيفي": f.employees?.job_title || d.job_title || "—",
        "السنة": y,
        "عدد التقييمات": 0,
        _sum: 0,
        _crit: Object.fromEntries(HRM06_CRITERIA.map((c) => [c.key, 0])),
        "الاحتياجات التدريبية": "",
        "إجراءات التحسين": "",
      };
      entry["عدد التقييمات"] = Number(entry["عدد التقييمات"]) + 1;
      entry._sum += total;
      HRM06_CRITERIA.forEach((c, i) => { entry._crit[c.key] += scores[i]; });
      if (d.training_needs) entry["الاحتياجات التدريبية"] = [entry["الاحتياجات التدريبية"], d.training_needs].filter(Boolean).join(" | ");
      if (d.improvement_actions) entry["إجراءات التحسين"] = [entry["إجراءات التحسين"], d.improvement_actions].filter(Boolean).join(" | ");
      map.set(key, entry);
    });
    return Array.from(map.values()).map((e) => {
      const n = Number(e["عدد التقييمات"]) || 1;
      const avg = e._sum / n;
      const row: Row = {
        "الموظف": e["الموظف"],
        "المسمى الوظيفي": e["المسمى الوظيفي"],
        "السنة": e["السنة"],
        "عدد التقييمات": n,
      };
      HRM06_CRITERIA.forEach((c) => { row[c.label] = Math.round((e._crit[c.key] / n) * 10) / 10; });
      row["المعدل السنوي (من 100)"] = Math.round(avg * 10) / 10;
      row["التقدير"] = avg >= 90 ? "ممتاز" : avg >= 75 ? "جيد جداً" : avg >= 60 ? "جيد" : avg > 0 ? "يحتاج تحسين" : "—";
      row["الاحتياجات التدريبية"] = e["الاحتياجات التدريبية"] || "—";
      row["إجراءات التحسين"] = e["إجراءات التحسين"] || "—";
      return row;
    }).sort((a, b) => Number(b["المعدل السنوي (من 100)"]) - Number(a["المعدل السنوي (من 100)"]));
  }, [evals, year]);

  // HRM-09 — سجل التدريب وتحسين الأداء (من HRM-08 + HRM-10)
  const hrm09 = useMemo(() => {
    const rows: Row[] = [];
    const evalByKey = new Map<string, any>();
    trainEval.forEach((f) => {
      const d = flat(f.form_data);
      evalByKey.set(`${(d.trainee_name || empName(f, "trainee_name")).trim()}|${(d.course_name || "").trim()}`, d);
    });
    trainReq.forEach((f) => {
      const d = flat(f.form_data);
      const name = empName(f);
      const y = String(new Date(d.proposed_date || d.request_date || f.created_at).getFullYear());
      if (year && y !== year) return;
      const ev = evalByKey.get(`${name.trim()}|${(d.course_name || "").trim()}`);
      rows.push({
        "الموظف": name,
        "المسمى الوظيفي": f.employees?.job_title || d.job_title || "—",
        "الدورة التدريبية": d.course_name || "—",
        "مصدر الطلب": d.request_type || "—",
        "تاريخ الطلب": d.request_date || String(f.created_at).slice(0, 10),
        "الجهة المدربة": ev?.provider || d.provider || "—",
        "مكان التدريب": d.proposed_place || "—",
        "تاريخ التنفيذ": ev?.training_date || d.proposed_date || "—",
        "التكلفة": num(ev?.cost || d.cost),
        "حالة الطلب": f.workflow_status === "approved" ? "معتمد" : f.workflow_status === "rejected" ? "مرفوض" : "قيد المراجعة",
        "تم التنفيذ": ev ? "نعم" : "لا",
        "تقييم المادة": ev?.material_rating || "—",
        "تقييم المدرب": ev?.trainer_rating || "—",
        "المهارات المكتسبة": ev?.skills_gained || "—",
      });
    });
    // Evaluations without a matching request
    trainEval.forEach((f) => {
      const d = flat(f.form_data);
      const name = (d.trainee_name || empName(f, "trainee_name") || "—").trim();
      const y = String(new Date(d.training_date || f.created_at).getFullYear());
      if (year && y !== year) return;
      const exists = rows.some((r) => r["الموظف"] === name && r["الدورة التدريبية"] === (d.course_name || "—"));
      if (exists) return;
      rows.push({
        "الموظف": name,
        "المسمى الوظيفي": f.employees?.job_title || "—",
        "الدورة التدريبية": d.course_name || "—",
        "مصدر الطلب": "بدون طلب مسبق",
        "تاريخ الطلب": "—",
        "الجهة المدربة": d.provider || "—",
        "مكان التدريب": "—",
        "تاريخ التنفيذ": d.training_date || "—",
        "التكلفة": num(d.cost),
        "حالة الطلب": "—",
        "تم التنفيذ": "نعم",
        "تقييم المادة": d.material_rating || "—",
        "تقييم المدرب": d.trainer_rating || "—",
        "المهارات المكتسبة": d.skills_gained || "—",
      });
    });
    return rows;
  }, [trainReq, trainEval, year]);

  const Table = ({ rows }: { rows: Row[] }) => {
    if (!rows.length) return <p className="p-6 text-sm text-muted-foreground text-center">لا توجد بيانات لهذه السنة.</p>;
    const cols = Object.keys(rows[0]);
    return (
      <div className="overflow-auto max-h-[60vh]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-primary text-primary-foreground">
            <tr>{cols.map((c) => <th key={c} className="px-2 py-2 text-right whitespace-nowrap font-semibold">{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b hover:bg-muted/40">
                {cols.map((c) => <td key={c} className="px-2 py-1.5 whitespace-nowrap">{String(r[c] ?? "—")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base flex items-center gap-2">
          سجلات مُولّدة تلقائياً
          <Badge variant="secondary">HRM-07 / HRM-09</Badge>
        </CardTitle>
        <div className="flex items-center gap-2">
          <Input className="w-24 h-8" value={year} onChange={(e) => setYear(e.target.value)} placeholder="السنة" />
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs defaultValue="hrm07" dir="rtl">
          <div className="px-3">
            <TabsList>
              <TabsTrigger value="hrm07">HRM-07 التقييم السنوي الكلي</TabsTrigger>
              <TabsTrigger value="hrm09">HRM-09 سجل التدريب وتحسين الأداء</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="hrm07" className="mt-2">
            <div className="px-3 pb-2 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">مُجمّع من نتائج نماذج HRM-06 ({hrm07.length} موظف)</p>
              <Button size="sm" variant="outline" onClick={() => exportXlsx([{ name: "HRM-07", rows: hrm07 }], `HRM-07-${year}.xlsx`)}>
                <FileSpreadsheet className="h-4 w-4 ml-1" /> تصدير Excel
              </Button>
            </div>
            <Table rows={hrm07} />
          </TabsContent>
          <TabsContent value="hrm09" className="mt-2">
            <div className="px-3 pb-2 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">مُجمّع من HRM-08 و HRM-10 ({hrm09.length} سجل)</p>
              <Button size="sm" variant="outline" onClick={() => exportXlsx([{ name: "HRM-09", rows: hrm09 }], `HRM-09-${year}.xlsx`)}>
                <FileSpreadsheet className="h-4 w-4 ml-1" /> تصدير Excel
              </Button>
            </div>
            <Table rows={hrm09} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
