import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Save, FileSpreadsheet, BookmarkPlus, Loader2, Sparkles, FolderOpen, FileText, BarChart3, LineChart as LineIcon, PieChart as PieIcon, Table as TableIcon, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DATA_SOURCES, getDataSource, FieldDef } from "@/lib/report-builder/data-sources";
import { runReport, calculateKPIs, ReportFilters } from "@/lib/report-builder/query-engine";
import ColumnPicker from "@/components/report-builder/ColumnPicker";
import FilterPanel from "@/components/report-builder/FilterPanel";
import DrillDownModal from "@/components/report-builder/DrillDownModal";
import ReportChart, { ChartType, getAvailableCharts } from "@/components/report-builder/ReportChart";
import SortableReportTable, { ColumnDef } from "@/components/reports/SortableReportTable";
import * as XLSX from "xlsx";
import { setNextExportBranding } from "@/lib/excel-export";
import { exportReportToPdf } from "@/lib/report-builder/pdf-export";

const DRAFT_KEY = "report-builder-draft";
type ViewMode = "table" | "chart" | "both";

export default function ReportBuilderPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const loadId = searchParams.get("load");

  const [sourceKey, setSourceKey] = useState<string>("sales");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<ReportFilters>(() => {
    const today = new Date().toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    return { dateFrom: monthAgo, dateTo: today };
  });
  const [groupBy, setGroupBy] = useState("none");
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [drillRows, setDrillRows] = useState<any[] | null>(null);
  const [drillLabel, setDrillLabel] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [reportName, setReportName] = useState("");
  const [reportDesc, setReportDesc] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [exportingPdf, setExportingPdf] = useState(false);
  const chartRef = useRef<HTMLDivElement | null>(null);

  const source = useMemo(() => getDataSource(sourceKey)!, [sourceKey]);

  // Load saved report or draft
  useEffect(() => {
    if (loadId && user) {
      (async () => {
        const { data: rec } = await supabase
          .from("custom_reports")
          .select("*")
          .eq("id", loadId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (rec) {
          setSourceKey(rec.data_source);
          setSelectedColumns((rec.columns as any) || []);
          setFilters((rec.filters as any) || {});
          setGroupBy(rec.group_by || "none");
          setReportName(rec.name);
          setReportDesc(rec.description || "");
          await supabase.from("custom_reports").update({
            last_used_at: new Date().toISOString(),
            use_count: (rec.use_count || 0) + 1,
          }).eq("id", loadId);
        }
      })();
    } else {
      // Try draft
      try {
        const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
        if (draft.sourceKey) {
          setSourceKey(draft.sourceKey);
          setSelectedColumns(draft.selectedColumns || []);
          setFilters(draft.filters || filters);
          setGroupBy(draft.groupBy || "none");
        }
      } catch {}
    }
  }, [loadId, user]);

  // Init default columns when source changes (and no columns set)
  useEffect(() => {
    if (selectedColumns.length === 0) {
      setSelectedColumns(source.fields.filter(f => f.defaultVisible).map(f => f.key));
    }
  }, [sourceKey]);

  // Save draft
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ sourceKey, selectedColumns, filters, groupBy }));
  }, [sourceKey, selectedColumns, filters, groupBy]);

  const handleRun = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const rows = await runReport({ source, userId: user.id, filters, groupBy });
      setData(rows);
      setHasRun(true);
    } catch (e: any) {
      toast({ title: "خطأ في تشغيل التقرير", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user, source, filters, groupBy, toast]);

  // Auto-run on first load
  useEffect(() => {
    if (user && !hasRun && selectedColumns.length > 0) {
      handleRun();
    }
  }, [user, sourceKey]);

  const handleChangeSource = (newKey: string) => {
    setSourceKey(newKey);
    const newSrc = getDataSource(newKey)!;
    setSelectedColumns(newSrc.fields.filter(f => f.defaultVisible).map(f => f.key));
    setGroupBy("none");
    setData([]);
    setHasRun(false);
  };

  // KPIs
  const kpis = useMemo(() => calculateKPIs(data, source), [data, source]);

  // Build dynamic columns for SortableReportTable
  const tableColumns: ColumnDef[] = useMemo(() => {
    if (groupBy !== "none" && data.length > 0 && "_group" in data[0]) {
      return [
        { key: "_group", label: "المجموعة", type: "text", width: "200px" },
        { key: "_count", label: "العدد", type: "number", align: "center" },
        { key: "total_amount", label: "الإجمالي", type: "currency" },
        ...(source.key !== "inventory" ? [{ key: "paid_amount", label: "المدفوع", type: "currency" as const }] : []),
      ];
    }
    return selectedColumns
      .map(key => source.fields.find(f => f.key === key))
      .filter(Boolean)
      .map((f) => ({
        key: f!.key,
        label: f!.label,
        type: f!.type as any,
        align: (f!.type === "number" || f!.type === "currency" ? "left" : "right") as any,
      }));
  }, [selectedColumns, source, data, groupBy]);

  // Totals row
  const totalsRow = useMemo(() => {
    const t: any = {};
    tableColumns.forEach(c => {
      if (c.type === "currency" || c.type === "number") t[c.key] = "sum";
    });
    return Object.keys(t).length > 0 ? t : undefined;
  }, [tableColumns]);

  // Drill down on grouped row click
  const onRowClick = (row: any) => {
    if (row._drillRows) {
      setDrillRows(row._drillRows);
      setDrillLabel(row._group);
    }
  };

  const handleSave = async () => {
    if (!user || !reportName.trim()) {
      toast({ title: "أدخل اسم التقرير", variant: "destructive" });
      return;
    }
    try {
      const { error } = await supabase.from("custom_reports").insert({
        user_id: user.id,
        name: reportName.trim(),
        description: reportDesc.trim() || null,
        data_source: sourceKey,
        columns: selectedColumns as any,
        filters: filters as any,
        group_by: groupBy === "none" ? null : groupBy,
      });
      if (error) throw error;
      toast({ title: "تم حفظ التقرير ✅", description: `تجده الآن في "تقاريري"` });
      setSaveOpen(false);
      setReportName("");
      setReportDesc("");
    } catch (e: any) {
      toast({ title: "خطأ في الحفظ", description: e.message, variant: "destructive" });
    }
  };

  const handleExport = () => {
    if (!data.length) return;
    const rows = data.map(row => {
      const out: Record<string, any> = {};
      tableColumns.forEach(c => { out[c.label] = row[c.key]; });
      return out;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, source.label);
    setNextExportBranding({ title: reportName || `تقرير ${source.label}` });
    XLSX.writeFile(wb, `${reportName || source.label}_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast({ title: "تم التصدير ✅" });
  };

  // Available chart types based on current data shape
  const isGrouped = groupBy !== "none" && data.length > 0 && "_group" in data[0];
  const availableCharts = useMemo(
    () => getAvailableCharts(tableColumns, isGrouped),
    [tableColumns, isGrouped]
  );

  // Reset chart type if current is not available
  useEffect(() => {
    if (availableCharts.length > 0 && !availableCharts.includes(chartType)) {
      setChartType(availableCharts[0]);
    }
    if (availableCharts.length === 0 && viewMode !== "table") {
      setViewMode("table");
    }
  }, [availableCharts, chartType, viewMode]);

  const handleExportPdf = async () => {
    if (!data.length) return;
    setExportingPdf(true);
    try {
      const chartEl = (viewMode === "chart" || viewMode === "both") ? chartRef.current : null;
      await new Promise(r => setTimeout(r, 150));
      await exportReportToPdf({
        title: reportName || `تقرير ${source.label}`,
        subtitle: reportDesc || undefined,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        kpis: kpis.map(k => ({ label: k.label, value: k.value })),
        columns: tableColumns,
        data,
        chartElement: chartEl,
      });
      toast({ title: "تم تصدير PDF ✅" });
    } catch (e: any) {
      toast({ title: "خطأ في تصدير PDF", description: e.message, variant: "destructive" });
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="px-4 pt-6 pb-24 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold text-foreground">منشئ التقارير المخصصة</h1>
            </div>
            <p className="text-xs text-muted-foreground">صمم تقريرك حسب احتياجك — اختر المصدر، الأعمدة، والفلاتر</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate("/reports/my-reports")} className="gap-1.5 rounded-xl">
            <FolderOpen className="h-4 w-4" /> تقاريري
          </Button>
          <Button size="sm" variant="outline" onClick={handleExport} disabled={!data.length} className="gap-1.5 rounded-xl">
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportPdf} disabled={!data.length || exportingPdf} className="gap-1.5 rounded-xl">
            {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} PDF
          </Button>
          <Button size="sm" onClick={() => setSaveOpen(true)} disabled={!hasRun} className="gap-1.5 rounded-xl">
            <BookmarkPlus className="h-4 w-4" /> حفظ التقرير
          </Button>
        </div>
      </div>

      {/* Step 1: Data source */}
      <Card className="p-4">
        <p className="text-xs font-medium text-muted-foreground mb-3">1. اختر مصدر البيانات</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {DATA_SOURCES.map(s => {
            const Icon = s.icon;
            const active = sourceKey === s.key;
            return (
              <button
                key={s.key}
                onClick={() => handleChangeSource(s.key)}
                className={`p-3 rounded-xl border text-right transition-all ${
                  active ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/30 hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${s.color}15`, color: s.color }}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium">{s.label}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{s.description}</p>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Step 2 & 3: Columns + Filters */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-1">
          <p className="text-xs font-medium text-muted-foreground mb-3">2. الأعمدة</p>
          <ColumnPicker
            allFields={source.fields}
            selectedKeys={selectedColumns}
            onChange={setSelectedColumns}
          />
        </Card>

        <div className="lg:col-span-2 space-y-3">
          <Card className="p-0 overflow-hidden">
            <div className="px-4 pt-4">
              <p className="text-xs font-medium text-muted-foreground">3. الفلاتر والتجميع</p>
            </div>
            <FilterPanel
              source={source}
              filters={filters}
              onChange={setFilters}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
              onRun={handleRun}
              loading={loading}
            />
          </Card>

          {/* KPIs */}
          {hasRun && kpis.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {kpis.map((k, i) => (
                <Card key={i} className="p-3">
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">{k.label}</p>
                  <p className={`text-base font-bold tabular-nums ${
                    k.color === "primary" ? "text-primary" :
                    k.color === "destructive" ? "text-destructive" : "text-foreground"
                  }`}>{k.value}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <Card className="p-12 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">جارٍ تحميل البيانات...</p>
        </Card>
      ) : !hasRun ? (
        <Card className="p-12 text-center">
          <Sparkles className="h-10 w-10 text-primary/30 mx-auto mb-3" />
          <p className="text-sm text-foreground font-medium mb-1">جاهز للبدء</p>
          <p className="text-xs text-muted-foreground">اختر مصدر وأعمدة وفلاتر، ثم اضغط "تشغيل التقرير"</p>
        </Card>
      ) : data.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-sm font-medium mb-1">لا توجد بيانات للفلاتر المحددة</p>
          <p className="text-xs text-muted-foreground mb-3">جرب توسيع نطاق التاريخ أو إزالة بعض الفلاتر</p>
          <Button size="sm" variant="outline" onClick={() => {
            setFilters({ dateFrom: "", dateTo: "" });
          }}>إزالة كل الفلاتر</Button>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* View mode + chart type toggle */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/40 bg-muted/20 flex-wrap">
            <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
              <ViewModeBtn active={viewMode === "table"} onClick={() => setViewMode("table")} icon={<TableIcon className="h-3.5 w-3.5" />} label="جدول" />
              <ViewModeBtn
                active={viewMode === "chart"}
                onClick={() => setViewMode("chart")}
                icon={<BarChart3 className="h-3.5 w-3.5" />}
                label="رسم بياني"
                disabled={availableCharts.length === 0}
              />
              <ViewModeBtn
                active={viewMode === "both"}
                onClick={() => setViewMode("both")}
                icon={<LayoutGrid className="h-3.5 w-3.5" />}
                label="كلاهما"
                disabled={availableCharts.length === 0}
              />
            </div>

            {(viewMode === "chart" || viewMode === "both") && availableCharts.length > 0 && (
              <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
                {availableCharts.includes("bar") && (
                  <ChartTypeBtn active={chartType === "bar"} onClick={() => setChartType("bar")} icon={<BarChart3 className="h-3.5 w-3.5" />} label="أعمدة" />
                )}
                {availableCharts.includes("line") && (
                  <ChartTypeBtn active={chartType === "line"} onClick={() => setChartType("line")} icon={<LineIcon className="h-3.5 w-3.5" />} label="خطي" />
                )}
                {availableCharts.includes("pie") && (
                  <ChartTypeBtn active={chartType === "pie"} onClick={() => setChartType("pie")} icon={<PieIcon className="h-3.5 w-3.5" />} label="دائري" />
                )}
              </div>
            )}
          </div>

          {/* Chart */}
          {(viewMode === "chart" || viewMode === "both") && availableCharts.length > 0 && (
            <div ref={chartRef} className="p-4 bg-background">
              <ReportChart
                data={data}
                columns={tableColumns}
                type={chartType}
                isGrouped={isGrouped}
              />
            </div>
          )}

          {/* Table */}
          {(viewMode === "table" || viewMode === "both") && (
            <>
              <SortableReportTable
                columns={tableColumns}
                data={data}
                totalsRow={totalsRow}
                loading={false}
                reportTitle={reportName || `تقرير ${source.label}`}
                storageKey={`builder-${sourceKey}-${groupBy}`}
                rowClassName={(row) => row._drillRows ? "cursor-pointer hover:bg-primary/5" : ""}
              />
              {groupBy !== "none" && data.length > 0 && (
                <div className="px-4 py-2 bg-muted/30 border-t border-border/40 text-[10px] text-muted-foreground text-center">
                  💡 اضغط على أي صف للوصول لتفاصيل البنود
                </div>
              )}
              {groupBy !== "none" && (
                <ClickableGroupRows data={data} onClick={onRowClick} />
              )}
            </>
          )}
        </Card>
      )}

      {/* Drill-down modal */}
      {drillRows && (
        <DrillDownModal
          open={!!drillRows}
          onClose={() => setDrillRows(null)}
          rows={drillRows}
          groupLabel={drillLabel}
          source={source}
        />
      )}

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>حفظ التقرير</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">اسم التقرير *</Label>
              <Input value={reportName} onChange={e => setReportName(e.target.value)} placeholder="مثلاً: مبيعات يومية مارس" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">وصف (اختياري)</Label>
              <Input value={reportDesc} onChange={e => setReportDesc(e.target.value)} placeholder="وصف مختصر للتقرير" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} className="gap-1.5"><Save className="h-4 w-4" /> حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper to attach click handlers via DOM since SortableReportTable doesn't accept onRowClick
function ClickableGroupRows({ data, onClick }: { data: any[]; onClick: (row: any) => void }) {
  useEffect(() => {
    const tbody = document.querySelector("table tbody");
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll("tr"));
    const handlers: Array<() => void> = [];
    rows.forEach((tr, idx) => {
      if (idx >= data.length) return;
      const row = data[idx];
      if (!row?._drillRows) return;
      const h = () => onClick(row);
      tr.addEventListener("click", h);
      handlers.push(() => tr.removeEventListener("click", h));
    });
    return () => handlers.forEach(fn => fn());
  }, [data, onClick]);
  return null;
}
