import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import useDataOwnerId from "@/hooks/useDataOwnerId";
import { FinanceShell, type ActionTab } from "@/components/finance/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowRight, RefreshCw, Search, Loader2, Download, Printer,
  ArrowUpDown, ArrowUp, ArrowDown, Star,
} from "lucide-react";
import { formatHRDateTime } from "@/lib/hrDate";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { setNextExportBranding } from "@/lib/excel-export";

/* ------------------------------------------------------------------ */
/* الأنواع                                                             */
/* ------------------------------------------------------------------ */

import {
  buildEvalRows, isEvaluationTemplate, round1, scoreLabel,
  type EvalRow, type EvalTemplateRow as TemplateRow, type EvalFormRow as FormRow,
  type EvalEmployeeLite as EmployeeLite,
} from "@/lib/hr/employeeEvaluations";

/* ------------------------------------------------------------------ */
/* ثوابت ومساعدات العرض                                                */
/* ------------------------------------------------------------------ */

const STATUSES = [
  { key: "draft", label: "مسودة", cls: "bg-slate-500 hover:bg-slate-500" },
  { key: "submitted", label: "مُرسل", cls: "bg-sky-600 hover:bg-sky-600" },
  { key: "under_review", label: "قيد المراجعة", cls: "bg-amber-500 hover:bg-amber-500" },
  { key: "approved", label: "معتمد", cls: "bg-emerald-600 hover:bg-emerald-600" },
  { key: "rejected", label: "مرفوض", cls: "bg-rose-600 hover:bg-rose-600" },
] as const;

const statusMeta = (s: string | null) =>
  STATUSES.find((x) => x.key === (s || "draft")) || STATUSES[0];

const AR_DT = (iso: string) => formatHRDateTime(iso);

/** لون شارة المعدل: ممتاز / جيد / يحتاج متابعة. */
const scoreCls = (avg: number | null) => {
  if (avg === null) return "bg-slate-400 hover:bg-slate-400";
  if (avg >= 8) return "bg-emerald-600 hover:bg-emerald-600";
  if (avg >= 6) return "bg-amber-500 hover:bg-amber-500";
  return "bg-rose-600 hover:bg-rose-600";
};

/* ------------------------------------------------------------------ */
/* الصفحة                                                              */
/* ------------------------------------------------------------------ */

export default function EmployeeEvaluationsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { dataOwnerId } = useDataOwnerId();

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [rows, setRows] = useState<EvalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortKey, setSortKey] = useState<keyof EvalRow>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [detail, setDetail] = useState<EvalRow | null>(null);

  /** خرائط عناوين الحقول لكل قالب (لعرض المعايير بأسمائها الحقيقية). */
  const templateMap = useMemo(() => {
    const m = new Map<string, TemplateRow>();
    templates.forEach((t) => m.set(t.id, t));
    return m;
  }, [templates]);

  const load = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    try {
      const { data: tpls, error: tErr } = await supabase
        .from("form_templates")
        .select("id, name, schema")
        .eq("user_id", dataOwnerId);
      if (tErr) throw tErr;

      const evalTemplates = ((tpls || []) as any as TemplateRow[]).filter(isEvaluationTemplate);
      setTemplates(evalTemplates);
      if (evalTemplates.length === 0) { setRows([]); return; }

      const { data: forms, error: fErr } = await supabase
        .from("employee_forms")
        .select("id, employee_id, template_id, title, form_data, status, workflow_status, created_at, submitted_at, hr_hidden_at, employee_acknowledged_at")
        .eq("user_id", dataOwnerId)
        .in("template_id", evalTemplates.map((t) => t.id))
        .order("created_at", { ascending: false })
        .limit(2000);
      if (fErr) throw fErr;

      const formRows = (forms || []) as any as FormRow[];
      const empIds = Array.from(new Set(formRows.map((f) => f.employee_id).filter(Boolean))) as string[];

      let employees: EmployeeLite[] = [];
      if (empIds.length) {
        const { data: emps } = await supabase
          .from("employees")
          .select("id, full_name, job_title, branch_id")
          .in("id", empIds);
        employees = (emps || []) as any as EmployeeLite[];
      }
      const branchIds = Array.from(new Set(employees.map((e) => e.branch_id).filter(Boolean))) as string[];
      let branchMap = new Map<string, string>();
      if (branchIds.length) {
        const { data: brs } = await supabase.from("branches").select("id, name").in("id", branchIds);
        branchMap = new Map(((brs || []) as any[]).map((b) => [b.id as string, b.name as string]));
      }

      setRows(buildEvalRows(formRows, evalTemplates, employees, branchMap));
    } catch (e: any) {
      toast.error(e?.message || "تعذّر تحميل التقييمات");
    } finally {
      setLoading(false);
    }
  }, [dataOwnerId]);

  useEffect(() => { void load(); }, [load]);

  // فتح تقييم محدد عند الوصول من رابط (?form=<id>)
  useEffect(() => {
    const id = searchParams.get("form");
    if (!id || !rows.length) return;
    const found = rows.find((r) => r.id === id);
    if (found) {
      setDetail(found);
      const next = new URLSearchParams(searchParams);
      next.delete("form");
      setSearchParams(next, { replace: true });
    }
  }, [rows, searchParams, setSearchParams]);

  const branches = useMemo(
    () => Array.from(new Set(rows.map((r) => r.branch).filter((b) => b && b !== "—"))).sort((a, b) => a.localeCompare(b, "ar")),
    [rows],
  );

  const visible = useMemo(() => rows.filter((r) => !r.raw.hr_hidden_at), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromT = fromDate ? Date.parse(`${fromDate}T00:00:00`) : null;
    const toT = toDate ? Date.parse(`${toDate}T23:59:59.999`) : null;

    return visible.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (templateFilter !== "all" && r.templateId !== templateFilter) return false;
      if (branchFilter !== "all" && r.branch !== branchFilter) return false;
      const t = Date.parse(r.created_at);
      if (fromT !== null && t < fromT) return false;
      if (toT !== null && t > toT) return false;
      if (!q) return true;
      return [r.evaluated, r.evaluatorName, r.evaluatorRole, r.branch, r.jobTitle, r.templateName]
        .some((v) => (v || "").toLowerCase().includes(q));
    }).sort((a, b) => {
      const va = a[sortKey] as any;
      const vb = b[sortKey] as any;
      let cmp: number;
      if (sortKey === "created_at") cmp = Date.parse(a.created_at) - Date.parse(b.created_at);
      else if (typeof va === "number" || typeof vb === "number") cmp = (va ?? -1) - (vb ?? -1);
      else cmp = String(va ?? "").localeCompare(String(vb ?? ""), "ar");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [visible, search, statusFilter, templateFilter, branchFilter, fromDate, toDate, sortKey, sortDir]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: visible.length };
    for (const s of STATUSES) c[s.key] = visible.filter((r) => r.status === s.key).length;
    return c;
  }, [visible]);

  const stats = useMemo(() => {
    const withAvg = filtered.filter((r) => r.average !== null);
    const avg = withAvg.length ? round1(withAvg.reduce((a, r) => a + (r.average as number), 0) / withAvg.length) : null;
    const employees = new Set(filtered.map((r) => r.evaluated).filter((v) => v !== "—")).size;
    const evaluators = new Set(filtered.map((r) => r.evaluatorName).filter((v) => v !== "—")).size;
    const weak = filtered.filter((r) => r.average !== null && (r.average as number) < 6).length;
    return { avg, employees, evaluators, weak };
  }, [filtered]);

  const toggleSort = (key: keyof EvalRow) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortableTh = ({ col, label }: { col: keyof EvalRow; label: string }) => (
    <th className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort(col)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === col
          ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
          : <ArrowUpDown className="w-3 h-3 opacity-40" />}
      </span>
    </th>
  );

  /** تصدير كل تقييم بكل معاييره — عمود لكل معيار حسب القالب. */
  const exportExcel = () => {
    if (!filtered.length) return toast.error("لا توجد تقييمات للتصدير");
    const data = filtered.map((r) => {
      const tpl = templateMap.get(r.templateId);
      const criteriaFields = (tpl?.schema?.sections || []).find((s) => s.key === "criteria")?.fields || [];
      const criteria = (r.raw.form_data?.criteria || {}) as Record<string, any>;
      const extraSection = (tpl?.schema?.sections || []).find((s) => s.key === "followup" || s.key === "decision");
      const extra = (r.raw.form_data?.[extraSection?.key || ""] || {}) as Record<string, any>;

      const base: Record<string, any> = {
        "التاريخ والوقت": AR_DT(r.created_at),
        "النموذج": r.templateName,
        "الموظف المقيَّم": r.evaluated,
        "المسمى الوظيفي": r.jobTitle,
        "المقيِّم": r.evaluatorName,
        "وظيفة المقيِّم": r.evaluatorJob,
        "صفة المقيِّم": r.evaluatorRole,
        "الفرع": r.branch,
        "نوع التقييم": r.evalType,
        "السنة": r.year,
        "تاريخ التقييم": r.evalDate || "—",
        "المجموع": r.total ?? "—",
        "المعدل (من 10)": r.average ?? "—",
        "التقدير": scoreLabel(r.average),
        "اعتماد الموظف": r.acknowledged ? "نعم" : "لا",
        "الحالة": statusMeta(r.status).label,
      };
      criteriaFields.forEach((c) => { base[c.label] = criteria[c.key] ?? ""; });
      (extraSection?.fields || []).forEach((f) => {
        const v = extra[f.key];
        base[f.label] = typeof v === "boolean" ? (v ? "نعم" : "لا") : (v ?? "");
      });
      return base;
    });

    const allKeys = Array.from(new Set(data.flatMap((d) => Object.keys(d))));
    const normalized = data.map((d) => Object.fromEntries(allKeys.map((k) => [k, (d as any)[k] ?? ""])));
    const ws = XLSX.utils.json_to_sheet(normalized);
    (ws as any)["!cols"] = allKeys.map(() => ({ wch: 20 }));
    (ws as any)["!views"] = [{ RTL: true }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تقييم الموظفين");
    setNextExportBranding({ title: "تقييم الموظفين" });
    XLSX.writeFile(wb, `تقييم-الموظفين-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`تم تصدير ${filtered.length} تقييم`);
  };

  const actionTabs: ActionTab[] = useMemo(() => [
    {
      key: "general",
      label: "عام",
      groups: [
        {
          key: "actions",
          label: "إجراءات",
          items: [
            { key: "refresh", label: "تحديث", icon: RefreshCw, variant: "primary", onClick: () => void load() },
            { key: "export-excel", label: "تصدير إكسل", icon: Download, onClick: exportExcel },
            { key: "print", label: "طباعة", icon: Printer, onClick: () => window.print() },
            { key: "back", label: "رجوع", icon: ArrowRight, onClick: () => navigate("/hr") },
          ],
        },
      ],
    },
  ], [load, navigate, filtered, templateMap]);

  const detailTemplate = detail ? templateMap.get(detail.templateId) : undefined;

  return (
    <div dir="rtl" className="min-h-[100dvh] bg-background">
      <FinanceShell
        title="تقييم الموظفين"
        breadcrumb={[{ label: "الموارد البشرية", href: "/hr" }, { label: "تقييم الموظفين" }]}
        actionTabs={actionTabs}
        rightSlot={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="relative w-[220px]">
              <Search className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالموظف، المقيِّم، الفرع..." className="pr-7 h-8 text-[12.5px]" />
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant={statusFilter === "all" ? "default" : "outline"}
                className="h-8 text-[12px]" onClick={() => setStatusFilter("all")}>
                الكل ({counts.all})
              </Button>
              {STATUSES.filter((s) => (counts[s.key] || 0) > 0).map((s) => (
                <Button key={s.key} size="sm" variant={statusFilter === s.key ? "default" : "outline"}
                  className="h-8 text-[12px]" onClick={() => setStatusFilter(s.key)}>
                  {s.label} ({counts[s.key] || 0})
                </Button>
              ))}
            </div>
          </div>
        }
      >
        <main className="flex-1 p-3 space-y-3">
          {/* فلاتر تفصيلية */}
          <div className="flex flex-wrap items-end gap-2 bg-muted/30 border rounded-lg p-2">
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">النموذج</div>
              <select value={templateFilter} onChange={(e) => setTemplateFilter(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-[12.5px] min-w-[190px]">
                <option value="all">كل نماذج التقييم</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">الفرع</div>
              <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-[12.5px] min-w-[150px]">
                <option value="all">كل الفروع</option>
                {branches.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">من تاريخ</div>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 text-[12.5px] w-[150px]" />
            </div>
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">إلى تاريخ</div>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 text-[12.5px] w-[150px]" />
            </div>
            {(templateFilter !== "all" || branchFilter !== "all" || fromDate || toDate) && (
              <Button size="sm" variant="ghost" className="h-8 text-[12px]"
                onClick={() => { setTemplateFilter("all"); setBranchFilter("all"); setFromDate(""); setToDate(""); }}>
                مسح الفلاتر
              </Button>
            )}
          </div>

          {/* ملخص سريع */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: "عدد التقييمات", value: filtered.length },
              { label: "موظفون مقيَّمون", value: stats.employees },
              { label: "عدد المقيِّمين", value: stats.evaluators },
              { label: "متوسط التقييم", value: stats.avg === null ? "—" : `${stats.avg} / 10` },
            ].map((c) => (
              <div key={c.label} className="border rounded-lg bg-background p-2.5">
                <div className="text-[11px] text-muted-foreground">{c.label}</div>
                <div className="text-lg font-bold">{c.value}</div>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">لا توجد تقييمات مطابقة.</div>
          ) : (
            <>
              {/* بطاقات الجوال */}
              <div className="grid gap-2 md:hidden">
                {filtered.map((r) => (
                  <div key={r.id} onClick={() => setDetail(r)}
                    className="text-right bg-background border rounded-lg p-3 space-y-1 hover:border-primary transition-colors cursor-pointer">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm">{r.evaluated}</span>
                      <Badge className={scoreCls(r.average)}>{r.average === null ? "—" : `${r.average}/10`}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      المقيِّم: {r.evaluatorName} • {r.evaluatorRole}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {r.branch} • {r.templateName}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">{AR_DT(r.created_at)}</span>
                      <Badge className={statusMeta(r.status).cls}>{statusMeta(r.status).label}</Badge>
                    </div>
                  </div>
                ))}
              </div>

              {/* جدول سطح المكتب */}
              <div className="hidden md:block bg-background border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-xs">
                    <tr className="[&>th]:p-2 [&>th]:text-right [&>th]:font-medium">
                      <SortableTh col="created_at" label="التاريخ والوقت" />
                      <SortableTh col="evaluated" label="الموظف المقيَّم" />
                      <SortableTh col="jobTitle" label="المسمى الوظيفي" />
                      <SortableTh col="evaluatorName" label="المدير المقيِّم" />
                      <SortableTh col="evaluatorRole" label="صفة المقيِّم" />
                      <SortableTh col="branch" label="الفرع" />
                      <SortableTh col="templateName" label="النموذج" />
                      <SortableTh col="evalType" label="نوع التقييم" />
                      <SortableTh col="year" label="السنة" />
                      <SortableTh col="total" label="المجموع" />
                      <SortableTh col="average" label="المعدل" />
                      <th>المعايير</th>
                      <th>اعتماد الموظف</th>
                      <SortableTh col="status" label="الحالة" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id} onClick={() => setDetail(r)}
                        className="border-t hover:bg-muted/30 cursor-pointer [&>td]:p-2">
                        <td className="whitespace-nowrap text-xs">{AR_DT(r.created_at)}</td>
                        <td className="font-medium whitespace-nowrap">{r.evaluated}</td>
                        <td className="whitespace-nowrap">{r.jobTitle}</td>
                        <td className="whitespace-nowrap">{r.evaluatorName}</td>
                        <td className="whitespace-nowrap">{r.evaluatorRole}</td>
                        <td className="whitespace-nowrap">{r.branch}</td>
                        <td className="max-w-[190px] truncate" title={r.templateName}>{r.templateName}</td>
                        <td className="whitespace-nowrap">{r.evalType}</td>
                        <td className="whitespace-nowrap">{r.year}</td>
                        <td className="whitespace-nowrap">{r.total ?? "—"}</td>
                        <td className="whitespace-nowrap">
                          <Badge className={scoreCls(r.average)}>
                            {r.average === null ? "—" : `${r.average} / 10`}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap text-xs text-muted-foreground">
                          {r.criteriaFilled}/{r.criteriaCount}
                        </td>
                        <td className="whitespace-nowrap">{r.acknowledged ? "نعم" : "—"}</td>
                        <td><Badge className={statusMeta(r.status).cls}>{statusMeta(r.status).label}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </main>
      </FinanceShell>

      {/* تفاصيل التقييم */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-right flex items-center gap-2">
              <Star className="w-4 h-4 text-primary" />
              تقييم: {detail?.evaluated}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={scoreCls(detail.average)}>
                  {detail.average === null ? "غير مكتمل" : `${detail.average} / 10 — ${scoreLabel(detail.average)}`}
                </Badge>
                <Badge className={statusMeta(detail.status).cls}>{statusMeta(detail.status).label}</Badge>
                <span className="text-xs text-muted-foreground">{AR_DT(detail.created_at)}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  ["النموذج", detail.templateName],
                  ["الموظف المقيَّم", detail.evaluated],
                  ["المسمى الوظيفي", detail.jobTitle],
                  ["المدير المقيِّم", `${detail.evaluatorName}${detail.evaluatorJob !== "—" ? ` (${detail.evaluatorJob})` : ""}`],
                  ["صفة المقيِّم", detail.evaluatorRole],
                  ["الفرع", detail.branch],
                  ["نوع التقييم", detail.evalType],
                  ["السنة", detail.year],
                  ["تاريخ التقييم", detail.evalDate || "—"],
                  ["المجموع المكتوب", detail.total ?? "—"],
                ].map(([l, v]) => (
                  <div key={l as string} className="border rounded-lg p-2">
                    <div className="text-[11px] text-muted-foreground">{l}</div>
                    <div className="font-medium">{String(v)}</div>
                  </div>
                ))}
              </div>

              {/* المعايير */}
              {(() => {
                const criteriaFields = (detailTemplate?.schema?.sections || []).find((s) => s.key === "criteria")?.fields || [];
                const criteria = (detail.raw.form_data?.criteria || {}) as Record<string, any>;
                if (!criteriaFields.length) return null;
                return (
                  <div>
                    <h4 className="text-xs font-bold text-muted-foreground mb-1">معايير التقييم</h4>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/60">
                          <tr className="[&>th]:p-1.5 [&>th]:text-right [&>th]:font-medium">
                            <th>المعيار</th><th className="w-20">الدرجة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {criteriaFields.map((c) => (
                            <tr key={c.key} className="border-t [&>td]:p-1.5">
                              <td>{c.label}</td>
                              <td className="font-semibold">{criteria[c.key] ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* المتابعة / القرار */}
              {(detailTemplate?.schema?.sections || [])
                .filter((s) => s.key !== "header" && s.key !== "criteria")
                .map((s) => {
                  const vals = (detail.raw.form_data?.[s.key] || {}) as Record<string, any>;
                  const items = (s.fields || []).filter((f) => {
                    const v = vals[f.key];
                    return v !== null && v !== undefined && String(v).trim() !== "";
                  });
                  if (!items.length) return null;
                  return (
                    <div key={s.key}>
                      <h4 className="text-xs font-bold text-muted-foreground mb-1">{s.title || "تفاصيل إضافية"}</h4>
                      <div className="space-y-1.5">
                        {items.map((f) => {
                          const v = vals[f.key];
                          return (
                            <div key={f.key} className="border rounded-lg p-2">
                              <div className="text-[11px] text-muted-foreground">{f.label}</div>
                              <div className="whitespace-pre-wrap">
                                {typeof v === "boolean" ? (v ? "نعم" : "لا") : String(v)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
