import { useState, useMemo } from "react";
import { usePageSessionState, usePageScrollRestoration } from "@/hooks/usePageSessionState";
import { usePOSReportsData, type DatePreset } from "@/hooks/usePOSReportsData";
import { useAccountantPOSAudit } from "@/hooks/useAccountantPOSAudit";
import { EyeOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Calendar as CalendarIcon,
  Download,
  Printer,
  TrendingUp,
  TrendingDown,
  BarChart2,
  Package,
  CreditCard,
  Users,
  Clock,
  Archive,
  RotateCcw,
  Timer,
  ArrowRight,
  UserCheck,
  ClipboardList, Tag,
  RefreshCw,
  Store,
  ChevronRight,
} from "lucide-react";
import { Truck } from "lucide-react";
import POSSalesReport from "@/components/pos-reports/POSSalesReport";
import POSProductsReport from "@/components/pos-reports/POSProductsReport";
import POSPaymentsReport from "@/components/pos-reports/POSPaymentsReport";
import POSCashierReport from "@/components/pos-reports/POSCashierReport";
import POSPeakHoursReport from "@/components/pos-reports/POSPeakHoursReport";
import POSInventoryReport from "@/components/pos-reports/POSInventoryReport";
import POSReturnsReport from "@/components/pos-reports/POSReturnsReport";
import POSProfitReport from "@/components/pos-reports/POSProfitReport";
import POSShiftsReport from "@/components/pos-reports/POSShiftsReport";
import POSCustomersReport from "@/components/pos-reports/POSCustomersReport";
import POSShiftAuditReport from "@/components/pos-reports/POSShiftAuditReport";
import POSDeliveryAppsReport from "@/components/pos-reports/POSDeliveryAppsReport";
import POSPriceChangesReport from "@/components/pos-reports/POSPriceChangesReport";
import POSOrderTrackingReport from "@/components/pos-reports/POSOrderTrackingReport";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import { toast as sonnerToast } from "sonner";

import { setNextExportBranding } from "@/lib/excel-export";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useRef } from "react";
import { Upload } from "lucide-react";
const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "اليوم" },
  { key: "yesterday", label: "أمس" },
  { key: "week", label: "هذا الأسبوع" },
  { key: "month", label: "هذا الشهر" },
  { key: "custom", label: "مخصص" },
];

const TABS = [
  { id: "sales", label: "المبيعات", icon: BarChart2 },
  { id: "products", label: "المنتجات", icon: Package },
  { id: "payments", label: "طرق الدفع", icon: CreditCard },
  { id: "cashier", label: "الكاشير", icon: Users },
  { id: "peak", label: "الأوقات", icon: Clock },
  { id: "inventory", label: "المخزون", icon: Archive },
  { id: "returns", label: "المرتجعات", icon: RotateCcw },
  { id: "profit", label: "الربحية", icon: TrendingUp },
  { id: "shifts", label: "الورديات", icon: Timer },
  { id: "customers", label: "الزبائن", icon: UserCheck },
  { id: "delivery-apps", label: "شركات التوصيل", icon: Truck },
  { id: "shift-audit", label: "دراسة وردية", icon: ClipboardList },
  { id: "price-changes", label: "تعديلات الأسعار", icon: Tag },
  { id: "order-tracking", label: "تتبع الطلبيات", icon: Timer },
];

const POSReportsPage = () => {
  // Persisted per page (sessionStorage) so leaving to another tab and coming
  // back restores the exact branch / report tab the user was working on.
  // Multi-branch selection. Empty array ⇢ all branches.
  const [branchIds, setBranchIds] = usePageSessionState<string[]>("branchIds", []);
  const [activeTab, setActiveTab] = usePageSessionState<string>("activeTab", "sales");
  usePageScrollRestoration();
  // Passing activeTab lets the hook skip 65k+ rows (orders/lines/payments)
  // on light tabs (shift-audit / shifts / customers). Heavy tabs load as before.
  const data = usePOSReportsData(branchIds, activeTab);
  const navigate = useNavigate();
  const audit = useAccountantPOSAudit();
  const amountsMasked = branchIds.length === 0
    ? audit.shouldMaskBranchAmounts(null)
    : branchIds.some(id => audit.shouldMaskBranchAmounts(id));
  const viewOnly = audit.isViewOnly;
  const { dataOwnerId } = useDataOwnerId();
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImportMargins = async (file: File) => {
    if (!dataOwnerId) { sonnerToast.error("تعذّر تحديد الحساب"); return; }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const rows: any[] = [];
      wb.SheetNames.forEach(sn => {
        const json = XLSX.utils.sheet_to_json<any>(wb.Sheets[sn], { defval: "" });
        json.forEach(r => rows.push(r));
      });
      const findKey = (r: any, patterns: RegExp[]) =>
        Object.keys(r).find(k => patterns.some(p => p.test(k.trim())));
      const pairs: { name: string; pct: number }[] = [];
      rows.forEach(r => {
        const nameKey = findKey(r, [/^الصنف$/i, /^المنتج$/i, /^name$/i, /^product$/i]);
        const pctKey = findKey(r, [/^ربح$/i, /نسبة/i, /profit/i, /margin/i, /%/]);
        if (!nameKey || !pctKey) return;
        const name = String(r[nameKey] ?? "").trim();
        let raw = String(r[pctKey] ?? "").trim();
        if (!name || !raw) return;
        raw = raw.replace("%", "").trim();
        const num = Number(raw);
        if (!isFinite(num) || num < 0) return;
        const pct = num <= 1 ? num * 100 : num;
        pairs.push({ name, pct: Math.round(pct * 100) / 100 });
      });
      if (pairs.length === 0) {
        sonnerToast.error("لم يتم العثور على أعمدة (الصنف / ربح) في الملف");
        return;
      }
      const { data: prods, error: prodErr } = await supabase
        .from("products").select("id, name").eq("user_id", dataOwnerId);
      if (prodErr) throw prodErr;
      const byName = new Map<string, string>();
      (prods || []).forEach((p: any) => byName.set(String(p.name).trim().toLowerCase(), p.id));
      let matched = 0, missed = 0;
      const misses: string[] = [];
      const updates: { id: string; pct: number }[] = [];
      for (const { name, pct } of pairs) {
        const id = byName.get(name.toLowerCase());
        if (id) { updates.push({ id, pct }); matched++; }
        else { misses.push(name); missed++; }
      }
      const chunk = 25;
      for (let i = 0; i < updates.length; i += chunk) {
        await Promise.all(updates.slice(i, i + chunk).map(u =>
          supabase.from("products").update({ profit_margin_percent: u.pct } as any).eq("id", u.id),
        ));
      }
      sonnerToast.success(`تم تحديث ${matched} صنف${missed > 0 ? ` — ${missed} بدون تطابق` : ""}`);
      if (missed > 0) console.warn("Unmatched product names:", misses);
      data.refetch();
    } catch (e: any) {
      console.error("Import margins error:", e);
      sonnerToast.error(e?.message || "فشل استيراد الملف");
    }
  };

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    if (data.dailySales.length > 0) {
      const ws = XLSX.utils.json_to_sheet(data.dailySales.map(d => ({
        "التاريخ": d.date, "الطلبات": d.orders, "المبيعات": d.sales, "المرتجعات": d.returns, "الصافي": d.net,
      })));
      XLSX.utils.book_append_sheet(wb, ws, "المبيعات اليومية");
    }
    if (data.topProducts.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(data.topProducts.map(p => {
        const pct = (p as any).marginPct;
        const netProfit = pct != null ? Number(p.revenue) * (Number(pct) / 100) : null;
        return {
          "المنتج": p.name,
          "الكمية": p.qty,
          "الإيراد": p.revenue,
          "التكلفة": p.cost,
          "الربح": p.revenue - p.cost,
          "نسبة الربح الصافي %": pct != null ? Number(pct) : "",
          "الربح الصافي للصنف": netProfit != null ? Math.round(netProfit * 100) / 100 : "",
        };
      }));
      XLSX.utils.book_append_sheet(wb, ws2, "المنتجات");
    }
    if (data.paymentBreakdown.length > 0) {
      const ws3 = XLSX.utils.json_to_sheet(data.paymentBreakdown.map(p => ({
        "طريقة الدفع": p.method, "المبلغ": p.amount,
        "%": data.totalSales > 0 ? ((p.amount / data.totalSales) * 100).toFixed(1) : 0,
      })));
      XLSX.utils.book_append_sheet(wb, ws3, "طرق الدفع");
    }
    if (data.cashierPerformance.length > 0) {
      const ws4 = XLSX.utils.json_to_sheet(data.cashierPerformance.map(c => ({
        "الكاشير": c.name, "الورديات": c.shifts, "الطلبات": c.orders,
        "المبيعات": c.sales, "المتوسط": Math.round(c.avgOrder), "العجز": c.variance,
      })));
      XLSX.utils.book_append_sheet(wb, ws4, "أداء الكاشير");
    }
    if (data.sessions.length > 0) {
      const ws5 = XLSX.utils.json_to_sheet(data.sessions.map(s => ({
        "الكاشير": s.cashier_name || "",
        "تاريخ الفتح": format(new Date(s.opened_at), "dd/MM/yyyy"),
        "وقت الفتح": format(new Date(s.opened_at), "HH:mm"),
        "وقت الإغلاق": s.closed_at ? format(new Date(s.closed_at), "HH:mm") : "مفتوحة",
        "رصيد الفتح": s.opening_cash, "رصيد الإغلاق": s.closing_cash ?? "",
        "المتوقع": s.expected_cash ?? "", "الفرق": s.cash_variance ?? "",
        "المبيعات": s.total_sales, "الطلبات": s.total_orders,
        "الحالة": s.state === "open" ? "مفتوحة" : "مغلقة",
      })));
      XLSX.utils.book_append_sheet(wb, ws5, "الورديات");
    }
    setNextExportBranding({ title: "المبيعات اليومية" });
    XLSX.writeFile(wb, `تقارير-POS-${format(data.dateFrom, "yyyy-MM-dd")}.xlsx`);
  };

  const handlePrint = () => {
    sonnerToast.info("الطباعة تتم عبر خدمة الطباعة المحلية — استخدم تصدير PDF بدلاً من ذلك");
  };

  const totalDiscounts = data.totalDiscounts;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* ── Breadcrumb + Title (Dynamics-style) ── */}
      <div className="bg-card border-b border-border px-5 pt-2.5 pb-1.5 print:hidden">
        <div className="max-w-full mx-auto">
          <nav className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <button onClick={() => navigate("/")} className="hover:text-foreground">التطبيقات</button>
            <ChevronRight className="w-3 h-3 -scale-x-100" />
            <span>نقطة البيع</span>
            <ChevronRight className="w-3 h-3 -scale-x-100" />
            <span className="text-foreground">التقارير</span>
          </nav>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={() => navigate(-1)} className="p-0.5 -mr-0.5 text-muted-foreground hover:text-foreground">
              <ArrowRight className="w-4 h-4" />
            </button>
            <h1 className="text-[14px] font-semibold text-foreground">تقارير نقطة البيع</h1>
            <span className="text-[11px] text-muted-foreground">
              · {format(data.dateFrom, "dd MMM", { locale: ar })} — {format(data.dateTo, "dd MMM yyyy", { locale: ar })}
            </span>
          </div>
        </div>
      </div>

      {/* ── Command Bar ── */}
      <div className="bg-card border-b border-border px-5 print:hidden">
        <div className="max-w-full mx-auto flex items-center h-9 gap-1 text-[11px]">
          <CmdButton onClick={data.refetch} icon={RefreshCw} label="تحديث" />
          {!viewOnly && (
            <>
              <Divider />
              <CmdButton onClick={handleExportExcel} icon={Download} label="تصدير Excel" />
              <CmdButton onClick={handlePrint} icon={Printer} label="طباعة" />
              <Divider />
              <CmdButton
                onClick={() => importInputRef.current?.click()}
                icon={Upload}
                label="استيراد نسب الأرباح"
              />
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImportMargins(f);
                  e.target.value = "";
                }}
              />
            </>
          )}
          {viewOnly && (
            <span className="ml-2 text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <EyeOff className="w-3 h-3" />
              وضع التدقيق · عرض فقط
            </span>
          )}
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="bg-muted/30 border-b border-border px-5 print:hidden">
        <div className="max-w-full mx-auto flex items-center flex-wrap gap-2 py-2 text-[11px]">
          <span className="text-muted-foreground">الفترة:</span>
          <div className="flex items-center gap-1">
            {PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => data.setPreset(p.key)}
                className={cn(
                  "px-2.5 py-1 rounded border transition-colors",
                  data.preset === p.key
                    ? "bg-foreground text-background border-foreground"
                    : "text-muted-foreground border-border hover:text-foreground",
                )}
              >
                {p.key === "custom" && <CalendarIcon className="w-3 h-3 inline-block ml-1" />}
                {p.label}
              </button>
            ))}
            {data.preset === "custom" && (
              <div className="flex gap-1 items-center mr-1">
                <DatePicker date={data.customFrom} onSelect={data.setCustomFrom} label="من" />
                <DatePicker date={data.customTo} onSelect={data.setCustomTo} label="إلى" />
              </div>
            )}
          </div>

          <span className="w-px h-4 bg-border mx-1" />

          <span className="text-muted-foreground flex items-center gap-1">
            <Store className="w-3 h-3" /> الفرع:
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="bg-background border border-border rounded px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-w-[160px] text-right truncate"
              >
                {branchIds.length === 0
                  ? "كل الفروع"
                  : branchIds.length === 1
                    ? (data.branches.find(b => b.id === branchIds[0])?.name || "فرع")
                    : `${branchIds.length} فروع محددة`}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-2 space-y-1">
              <button
                type="button"
                onClick={() => setBranchIds([])}
                className={cn(
                  "w-full text-right text-[12px] px-2 py-1.5 rounded hover:bg-muted",
                  branchIds.length === 0 && "bg-muted font-medium",
                )}
              >
                كل الفروع
              </button>
              <div className="h-px bg-border my-1" />
              {data.branches.map(b => {
                const checked = branchIds.includes(b.id);
                return (
                  <label
                    key={b.id}
                    className="flex items-center gap-2 text-[12px] px-2 py-1.5 rounded hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() =>
                        setBranchIds(
                          checked
                            ? branchIds.filter(id => id !== b.id)
                            : [...branchIds, b.id],
                        )
                      }
                    />
                    <span className="truncate">{b.name}</span>
                  </label>
                );
              })}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="max-w-full mx-auto px-5 py-4 space-y-4 print:px-2 print:py-2">
        {/* ── KPI Cards ── */}
        {data.loading ? (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-[68px] rounded" />)}
          </div>
        ) : data.isLightTab ? null : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            <KPITile title="مبيعات المطعم" value={data.totalSales} prefix="₪" hint="بدون التوصيل" masked={amountsMasked} />
            <KPITile title="عدد الطلبات" value={data.totalOrders} masked={amountsMasked} />
            <KPITile title="متوسط الفاتورة" value={Math.round(data.avgOrderValue)} prefix="₪" masked={amountsMasked} />
            <KPITile title="هامش الربح" value={data.grossMargin} suffix="%" decimals={1} masked={amountsMasked} />
            <KPITile title="رسوم التوصيل" value={data.deliveryCollected} prefix="₪" hint="لشركة التوصيل" masked={amountsMasked} />
            <KPITile title="إجمالي التحصيل" value={data.customerCollected} prefix="₪" hint="مبيعات + توصيل" masked={amountsMasked} />
          </div>
        )}

        {/* ── Navigation Tabs (Dynamics-style) ── */}
        <div className="border-b border-border sticky top-0 z-10 bg-background print:hidden">
          <nav className="flex -mb-px overflow-x-auto gap-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-[12px] whitespace-nowrap border-b-2 transition-colors",
                  activeTab === tab.id
                    ? "border-primary text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Tab Content ── */}
        {data.loading ? (
          <div className="space-y-4">
            <Skeleton className="h-[300px] rounded-lg" />
            <Skeleton className="h-[200px] rounded-lg" />
          </div>
        ) : amountsMasked ? (
          <MaskedAmountsNotice
            branchName={
              branchIds.length === 1
                ? data.branches.find(b => b.id === branchIds[0])?.name || null
                : null
            }
            allowedBranchNames={audit.allowedBranchIds
              .map(id => data.branches.find(b => b.id === id)?.name)
              .filter(Boolean) as string[]}
            cashierNames={Array.from(new Set(data.cashierPerformance.map(c => c.name).filter(Boolean)))}
          />
        ) : (
          <div className="mt-0">
            {activeTab === "sales" && <POSSalesReport dailySales={data.dailySales} orders={[...data.paidOrders, ...data.returnOrders]} sessions={data.sessions} branches={data.branches} onRefetch={data.refetch} />}
            {activeTab === "products" && <POSProductsReport topProducts={data.topProducts} totalRevenue={data.totalSales} />}
            {activeTab === "payments" && <POSPaymentsReport paymentBreakdown={data.paymentBreakdown} totalSales={data.totalSales} paidOrders={data.paidOrders} />}
            {activeTab === "cashier" && <POSCashierReport cashierPerformance={data.cashierPerformance} />}
            {activeTab === "peak" && <POSPeakHoursReport peakHoursData={data.peakHoursData} />}
            {activeTab === "inventory" && <POSInventoryReport inventoryReport={data.inventoryReport} />}
            {activeTab === "returns" && (
              <POSReturnsReport
                returnOrders={data.returnOrders} orderLines={data.orderLines}
                sessions={data.sessions} paidOrders={data.paidOrders} totalSales={data.totalSales}
              />
            )}
            {activeTab === "profit" && (
              <POSProfitReport
                totalSales={data.totalSales} totalCOGS={data.totalCOGS}
                grossProfit={data.grossProfit} grossMargin={data.grossMargin}
                totalReturns={data.totalReturns} totalDiscounts={totalDiscounts}
              />
            )}
            {activeTab === "shifts" && <POSShiftsReport sessions={data.sessions} onRefresh={data.refetch} />}
            {activeTab === "customers" && data.dataOwnerId && <POSCustomersReport dataOwnerId={data.dataOwnerId} />}
            {activeTab === "shift-audit" && <POSShiftAuditReport sessions={data.sessions} />}
            {activeTab === "delivery-apps" && (
              <POSDeliveryAppsReport
                dateFrom={data.dateFrom}
                dateTo={data.dateTo}
                branchIds={branchIds}
              />
            )}
            {activeTab === "order-tracking" && (
              <POSOrderTrackingReport
                dateFrom={data.dateFrom}
                dateTo={data.dateTo}
                branchIds={branchIds}
              />
            )}
            {activeTab === "price-changes" && (
              <POSPriceChangesReport
                dateFrom={data.dateFrom}
                dateTo={data.dateTo}
                branchIds={branchIds}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── KPI Tile (Dynamics-style, dense) ──
const KPITile = ({ title, value, prefix, suffix, decimals = 0, hint, masked = false }: {
  title: string; value: number; prefix?: string; suffix?: string; decimals?: number; hint?: string; masked?: boolean;
}) => (
  <div className="bg-card border border-border rounded px-3 py-2">
    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate">{title}</p>
    <p className="text-[18px] font-semibold text-foreground mt-0.5 font-mono tabular-nums leading-tight">
      {masked ? (
        <span className="text-muted-foreground">— — —</span>
      ) : (
        <>
          {prefix && <span className="text-[12px] ml-0.5 text-muted-foreground">{prefix}</span>}
          {decimals > 0 ? value.toFixed(decimals) : value.toLocaleString()}
          {suffix && <span className="text-[12px] mr-0.5 text-muted-foreground">{suffix}</span>}
        </>
      )}
    </p>
    {hint && <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug truncate">{hint}</p>}
  </div>
);

/* ── Notice shown when an accountant views a restricted branch ──
   Names visible, monetary figures hidden. Allows the accountant to verify
   coverage (branch list + cashier roster) without leaking any sales data. */
const MaskedAmountsNotice = ({
  branchName,
  allowedBranchNames,
  cashierNames,
}: {
  branchName: string | null;
  allowedBranchNames: string[];
  cashierNames: string[];
}) => (
  <div className="bg-card border border-border rounded-lg p-6 space-y-4">
    <div className="flex items-start gap-3">
      <EyeOff className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">الأرقام مخفية لهذا الفرع</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {branchName
            ? <>فرع <span className="font-medium text-foreground">«{branchName}»</span> غير ضمن الفروع المسموح لك بمراجعة أرقامها. تظهر الأسماء فقط — راجع الإدارة لطلب توسيع الصلاحية.</>
            : <>اخترت «كل الفروع». لحماية بيانات الفروع غير المخصصة لك، يجب اختيار فرع محدد من قائمتك لعرض الأرقام.</>
          }
        </p>
      </div>
    </div>
    {allowedBranchNames.length > 0 && (
      <div className="border-t border-border pt-3">
        <p className="text-[11px] font-medium text-muted-foreground mb-1.5">الفروع المسموحة لك:</p>
        <div className="flex flex-wrap gap-1.5">
          {allowedBranchNames.map(n => (
            <span key={n} className="text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{n}</span>
          ))}
        </div>
      </div>
    )}
    {cashierNames.length > 0 && (
      <div className="border-t border-border pt-3">
        <p className="text-[11px] font-medium text-muted-foreground mb-1.5">الكاشيرون النشطون في الفترة:</p>
        <div className="flex flex-wrap gap-1.5">
          {cashierNames.map(n => (
            <span key={n} className="text-[11px] px-2 py-0.5 rounded bg-muted text-foreground border border-border">{n}</span>
          ))}
        </div>
      </div>
    )}
  </div>
);

const CmdButton = ({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-1.5 px-2 h-7 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
  >
    <Icon className="w-3.5 h-3.5" />
    <span>{label}</span>
  </button>
);

const Divider = () => <span className="w-px h-4 bg-border mx-0.5" />;

// ── Date Picker ──
const DatePicker = ({ date, onSelect, label }: { date: Date; onSelect: (d: Date) => void; label: string }) => {
  const value = format(date, "yyyy-MM-dd");
  return (
    <div className="flex items-center gap-1.5">
      <CalendarIcon className="h-3 w-3 text-muted-foreground" />
      <span className="text-[11px] text-muted-foreground">{label}:</span>
      <Input
        type="date"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          const [y, m, d] = v.split("-").map(Number);
          if (!y || !m || !d) return;
          onSelect(new Date(y, m - 1, d));
        }}
        className="h-7 w-[140px] text-[11px] px-2"
      />
    </div>
  );
};

export default POSReportsPage;
