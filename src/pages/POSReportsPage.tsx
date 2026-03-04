import { useState, useMemo } from "react";
import { usePOSReportsData, type DatePreset } from "@/hooks/usePOSReportsData";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  ShoppingCart,
  DollarSign,
  Receipt,
  BarChart3,
} from "lucide-react";
import BackButton from "@/components/BackButton";
import POSSalesReport from "@/components/pos-reports/POSSalesReport";
import POSProductsReport from "@/components/pos-reports/POSProductsReport";
import POSPaymentsReport from "@/components/pos-reports/POSPaymentsReport";
import POSCashierReport from "@/components/pos-reports/POSCashierReport";
import POSPeakHoursReport from "@/components/pos-reports/POSPeakHoursReport";
import POSInventoryReport from "@/components/pos-reports/POSInventoryReport";
import POSReturnsReport from "@/components/pos-reports/POSReturnsReport";
import POSProfitReport from "@/components/pos-reports/POSProfitReport";
import POSShiftsReport from "@/components/pos-reports/POSShiftsReport";
import * as XLSX from "xlsx";

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "اليوم" },
  { key: "yesterday", label: "أمس" },
  { key: "week", label: "هذا الأسبوع" },
  { key: "month", label: "هذا الشهر" },
  { key: "custom", label: "مخصص 📅" },
];

const POSReportsPage = () => {
  const data = usePOSReportsData();
  const [activeTab, setActiveTab] = useState("sales");

  // Export to Excel
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Daily sales sheet
    if (data.dailySales.length > 0) {
      const ws = XLSX.utils.json_to_sheet(data.dailySales.map(d => ({
        "التاريخ": d.date,
        "الطلبات": d.orders,
        "المبيعات": d.sales,
        "المرتجعات": d.returns,
        "الصافي": d.net,
      })));
      XLSX.utils.book_append_sheet(wb, ws, "المبيعات اليومية");
    }

    // Products sheet
    if (data.topProducts.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(data.topProducts.map(p => ({
        "المنتج": p.name,
        "الكمية": p.qty,
        "الإيراد": p.revenue,
        "التكلفة": p.cost,
        "الربح": p.revenue - p.cost,
      })));
      XLSX.utils.book_append_sheet(wb, ws2, "المنتجات");
    }

    // Payment methods sheet
    if (data.paymentBreakdown.length > 0) {
      const ws3 = XLSX.utils.json_to_sheet(data.paymentBreakdown.map(p => ({
        "طريقة الدفع": p.method,
        "المبلغ": p.amount,
        "%": data.totalSales > 0 ? ((p.amount / data.totalSales) * 100).toFixed(1) : 0,
      })));
      XLSX.utils.book_append_sheet(wb, ws3, "طرق الدفع");
    }

    // Cashier sheet
    if (data.cashierPerformance.length > 0) {
      const ws4 = XLSX.utils.json_to_sheet(data.cashierPerformance.map(c => ({
        "الكاشير": c.name,
        "الورديات": c.shifts,
        "الطلبات": c.orders,
        "المبيعات": c.sales,
        "المتوسط": Math.round(c.avgOrder),
        "العجز": c.variance,
      })));
      XLSX.utils.book_append_sheet(wb, ws4, "أداء الكاشير");
    }

    // Shifts sheet
    if (data.sessions.length > 0) {
      const ws5 = XLSX.utils.json_to_sheet(data.sessions.map(s => ({
        "الكاشير": s.cashier_name || "",
        "تاريخ الفتح": format(new Date(s.opened_at), "yyyy-MM-dd"),
        "وقت الفتح": format(new Date(s.opened_at), "HH:mm"),
        "وقت الإغلاق": s.closed_at ? format(new Date(s.closed_at), "HH:mm") : "مفتوحة",
        "رصيد الفتح": s.opening_cash,
        "رصيد الإغلاق": s.closing_cash ?? "",
        "المتوقع": s.expected_cash ?? "",
        "الفرق": s.cash_variance ?? "",
        "المبيعات": s.total_sales,
        "الطلبات": s.total_orders,
        "الحالة": s.state === "open" ? "مفتوحة" : "مغلقة",
      })));
      XLSX.utils.book_append_sheet(wb, ws5, "الورديات");
    }

    XLSX.writeFile(wb, `تقارير-POS-${format(data.dateFrom, "yyyy-MM-dd")}.xlsx`);
  };

  const handlePrint = () => window.print();

  // Calculate discounts total
  const totalDiscounts = useMemo(() =>
    data.paidOrders.reduce((s, o) => s + o.discount_amount, 0), [data.paidOrders]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto print:p-2" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              تقارير نقطة البيع
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {format(data.dateFrom, "dd MMMM yyyy", { locale: ar })} — {format(data.dateTo, "dd MMMM yyyy", { locale: ar })}
            </p>
          </div>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <Download className="h-4 w-4 ml-1" /> تصدير Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 ml-1" /> طباعة
          </Button>
        </div>
      </div>

      {/* Date presets */}
      <div className="flex flex-wrap gap-2 print:hidden">
        {PRESETS.map(p => (
          <Button
            key={p.key}
            variant={data.preset === p.key ? "default" : "outline"}
            size="sm"
            onClick={() => data.setPreset(p.key)}
          >
            {p.label}
          </Button>
        ))}
        {data.preset === "custom" && (
          <div className="flex gap-2 items-center">
            <DatePicker date={data.customFrom} onSelect={data.setCustomFrom} label="من" />
            <DatePicker date={data.customTo} onSelect={data.setCustomTo} label="إلى" />
          </div>
        )}
      </div>

      {/* KPI Cards */}
      {data.loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard title="المبيعات" value={`₪${data.totalSales.toLocaleString()}`} icon={<DollarSign className="h-5 w-5" />} color="primary" />
          <KPICard title="الطلبات" value={data.totalOrders.toString()} icon={<ShoppingCart className="h-5 w-5" />} color="info" />
          <KPICard title="متوسط الفاتورة" value={`₪${Math.round(data.avgOrderValue).toLocaleString()}`} icon={<Receipt className="h-5 w-5" />} color="warning" />
          <KPICard title="إجمالي الربح" value={`₪${data.grossProfit.toLocaleString()}`} icon={<TrendingUp className="h-5 w-5" />} color="success" subtitle={`هامش ${data.grossMargin.toFixed(1)}%`} />
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1 print:hidden">
          <TabsTrigger value="sales" className="text-xs sm:text-sm">📈 المبيعات</TabsTrigger>
          <TabsTrigger value="products" className="text-xs sm:text-sm">🥇 المنتجات</TabsTrigger>
          <TabsTrigger value="payments" className="text-xs sm:text-sm">💳 الدفع</TabsTrigger>
          <TabsTrigger value="cashier" className="text-xs sm:text-sm">👤 الكاشير</TabsTrigger>
          <TabsTrigger value="peak" className="text-xs sm:text-sm">⏰ الأوقات</TabsTrigger>
          <TabsTrigger value="inventory" className="text-xs sm:text-sm">📦 المخزون</TabsTrigger>
          <TabsTrigger value="returns" className="text-xs sm:text-sm">🔄 المرتجعات</TabsTrigger>
          <TabsTrigger value="profit" className="text-xs sm:text-sm">📊 الربحية</TabsTrigger>
          <TabsTrigger value="shifts" className="text-xs sm:text-sm">🕐 الورديات</TabsTrigger>
        </TabsList>

        {data.loading ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-[300px] rounded-xl" />
            <Skeleton className="h-[200px] rounded-xl" />
          </div>
        ) : (
          <>
            <TabsContent value="sales">
              <POSSalesReport dailySales={data.dailySales} />
            </TabsContent>
            <TabsContent value="products">
              <POSProductsReport topProducts={data.topProducts} totalRevenue={data.totalSales} />
            </TabsContent>
            <TabsContent value="payments">
              <POSPaymentsReport paymentBreakdown={data.paymentBreakdown} totalSales={data.totalSales} paidOrders={data.paidOrders} />
            </TabsContent>
            <TabsContent value="cashier">
              <POSCashierReport cashierPerformance={data.cashierPerformance} />
            </TabsContent>
            <TabsContent value="peak">
              <POSPeakHoursReport peakHoursData={data.peakHoursData} />
            </TabsContent>
            <TabsContent value="inventory">
              <POSInventoryReport inventoryReport={data.inventoryReport} />
            </TabsContent>
            <TabsContent value="returns">
              <POSReturnsReport
                returnOrders={data.returnOrders}
                orderLines={data.orderLines}
                sessions={data.sessions}
                paidOrders={data.paidOrders}
                totalSales={data.totalSales}
              />
            </TabsContent>
            <TabsContent value="profit">
              <POSProfitReport
                totalSales={data.totalSales}
                totalCOGS={data.totalCOGS}
                grossProfit={data.grossProfit}
                grossMargin={data.grossMargin}
                totalReturns={data.totalReturns}
                totalDiscounts={totalDiscounts}
              />
            </TabsContent>
            <TabsContent value="shifts">
              <POSShiftsReport sessions={data.sessions} onRefresh={data.refetch} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
};

// KPI Card component
const KPICard = ({ title, value, icon, color, subtitle }: {
  title: string; value: string; icon: React.ReactNode; color: string; subtitle?: string;
}) => (
  <Card className="overflow-hidden">
    <CardContent className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-xl md:text-2xl font-bold mt-1">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className={`p-2 rounded-lg bg-${color}/10`} style={{ color: `hsl(var(--${color}))` }}>
          {icon}
        </div>
      </div>
    </CardContent>
  </Card>
);

// Date picker helper
const DatePicker = ({ date, onSelect, label }: { date: Date; onSelect: (d: Date) => void; label: string }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline" size="sm" className="text-xs">
        <CalendarIcon className="h-3 w-3 ml-1" />
        {label}: {format(date, "dd/MM/yyyy")}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="start">
      <Calendar
        mode="single"
        selected={date}
        onSelect={(d) => d && onSelect(d)}
        initialFocus
        className={cn("p-3 pointer-events-auto")}
      />
    </PopoverContent>
  </Popover>
);

export default POSReportsPage;
