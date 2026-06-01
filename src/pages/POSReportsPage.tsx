import { useState, useMemo } from "react";
import { usePOSReportsData, type DatePreset } from "@/hooks/usePOSReportsData";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "lucide-react";
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
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import { toast as sonnerToast } from "sonner";

import { setNextExportBranding } from "@/lib/excel-export";
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
];

const POSReportsPage = () => {
  const data = usePOSReportsData();
  const [activeTab, setActiveTab] = useState("sales");
  const navigate = useNavigate();

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    if (data.dailySales.length > 0) {
      const ws = XLSX.utils.json_to_sheet(data.dailySales.map(d => ({
        "التاريخ": d.date, "الطلبات": d.orders, "المبيعات": d.sales, "المرتجعات": d.returns, "الصافي": d.net,
      })));
      XLSX.utils.book_append_sheet(wb, ws, "المبيعات اليومية");
    }
    if (data.topProducts.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(data.topProducts.map(p => ({
        "المنتج": p.name, "الكمية": p.qty, "الإيراد": p.revenue, "التكلفة": p.cost, "الربح": p.revenue - p.cost,
      })));
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

  const totalDiscounts = useMemo(() =>
    data.paidOrders.reduce((s, o) => s + o.discount_amount, 0), [data.paidOrders]);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* ── Header ── */}
      <div className="bg-card border-b border-border px-6 py-4 print:py-2">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate(-1)} className="p-1.5 rounded-md hover:bg-secondary transition-colors print:hidden">
                <ArrowRight className="w-5 h-5 text-muted-foreground" />
              </button>
              <div>
                <h1 className="text-xl font-semibold text-foreground tracking-tight">
                  تقارير نقطة البيع
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {format(data.dateFrom, "dd MMMM yyyy", { locale: ar })} — {format(data.dateTo, "dd MMMM yyyy", { locale: ar })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 print:hidden">
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground border border-border rounded-md hover:bg-secondary transition-colors"
              >
                <Download className="w-4 h-4" />
                تصدير Excel
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground border border-border rounded-md hover:bg-secondary transition-colors"
              >
                <Printer className="w-4 h-4" />
                طباعة
              </button>
            </div>
          </div>

          {/* Date presets */}
          <div className="flex flex-wrap gap-1.5 mt-3 print:hidden">
            {PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => data.setPreset(p.key)}
                className={cn(
                  "px-3 py-1.5 text-xs rounded-md border transition-colors font-medium",
                  data.preset === p.key
                    ? "bg-accent text-accent-foreground border-accent"
                    : "text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground"
                )}
              >
                {p.key === "custom" && <CalendarIcon className="w-3 h-3 inline-block ml-1" />}
                {p.label}
              </button>
            ))}
            {data.preset === "custom" && (
              <div className="flex gap-2 items-center mr-2">
                <DatePicker date={data.customFrom} onSelect={data.setCustomFrom} label="من" />
                <DatePicker date={data.customTo} onSelect={data.setCustomTo} label="إلى" />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-5 space-y-5 print:px-2 print:py-2">
        {/* ── KPI Cards ── */}
        {data.loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard title="مبيعات المطعم (بدون التوصيل)" value={data.totalSales} prefix="₪" />
              <KPICard title="عدد الطلبات" value={data.totalOrders} />
              <KPICard title="متوسط قيمة الفاتورة" value={Math.round(data.avgOrderValue)} prefix="₪" />
              <KPICard title="هامش الربح الإجمالي" value={data.grossMargin} suffix="%" decimals={1} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <KPICard
                title="رسوم التوصيل المحصلة"
                value={data.deliveryCollected}
                prefix="₪"
                hint="تُحصّل لصالح شركة التوصيل — غير محسوبة ضمن مبيعات المطعم"
              />
              <KPICard
                title="إجمالي التحصيل من الزبائن"
                value={data.customerCollected}
                prefix="₪"
                hint="مبيعات المطعم + رسوم التوصيل"
              />
            </div>
          </>
        )}

        {/* ── Navigation Tabs ── */}
        <div className="border-b border-border bg-card rounded-t-lg print:hidden">
          <nav className="flex -mb-px overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors",
                  activeTab === tab.id
                    ? "border-accent text-accent font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <tab.icon className="w-4 h-4" />
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
        ) : (
          <div className="mt-0">
            {activeTab === "sales" && <POSSalesReport dailySales={data.dailySales} orders={[...data.paidOrders, ...data.returnOrders]} onRefetch={data.refetch} />}
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
          </div>
        )}
      </div>
    </div>
  );
};

// ── KPI Card ──
const KPICard = ({ title, value, prefix, suffix, decimals = 0, hint }: {
  title: string; value: number; prefix?: string; suffix?: string; decimals?: number; hint?: string;
}) => (
  <div className="bg-card border border-border rounded-lg p-4">
    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
    <p className="text-2xl font-bold text-foreground mt-2 font-mono tabular-nums">
      {prefix && <span className="text-base ml-0.5">{prefix}</span>}
      {decimals > 0 ? value.toFixed(decimals) : value.toLocaleString()}
      {suffix && <span className="text-base mr-0.5">{suffix}</span>}
    </p>
    {hint && <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">{hint}</p>}
  </div>
);

// ── Date Picker ──
const DatePicker = ({ date, onSelect, label }: { date: Date; onSelect: (d: Date) => void; label: string }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground border border-border rounded-md hover:bg-secondary">
        <CalendarIcon className="h-3 w-3" />
        {label}: {format(date, "dd/MM/yyyy")}
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="start">
      <Calendar
        mode="single" selected={date}
        onSelect={(d) => d && onSelect(d)} initialFocus
        className={cn("p-3 pointer-events-auto")}
      />
    </PopoverContent>
  </Popover>
);

export default POSReportsPage;
