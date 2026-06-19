import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { format, startOfDay, startOfWeek, startOfMonth, subMonths } from "date-fns";
import {
  Hammer, TrendingUp, DollarSign, BarChart3,
  FileSpreadsheet, Download, Filter, Calendar,
  Package, Users, CheckCircle2, Clock, Printer, Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import BackButton from "@/components/BackButton";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { generateProfessionalPDFHtml, openPrintWindow, useCompanyInfo } from "@/components/ReportPrintLayout";

import { setNextExportBranding } from "@/lib/excel-export";
const COST_TYPES: Record<string, { label: string; icon: string; color: string }> = {
  wood:      { label: "خشب", icon: "🪵", color: "#d97706" },
  paint:     { label: "دهان", icon: "🎨", color: "#3b82f6" },
  crystal:   { label: "كرستا", icon: "✨", color: "#8b5cf6" },
  labor:     { label: "عمال", icon: "👷", color: "#f97316" },
  hardware:  { label: "عدد ومسامير", icon: "🔩", color: "#6b7280" },
  glass:     { label: "زجاج", icon: "🪟", color: "#06b6d4" },
  marble:    { label: "رخام/حجر", icon: "🧱", color: "#78716c" },
  transport: { label: "نقل وتوصيل", icon: "🚚", color: "#22c55e" },
  other:     { label: "أخرى", icon: "📎", color: "#a1a1aa" },
};

const PIE_COLORS = Object.values(COST_TYPES).map(c => c.color);

export default function WorkshopReportsPage() {
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const companyInfo = useCompanyInfo();
  const [workshops, setWorkshops] = useState<any[]>([]);
  const [costs, setCosts] = useState<any[]>([]);
  const [workshopPayments, setWorkshopPayments] = useState<any[]>([]);
  const [financeReceipts, setFinanceReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  type DatePreset = "today" | "week" | "month" | "quarter" | "half" | "year" | "custom";
  const [datePreset, setDatePreset] = useState<DatePreset>("custom");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Set default dateFrom to user creation date
  useEffect(() => {
    if (!user || !dataOwnerId) return;
    const createdAt = (user as any).created_at;
    if (createdAt) {
      setDateFrom(format(new Date(createdAt), "yyyy-MM-dd"));
    } else {
      setDateFrom("2024-01-01");
    }
    loadData();
  }, [user, dataOwnerId]);

  // Handle date presets
  const applyPreset = (preset: DatePreset) => {
    setDatePreset(preset);
    const today = new Date();
    switch (preset) {
      case "today":
        setDateFrom(format(startOfDay(today), "yyyy-MM-dd"));
        setDateTo(format(today, "yyyy-MM-dd"));
        break;
      case "week":
        setDateFrom(format(startOfWeek(today, { weekStartsOn: 0 }), "yyyy-MM-dd"));
        setDateTo(format(today, "yyyy-MM-dd"));
        break;
      case "month":
        setDateFrom(format(startOfMonth(today), "yyyy-MM-dd"));
        setDateTo(format(today, "yyyy-MM-dd"));
        break;
      case "quarter":
        setDateFrom(format(subMonths(today, 3), "yyyy-MM-dd"));
        setDateTo(format(today, "yyyy-MM-dd"));
        break;
      case "half":
        setDateFrom(format(subMonths(today, 6), "yyyy-MM-dd"));
        setDateTo(format(today, "yyyy-MM-dd"));
        break;
      case "year":
        setDateFrom(format(subMonths(today, 12), "yyyy-MM-dd"));
        setDateTo(format(today, "yyyy-MM-dd"));
        break;
      case "custom":
        break;
    }
  };

  const loadData = async () => {
    setLoading(true);
    const uid = user!.id;
    const [wRes, cRes, pRes] = await Promise.all([
      supabase.from("workshops").select("*").eq("user_id", dataOwnerId!).order("created_at", { ascending: false }),
      supabase.from("workshop_costs").select("*").eq("user_id", dataOwnerId!).order("cost_date", { ascending: false }),
      supabase.from("workshop_payments").select("*").eq("user_id", dataOwnerId!).order("payment_date", { ascending: false }),
    ]);
    const ws = wRes.data || [];
    setWorkshops(ws);
    setCosts(cRes.data || []);
    setWorkshopPayments(pRes.data || []);

    // Fetch Finance receipts/payments for workshop contacts
    const contactIds = [...new Set(ws.map((w: any) => w.contact_id).filter(Boolean))];
    if (contactIds.length > 0) {
      const { data: txData } = await supabase
        .from("transactions")
        .select("id, transaction_date, description, amount, transaction_type, contact_id, payment_method, is_deleted, reference")
        .in("contact_id", contactIds)
        .in("transaction_type", ["receipt", "payment", "sale_cash", "sale_bank", "sale_credit", "sale_cheque"])
        .eq("is_deleted", false)
        .order("transaction_date", { ascending: false });
      
      // Exclude workshop-specific transactions (already tracked in workshop_payments)
      const wsPaymentTxIds = new Set((pRes.data || []).map((p: any) => p.linked_transaction_id).filter(Boolean));
      setFinanceReceipts((txData || []).filter((tx: any) => !wsPaymentTxIds.has(tx.id)));
    } else {
      setFinanceReceipts([]);
    }

    setLoading(false);
  };

  // Filtered workshops
  const filtered = useMemo(() => {
    return workshops.filter(w => {
      const inDate = (!dateFrom || w.created_at >= dateFrom) && (!dateTo || w.created_at <= dateTo + "T23:59:59");
      const inStatus = statusFilter === "all" || w.status === statusFilter;
      const inSearch = !search || w.name?.includes(search) || w.customer_name?.includes(search);
      return inDate && inStatus && inSearch;
    });
  }, [workshops, dateFrom, dateTo, statusFilter, search]);

  const filteredIds = useMemo(() => new Set(filtered.map(w => w.id)), [filtered]);
  const filteredContactIds = useMemo(() => new Set(filtered.map(w => w.contact_id).filter(Boolean)), [filtered]);

  const filteredCosts = useMemo(() => costs.filter(c => filteredIds.has(c.workshop_id)), [costs, filteredIds]);
  const filteredPayments = useMemo(() => workshopPayments.filter(p => filteredIds.has(p.workshop_id)), [workshopPayments, filteredIds]);
  const filteredFinanceReceipts = useMemo(() => financeReceipts.filter(tx => filteredContactIds.has(tx.contact_id)), [financeReceipts, filteredContactIds]);

  // All collected = workshop payments + finance receipts for workshop contacts
  const allCollectedByContact = useMemo(() => {
    const map: Record<string, number> = {};
    // Workshop direct payments
    filteredPayments.forEach(p => {
      const ws = workshops.find(w => w.id === p.workshop_id);
      if (ws?.contact_id) {
        map[ws.contact_id] = (map[ws.contact_id] || 0) + (p.amount || 0);
      }
    });
    // Finance receipts
    filteredFinanceReceipts.forEach(tx => {
      if (tx.contact_id) {
        map[tx.contact_id] = (map[tx.contact_id] || 0) + (tx.amount || 0);
      }
    });
    return map;
  }, [filteredPayments, filteredFinanceReceipts, workshops]);

  const totalCollected = useMemo(() => {
    let total = 0;
    filteredPayments.forEach(p => total += p.amount || 0);
    filteredFinanceReceipts.forEach(tx => total += tx.amount || 0);
    return total;
  }, [filteredPayments, filteredFinanceReceipts]);

  // KPIs
  const kpis = useMemo(() => {
    const total = filtered.length;
    const active = filtered.filter(w => w.status === "active").length;
    const completed = filtered.filter(w => w.status === "completed").length;
    const totalBudget = filtered.reduce((s, w) => s + (w.total_budget || 0), 0);
    const totalCosts = filteredCosts.reduce((s, c) => s + (c.amount || 0), 0);
    const avgProfit = completed > 0
      ? filtered.filter(w => w.status === "completed").reduce((s, w) => {
          const wCosts = costs.filter(c => c.workshop_id === w.id).reduce((ss, c) => ss + (c.amount || 0), 0);
          return s + ((w.total_budget || 0) - wCosts);
        }, 0) / completed
      : 0;
    const profitMargin = totalBudget > 0 ? ((totalBudget - totalCosts) / totalBudget * 100) : 0;

    return { total, active, completed, totalBudget, totalCosts, totalCollected, avgProfit, profitMargin };
  }, [filtered, filteredCosts, costs, totalCollected]);

  // Cost breakdown by type
  const costByType = useMemo(() => {
    const map: Record<string, number> = {};
    filteredCosts.forEach(c => {
      const t = c.cost_type || "other";
      map[t] = (map[t] || 0) + (c.amount || 0);
    });
    return Object.entries(map)
      .map(([type, amount]) => ({
        name: COST_TYPES[type]?.label || type,
        value: amount,
        color: COST_TYPES[type]?.color || "#a1a1aa",
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredCosts]);

  // Per-workshop profitability table
  const workshopProfitability = useMemo(() => {
    return filtered.map(w => {
      const wCosts = costs.filter(c => c.workshop_id === w.id);
      const totalCost = wCosts.reduce((s, c) => s + (c.amount || 0), 0);
      const wPayments = workshopPayments.filter(p => p.workshop_id === w.id).reduce((s, p) => s + (p.amount || 0), 0);
      const wFinanceReceipts = w.contact_id ? (financeReceipts.filter(tx => tx.contact_id === w.contact_id).reduce((s, tx) => s + (tx.amount || 0), 0)) : 0;
      const collected = wPayments + wFinanceReceipts;
      const profit = (w.total_budget || 0) - totalCost;
      const margin = w.total_budget > 0 ? (profit / w.total_budget * 100) : 0;
      const costBreakdown: Record<string, number> = {};
      wCosts.forEach(c => {
        const t = c.cost_type || "other";
        costBreakdown[t] = (costBreakdown[t] || 0) + (c.amount || 0);
      });
      return {
        id: w.id, name: w.name, customer: w.customer_name || "-", status: w.status,
        budget: w.total_budget || 0, totalCost, profit, margin, collected,
        costBreakdown,
        startDate: w.start_date,
        area_sqm: (w as any).area_sqm || 0,
        workshop_type: (w as any).workshop_type || "other",
        contact_id: w.contact_id,
      };
    }).sort((a, b) => b.budget - a.budget);
  }, [filtered, costs, workshopPayments, financeReceipts]);

  // Cost per sqm analysis
  const costPerSqmData = useMemo(() => {
    return workshopProfitability
      .filter(w => w.area_sqm > 0)
      .map(w => ({
        ...w,
        costPerSqm: w.area_sqm > 0 ? Math.round(w.totalCost / w.area_sqm) : 0,
        budgetPerSqm: w.area_sqm > 0 ? Math.round(w.budget / w.area_sqm) : 0,
        profitPerSqm: w.area_sqm > 0 ? Math.round(w.profit / w.area_sqm) : 0,
      }))
      .sort((a, b) => b.costPerSqm - a.costPerSqm);
  }, [workshopProfitability]);

  // Type comparison
  const typeComparison = useMemo(() => {
    const map: Record<string, { count: number; totalCost: number; totalArea: number; totalBudget: number }> = {};
    workshopProfitability.forEach(w => {
      const t = w.workshop_type || "other";
      if (!map[t]) map[t] = { count: 0, totalCost: 0, totalArea: 0, totalBudget: 0 };
      map[t].count++;
      map[t].totalCost += w.totalCost;
      map[t].totalArea += w.area_sqm;
      map[t].totalBudget += w.budget;
    });
    const WORKSHOP_TYPE_LABELS: Record<string, string> = {
      kitchen: "🍳 مطبخ", bedroom: "🛏️ غرفة نوم", livingroom: "🛋️ صالون",
      closet: "🗄️ خزائن", door: "🚪 أبواب", other: "📦 أخرى",
    };
    return Object.entries(map).map(([type, d]) => ({
      type, label: WORKSHOP_TYPE_LABELS[type] || type,
      ...d,
      avgCostPerSqm: d.totalArea > 0 ? Math.round(d.totalCost / d.totalArea) : 0,
      avgBudgetPerSqm: d.totalArea > 0 ? Math.round(d.totalBudget / d.totalArea) : 0,
    }));
  }, [workshopProfitability]);

  // Purchases by supplier
  const supplierPurchases = useMemo(() => {
    const map: Record<string, { name: string; total: number; count: number }> = {};
    filteredCosts.forEach(c => {
      const name = c.supplier_name || "بدون مورد";
      if (!map[name]) map[name] = { name, total: 0, count: 0 };
      map[name].total += c.amount || 0;
      map[name].count += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filteredCosts]);

  // Monthly cost trend
  const monthlyTrend = useMemo(() => {
    const map: Record<string, number> = {};
    filteredCosts.forEach(c => {
      const m = c.cost_date?.substring(0, 7) || "unknown";
      map[m] = (map[m] || 0) + (c.amount || 0);
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount }));
  }, [filteredCosts]);

  // All receipts for "المقبوضات" tab
  const allReceiptsForDisplay = useMemo(() => {
    const items: { id: string; date: string; description: string; amount: number; method: string; source: string; workshopName: string }[] = [];
    
    // Workshop direct payments
    filteredPayments.forEach(p => {
      const ws = workshops.find(w => w.id === p.workshop_id);
      items.push({
        id: p.id,
        date: p.payment_date,
        description: p.description || `دفعة - ${ws?.name || ""}`,
        amount: p.amount || 0,
        method: p.payment_method || "نقدي",
        source: "ورشات",
        workshopName: ws?.name || "-",
      });
    });
    
    // Finance receipts
    filteredFinanceReceipts.forEach(tx => {
      const ws = workshops.find(w => w.contact_id === tx.contact_id);
      items.push({
        id: tx.id,
        date: tx.transaction_date,
        description: tx.description || "",
        amount: tx.amount || 0,
        method: tx.payment_method || "-",
        source: "المالية",
        workshopName: ws?.name || "-",
      });
    });
    
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredPayments, filteredFinanceReceipts, workshops]);

  const fmtNum = (n: number) => n.toLocaleString("ar-EG", { maximumFractionDigits: 0 });

  const exportExcel = () => {
    const rows = workshopProfitability.map(w => ({
      "الورشة": w.name,
      "الزبون": w.customer,
      "الحالة": w.status === "completed" ? "مكتملة" : w.status === "active" ? "نشطة" : w.status,
      "الميزانية": w.budget,
      "إجمالي التكلفة": w.totalCost,
      "المقبوض": w.collected,
      "الربح": w.profit,
      "هامش الربح %": Math.round(w.margin),
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "تقرير الورشات");

    // Supplier sheet
    const sRows = supplierPurchases.map(s => ({ "المورد": s.name, "إجمالي المشتريات": s.total, "عدد الفواتير": s.count }));
    const ws2 = XLSX.utils.json_to_sheet(sRows);
    XLSX.utils.book_append_sheet(wb, ws2, "مشتريات الموردين");

    // Receipts sheet
    const rRows = allReceiptsForDisplay.map(r => ({
      "التاريخ": r.date, "الوصف": r.description, "المبلغ": r.amount,
      "الطريقة": r.method, "المصدر": r.source, "الورشة": r.workshopName,
    }));
    const ws3 = XLSX.utils.json_to_sheet(rRows);
    XLSX.utils.book_append_sheet(wb, ws3, "المقبوضات");

    setNextExportBranding({ title: "تقرير الورشات" });
    XLSX.writeFile(wb, `تقرير-الورشات-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast.success("تم تصدير التقرير بنجاح");
  };

  const handlePrint = () => {
    const periodLabel = dateFrom && dateTo ? `من ${dateFrom} إلى ${dateTo}` : "";
    const tableHeaders = ["الورشة", "الزبون", "الحالة", "الميزانية", "التكلفة", "المقبوض", "الربح", "هامش الربح"];
    const tableRows = workshopProfitability.map(w => [
      w.name, w.customer,
      w.status === "completed" ? "مكتملة" : w.status === "active" ? "نشطة" : w.status === "paused" ? "متوقفة" : "ملغاة",
      `₪${fmtNum(w.budget)}`, `₪${fmtNum(w.totalCost)}`, `₪${fmtNum(w.collected)}`,
      `₪${fmtNum(w.profit)}`, `${Math.round(w.margin)}%`,
    ]);
    // Totals row
    tableRows.push([
      "الإجمالي", "", "", `₪${fmtNum(kpis.totalBudget)}`, `₪${fmtNum(kpis.totalCosts)}`,
      `₪${fmtNum(totalCollected)}`, `₪${fmtNum(kpis.totalBudget - kpis.totalCosts)}`, `${Math.round(kpis.profitMargin)}%`,
    ]);

    const html = generateProfessionalPDFHtml({
      company: companyInfo,
      reportTitle: "تقرير الورشات",
      reportTitleEn: "Workshop Report",
      periodLabel,
      summaryItems: [
        { label: "عدد الورشات", value: String(kpis.total) },
        { label: "إجمالي المقبوضات", value: `₪${fmtNum(totalCollected)}`, color: "#16A34A" },
        { label: "إجمالي التكاليف", value: `₪${fmtNum(kpis.totalCosts)}`, color: "#DC2626" },
        { label: "هامش الربح", value: `${Math.round(kpis.profitMargin)}%`, color: kpis.profitMargin >= 0 ? "#16A34A" : "#DC2626" },
      ],
      tableHeaders,
      tableRows,
      notes: [
        `عدد الورشات النشطة: ${kpis.active} | المكتملة: ${kpis.completed}`,
        `المقبوضات تشمل الدفعات المباشرة من الورشات وسندات القبض من المالية`,
      ],
    });
    openPrintWindow(html);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <BackButton />
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              تقارير الورشات
            </h1>
            <p className="text-xs text-muted-foreground">تحليل الربحية والتكاليف والمقبوضات — مربوط بالمالية</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" />
            طباعة
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportExcel}>
            <FileSpreadsheet className="h-3.5 w-3.5" />
            تصدير Excel
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-border/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setDatePreset("custom"); }}
              className="h-8 text-xs w-[130px]" />
            <span className="text-xs text-muted-foreground">إلى</span>
            <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setDatePreset("custom"); }}
              className="h-8 text-xs w-[130px]" />
            <div className="flex gap-1">
              {([
                { v: "today" as DatePreset, l: "اليوم" },
                { v: "week" as DatePreset, l: "الأسبوع" },
                { v: "month" as DatePreset, l: "الشهر" },
                { v: "quarter" as DatePreset, l: "ربع سنوي" },
                { v: "half" as DatePreset, l: "نصف سنوي" },
                { v: "year" as DatePreset, l: "سنوي" },
              ]).map(p => (
                <Button key={p.v} variant={datePreset === p.v ? "default" : "outline"} size="sm"
                  className="h-7 text-[10px] px-2" onClick={() => applyPreset(p.v)}>
                  {p.l}
                </Button>
              ))}
            </div>
            <div className="w-px h-5 bg-border" />
            <div className="flex gap-1">
              {[
                { v: "all", l: "الكل" },
                { v: "active", l: "نشطة" },
                { v: "completed", l: "مكتملة" },
              ].map(s => (
                <Button key={s.v} variant={statusFilter === s.v ? "default" : "outline"} size="sm"
                  className="h-7 text-[10px] px-2" onClick={() => setStatusFilter(s.v)}>
                  {s.l}
                </Button>
              ))}
            </div>
            <Input placeholder="بحث بالاسم أو الزبون..." value={search} onChange={e => setSearch(e.target.value)}
              className="h-8 text-xs flex-1 min-w-[140px]" />
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "عدد الورشات", value: kpis.total, icon: Hammer, color: "text-primary", prefix: "" },
          { label: "إجمالي المقبوضات", value: totalCollected, icon: Receipt, color: "text-emerald-600", prefix: "₪" },
          { label: "إجمالي التكاليف", value: kpis.totalCosts, icon: DollarSign, color: "text-destructive", prefix: "₪" },
          { label: "هامش الربح", value: Math.round(kpis.profitMargin), icon: TrendingUp, color: kpis.profitMargin >= 0 ? "text-emerald-600" : "text-destructive", prefix: "", suffix: "%" },
        ].map(k => (
          <Card key={k.label} className="border-border/50">
            <CardContent className="p-3 text-center">
              <k.icon className={`h-4 w-4 mx-auto mb-1 ${k.color}`} />
              <p className="text-[10px] text-muted-foreground">{k.label}</p>
              <p className={`text-base font-bold tabular-nums ${k.color}`}>
                {k.prefix}{fmtNum(k.value)}{(k as any).suffix || ""}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="profitability" className="space-y-3">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="profitability" className="text-xs">ربحية الورشات</TabsTrigger>
          <TabsTrigger value="receipts" className="text-xs">المقبوضات</TabsTrigger>
          <TabsTrigger value="sqm" className="text-xs">تكلفة المتر</TabsTrigger>
          <TabsTrigger value="costs" className="text-xs">توزيع التكاليف</TabsTrigger>
          <TabsTrigger value="suppliers" className="text-xs">مشتريات الموردين</TabsTrigger>
          <TabsTrigger value="trend" className="text-xs">الاتجاه الشهري</TabsTrigger>
        </TabsList>

        {/* Tab 1: Profitability */}
        <TabsContent value="profitability" className="space-y-3">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px]">الورشة</TableHead>
                  <TableHead className="text-[11px]">الزبون</TableHead>
                  <TableHead className="text-[11px]">الحالة</TableHead>
                  <TableHead className="text-[11px]">الميزانية</TableHead>
                  <TableHead className="text-[11px]">التكلفة</TableHead>
                  <TableHead className="text-[11px]">المقبوض</TableHead>
                  <TableHead className="text-[11px]">الربح</TableHead>
                  <TableHead className="text-[11px]">نسبة التكلفة</TableHead>
                  <TableHead className="text-[11px]">هامش الربح</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workshopProfitability.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8">
                      لا توجد ورشات في الفترة المحددة
                    </TableCell>
                  </TableRow>
                ) : workshopProfitability.map(w => (
                  <TableRow key={w.id}>
                    <TableCell className="text-xs font-medium">{w.name}</TableCell>
                    <TableCell className="text-xs">{w.customer}</TableCell>
                    <TableCell>
                      <Badge variant={w.status === "completed" ? "secondary" : w.status === "active" ? "default" : "outline"} className="text-[10px]">
                        {w.status === "completed" ? "مكتملة" : w.status === "active" ? "نشطة" : w.status === "paused" ? "متوقفة" : "ملغاة"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">₪{fmtNum(w.budget)}</TableCell>
                    <TableCell className="text-xs tabular-nums text-destructive">₪{fmtNum(w.totalCost)}</TableCell>
                    <TableCell className="text-xs tabular-nums text-emerald-600 font-semibold">₪{fmtNum(w.collected)}</TableCell>
                    <TableCell className={`text-xs tabular-nums font-semibold ${w.profit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      ₪{fmtNum(w.profit)}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {w.budget > 0 ? `${Math.round(w.totalCost / w.budget * 100)}%` : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={w.margin >= 20 ? "default" : w.margin >= 0 ? "secondary" : "destructive"} className="text-[10px]">
                        {Math.round(w.margin)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {workshopProfitability.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="text-xs font-bold">الإجمالي</TableCell>
                    <TableCell className="text-xs font-bold tabular-nums">₪{fmtNum(kpis.totalBudget)}</TableCell>
                    <TableCell className="text-xs font-bold tabular-nums text-destructive">₪{fmtNum(kpis.totalCosts)}</TableCell>
                    <TableCell className="text-xs font-bold tabular-nums text-emerald-600">₪{fmtNum(totalCollected)}</TableCell>
                    <TableCell className={`text-xs font-bold tabular-nums ${(kpis.totalBudget - kpis.totalCosts) >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      ₪{fmtNum(kpis.totalBudget - kpis.totalCosts)}
                    </TableCell>
                    <TableCell className="text-xs font-bold tabular-nums">
                      {kpis.totalBudget > 0 ? `${Math.round(kpis.totalCosts / kpis.totalBudget * 100)}%` : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={kpis.profitMargin >= 20 ? "default" : "secondary"} className="text-[10px]">
                        {Math.round(kpis.profitMargin)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>

          {/* Cost breakdown per workshop */}
          {workshopProfitability.filter(w => Object.keys(w.costBreakdown).length > 0).length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-sm">تفصيل التكاليف لكل ورشة</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="space-y-3">
                  {workshopProfitability.filter(w => Object.keys(w.costBreakdown).length > 0).map(w => (
                    <div key={w.id} className="rounded-lg border border-border/50 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold">{w.name}</span>
                        <span className="text-[10px] text-muted-foreground">إجمالي: ₪{fmtNum(w.totalCost)}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {Object.entries(w.costBreakdown).map(([type, amount]) => {
                          const ct = COST_TYPES[type] || COST_TYPES.other;
                          const pct = w.totalCost > 0 ? Math.round((amount as number) / w.totalCost * 100) : 0;
                          return (
                            <div key={type} className="rounded-md bg-muted/30 p-2 text-center">
                              <span className="text-sm">{ct.icon}</span>
                              <p className="text-[10px] text-muted-foreground">{ct.label}</p>
                              <p className="text-xs font-bold tabular-nums">₪{fmtNum(amount as number)}</p>
                              <p className="text-[9px] text-muted-foreground">{pct}%</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab: Receipts - All collections from workshops + Finance */}
        <TabsContent value="receipts" className="space-y-3">
          <Card className="border-border/50">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Receipt className="h-4 w-4 text-emerald-600" />
                جميع المقبوضات (ورشات + سندات قبض من المالية)
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">
                يشمل الدفعات المسجلة من داخل الورشة وسندات القبض المنشأة من وحدة المالية لنفس الزبون
              </p>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">التاريخ</TableHead>
                    <TableHead className="text-[11px]">الوصف</TableHead>
                    <TableHead className="text-[11px]">الورشة</TableHead>
                    <TableHead className="text-[11px]">المبلغ</TableHead>
                    <TableHead className="text-[11px]">الطريقة</TableHead>
                    <TableHead className="text-[11px]">المصدر</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allReceiptsForDisplay.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">
                        لا توجد مقبوضات مسجلة
                      </TableCell>
                    </TableRow>
                  ) : allReceiptsForDisplay.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs tabular-nums">{r.date}</TableCell>
                      <TableCell className="text-xs">{r.description}</TableCell>
                      <TableCell className="text-xs">{r.workshopName}</TableCell>
                      <TableCell className="text-xs tabular-nums font-semibold text-emerald-600">₪{fmtNum(r.amount)}</TableCell>
                      <TableCell className="text-xs">{r.method}</TableCell>
                      <TableCell>
                        <Badge variant={r.source === "ورشات" ? "default" : "secondary"} className="text-[10px]">
                          {r.source}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {allReceiptsForDisplay.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={3} className="text-xs font-bold">الإجمالي</TableCell>
                      <TableCell className="text-xs font-bold tabular-nums text-emerald-600">
                        ₪{fmtNum(allReceiptsForDisplay.reduce((s, r) => s + r.amount, 0))}
                      </TableCell>
                      <TableCell colSpan={2} className="text-xs text-muted-foreground">
                        {allReceiptsForDisplay.filter(r => r.source === "ورشات").length} من الورشات |{" "}
                        {allReceiptsForDisplay.filter(r => r.source === "المالية").length} من المالية
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Cost per SQM */}
        <TabsContent value="sqm" className="space-y-3">
          {typeComparison.length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-sm">مقارنة حسب النوع (متوسط تكلفة المتر)</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[11px]">النوع</TableHead>
                        <TableHead className="text-[11px]">العدد</TableHead>
                        <TableHead className="text-[11px]">إجمالي المساحة</TableHead>
                        <TableHead className="text-[11px]">إجمالي التكلفة</TableHead>
                        <TableHead className="text-[11px]">تكلفة المتر</TableHead>
                        <TableHead className="text-[11px]">سعر المتر (ميزانية)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {typeComparison.map(t => (
                        <TableRow key={t.type}>
                          <TableCell className="text-xs font-medium">{t.label}</TableCell>
                          <TableCell className="text-xs tabular-nums">{t.count}</TableCell>
                          <TableCell className="text-xs tabular-nums">{t.totalArea > 0 ? `${t.totalArea} م²` : "-"}</TableCell>
                          <TableCell className="text-xs tabular-nums text-destructive">₪{fmtNum(t.totalCost)}</TableCell>
                          <TableCell className="text-xs tabular-nums font-bold">{t.avgCostPerSqm > 0 ? `₪${fmtNum(t.avgCostPerSqm)}/م²` : "-"}</TableCell>
                          <TableCell className="text-xs tabular-nums">{t.avgBudgetPerSqm > 0 ? `₪${fmtNum(t.avgBudgetPerSqm)}/م²` : "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-border/50">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-sm">تفصيل تكلفة المتر لكل ورشة</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              {costPerSqmData.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">لا توجد ورشات بها مساحة محددة — أضف المساحة (م²) عند إنشاء الورشة</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[11px]">الورشة</TableHead>
                        <TableHead className="text-[11px]">المساحة</TableHead>
                        <TableHead className="text-[11px]">إجمالي التكلفة</TableHead>
                        <TableHead className="text-[11px]">تكلفة المتر</TableHead>
                        <TableHead className="text-[11px]">ميزانية المتر</TableHead>
                        <TableHead className="text-[11px]">ربح المتر</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {costPerSqmData.map(w => (
                        <TableRow key={w.id}>
                          <TableCell className="text-xs font-medium">{w.name}</TableCell>
                          <TableCell className="text-xs tabular-nums">{w.area_sqm} م²</TableCell>
                          <TableCell className="text-xs tabular-nums text-destructive">₪{fmtNum(w.totalCost)}</TableCell>
                          <TableCell className="text-xs tabular-nums font-bold">₪{fmtNum(w.costPerSqm)}/م²</TableCell>
                          <TableCell className="text-xs tabular-nums">₪{fmtNum(w.budgetPerSqm)}/م²</TableCell>
                          <TableCell className={`text-xs tabular-nums font-bold ${w.profitPerSqm >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                            ₪{fmtNum(w.profitPerSqm)}/م²
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Cost Distribution */}
        <TabsContent value="costs" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="border-border/50">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-sm">توزيع التكاليف حسب النوع</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {costByType.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={costByType} dataKey="value" nameKey="name" cx="50%" cy="50%"
                        outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false} fontSize={10}>
                        {costByType.map((_, i) => (
                          <Cell key={i} fill={costByType[i].color} />
                        ))}
                      </Pie>
                      <ReTooltip formatter={(v: number) => `₪${v.toLocaleString()}`} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-xs text-muted-foreground py-8">لا توجد تكاليف</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-sm">جدول التكاليف</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px]">النوع</TableHead>
                      <TableHead className="text-[11px]">المبلغ</TableHead>
                      <TableHead className="text-[11px]">النسبة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costByType.map(c => {
                      const totalAll = costByType.reduce((s, x) => s + x.value, 0);
                      return (
                        <TableRow key={c.name}>
                          <TableCell className="text-xs">{c.name}</TableCell>
                          <TableCell className="text-xs tabular-nums font-medium">₪{fmtNum(c.value)}</TableCell>
                          <TableCell className="text-xs tabular-nums">{totalAll > 0 ? Math.round(c.value / totalAll * 100) : 0}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  {costByType.length > 0 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell className="text-xs font-bold">الإجمالي</TableCell>
                        <TableCell className="text-xs font-bold tabular-nums">₪{fmtNum(costByType.reduce((s, c) => s + c.value, 0))}</TableCell>
                        <TableCell className="text-xs font-bold">100%</TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab: Supplier Purchases */}
        <TabsContent value="suppliers" className="space-y-3">
          <Card className="border-border/50">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                مشتريات الموردين للورشات
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">المورد</TableHead>
                    <TableHead className="text-[11px]">إجمالي المشتريات</TableHead>
                    <TableHead className="text-[11px]">عدد المعاملات</TableHead>
                    <TableHead className="text-[11px]">النسبة من الإجمالي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierPurchases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-8">
                        لا توجد مشتريات مسجلة
                      </TableCell>
                    </TableRow>
                  ) : supplierPurchases.map(s => {
                    const totalAll = supplierPurchases.reduce((sum, x) => sum + x.total, 0);
                    return (
                      <TableRow key={s.name}>
                        <TableCell className="text-xs font-medium">{s.name}</TableCell>
                        <TableCell className="text-xs tabular-nums">₪{fmtNum(s.total)}</TableCell>
                        <TableCell className="text-xs tabular-nums">{s.count}</TableCell>
                        <TableCell className="text-xs tabular-nums">{totalAll > 0 ? Math.round(s.total / totalAll * 100) : 0}%</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                {supplierPurchases.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="text-xs font-bold">الإجمالي</TableCell>
                      <TableCell className="text-xs font-bold tabular-nums">₪{fmtNum(supplierPurchases.reduce((s, x) => s + x.total, 0))}</TableCell>
                      <TableCell className="text-xs font-bold tabular-nums">{supplierPurchases.reduce((s, x) => s + x.count, 0)}</TableCell>
                      <TableCell className="text-xs font-bold">100%</TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Monthly Trend */}
        <TabsContent value="trend" className="space-y-3">
          <Card className="border-border/50">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                الاتجاه الشهري للتكاليف
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              {monthlyTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="month" fontSize={10} />
                    <YAxis fontSize={10} tickFormatter={v => `₪${(v / 1000).toFixed(0)}k`} />
                    <ReTooltip formatter={(v: number) => `₪${v.toLocaleString()}`} labelFormatter={l => `شهر: ${l}`} />
                    <Bar dataKey="amount" name="التكاليف" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-xs text-muted-foreground py-8">لا توجد بيانات كافية</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
