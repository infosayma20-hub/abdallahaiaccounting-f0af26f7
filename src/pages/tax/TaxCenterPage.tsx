import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Receipt, FileText, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Clock, CalendarDays } from "lucide-react";
import TaxPeriodicReport from "@/components/tax/TaxPeriodicReport";
import TaxSalesLedger from "@/components/tax/TaxSalesLedger";
import TaxPurchasesLedger from "@/components/tax/TaxPurchasesLedger";
import TaxSubmissions from "@/components/tax/TaxSubmissions";
import TaxSettingsSection from "@/components/tax/TaxSettingsSection";
import { calculateTaxSummary } from "@/lib/reports/tax-summary";

const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

export default function TaxCenterPage() {
  const { user } = useAuth();
  const [ownerId, setOwnerId] = useState<string>("");
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  // Shared period state — cards + periodic report read/write the same year/month
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  useEffect(() => {
    if (!user) return;
    supabase.rpc("get_team_owner_id", { _user_id: user.id }).then(({ data }) => {
      setOwnerId(data || user.id);
    });
  }, [user]);

  useEffect(() => {
    if (!ownerId) return;
    loadSummary();
  }, [ownerId, year, month]);

  const loadSummary = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const today = new Date();
    // Unified VAT helper — same source as TaxPeriodicReport
    const tx = await calculateTaxSummary({ ownerId, year, month });

    const { data: submission } = await supabase
      .from("tax_submissions")
      .select("*")
      .eq("user_id", ownerId)
      .eq("period_year", year)
      .eq("period_month", month)
      .maybeSingle();

    const { data: settings } = await supabase
      .from("tax_settings")
      .select("*")
      .eq("user_id", ownerId)
      .maybeSingle();

    const outputTax = tx.totalOutputTax;
    const inputTax = tx.totalInputTax;
    const netTax = tx.netTaxDue;
    const dueDay = settings?.report_due_day || 15;
    const dueDate = new Date(year, month, dueDay); // next month
    const daysRemaining = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let statusColor = "text-amber-600";
    let statusBg = "bg-amber-50";
    let statusLabel = "لم يُقدَّم";
    let StatusIcon = Clock;

    if (submission?.status === "submitted" || submission?.status === "paid") {
      statusColor = "text-emerald-600";
      statusBg = "bg-emerald-50";
      statusLabel = "تم التقديم";
      StatusIcon = CheckCircle2;
    } else if (daysRemaining < 0) {
      statusColor = "text-red-600";
      statusBg = "bg-red-50";
      statusLabel = "متأخر!";
      StatusIcon = AlertTriangle;
    }

    setSummary({ outputTax, inputTax, netTax, daysRemaining, statusColor, statusBg, statusLabel, StatusIcon, submission, settings });
    setLoading(false);
  }, [ownerId, year, month]);

  const monthName = `${MONTHS_AR[month - 1]} ${year}`;

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader title="المحاسبة الضريبية" breadcrumb={["المالية", "مركز الضريبة"]} />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 border border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground">ضريبة المبيعات (مخرجات)</span>
            <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
              <TrendingUp className="w-4.5 h-4.5 text-red-500" />
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {loading ? "..." : `₪${(summary?.outputTax || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">{monthName}</p>
        </Card>

        <Card className="p-5 border border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground">ضريبة المشتريات (مدخلات)</span>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
              <TrendingDown className="w-4.5 h-4.5 text-emerald-500" />
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {loading ? "..." : `₪${(summary?.inputTax || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">قابلة للخصم</p>
        </Card>

        <Card className="p-5 border border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground">صافي الضريبة المستحقة</span>
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <Receipt className="w-4.5 h-4.5 text-blue-500" />
            </div>
          </div>
          <p className={`text-2xl font-bold tabular-nums ${!loading && summary ? (summary.netTax > 0 ? "text-red-600" : summary.netTax < 0 ? "text-emerald-600" : "text-muted-foreground") : "text-foreground"}`}>
            {loading ? "..." : `₪${Math.abs(summary?.netTax || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {!loading && summary ? (summary.netTax > 0 ? "مستحق الدفع للوزارة" : summary.netTax < 0 ? "مستحق الاسترداد" : "لا يوجد مستحق") : ""}
          </p>
        </Card>

        <Card className="p-5 border border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground">حالة التقرير</span>
            <div className={`w-9 h-9 rounded-lg ${summary?.statusBg || "bg-muted"} flex items-center justify-center`}>
              {summary?.StatusIcon ? <summary.StatusIcon className={`w-4.5 h-4.5 ${summary?.statusColor}`} /> : <Clock className="w-4.5 h-4.5 text-muted-foreground" />}
            </div>
          </div>
          <p className={`text-lg font-bold ${summary?.statusColor || "text-foreground"}`}>
            {loading ? "..." : summary?.statusLabel}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
            <CalendarDays className="w-3 h-3" />
            {!loading && summary?.daysRemaining !== undefined
              ? summary.daysRemaining > 0
                ? `باقي ${summary.daysRemaining} يوم`
                : `متأخر ${Math.abs(summary.daysRemaining)} يوم`
              : ""}
          </p>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="periodic" className="space-y-4">
        <TabsList className="bg-muted/50 p-1 rounded-xl">
          <TabsTrigger value="periodic" className="rounded-lg text-xs">التقرير الدوري</TabsTrigger>
          <TabsTrigger value="sales" className="rounded-lg text-xs">ضريبة المبيعات</TabsTrigger>
          <TabsTrigger value="purchases" className="rounded-lg text-xs">ضريبة المشتريات</TabsTrigger>
          <TabsTrigger value="submissions" className="rounded-lg text-xs">التقديمات</TabsTrigger>
          <TabsTrigger value="settings" className="rounded-lg text-xs">الإعدادات</TabsTrigger>
        </TabsList>

        <TabsContent value="periodic">
          <TaxPeriodicReport
            ownerId={ownerId}
            year={year}
            month={month}
            onPeriodChange={(y, m) => { setYear(y); setMonth(m); }}
            onCalculated={loadSummary}
          />
        </TabsContent>
        <TabsContent value="sales">
          <TaxSalesLedger ownerId={ownerId} />
        </TabsContent>
        <TabsContent value="purchases">
          <TaxPurchasesLedger ownerId={ownerId} />
        </TabsContent>
        <TabsContent value="submissions">
          <TaxSubmissions ownerId={ownerId} onRefresh={loadSummary} />
        </TabsContent>
        <TabsContent value="settings">
          <TaxSettingsSection ownerId={ownerId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
