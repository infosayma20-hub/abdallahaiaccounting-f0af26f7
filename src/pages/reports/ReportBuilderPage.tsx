import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Save,
  FileSpreadsheet,
  BookmarkPlus,
  Loader2,
  Sparkles,
  FolderOpen,
  FileText,
  BarChart3,
  LineChart as LineIcon,
  PieChart as PieIcon,
  Table as TableIcon,
  LayoutGrid,
  RotateCcw,
  Zap,
  Activity,
  Layers,
  CircleDot,
  History,
  Folder,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { supabase } from "@/integrations/supabase/client";
import { DATA_SOURCES, getDataSource } from "@/lib/report-builder/data-sources";
import { runReport, calculateKPIs, ReportFilters } from "@/lib/report-builder/query-engine";
import ColumnPicker from "@/components/report-builder/ColumnPicker";
import FilterPanel from "@/components/report-builder/FilterPanel";
import DrillDownDrawer, { DrillLevel } from "@/components/report-builder/DrillDownDrawer";
import ReportChart, { ChartType, getAvailableCharts } from "@/components/report-builder/ReportChart";
import ChartToolbar from "@/components/report-builder/ChartToolbar";
import TableSkeleton from "@/components/report-builder/TableSkeleton";
import ReportPagination from "@/components/report-builder/ReportPagination";
import SortableReportTable, { ColumnDef } from "@/components/reports/SortableReportTable";
import * as XLSX from "xlsx";
import { setNextExportBranding } from "@/lib/excel-export";
import { exportReportToPdf, PdfTemplate } from "@/lib/report-builder/pdf-export";
import { ChevronDown, Briefcase, Coins, Minimize2, FileStack } from "lucide-react";
import VersionHistoryDialog from "@/components/report-builder/VersionHistoryDialog";
import { useReportFolders } from "@/hooks/useReportFolders";

const DRAFT_KEY = "report-builder-draft";
const VIEW_KEY_PREFIX = "report-builder-view-"; // per-source last view
type ViewMode = "table" | "chart" | "both";

const DEFAULT_FILTERS = (): ReportFilters => {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  return { dateFrom: monthAgo, dateTo: today };
};

export default function ReportBuilderPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const loadId = searchParams.get("load");
  const { folders } = useReportFolders();

  const [sourceKey, setSourceKey] = useState<string>("sales");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
  const [groupBy, setGroupBy] = useState("none");

  const [data, setData] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const [drillRows, setDrillRows] = useState<any[] | null>(null);
  const [drillLabel, setDrillLabel] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [reportName, setReportName] = useState("");
  const [reportDesc, setReportDesc] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [loadedReportId, setLoadedReportId] = useState<string | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [exportingPdf, setExportingPdf] = useState(false);
  const chartRef = useRef<HTMLDivElement | null>(null);

  // Branding info for PDF footer/header
  const [branding, setBranding] = useState<{ companyName?: string; companyLogo?: string; userName?: string }>({});

  // Debounce filters so rapid typing doesn't fire many queries
  const debouncedFilters = useDebouncedValue(filters, 350);

  const source = useMemo(() => getDataSource(sourceKey)!, [sourceKey]);
  const isGrouped = groupBy !== "none";

  // Load branding once
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [profileRes, companyRes] = await Promise.all([
        supabase.from("profiles" as any).select("display_name").eq("user_id", user.id).maybeSingle(),
        supabase.from("companies" as any).select("name, logo_url").eq("owner_id", user.id).maybeSingle(),
      ]);
      const profile: any = profileRes.data;
      const company: any = companyRes.data;
      setBranding({
        userName: profile?.display_name || user.email || undefined,
        companyName: company?.name || undefined,
        companyLogo: company?.logo_url || undefined,
      });
    })();
  }, [user]);

  // Load saved report or per-source last view
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
          setFilters((rec.filters as any) || DEFAULT_FILTERS());
          setGroupBy(rec.group_by || "none");
          setReportName(rec.name);
          setReportDesc(rec.description || "");
          setFolderId(rec.folder_id || null);
          setLoadedReportId(rec.id);
          await supabase
            .from("custom_reports")
            .update({
              last_used_at: new Date().toISOString(),
              use_count: (rec.use_count || 0) + 1,
            })
            .eq("id", loadId);
        }
      })();
    } else {
      // Try draft first
      try {
        const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
        if (draft.sourceKey) {
          setSourceKey(draft.sourceKey);
          setSelectedColumns(draft.selectedColumns || []);
          setFilters(draft.filters || DEFAULT_FILTERS());
          setGroupBy(draft.groupBy || "none");
          if (draft.viewMode) setViewMode(draft.viewMode);
          if (draft.chartType) setChartType(draft.chartType);
          if (draft.pageSize) setPageSize(draft.pageSize);
        }
      } catch {}
    }
  }, [loadId, user]);

  // Init default columns when source changes (and no columns set)
  useEffect(() => {
    const validKeys = new Set(source.fields.map((f) => f.key));
    // Drop any legacy column keys that no longer exist on this source.
    const cleaned = selectedColumns.filter((c) => validKeys.has(c));
    if (cleaned.length === 0) {
      setSelectedColumns(source.fields.filter((f) => f.defaultVisible).map((f) => f.key));
    } else if (cleaned.length !== selectedColumns.length) {
      setSelectedColumns(cleaned);
    }
  }, [sourceKey]);

  // Persist draft + per-source view (debounced via effect dependency stability)
  useEffect(() => {
    const payload = { sourceKey, selectedColumns, filters, groupBy, viewMode, chartType, pageSize };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    localStorage.setItem(VIEW_KEY_PREFIX + sourceKey, JSON.stringify(payload));
  }, [sourceKey, selectedColumns, filters, groupBy, viewMode, chartType, pageSize]);

  const handleRun = useCallback(
    async (opts?: { page?: number }) => {
      if (!user) return;
      setLoading(true);
      try {
        const result = await runReport({
          source,
          userId: user.id,
          filters: debouncedFilters,
          groupBy,
          page: opts?.page ?? page,
          pageSize,
          selectedColumns,
        });
        setData(result.rows);
        setTotalCount(result.total);
        setDurationMs(result.durationMs);
        setHasRun(true);
      } catch (e: any) {
        toast({ title: "خطأ في تشغيل التقرير", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    },
    [user, source, debouncedFilters, groupBy, page, pageSize, selectedColumns, toast]
  );

  // Auto-run on first load
  useEffect(() => {
    if (user && !hasRun && selectedColumns.length > 0) {
      handleRun({ page: 1 });
    }
  }, [user, sourceKey]);

  // Re-run when debounced filters / groupBy / page / pageSize change (after first run)
  useEffect(() => {
    if (!hasRun) return;
    handleRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFilters, groupBy, page, pageSize]);

  // Reset to page 1 when filters/group change
  useEffect(() => {
    setPage(1);
  }, [debouncedFilters, groupBy, sourceKey]);

  const handleChangeSource = (newKey: string) => {
    // Restore last view for this source if exists
    let restored: any = null;
    try {
      restored = JSON.parse(localStorage.getItem(VIEW_KEY_PREFIX + newKey) || "null");
    } catch {}
    setSourceKey(newKey);
    const newSrc = getDataSource(newKey)!;
    if (restored) {
      setSelectedColumns(restored.selectedColumns || newSrc.fields.filter((f) => f.defaultVisible).map((f) => f.key));
      setFilters(restored.filters || DEFAULT_FILTERS());
      setGroupBy(restored.groupBy || "none");
    } else {
      setSelectedColumns(newSrc.fields.filter((f) => f.defaultVisible).map((f) => f.key));
      setGroupBy("none");
    }
    setData([]);
    setTotalCount(0);
    setHasRun(false);
    setPage(1);
  };

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS());
    setGroupBy("none");
    setPage(1);
  };

  const hasActiveFilters = useMemo(() => {
    const def = DEFAULT_FILTERS();
    return (
      filters.contactId ||
      filters.status ||
      filters.paymentMethod ||
      filters.branchName ||
      filters.category ||
      filters.searchText ||
      filters.dateFrom !== def.dateFrom ||
      filters.dateTo !== def.dateTo ||
      groupBy !== "none"
    );
  }, [filters, groupBy]);

  // KPIs
  const kpis = useMemo(() => calculateKPIs(data, source, totalCount), [data, source, totalCount]);

  // Build dynamic columns for SortableReportTable
  const tableColumns: ColumnDef[] = useMemo(() => {
    if (isGrouped && data.length > 0 && "_group" in data[0]) {
      return [
        { key: "_group", label: "المجموعة", type: "text", width: "200px" },
        { key: "_count", label: "العدد", type: "number", align: "center" },
        { key: "total_amount", label: "الإجمالي", type: "currency" },
        ...(source.key !== "inventory" ? [{ key: "paid_amount", label: "المدفوع", type: "currency" as const }] : []),
      ];
    }
    return selectedColumns
      .map((key) => source.fields.find((f) => f.key === key))
      .filter(Boolean)
      .map((f) => ({
        key: f!.key,
        label: f!.label,
        type: f!.type as any,
        align: (f!.type === "number" || f!.type === "currency" ? "left" : "right") as any,
      }));
  }, [selectedColumns, source, data, isGrouped]);

  // Totals row
  const totalsRow = useMemo(() => {
    const t: any = {};
    tableColumns.forEach((c) => {
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
      const payload = {
        name: reportName.trim(),
        description: reportDesc.trim() || null,
        data_source: sourceKey,
        columns: selectedColumns as any,
        filters: filters as any,
        group_by: groupBy === "none" ? null : groupBy,
        chart_type: chartType,
        folder_id: folderId,
      };

      if (loadedReportId) {
        // UPDATE → trigger auto-snapshots previous state into custom_report_versions
        const { error } = await supabase
          .from("custom_reports")
          .update(payload)
          .eq("id", loadedReportId);
        if (error) throw error;
        toast({ title: "تم تحديث التقرير ✅", description: "تم حفظ نسخة من الإصدار السابق" });
      } else {
        const { data: created, error } = await supabase
          .from("custom_reports")
          .insert({ user_id: user.id, ...payload })
          .select("id")
          .single();
        if (error) throw error;
        if (created) setLoadedReportId(created.id);
        toast({ title: "تم حفظ التقرير ✅", description: `تجده الآن في "تقاريري"` });
      }
      setSaveOpen(false);
    } catch (e: any) {
      toast({ title: "خطأ في الحفظ", description: e.message, variant: "destructive" });
    }
  };

  const handleExport = () => {
    if (!data.length) return;
    const rows = data.map((row) => {
      const out: Record<string, any> = {};
      tableColumns.forEach((c) => {
        out[c.label] = row[c.key];
      });
      return out;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, source.label);
    setNextExportBranding({ title: reportName || `تقرير ${source.label}` });
    XLSX.writeFile(wb, `${reportName || source.label}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "تم التصدير ✅" });
  };

  // Available chart types based on current data shape
  const availableCharts = useMemo(() => getAvailableCharts(tableColumns, isGrouped), [tableColumns, isGrouped]);

  // Reset chart type if current is not available
  useEffect(() => {
    if (availableCharts.length > 0 && !availableCharts.includes(chartType)) {
      setChartType(availableCharts[0]);
    }
    if (availableCharts.length === 0 && viewMode !== "table") {
      setViewMode("table");
    }
  }, [availableCharts, chartType, viewMode]);

  const handleExportPdf = async (template: PdfTemplate = "executive") => {
    if (!data.length) return;
    setExportingPdf(true);
    try {
      // For compact template we don't need the chart even if visible
      const includeChart = template === "executive" || template === "detailed";
      const chartEl =
        includeChart && (viewMode === "chart" || viewMode === "both") ? chartRef.current : null;
      await new Promise((r) => setTimeout(r, 150));
      await exportReportToPdf({
        title: reportName || `تقرير ${source.label}`,
        subtitle: reportDesc || undefined,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        kpis: kpis.map((k) => ({ label: k.label, value: k.value })),
        columns: tableColumns,
        data,
        chartElement: chartEl,
        template,
        companyName: branding.companyName,
        companyLogo: branding.companyLogo,
        userName: branding.userName,
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
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted"
          >
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={!data.length || exportingPdf}
                className="gap-1.5 rounded-xl"
              >
                {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                PDF
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60" style={{ direction: "rtl" }}>
              <DropdownMenuLabel className="text-[11px] text-muted-foreground">اختر قالب التصدير</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleExportPdf("executive")} className="gap-2 text-xs cursor-pointer">
                <Briefcase className="h-3.5 w-3.5 text-primary" />
                <div className="flex-1">
                  <p className="font-medium">إداري</p>
                  <p className="text-[10px] text-muted-foreground">KPIs + رسم + جدول</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportPdf("financial")} className="gap-2 text-xs cursor-pointer">
                <Coins className="h-3.5 w-3.5 text-warning" />
                <div className="flex-1">
                  <p className="font-medium">مالي</p>
                  <p className="text-[10px] text-muted-foreground">KPIs + جدول + إجماليات</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportPdf("compact")} className="gap-2 text-xs cursor-pointer">
                <Minimize2 className="h-3.5 w-3.5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium">مختصر</p>
                  <p className="text-[10px] text-muted-foreground">جدول فقط — للطباعة السريعة</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportPdf("detailed")} className="gap-2 text-xs cursor-pointer">
                <FileStack className="h-3.5 w-3.5 text-primary" />
                <div className="flex-1">
                  <p className="font-medium">تفصيلي</p>
                  <p className="text-[10px] text-muted-foreground">كل شيء + قسم ملاحظات</p>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {loadedReportId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setVersionsOpen(true)}
              className="gap-1.5 rounded-xl"
              title="سجل النسخ"
            >
              <History className="h-4 w-4" /> النسخ
            </Button>
          )}
          <Button size="sm" onClick={() => setSaveOpen(true)} disabled={!hasRun} className="gap-1.5 rounded-xl">
            <BookmarkPlus className="h-4 w-4" />
            {loadedReportId ? "حفظ التغييرات" : "حفظ التقرير"}
          </Button>
        </div>
      </div>

      {/* Step 1: Data source */}
      <Card className="p-4">
        <p className="text-xs font-medium text-muted-foreground mb-3">1. اختر مصدر البيانات</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {DATA_SOURCES.map((s) => {
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
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: `${s.color}15`, color: s.color }}
                  >
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
          <ColumnPicker allFields={source.fields} selectedKeys={selectedColumns} onChange={setSelectedColumns} />
        </Card>

        <div className="lg:col-span-2 space-y-3">
          <Card className="p-0 overflow-hidden">
            <div className="px-4 pt-4 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">3. الفلاتر والتجميع</p>
              {hasActiveFilters && (
                <button
                  onClick={handleResetFilters}
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <RotateCcw className="h-3 w-3" /> إعادة ضبط
                </button>
              )}
            </div>
            <FilterPanel
              source={source}
              filters={filters}
              onChange={setFilters}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
              onRun={() => handleRun({ page: 1 })}
              loading={loading}
            />
          </Card>

          {/* KPIs */}
          {hasRun && kpis.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {kpis.map((k, i) => (
                <Card key={i} className="p-3">
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">{k.label}</p>
                  <p
                    className={`text-base font-bold tabular-nums ${
                      k.color === "primary"
                        ? "text-primary"
                        : k.color === "destructive"
                        ? "text-destructive"
                        : "text-foreground"
                    }`}
                  >
                    {k.value}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {loading && !hasRun ? (
        <Card className="overflow-hidden">
          <TableSkeleton rows={8} cols={Math.max(3, selectedColumns.length || 5)} />
        </Card>
      ) : !hasRun ? (
        <Card className="p-12 text-center">
          <Sparkles className="h-10 w-10 text-primary/30 mx-auto mb-3" />
          <p className="text-sm text-foreground font-medium mb-1">جاهز للبدء</p>
          <p className="text-xs text-muted-foreground">اختر مصدر وأعمدة وفلاتر، ثم اضغط "تشغيل التقرير"</p>
        </Card>
      ) : data.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-muted/40 flex items-center justify-center mx-auto mb-3">
            <Sparkles className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium mb-1">لا توجد بيانات للفلاتر المحددة</p>
          <p className="text-xs text-muted-foreground mb-4">
            جرب توسيع نطاق التاريخ، إزالة بعض الفلاتر، أو تغيير مصدر البيانات
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={handleResetFilters} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> إعادة ضبط الفلاتر
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFilters((f) => ({
                  ...f,
                  dateFrom: new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10),
                  dateTo: new Date().toISOString().slice(0, 10),
                }));
              }}
              className="gap-1.5"
            >
              <Zap className="h-3.5 w-3.5" /> توسيع لسنة كاملة
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* View mode + chart type toggle + meta */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/40 bg-muted/20 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
                <ViewModeBtn
                  active={viewMode === "table"}
                  onClick={() => setViewMode("table")}
                  icon={<TableIcon className="h-3.5 w-3.5" />}
                  label="جدول"
                />
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
                <div className="inline-flex rounded-lg border border-border bg-background p-0.5 flex-wrap">
                  {availableCharts.includes("bar") && (
                    <ChartTypeBtn
                      active={chartType === "bar"}
                      onClick={() => setChartType("bar")}
                      icon={<BarChart3 className="h-3.5 w-3.5" />}
                      label="أعمدة"
                    />
                  )}
                  {availableCharts.includes("stacked") && (
                    <ChartTypeBtn
                      active={chartType === "stacked"}
                      onClick={() => setChartType("stacked")}
                      icon={<Layers className="h-3.5 w-3.5" />}
                      label="مكدّس"
                    />
                  )}
                  {availableCharts.includes("line") && (
                    <ChartTypeBtn
                      active={chartType === "line"}
                      onClick={() => setChartType("line")}
                      icon={<LineIcon className="h-3.5 w-3.5" />}
                      label="خطي"
                    />
                  )}
                  {availableCharts.includes("area") && (
                    <ChartTypeBtn
                      active={chartType === "area"}
                      onClick={() => setChartType("area")}
                      icon={<Activity className="h-3.5 w-3.5" />}
                      label="مساحي"
                    />
                  )}
                  {availableCharts.includes("pie") && (
                    <ChartTypeBtn
                      active={chartType === "pie"}
                      onClick={() => setChartType("pie")}
                      icon={<PieIcon className="h-3.5 w-3.5" />}
                      label="دائري"
                    />
                  )}
                  {availableCharts.includes("donut") && (
                    <ChartTypeBtn
                      active={chartType === "donut"}
                      onClick={() => setChartType("donut")}
                      icon={<CircleDot className="h-3.5 w-3.5" />}
                      label="حلقي"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Meta: count + duration */}
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
              <span className="tabular-nums">
                <span className="font-semibold text-foreground">{totalCount.toLocaleString()}</span> نتيجة
                {durationMs > 0 && <span className="opacity-60"> · {durationMs}ms</span>}
              </span>
            </div>
          </div>

          {/* Loading overlay for re-runs */}
          {loading && hasRun ? (
            <TableSkeleton rows={pageSize > 10 ? 10 : pageSize} cols={Math.max(3, tableColumns.length)} />
          ) : (
            <>
              {/* Chart */}
              {(viewMode === "chart" || viewMode === "both") && availableCharts.length > 0 && (
                <div ref={chartRef} className="p-4 bg-background">
                  <ChartToolbar title={reportName || `تقرير ${source.label}`}>
                    <ReportChart data={data} columns={tableColumns} type={chartType} isGrouped={isGrouped} />
                  </ChartToolbar>
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
                    rowClassName={(row) => (row._drillRows ? "cursor-pointer hover:bg-primary/5" : "")}
                  />
                  {isGrouped && data.length > 0 && (
                    <div className="px-4 py-2 bg-muted/30 border-t border-border/40 text-[10px] text-muted-foreground text-center">
                      💡 اضغط على أي صف للوصول لتفاصيل البنود
                    </div>
                  )}
                  {isGrouped && <ClickableGroupRows data={data} onClick={onRowClick} />}
                </>
              )}

              {/* Pagination — only for non-grouped view */}
              {!isGrouped && (viewMode === "table" || viewMode === "both") && totalCount > 0 && (
                <ReportPagination
                  page={page}
                  pageSize={pageSize}
                  total={totalCount}
                  onPageChange={setPage}
                  onPageSizeChange={(s) => {
                    setPageSize(s);
                    setPage(1);
                  }}
                />
              )}
            </>
          )}
        </Card>
      )}

      {/* Drill-down drawer */}
      {drillRows && (
        <DrillDownDrawer
          open={!!drillRows}
          onClose={() => setDrillRows(null)}
          sourceKey={sourceKey}
          initialLevel={{
            type: "group-rows",
            title: `تفاصيل: ${drillLabel}`,
            parentRef: { label: drillLabel },
            rows: drillRows,
          } as DrillLevel}
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
              <Input
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="مثلاً: مبيعات يومية مارس"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">وصف (اختياري)</Label>
              <Input
                value={reportDesc}
                onChange={(e) => setReportDesc(e.target.value)}
                placeholder="وصف مختصر للتقرير"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Folder className="h-3 w-3" /> المجلد (اختياري)
              </Label>
              <select
                value={folderId || ""}
                onChange={(e) => setFolderId(e.target.value || null)}
                className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm"
              >
                <option value="">— بدون تصنيف —</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSave} className="gap-1.5">
              <Save className="h-4 w-4" /> حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version history */}
      <VersionHistoryDialog
        open={versionsOpen}
        reportId={loadedReportId}
        onClose={() => setVersionsOpen(false)}
        onRestored={() => {
          // reload current saved report's config
          if (loadedReportId) {
            (async () => {
              const { data: rec } = await supabase
                .from("custom_reports")
                .select("*")
                .eq("id", loadedReportId)
                .maybeSingle();
              if (rec) {
                setSourceKey(rec.data_source);
                setSelectedColumns((rec.columns as any) || []);
                setFilters((rec.filters as any) || DEFAULT_FILTERS());
                setGroupBy(rec.group_by || "none");
                setReportName(rec.name);
                setReportDesc(rec.description || "");
                if (rec.chart_type) setChartType(rec.chart_type as any);
              }
            })();
          }
        }}
      />
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
    return () => handlers.forEach((fn) => fn());
  }, [data, onClick]);
  return null;
}

function ViewModeBtn({
  active,
  onClick,
  icon,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all ${
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ChartTypeBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all ${
        active ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
