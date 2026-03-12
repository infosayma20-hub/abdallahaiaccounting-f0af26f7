import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";

interface Props {
  contact: any;
  transactions: any[];
  cheques: any[];
}

const getColorClass = (value: number, thresholds: [number, number]) => {
  if (value <= thresholds[0]) return "text-emerald-600";
  if (value <= thresholds[1]) return "text-amber-600";
  return "text-red-600";
};

const getCreditScore = (avgDays: number, complianceRate: number) => {
  if (avgDays < 30 && complianceRate > 80) return { grade: "A", label: "زبون ممتاز 🟢", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40" };
  if (avgDays <= 45 && complianceRate >= 60) return { grade: "B", label: "زبون جيد 🟡", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40" };
  if (avgDays <= 60 && complianceRate >= 40) return { grade: "C", label: "يحتاج متابعة 🟠", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40" };
  return { grade: "D", label: "خطر ائتماني 🔴", color: "bg-red-100 text-red-700 dark:bg-red-900/40" };
};

const ReceivablesAnalysisTab = ({ contact, transactions, cheques }: Props) => {
  const paymentTermsDays = contact.payment_terms_days || 30;

  // Compute invoice and payment data
  const analysisData = useMemo(() => {
    const invoices = transactions.filter(tx =>
      tx.transaction_type?.includes('sale') || tx.transaction_type?.includes('فاتورة')
    );
    const receipts = transactions.filter(tx =>
      tx.transaction_type?.includes('receipt') || tx.transaction_type?.includes('قبض')
    );

    // Simple matching: pair invoices with receipts by date order
    let collectionDaysArr: number[] = [];
    let daysLateArr: number[] = [];
    let onTimeCount = 0;
    let totalInvoiceCount = invoices.length;
    let paidInvoiceCount = 0;

    // For behavior chart (last 12 invoices)
    let behaviorData: { ref: string; days: number; late: boolean }[] = [];

    // Simplified: for each invoice, find matching receipt
    const receiptsCopy = [...receipts];
    invoices.forEach(inv => {
      const invDate = new Date(inv.transaction_date);
      const dueDate = new Date(invDate);
      dueDate.setDate(dueDate.getDate() + paymentTermsDays);

      // Find a receipt after this invoice
      const matchIdx = receiptsCopy.findIndex(r => new Date(r.transaction_date) >= invDate);
      if (matchIdx >= 0) {
        const receipt = receiptsCopy.splice(matchIdx, 1)[0];
        const payDate = new Date(receipt.transaction_date);
        const collDays = Math.max(0, Math.round((payDate.getTime() - invDate.getTime()) / 86400000));
        const lateDays = Math.max(0, Math.round((payDate.getTime() - dueDate.getTime()) / 86400000));

        collectionDaysArr.push(collDays);
        if (lateDays > 0) daysLateArr.push(lateDays);
        if (payDate <= dueDate) onTimeCount++;
        paidInvoiceCount++;

        behaviorData.push({
          ref: inv.reference || `INV-${behaviorData.length + 1}`,
          days: collDays,
          late: payDate > dueDate,
        });
      }
    });

    const avgCollectionDays = collectionDaysArr.length > 0
      ? Math.round(collectionDaysArr.reduce((a, b) => a + b, 0) / collectionDaysArr.length)
      : 0;

    const avgDaysLate = daysLateArr.length > 0
      ? Math.round(daysLateArr.reduce((a, b) => a + b, 0) / daysLateArr.length)
      : 0;

    const complianceRate = totalInvoiceCount > 0
      ? Math.round((onTimeCount / totalInvoiceCount) * 100)
      : 0;

    // Check days average
    const checkPayments = cheques.filter(c => c.party_name === contact.contact_name);
    const checkDaysArr = checkPayments.map(c => {
      const checkDate = new Date(c.cheque_date);
      const created = new Date(c.created_at);
      return Math.max(0, Math.round((checkDate.getTime() - created.getTime()) / 86400000));
    });
    const avgCheckDays = checkDaysArr.length > 0
      ? Math.round(checkDaysArr.reduce((a, b) => a + b, 0) / checkDaysArr.length)
      : -1;

    // Aging buckets
    const unpaidInvoices = invoices.filter(inv => {
      const totalPaid = receipts.reduce((s, r) => s + (r.amount || 0), 0);
      return true; // We'll compute aging from raw unpaid balance
    });

    const today = new Date();
    let aging = { current: 0, d31_60: 0, d61_90: 0, d90plus: 0, currentCount: 0, d31_60Count: 0, d61_90Count: 0, d90plusCount: 0 };

    // Build aging from unpaid invoices (balance > 0)
    const totalSales = invoices.reduce((s, i) => s + (i.amount || 0), 0);
    const totalPaid = receipts.reduce((s, r) => s + (r.amount || 0), 0);
    const remainingBalance = Math.max(0, totalSales - totalPaid);

    // Distribute remaining among oldest invoices
    let remaining = remainingBalance;
    const sortedInvoices = [...invoices].sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime());
    
    sortedInvoices.forEach(inv => {
      if (remaining <= 0) return;
      const invAmount = Math.min(remaining, inv.amount || 0);
      remaining -= invAmount;
      if (invAmount <= 0) return;

      const invDate = new Date(inv.transaction_date);
      const dueDate = new Date(invDate);
      dueDate.setDate(dueDate.getDate() + paymentTermsDays);
      const daysOverdue = Math.max(0, Math.round((today.getTime() - dueDate.getTime()) / 86400000));

      if (daysOverdue <= 0) { aging.current += invAmount; aging.currentCount++; }
      else if (daysOverdue <= 30) { aging.d31_60 += invAmount; aging.d31_60Count++; }
      else if (daysOverdue <= 60) { aging.d61_90 += invAmount; aging.d61_90Count++; }
      else { aging.d90plus += invAmount; aging.d90plusCount++; }
    });

    const agingTotal = aging.current + aging.d31_60 + aging.d61_90 + aging.d90plus;
    const agingTotalCount = aging.currentCount + aging.d31_60Count + aging.d61_90Count + aging.d90plusCount;

    return {
      avgCollectionDays,
      avgDaysLate,
      avgCheckDays,
      complianceRate,
      aging,
      agingTotal,
      agingTotalCount,
      behaviorData: behaviorData.slice(-12),
      checkPayments,
      creditScore: getCreditScore(avgCollectionDays, complianceRate),
    };
  }, [transactions, cheques, contact, paymentTermsDays]);

  const { avgCollectionDays, avgDaysLate, avgCheckDays, complianceRate, aging, agingTotal, agingTotalCount, behaviorData, checkPayments, creditScore } = analysisData;

  const contactCheques = cheques.filter(c => c.party_name === contact.contact_name);

  return (
    <div className="space-y-5">
      {/* Credit Score Badge */}
      <div className="flex items-center gap-3">
        <Badge className={`text-sm px-4 py-1.5 ${creditScore.color}`}>
          التصنيف الائتماني: [{creditScore.grade}] {creditScore.label}
        </Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">متوسط أيام السداد</p>
            <p className={`text-lg font-bold tabular-nums ${getColorClass(avgCollectionDays, [30, 60])}`}>
              {avgCollectionDays} <span className="text-xs font-normal">يوم</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">متوسط أيام التأخر</p>
            <p className={`text-lg font-bold tabular-nums ${getColorClass(avgDaysLate, [0, 15])}`}>
              {avgDaysLate} <span className="text-xs font-normal">يوم</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">متوسط أيام الشيكات</p>
            <p className={`text-lg font-bold tabular-nums ${avgCheckDays < 0 ? 'text-muted-foreground' : getColorClass(avgCheckDays, [30, 60])}`}>
              {avgCheckDays < 0 ? "لا توجد شيكات" : <>{avgCheckDays} <span className="text-xs font-normal">يوم</span></>}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">نسبة الالتزام بالسداد</p>
            <p className={`text-lg font-bold tabular-nums ${complianceRate > 80 ? 'text-emerald-600' : complianceRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
              {complianceRate}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Aging Table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">جدول تعمير الذمم</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#0D1B2A] text-white">
                  <th className="p-3 text-right font-semibold">الشريحة</th>
                  <th className="p-3 text-right font-semibold">المبلغ</th>
                  <th className="p-3 text-right font-semibold">عدد الفواتير</th>
                  <th className="p-3 text-right font-semibold">% من الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "جارية (0-30 يوم)", amount: aging.current, count: aging.currentCount, cls: "bg-emerald-50 dark:bg-emerald-950/20" },
                  { label: "31 - 60 يوم", amount: aging.d31_60, count: aging.d31_60Count, cls: "" },
                  { label: "61 - 90 يوم", amount: aging.d61_90, count: aging.d61_90Count, cls: "bg-amber-50 dark:bg-amber-950/20" },
                  { label: "+90 يوم", amount: aging.d90plus, count: aging.d90plusCount, cls: "bg-red-50 dark:bg-red-950/20" },
                ].map((row, i) => (
                  <tr key={i} className={`border-b ${row.cls}`}>
                    <td className="p-3 text-xs font-medium">{row.label}</td>
                    <td className="p-3 text-xs font-semibold tabular-nums">₪{row.amount.toLocaleString()}</td>
                    <td className="p-3 text-xs tabular-nums">{row.count}</td>
                    <td className="p-3 text-xs tabular-nums">{agingTotal > 0 ? Math.round((row.amount / agingTotal) * 100) : 0}%</td>
                  </tr>
                ))}
                <tr className="bg-muted/50 font-bold">
                  <td className="p-3 text-xs">الإجمالي</td>
                  <td className="p-3 text-xs tabular-nums">₪{agingTotal.toLocaleString()}</td>
                  <td className="p-3 text-xs tabular-nums">{agingTotalCount}</td>
                  <td className="p-3 text-xs">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Behavior Chart */}
      {behaviorData.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">تحليل سلوك الدفع (آخر 12 فاتورة)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={behaviorData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <XAxis type="number" label={{ value: "أيام السداد", position: "insideBottom", offset: -5 }} />
                <YAxis type="category" dataKey="ref" width={80} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: number) => [`${value} يوم`, "أيام السداد"]} />
                <ReferenceLine x={paymentTermsDays} stroke="#6B7280" strokeDasharray="5 5" label={{ value: `${paymentTermsDays} يوم`, fontSize: 10, fill: "#6B7280" }} />
                <Bar dataKey="days" radius={[0, 4, 4, 0]}>
                  {behaviorData.map((entry, index) => (
                    <Cell key={index} fill={entry.late ? "#EF4444" : "#10B981"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Cheques Report */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">تقرير الشيكات</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#0D1B2A] text-white">
                  <th className="p-3 text-right font-semibold">رقم الشيك</th>
                  <th className="p-3 text-right font-semibold">تاريخ الإصدار</th>
                  <th className="p-3 text-right font-semibold">تاريخ الشيك</th>
                  <th className="p-3 text-right font-semibold">أيام الشيك</th>
                  <th className="p-3 text-right font-semibold">المبلغ</th>
                  <th className="p-3 text-right font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {contactCheques.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد شيكات مسجلة</td></tr>
                ) : contactCheques.map(cheque => {
                  const created = new Date(cheque.created_at);
                  const chequeDate = new Date(cheque.cheque_date);
                  const chequeDays = Math.round((chequeDate.getTime() - created.getTime()) / 86400000);
                  const statusConfig: Record<string, { label: string; cls: string }> = {
                    "محصل": { label: "محصّل", cls: "bg-emerald-100 text-emerald-700" },
                    "برسم التحصيل": { label: "معلق", cls: "bg-amber-100 text-amber-700" },
                    "مرتجع": { label: "مرتجع", cls: "bg-red-100 text-red-700" },
                    "صادر": { label: "صادر", cls: "bg-blue-100 text-blue-700" },
                    "مدفوع": { label: "مدفوع", cls: "bg-emerald-100 text-emerald-700" },
                  };
                  const st = statusConfig[cheque.status] || { label: cheque.status, cls: "bg-muted" };
                  return (
                    <tr key={cheque.id} className="border-b hover:bg-muted/20">
                      <td className="p-3 text-xs font-mono">{cheque.cheque_number || "—"}</td>
                      <td className="p-3 text-xs tabular-nums">{created.toLocaleDateString('en-GB')}</td>
                      <td className="p-3 text-xs tabular-nums">{chequeDate.toLocaleDateString('en-GB')}</td>
                      <td className="p-3 text-xs tabular-nums">{chequeDays} يوم</td>
                      <td className="p-3 text-xs font-semibold tabular-nums">₪{(cheque.amount || 0).toLocaleString()}</td>
                      <td className="p-3"><Badge className={`text-[10px] ${st.cls}`}>{st.label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReceivablesAnalysisTab;
