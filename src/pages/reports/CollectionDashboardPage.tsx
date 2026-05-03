import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, startOfMonth, endOfMonth, subMonths, differenceInDays } from "date-fns";
import { ArrowRight, TrendingUp, TrendingDown, Clock, AlertTriangle, DollarSign, CalendarDays, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const fmtAmt = (n: number) => `₪${Math.abs(n).toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const AGING_COLORS = ["hsl(160, 60%, 45%)", "hsl(45, 90%, 50%)", "hsl(25, 90%, 55%)", "hsl(0, 70%, 50%)", "hsl(0, 70%, 35%)"];

export default function CollectionDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.rpc("get_team_owner_id", { _user_id: user.id }).then(({ data }) => setOwnerId(data || user!.id));
  }, [user]);

  useEffect(() => {
    if (ownerId) loadData();
  }, [ownerId]);

  const loadData = async () => {
    setLoading(true);
    const uid = ownerId!;
    const [invRes, vRes, linkRes] = await Promise.all([
      supabase.from("invoices").select("id, invoice_number, invoice_date, due_date, total_amount, paid_amount, remaining_amount, status, payment_status, contact_name, contact_id, invoice_type").eq("user_id", uid).eq("invoice_type", "sale").eq("is_voided", false).not("status", "in", "(cancelled,void,reversed)"),
      supabase.from("receipt_vouchers").select("id, receipt_number, payment_date, amount, contact_name, payment_method").eq("user_id", uid),
      supabase.from("payment_invoice_links").select("id, invoice_id, payment_id, allocated_amount"),
    ]);
    setInvoices(invRes.data || []);
    setVouchers(vRes.data || []);
    setLinks(linkRes.data || []);
    setLoading(false);
  };

  const today = new Date();
  const thisMonthStart = format(startOfMonth(today), "yyyy-MM-dd");

  // KPIs
  const totalReceivables = useMemo(() => invoices.reduce((s, i) => s + (i.remaining_amount || (i.total_amount - (i.paid_amount || 0))), 0), [invoices]);

  const collectedThisMonth = useMemo(() => vouchers.filter(v => v.payment_date >= thisMonthStart).reduce((s, v) => s + (v.amount || 0), 0), [vouchers, thisMonthStart]);

  const overdueOver60 = useMemo(() => {
    return invoices.filter(i => {
      const remaining = i.remaining_amount ?? (i.total_amount - (i.paid_amount || 0));
      return remaining > 0 && i.due_date && differenceInDays(today, new Date(i.due_date)) > 60;
    }).reduce((s, i) => s + (i.remaining_amount ?? (i.total_amount - (i.paid_amount || 0))), 0);
  }, [invoices]);

  const avgDSO = useMemo(() => {
    const paidInvoices = invoices.filter(i => i.payment_status === "paid" || (i.paid_amount || 0) >= i.total_amount);
    if (!paidInvoices.length) return 0;
    const voucherMap = new Map<string, string[]>();
    links.forEach(l => {
      if (!voucherMap.has(l.invoice_id)) voucherMap.set(l.invoice_id, []);
      voucherMap.get(l.invoice_id)!.push(l.payment_id);
    });
    const vMap = new Map(vouchers.map(v => [v.id, v.payment_date]));
    let totalDays = 0, count = 0;
    paidInvoices.forEach(inv => {
      const paymentIds = voucherMap.get(inv.id);
      if (paymentIds?.length) {
        const lastPayDate = paymentIds.map(pid => vMap.get(pid)).filter(Boolean).sort().pop();
        if (lastPayDate) {
          totalDays += differenceInDays(new Date(lastPayDate), new Date(inv.invoice_date));
          count++;
        }
      }
    });
    return count > 0 ? Math.round(totalDays / count) : 0;
  }, [invoices, links, vouchers]);

  const closureRate = useMemo(() => {
    const withDue = invoices.filter(i => i.due_date);
    if (!withDue.length) return 0;
    const onTime = withDue.filter(i => {
      const isPaid = i.payment_status === "paid" || (i.paid_amount || 0) >= i.total_amount;
      if (!isPaid) return false;
      const paymentIds = links.filter(l => l.invoice_id === i.id).map(l => l.payment_id);
      const lastPayDate = paymentIds.map(pid => vouchers.find(v => v.id === pid)?.payment_date).filter(Boolean).sort().pop();
      return lastPayDate && lastPayDate <= i.due_date;
    });
    return Math.round((onTime.length / withDue.length) * 100);
  }, [invoices, links, vouchers]);

  // DSO Monthly Chart
  const dsoMonthly = useMemo(() => {
    const months: { label: string; dso: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const m = subMonths(today, i);
      const mStart = format(startOfMonth(m), "yyyy-MM-dd");
      const mEnd = format(endOfMonth(m), "yyyy-MM-dd");
      const mInvoices = invoices.filter(inv => inv.invoice_date >= mStart && inv.invoice_date <= mEnd && ((inv.paid_amount || 0) >= inv.total_amount || inv.payment_status === "paid"));
      let totalDays = 0, count = 0;
      mInvoices.forEach(inv => {
        const paymentIds = links.filter(l => l.invoice_id === inv.id).map(l => l.payment_id);
        const lastPayDate = paymentIds.map(pid => vouchers.find(v => v.id === pid)?.payment_date).filter(Boolean).sort().pop();
        if (lastPayDate) { totalDays += differenceInDays(new Date(lastPayDate), new Date(inv.invoice_date)); count++; }
      });
      months.push({ label: format(m, "MM/yy"), dso: count > 0 ? Math.round(totalDays / count) : 0 });
    }
    return months;
  }, [invoices, links, vouchers]);

  // Aging Pie
  const agingPie = useMemo(() => {
    const buckets = [
      { name: "جارية", value: 0 },
      { name: "1-30 يوم", value: 0 },
      { name: "31-60 يوم", value: 0 },
      { name: "61-90 يوم", value: 0 },
      { name: "+90 يوم", value: 0 },
    ];
    invoices.forEach(inv => {
      const remaining = inv.remaining_amount ?? (inv.total_amount - (inv.paid_amount || 0));
      if (remaining <= 0) return;
      if (!inv.due_date) { buckets[0].value += remaining; return; }
      const overdue = differenceInDays(today, new Date(inv.due_date));
      if (overdue <= 0) buckets[0].value += remaining;
      else if (overdue <= 30) buckets[1].value += remaining;
      else if (overdue <= 60) buckets[2].value += remaining;
      else if (overdue <= 90) buckets[3].value += remaining;
      else buckets[4].value += remaining;
    });
    return buckets.filter(b => b.value > 0);
  }, [invoices]);

  // Top 5 receivables
  const top5 = useMemo(() => {
    const contactMap: Record<string, { name: string; total: number; contactId: string }> = {};
    invoices.forEach(inv => {
      const remaining = inv.remaining_amount ?? (inv.total_amount - (inv.paid_amount || 0));
      if (remaining <= 0 || !inv.contact_name) return;
      if (!contactMap[inv.contact_name]) contactMap[inv.contact_name] = { name: inv.contact_name, total: 0, contactId: inv.contact_id };
      contactMap[inv.contact_name].total += remaining;
    });
    return Object.values(contactMap).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [invoices]);

  // Upcoming 5 due
  const upcoming5 = useMemo(() => {
    return invoices
      .filter(i => {
        const remaining = i.remaining_amount ?? (i.total_amount - (i.paid_amount || 0));
        return remaining > 0 && i.due_date && differenceInDays(new Date(i.due_date), today) >= 0 && differenceInDays(new Date(i.due_date), today) <= 7;
      })
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 5);
  }, [invoices]);

  const sendWhatsApp = (name: string, invNumber: string, amount: number, dueDate: string) => {
    const msg = `السلام عليكم ${name}،\nنودّ تذكيركم بفاتورة رقم ${invNumber} بمبلغ ${fmtAmt(amount)} مستحقة بتاريخ ${dueDate}.\nنأمل التكرم بالسداد — شكراً لكم`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  if (loading) return (
    <div className="max-w-[1200px] mx-auto p-4 space-y-4" dir="rtl">
      <div className="h-8 w-48 bg-muted rounded animate-pulse" />
      <div className="grid grid-cols-5 gap-3">{[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}</div>
      <div className="grid grid-cols-2 gap-4">{[...Array(2)].map((_, i) => <div key={i} className="h-64 bg-muted rounded-xl animate-pulse" />)}</div>
    </div>
  );

  return (
    <div className="max-w-[1200px] mx-auto space-y-5 pb-10" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/reports")} className="p-2 rounded-xl hover:bg-muted transition-colors">
          <ArrowRight className="h-5 w-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground">لوحة تحكم التحصيل</h1>
          <p className="text-xs text-muted-foreground">نظرة شاملة على أداء التحصيل والذمم المدينة</p>
        </div>
      </div>

      {/* KPIs Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "إجمالي الذمم", value: fmtAmt(totalReceivables), icon: DollarSign, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
          { label: "محصَّل هذا الشهر", value: fmtAmt(collectedThisMonth), icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "متأخر +60 يوم", value: fmtAmt(overdueOver60), icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
          { label: "متوسط DSO", value: `${avgDSO} يوم`, icon: Clock, color: avgDSO <= 30 ? "text-emerald-600" : avgDSO <= 45 ? "text-amber-600" : "text-red-600", bg: avgDSO <= 30 ? "bg-emerald-50 dark:bg-emerald-950/30" : avgDSO <= 45 ? "bg-amber-50 dark:bg-amber-950/30" : "bg-red-50 dark:bg-red-950/30" },
          { label: "نسبة الإغلاق بالموعد", value: `${closureRate}%`, icon: closureRate >= 70 ? TrendingUp : TrendingDown, color: closureRate >= 70 ? "text-emerald-600" : closureRate >= 50 ? "text-amber-600" : "text-red-600", bg: closureRate >= 70 ? "bg-emerald-50 dark:bg-emerald-950/30" : closureRate >= 50 ? "bg-amber-50 dark:bg-amber-950/30" : "bg-red-50 dark:bg-red-950/30" },
        ].map((kpi, i) => (
          <Card key={i} className={`p-4 border-border/30 ${kpi.bg}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted-foreground font-medium">{kpi.label}</span>
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
            </div>
            <p className={`text-lg font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* DSO Monthly Line Chart */}
        <Card className="p-4 border-border/30">
          <h3 className="text-sm font-bold text-foreground mb-3">📈 DSO شهرياً — آخر 12 شهر</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dsoMonthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => [`${v} يوم`, "DSO"]} />
              <Line type="monotone" dataKey="dso" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              {/* Target line at 30 */}
              <Line type="monotone" dataKey={() => 30} stroke="#10b981" strokeWidth={1} strokeDasharray="5 5" dot={false} name="المستهدف" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Aging Pie Chart */}
        <Card className="p-4 border-border/30">
          <h3 className="text-sm font-bold text-foreground mb-3">📊 توزيع الذمم بالشرائح</h3>
          {agingPie.length === 0 ? (
            <div className="flex items-center justify-center h-[220px] text-muted-foreground text-xs">لا توجد ذمم مفتوحة</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={agingPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {agingPie.map((_, idx) => <Cell key={idx} fill={AGING_COLORS[idx % AGING_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmtAmt(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top 5 Receivables */}
        <Card className="border-border/30 overflow-hidden">
          <div className="p-3 border-b border-border/30 bg-accent/20">
            <h3 className="text-sm font-bold text-foreground">💰 أعلى 5 ذمم بالمبلغ</h3>
          </div>
          <div className="divide-y divide-border/30">
            {top5.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">لا توجد ذمم مفتوحة</p>
            ) : top5.map((c, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-accent/10 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-bold">{i + 1}</span>
                  <span className="text-sm font-medium text-foreground">{c.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold font-mono text-red-600">{fmtAmt(c.total)}</span>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => sendWhatsApp(c.name, "", c.total, "")}>
                    <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Upcoming 5 Due */}
        <Card className="border-border/30 overflow-hidden">
          <div className="p-3 border-b border-border/30 bg-accent/20">
            <h3 className="text-sm font-bold text-foreground">📅 أقرب 5 استحقاقات خلال 7 أيام</h3>
          </div>
          <div className="divide-y divide-border/30">
            {upcoming5.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">لا توجد استحقاقات قريبة</p>
            ) : upcoming5.map((inv, i) => {
              const remaining = inv.remaining_amount ?? (inv.total_amount - (inv.paid_amount || 0));
              const daysLeft = differenceInDays(new Date(inv.due_date), today);
              return (
                <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-accent/10 transition-colors">
                  <div>
                    <span className="text-sm font-medium text-foreground">{inv.contact_name || "—"}</span>
                    <span className="text-[10px] text-muted-foreground mr-2">{inv.invoice_number}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${daysLeft <= 2 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}>
                      {daysLeft === 0 ? "اليوم" : `${daysLeft} يوم`}
                    </span>
                    <span className="text-sm font-bold font-mono">{fmtAmt(remaining)}</span>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => sendWhatsApp(inv.contact_name || "", inv.invoice_number || "", remaining, inv.due_date)}>
                      <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
