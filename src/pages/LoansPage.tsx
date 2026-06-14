import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useCompany } from "@/hooks/useCompanyContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Download, Wallet, Users, Calendar, CheckCircle2, Clock, ChevronDown, ChevronUp, Plus, Search, UserCheck, Printer, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import BackButton from "@/components/BackButton";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import LoanAttachments from "@/components/hr/LoanAttachments";
import { multiWordMatchAny } from "@/lib/utils";

import { setNextExportBranding } from "@/lib/excel-export";
const fmtCurrency = (v: number) => `${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪`;

interface Employee {
  id: string;
  full_name: string;
  job_title: string | null;
}

export default function LoansPage() {
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingLoan, setEditingLoan] = useState<any | null>(null);
  const [payingLoanId, setPayingLoanId] = useState<string | null>(null);

  // Quick action: mark the next pending installment as paid
  const handleMarkNextPaid = async (loan: any) => {
    const installments = (loan.loan_installments || []).slice().sort(
      (a: any, b: any) => a.month_number - b.month_number
    );
    const nextPending = installments.find((i: any) => i.status === "pending");
    if (!nextPending) {
      toast.info("لا يوجد قسط معلق لهذا القرض");
      return;
    }
    const confirmMsg =
      `تأشير القسط رقم ${nextPending.month_number} بقيمة ${fmtCurrency(Number(nextPending.installment_amount))} كمدفوع؟\n` +
      `(${loan.employees?.full_name || ""})`;
    if (!window.confirm(confirmMsg)) return;

    setPayingLoanId(loan.id);
    try {
      const today = new Date().toISOString().split("T")[0];
      const { error: instErr } = await supabase
        .from("loan_installments")
        .update({ status: "paid", paid_date: today })
        .eq("id", nextPending.id);
      if (instErr) throw instErr;

      const newPaidMonths = Number(loan.paid_months || 0) + 1;
      const newRemaining = Math.max(
        0,
        Number(loan.remaining_amount || 0) - Number(nextPending.installment_amount)
      );
      const isCompleted = newPaidMonths >= Number(loan.total_months || 0) || newRemaining === 0;

      const { error: loanErr } = await supabase
        .from("employee_loans")
        .update({
          paid_months: newPaidMonths,
          remaining_amount: newRemaining,
          status: isCompleted ? "completed" : "active",
        })
        .eq("id", loan.id);
      if (loanErr) throw loanErr;

      toast.success(
        `تم تأشير قسط ${nextPending.month_number} كمدفوع` +
        (isCompleted ? " — اكتمل سداد القرض ✓" : "")
      );
      queryClient.invalidateQueries({ queryKey: ["employee-loans"] });
    } catch (err: any) {
      console.error("Mark paid error:", err);
      toast.error(err.message || "تعذّر تأشير القسط");
    } finally {
      setPayingLoanId(null);
    }
  };

  const { data: loans = [], isLoading } = useQuery({
    queryKey: ["employee-loans", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("employee_loans")
        .select("*, employees(full_name, job_title, branches(name)), loan_installments(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const filtered = useMemo(() => {
    if (statusFilter === "الكل") return loans;
    if (statusFilter === "active") return loans.filter((l: any) => l.status === "active");
    if (statusFilter === "completed") return loans.filter((l: any) => l.status === "completed");
    return loans;
  }, [loans, statusFilter]);

  const totalActive = useMemo(() =>
    loans.filter((l: any) => l.status === "active").reduce((s: number, l: any) => s + Number(l.remaining_amount), 0)
  , [loans]);

  const totalOriginal = useMemo(() =>
    loans.filter((l: any) => l.status === "active").reduce((s: number, l: any) => s + Number(l.total_amount), 0)
  , [loans]);

  const thisMonthDue = useMemo(() => {
    const now = new Date();
    const m = now.getMonth() + 1;
    const y = now.getFullYear();
    return loans.reduce((sum: number, l: any) => {
      const inst = (l.loan_installments || []).find((i: any) => {
        const d = new Date(i.due_date);
        return d.getMonth() + 1 === m && d.getFullYear() === y && i.status === "pending";
      });
      return sum + (inst ? Number(inst.installment_amount) : 0);
    }, 0);
  }, [loans]);

  const activeCount = loans.filter((l: any) => l.status === "active").length;

  const exportExcel = () => {
    const rows = filtered.map((l: any) => ({
      "الموظف": l.employees?.full_name || "-",
      "المبلغ الإجمالي": Number(l.total_amount),
      "القسط الشهري": Number(l.monthly_installment),
      "الأقساط المدفوعة": l.paid_months,
      "إجمالي الأقساط": l.total_months,
      "المتبقي": Number(l.remaining_amount),
      "الحالة": l.status === "active" ? "نشط" : "مكتمل",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "القروض");
    setNextExportBranding({ title: "القروض" });
    XLSX.writeFile(wb, "قروض_الموظفين.xlsx");
  };

  const handlePrint = () => {
    const activeLoans = loans.filter((l: any) => l.status === "active");
    if (!activeLoans.length) { toast.error("لا توجد قروض نشطة للطباعة"); return; }

    const companyName = company?.name || "الشركة";
    const companyLogo = company?.logo_url || "";
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-GB");
    const reportNum = `LR-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const summaryRows = activeLoans.map((l: any, i: number) => {
      const inst = l.loan_installments || [];
      const paid = inst.filter((x: any) => x.status === "paid").length;
      const paidAmt = inst.filter((x: any) => x.status === "paid").reduce((s: number, x: any) => s + Number(x.installment_amount), 0);
      const startDate = l.start_date || inst[0]?.due_date || "-";
      const endDate = inst.length ? inst[inst.length - 1]?.due_date : "-";
      return `<tr>
        <td style="text-align:center">${i + 1}</td>
        <td style="font-weight:600">${l.employees?.full_name || "-"}</td>
        <td>${l.employees?.branches?.name || "-"}</td>
        <td style="text-align:left">${Number(l.total_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
        <td style="text-align:left">${Number(l.monthly_installment).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
        <td style="text-align:center">${l.total_months} شهر</td>
        <td style="text-align:left">${paidAmt.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
        <td style="text-align:left">${Number(l.remaining_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
        <td style="text-align:center">${startDate}</td>
        <td style="text-align:center">${endDate}</td>
      </tr>`;
    }).join("");

    const totalAmt = activeLoans.reduce((s: number, l: any) => s + Number(l.total_amount), 0);
    const totalRemaining = activeLoans.reduce((s: number, l: any) => s + Number(l.remaining_amount), 0);
    const totalPaid = totalAmt - totalRemaining;

    const detailSections = activeLoans.map((l: any) => {
      const inst = l.loan_installments || [];
      const sorted = [...inst].sort((a: any, b: any) => a.month_number - b.month_number);
      let runningBalance = Number(l.total_amount);

      const instRows = sorted.map((x: any) => {
        if (x.status === "paid") runningBalance -= Number(x.installment_amount);
        const statusLabel = x.status === "paid"
          ? '<span style="color:#059669;font-weight:600">✓ مدفوع</span>'
          : x.status === "pending"
            ? '<span style="color:#D97706">قادم</span>'
            : '<span style="color:#6B7280">—</span>';
        return `<tr>
          <td style="text-align:center">${x.month_number}</td>
          <td style="text-align:center">${x.due_date}</td>
          <td style="text-align:left">${Number(x.installment_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
          <td style="text-align:left">${Math.max(0, runningBalance).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
          <td style="text-align:center">${statusLabel}</td>
        </tr>`;
      }).join("");

      const paidCount = inst.filter((x: any) => x.status === "paid").length;
      const pct = l.total_months > 0 ? Math.round((paidCount / l.total_months) * 100) : 0;

      return `
        <div style="page-break-inside:avoid;margin-top:28px">
          <div style="background:#f0f2f5;border-radius:8px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <div>
              <span style="font-weight:700;font-size:14px">${l.employees?.full_name || "-"}</span>
              <span style="color:#6B7280;font-size:11px;margin-right:12px">${l.employees?.branches?.name || ""}</span>
            </div>
            <div style="font-size:11px;color:#6B7280">
              القرض: <strong>${Number(l.total_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })} ₪</strong>
              &nbsp;|&nbsp; المدفوع: ${paidCount} من ${l.total_months}
              &nbsp;|&nbsp; الإنجاز: <strong>${pct}%</strong>
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead>
              <tr style="background:#1B3A5C;color:#fff">
                <th style="padding:6px 8px;text-align:center">الشهر</th>
                <th style="padding:6px 8px;text-align:center">تاريخ القسط</th>
                <th style="padding:6px 8px;text-align:left">القسط</th>
                <th style="padding:6px 8px;text-align:left">الرصيد المتبقي</th>
                <th style="padding:6px 8px;text-align:center">الحالة</th>
              </tr>
            </thead>
            <tbody>${instRows}</tbody>
          </table>
        </div>
      `;
    }).join("");

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <title>تقرير القروض الحسنة</title>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    @page { size: A4; margin: 15mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; direction: rtl; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; }
    thead th { font-weight: 600; }
    tbody tr:nth-child(even) { background: #fafbfc; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <!-- HEADER -->
  <div style="background:#1B3A5C;color:#fff;padding:20px 28px;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0">
    <div>
      <div style="font-size:20px;font-weight:700">تقرير القروض الحسنة</div>
      <div style="font-size:11px;opacity:.6;margin-top:2px">INTEREST-FREE LOANS REPORT</div>
    </div>
    <div style="text-align:left;display:flex;align-items:center;gap:12px">
      ${companyLogo ? `<img src="${companyLogo}" style="height:40px;border-radius:6px" />` : ""}
      <div>
        <div style="font-size:15px;font-weight:700">${companyName}</div>
      </div>
    </div>
  </div>
  <div style="height:3px;background:#4A9EE8"></div>

  <!-- META -->
  <div style="display:flex;justify-content:space-between;padding:14px 28px;font-size:11px;color:#6B7280;border-bottom:1px solid #eee">
    <span>تاريخ الإصدار: <strong style="color:#1a1a1a">${dateStr}</strong></span>
    <span>رقم التقرير: <strong style="color:#1a1a1a">${reportNum}</strong></span>
    <span>عدد القروض النشطة: <strong style="color:#1a1a1a">${activeLoans.length}</strong></span>
    <span>أعده: <strong style="color:#1a1a1a">${user?.email || "—"}</strong></span>
  </div>

  <!-- KPI CARDS -->
  <div style="padding:20px 28px 0;display:flex;gap:12px;flex-wrap:wrap">
    <div style="flex:1;min-width:140px;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;text-align:center">
      <div style="font-size:10px;color:#6B7280;margin-bottom:4px">إجمالي القروض النشطة</div>
      <div style="font-size:16px;font-weight:700;color:#1B3A5C">₪ ${totalAmt.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
    </div>
    <div style="flex:1;min-width:140px;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;text-align:center">
      <div style="font-size:10px;color:#6B7280;margin-bottom:4px">المتبقي للسداد</div>
      <div style="font-size:16px;font-weight:700;color:#D97706">₪ ${totalRemaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
    </div>
    <div style="flex:1;min-width:140px;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;text-align:center">
      <div style="font-size:10px;color:#6B7280;margin-bottom:4px">المدفوع</div>
      <div style="font-size:16px;font-weight:700;color:#059669">₪ ${totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
    </div>
    <div style="flex:1;min-width:140px;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;text-align:center">
      <div style="font-size:10px;color:#6B7280;margin-bottom:4px">عدد القروض النشطة</div>
      <div style="font-size:16px;font-weight:700;color:#1B3A5C">${activeLoans.length}</div>
    </div>
  </div>

   <!-- SUMMARY TABLE -->
   <div style="padding:20px 28px">
    <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;color:#1B3A5C">📋 ملخص القروض النشطة</h3>
    <table style="font-size:11px">
      <thead>
        <tr style="background:#1B3A5C;color:#fff">
          <th style="text-align:center;padding:8px">#</th>
          <th style="padding:8px">الموظف</th>
          <th style="padding:8px">الفرع</th>
          <th style="padding:8px;text-align:left">قيمة القرض</th>
          <th style="padding:8px;text-align:left">القسط</th>
          <th style="padding:8px;text-align:center">المدة</th>
          <th style="padding:8px;text-align:left">المدفوع</th>
          <th style="padding:8px;text-align:left">المتبقي</th>
          <th style="padding:8px;text-align:center">بداية السداد</th>
          <th style="padding:8px;text-align:center">نهاية السداد</th>
        </tr>
      </thead>
      <tbody>${summaryRows}</tbody>
      <tfoot>
        <tr style="background:#1B3A5C;color:#fff;font-weight:700">
          <td colspan="3" style="padding:8px">الإجمالي</td>
          <td style="text-align:left;padding:8px">${totalAmt.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
          <td style="padding:8px"></td>
          <td style="padding:8px"></td>
          <td style="text-align:left;padding:8px">${totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
          <td style="text-align:left;padding:8px">${totalRemaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
          <td colspan="2" style="padding:8px"></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- DETAIL SECTIONS -->
  <div style="padding:0 28px 20px">
    <h3 style="font-size:14px;font-weight:700;margin-bottom:6px;color:#1B3A5C">📊 تفاصيل جداول السداد</h3>
    ${detailSections}
  </div>

  <!-- SIGNATURES -->
  <div style="display:flex;justify-content:space-between;padding:40px 28px 20px;margin-top:30px;border-top:1px solid #e5e7eb;page-break-inside:avoid">
    ${["مدير الموارد البشرية", "المدير المالي", "المدير العام"].map(t => `
      <div style="text-align:center;width:30%">
        <div style="border-bottom:1px solid #ccc;height:50px"></div>
        <div style="font-size:11px;color:#6B7280;margin-top:6px">${t}</div>
      </div>
    `).join("")}
  </div>

  <!-- FOOTER -->
  <div style="background:#f7f8fa;padding:10px 28px;display:flex;justify-content:space-between;font-size:10px;color:#6B7280;border-top:1px solid #eee;margin-top:20px">
    <span>طُبع بتاريخ ${dateStr}</span>
    <span style="color:#4A9EE8;font-weight:600">${companyName}</span>
    <span>صفحة 1</span>
  </div>
</body>
</html>`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    /* view only — no browser print */
  };

  const handlePrintSingle = (loan: any) => {
    const companyName = company?.name || "الشركة";
    const companyLogo = company?.logo_url || "";
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-GB");
    const inst = loan.loan_installments || [];
    const sorted = [...inst].sort((a: any, b: any) => a.month_number - b.month_number);
    const paidCount = inst.filter((x: any) => x.status === "paid").length;
    const paidAmt = inst.filter((x: any) => x.status === "paid").reduce((s: number, x: any) => s + Number(x.installment_amount), 0);
    const pct = loan.total_months > 0 ? Math.round((paidCount / loan.total_months) * 100) : 0;
    let runningBalance = Number(loan.total_amount);

    const instRows = sorted.map((x: any) => {
      if (x.status === "paid") runningBalance -= Number(x.installment_amount);
      const statusLabel = x.status === "paid"
        ? '<span style="color:#059669;font-weight:600">✓ مدفوع</span>'
        : '<span style="color:#D97706">معلق</span>';
      return `<tr>
        <td style="text-align:center">${x.month_number}</td>
        <td style="text-align:center">${x.due_date}</td>
        <td style="text-align:left">${Number(x.installment_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })} ₪</td>
        <td style="text-align:left">${Math.max(0, runningBalance).toLocaleString("en-US", { minimumFractionDigits: 2 })} ₪</td>
        <td style="text-align:center">${statusLabel}</td>
      </tr>`;
    }).join("");

    const startDate = loan.first_payment_date || loan.start_date || sorted[0]?.due_date || "-";
    const endDate = loan.last_payment_date || (sorted.length ? sorted[sorted.length - 1]?.due_date : "-");

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <title>قرض حسن - ${loan.employees?.full_name || ""}</title>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    @page { size: A4; margin: 15mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; direction: rtl; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
    thead th { font-weight: 600; }
    tbody tr:nth-child(even) { background: #fafbfc; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <!-- HEADER -->
  <div style="background:#1B3A5C;color:#fff;padding:20px 28px;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0">
    <div>
      <div style="font-size:20px;font-weight:700">كشف قرض حسن</div>
      <div style="font-size:11px;opacity:.6;margin-top:2px">INTEREST-FREE LOAN STATEMENT</div>
    </div>
    <div style="text-align:left;display:flex;align-items:center;gap:12px">
      ${companyLogo ? `<img src="${companyLogo}" style="height:40px;border-radius:6px" />` : ""}
      <div><div style="font-size:15px;font-weight:700">${companyName}</div></div>
    </div>
  </div>
  <div style="height:3px;background:#4A9EE8"></div>

  <!-- META -->
  <div style="display:flex;justify-content:space-between;padding:14px 28px;font-size:11px;color:#6B7280;border-bottom:1px solid #eee">
    <span>تاريخ الطباعة: <strong style="color:#1a1a1a">${dateStr}</strong></span>
    <span>الحالة: <strong style="color:${loan.status === "active" ? "#059669" : "#6B7280"}">${loan.status === "active" ? "نشط" : "مكتمل"}</strong></span>
  </div>

  <!-- EMPLOYEE INFO -->
  <div style="padding:20px 28px">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:20px">
      <div>
        <div style="font-size:10px;color:#6B7280;margin-bottom:2px">اسم الموظف</div>
        <div style="font-size:14px;font-weight:700">${loan.employees?.full_name || "-"}</div>
      </div>
      <div>
        <div style="font-size:10px;color:#6B7280;margin-bottom:2px">الوظيفة / الفرع</div>
        <div style="font-size:14px;font-weight:600">${loan.employees?.job_title || ""} ${loan.employees?.branches?.name ? `- ${loan.employees.branches.name}` : ""}</div>
      </div>
    </div>

    <!-- LOAN SUMMARY -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
      <div style="background:#f0f2f5;border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:10px;color:#6B7280">مبلغ القرض</div>
        <div style="font-size:15px;font-weight:700;color:#1B3A5C">${Number(loan.total_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })} ₪</div>
      </div>
      <div style="background:#f0f2f5;border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:10px;color:#6B7280">القسط الشهري</div>
        <div style="font-size:15px;font-weight:700;color:#1B3A5C">${Number(loan.monthly_installment).toLocaleString("en-US", { minimumFractionDigits: 2 })} ₪</div>
      </div>
      <div style="background:#f0f2f5;border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:10px;color:#6B7280">المدفوع</div>
        <div style="font-size:15px;font-weight:700;color:#059669">${paidAmt.toLocaleString("en-US", { minimumFractionDigits: 2 })} ₪</div>
      </div>
      <div style="background:#f0f2f5;border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:10px;color:#6B7280">المتبقي</div>
        <div style="font-size:15px;font-weight:700;color:#DC2626">${Number(loan.remaining_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })} ₪</div>
      </div>
    </div>

    <!-- PROGRESS -->
    <div style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#6B7280;margin-bottom:4px">
        <span>${paidCount} من ${loan.total_months} قسط</span>
        <span>بداية: ${startDate} — نهاية: ${endDate}</span>
        <span>${pct}%</span>
      </div>
      <div style="background:#e5e7eb;border-radius:4px;height:8px;overflow:hidden">
        <div style="background:#059669;height:100%;width:${pct}%;border-radius:4px"></div>
      </div>
    </div>

    <!-- INSTALLMENTS TABLE -->
    <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;color:#1B3A5C">📋 جدول الأقساط</h3>
    <table style="font-size:11px">
      <thead>
        <tr style="background:#1B3A5C;color:#fff">
          <th style="padding:8px;text-align:center">القسط</th>
          <th style="padding:8px;text-align:center">تاريخ الاستحقاق</th>
          <th style="padding:8px;text-align:left">المبلغ</th>
          <th style="padding:8px;text-align:left">الرصيد المتبقي</th>
          <th style="padding:8px;text-align:center">الحالة</th>
        </tr>
      </thead>
      <tbody>${instRows}</tbody>
    </table>

    ${loan.notes ? `<div style="margin-top:16px;padding:10px;background:#fffbeb;border-radius:6px;font-size:11px;color:#92400e">📝 ملاحظات: ${loan.notes}</div>` : ""}
  </div>

  <!-- SIGNATURES -->
  <div style="display:flex;justify-content:space-between;padding:40px 28px 20px;margin-top:30px;border-top:1px solid #e5e7eb;page-break-inside:avoid">
    ${["الموظف", "مدير الموارد البشرية", "المدير المالي"].map(t => `
      <div style="text-align:center;width:30%">
        <div style="border-bottom:1px solid #ccc;height:50px"></div>
        <div style="font-size:11px;color:#6B7280;margin-top:6px">${t}</div>
      </div>
    `).join("")}
  </div>

  <!-- FOOTER -->
  <div style="background:#f7f8fa;padding:10px 28px;display:flex;justify-content:space-between;font-size:10px;color:#6B7280;border-top:1px solid #eee;margin-top:20px">
    <span>طُبع بتاريخ ${dateStr}</span>
    <span style="color:#4A9EE8;font-weight:600">${companyName}</span>
    <span>قرض حسن - ${loan.employees?.full_name || ""}</span>
  </div>
</body>
</html>`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    /* view only — no browser print */
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1200px] mx-auto pb-10" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl font-bold text-foreground">القروض الحسنة</h1>
            <p className="text-xs text-muted-foreground">إدارة قروض الموظفين وجداول السداد</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={!loans.filter((l: any) => l.status === "active").length}>
            <Printer className="h-4 w-4 ml-1" /> طباعة
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={!filtered.length}>
            <Download className="h-4 w-4 ml-1" /> Excel
          </Button>
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 ml-1" /> قرض جديد
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="h-4 w-4 text-primary" />
            <span className="text-[10px] text-muted-foreground">إجمالي القروض النشطة</span>
          </div>
          <p className="text-sm font-bold text-foreground">{fmtCurrency(totalOriginal)}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-[10px] text-muted-foreground">المتبقي للسداد</span>
          </div>
          <p className="text-sm font-bold text-foreground">{fmtCurrency(totalActive)}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="h-4 w-4 text-blue-500" />
            <span className="text-[10px] text-muted-foreground">مستحق هذا الشهر</span>
          </div>
          <p className="text-sm font-bold text-foreground">{fmtCurrency(thisMonthDue)}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-emerald-500" />
            <span className="text-[10px] text-muted-foreground">عدد القروض النشطة</span>
          </div>
          <p className="text-sm font-bold text-foreground">{activeCount}</p>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="الكل">الكل</SelectItem>
            <SelectItem value="active">نشط</SelectItem>
            <SelectItem value="completed">مكتمل</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loan Cards */}
      {isLoading ? (
        <Card className="p-8 text-center text-muted-foreground">جاري التحميل...</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">لا توجد قروض</Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((loan: any) => {
            const progress = loan.total_months > 0 ? (loan.paid_months / loan.total_months) * 100 : 0;
            const isExpanded = expandedLoan === loan.id;
            const installments = (loan.loan_installments || []).sort((a: any, b: any) => a.month_number - b.month_number);
            const createdAtStr = loan.created_at
              ? new Date(loan.created_at).toLocaleDateString("en-GB")
              : "-";

            return (
              <Card key={loan.id} className="overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedLoan(isExpanded ? null : loan.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm text-foreground">{loan.employees?.full_name || "-"}</span>
                        <Badge variant={loan.status === "active" ? "default" : "secondary"} className={`text-[10px] ${loan.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                          {loan.status === "active" ? "نشط" : "مكتمل"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span>{loan.employees?.branches?.name || "-"}</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          أُنشئ: {createdAtStr}
                        </span>
                      </div>
                    </div>
                    <div className="text-left flex items-center gap-2">
                      <div>
                        <p className="text-sm font-bold text-foreground">{fmtCurrency(Number(loan.remaining_amount))}</p>
                        <p className="text-[10px] text-muted-foreground">متبقي من {fmtCurrency(Number(loan.total_amount))}</p>
                      </div>
                      {loan.status === "active" && installments.some((i: any) => i.status === "pending") && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px] gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/40 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                          disabled={payingLoanId === loan.id}
                          onClick={(e) => { e.stopPropagation(); handleMarkNextPaid(loan); }}
                          title="تأشير القسط التالي كمدفوع"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {payingLoanId === loan.id ? "جاري…" : "سداد القسط"}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); setEditingLoan(loan); }}
                        title="تعديل القرض"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                      <span>{loan.paid_months} من {loan.total_months} قسط</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                    <div className="bg-muted/40 rounded p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">القسط الشهري</p>
                      <p className="font-semibold text-foreground">{fmtCurrency(Number(loan.monthly_installment))}</p>
                    </div>
                    <div className="bg-muted/40 rounded p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">بداية السداد</p>
                      <p className="font-semibold text-foreground">{loan.first_payment_date}</p>
                    </div>
                    <div className="bg-muted/40 rounded p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">نهاية السداد</p>
                      <p className="font-semibold text-foreground">{loan.last_payment_date}</p>
                    </div>
                  </div>
                </div>

                {isExpanded && installments.length > 0 && (
                  <div className="border-t border-border">
                    <div className="p-3 bg-muted/20">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold text-muted-foreground">جدول الأقساط</h4>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); handlePrintSingle(loan); }}>
                          <Printer className="h-3.5 w-3.5" /> طباعة القرض
                        </Button>
                      </div>
                      <div className="space-y-1.5">
                        {installments.map((inst: any) => (
                          <div key={inst.id} className={`flex items-center justify-between p-2 rounded text-xs ${inst.status === "paid" ? "bg-emerald-50 dark:bg-emerald-900/10" : "bg-background"}`}>
                            <div className="flex items-center gap-2">
                              {inst.status === "paid" ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                              <span className="text-muted-foreground">قسط {inst.month_number}</span>
                              <span className="text-muted-foreground">{inst.due_date}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-foreground">{fmtCurrency(Number(inst.installment_amount))}</span>
                              <span className="text-[10px] text-muted-foreground">رصيد: {fmtCurrency(Number(inst.balance_after))}</span>
                              <Badge variant={inst.status === "paid" ? "default" : "outline"} className={`text-[9px] ${inst.status === "paid" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : ""}`}>
                                {inst.status === "paid" ? "مدفوع" : "معلق"}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {loan.notes && (
                      <div className="px-3 pb-3 text-xs text-muted-foreground">
                        📝 {loan.notes}
                      </div>
                    )}
                    <LoanAttachments loanId={loan.id} userId={user?.id || ""} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Loan Dialog */}
      <AddLoanDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        userId={dataOwnerId || user?.id || ""}
        companyId={company?.id || null}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["employee-loans"] });
          setShowAddDialog(false);
        }}
      />

      {/* Edit Loan Dialog */}
      {editingLoan && (
        <EditLoanDialog
          loan={editingLoan}
          open={!!editingLoan}
          onOpenChange={(v) => { if (!v) setEditingLoan(null); }}
          userId={dataOwnerId || user?.id || ""}
          companyId={company?.id || null}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["employee-loans"] });
            setEditingLoan(null);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────
// Add Loan Dialog
// ─────────────────────────────────────────────────
function AddLoanDialog({ open, onOpenChange, userId, companyId, onSuccess }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  companyId: string | null;
  onSuccess: () => void;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empSearch, setEmpSearch] = useState("");
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [showEmpDrop, setShowEmpDrop] = useState(false);

  const [totalAmount, setTotalAmount] = useState("");
  const [monthlyInstallment, setMonthlyInstallment] = useState("");
  const [firstPaymentDate, setFirstPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Cash boxes
  const [cashBoxes, setCashBoxes] = useState<{ id: string; name: string; gl_account_code: string | null }[]>([]);
  const [selectedCashBox, setSelectedCashBox] = useState("");

  // Derived
  const amount = parseFloat(totalAmount) || 0;
  const installment = parseFloat(monthlyInstallment) || 0;
  const totalMonths = installment > 0 ? Math.ceil(amount / installment) : 0;
  const lastInstallment = installment > 0 && totalMonths > 0 ? amount - installment * (totalMonths - 1) : 0;

  // Generate schedule preview
  const schedule = useMemo(() => {
    if (!amount || !installment || !firstPaymentDate) return [];
    const items = [];
    let balance = amount;
    const startDate = new Date(firstPaymentDate);

    for (let i = 0; i < totalMonths; i++) {
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      const inst = i === totalMonths - 1 ? lastInstallment : installment;
      balance -= inst;
      items.push({
        month_number: i + 1,
        due_date: dueDate.toISOString().split("T")[0],
        installment_amount: Math.round(inst * 100) / 100,
        balance_after: Math.max(0, Math.round(balance * 100) / 100),
      });
    }
    return items;
  }, [amount, installment, totalMonths, lastInstallment, firstPaymentDate]);

  const lastPaymentDate = schedule.length > 0 ? schedule[schedule.length - 1].due_date : firstPaymentDate;

  // Load employees & cash boxes
  useEffect(() => {
    if (!userId || !open) return;
    Promise.all([
      supabase.from("employees").select("id, full_name, job_title").eq("user_id", userId).eq("is_active", true).order("full_name"),
      supabase.from("cash_boxes").select("id, name, gl_account_code").eq("user_id", userId).eq("is_active", true),
    ]).then(([empRes, cbRes]) => {
      setEmployees(empRes.data || []);
      const boxes = cbRes.data || [];
      setCashBoxes(boxes);
      if (boxes.length && !selectedCashBox) setSelectedCashBox(boxes[0].id);
    });
  }, [userId, open]);

  const filteredEmps = useMemo(() => {
    if (!empSearch.trim()) return employees.slice(0, 10);
    return employees.filter(e => multiWordMatchAny(empSearch, e.full_name)).slice(0, 10);
  }, [employees, empSearch]);

  const resetForm = () => {
    setSelectedEmp(null);
    setEmpSearch("");
    setTotalAmount("");
    setMonthlyInstallment("");
    setFirstPaymentDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    if (cashBoxes.length) setSelectedCashBox(cashBoxes[0].id);
  };

  const handleSave = async () => {
    if (!selectedEmp || amount <= 0 || installment <= 0 || !firstPaymentDate) {
      toast.error("الرجاء تعبئة جميع الحقول المطلوبة");
      return;
    }
    if (installment > amount) {
      toast.error("القسط الشهري لا يمكن أن يتجاوز مبلغ القرض");
      return;
    }

    setSaving(true);
    try {
      // 1. Find or create employee account under 2180
      let empAccountCode = "";
      const empAccName = `ذمم موظف - ${selectedEmp.full_name}`;
      const { data: existingAcc } = await supabase
        .from("accounts")
        .select("account_code")
        .eq("user_id", userId)
        .eq("parent_code", "2180")
        .or(`account_name.eq.${empAccName},account_name.ilike.%${selectedEmp.full_name}%`)
        .limit(1)
        .maybeSingle();

      if (existingAcc) {
        empAccountCode = existingAcc.account_code;
      } else {
        // Get next available code under 2180
        const { data: siblings } = await supabase
          .from("accounts")
          .select("account_code")
          .eq("user_id", userId)
          .eq("parent_code", "2180")
          .order("account_code", { ascending: false })
          .limit(1);

        const lastCode = siblings?.[0]?.account_code || "21800";
        const nextNum = parseInt(lastCode) + 1;
        empAccountCode = String(nextNum);

        await supabase.from("accounts").insert({
          user_id: userId,
          account_code: empAccountCode,
          account_name: empAccName,
          account_type: "التزامات",
          parent_code: "2180",
          is_active: true,
          is_system: false,
        });
      }

      // 2. Create loan record
      const { data: loanRecord, error: loanErr } = await supabase
        .from("employee_loans")
        .insert({
          user_id: userId,
          company_id: companyId,
          employee_id: selectedEmp.id,
          total_amount: amount,
          monthly_installment: installment,
          total_months: totalMonths,
          paid_months: 0,
          remaining_amount: amount,
          first_payment_date: firstPaymentDate,
          last_payment_date: lastPaymentDate,
          status: "active",
          notes: notes || `قرض حسن - ${selectedEmp.full_name}`,
        })
        .select()
        .single();

      if (loanErr) throw loanErr;

      // 3. Create installment schedule
      const installments = schedule.map(inst => ({
        loan_id: loanRecord.id,
        user_id: userId,
        company_id: companyId,
        employee_id: selectedEmp.id,
        month_number: inst.month_number,
        due_date: inst.due_date,
        installment_amount: inst.installment_amount,
        balance_after: inst.balance_after,
        status: "pending",
      }));

      const { error: instErr } = await supabase
        .from("loan_installments")
        .insert(installments);

      if (instErr) throw instErr;

      // 4. Create accounting entry: Debit employee account (2180.x), Credit selected cash box
      const selectedBox = cashBoxes.find(cb => cb.id === selectedCashBox);
      const creditAccountCode = selectedBox?.gl_account_code || "1110";
      const creditLabel = selectedBox?.name || "الصندوق";

      const idempotencyKey = `LOAN-${loanRecord.id}`;
      const { error: txErr } = await supabase
        .from("transactions")
        .insert({
          user_id: userId,
          transaction_date: new Date().toISOString().split("T")[0],
          description: `قرض حسن - ${selectedEmp.full_name} - مبلغ ${fmtCurrency(amount)} - من ${creditLabel}`,
          debit_account_code: empAccountCode,
          credit_account_code: creditAccountCode,
          amount: amount,
          currency: "شيكل",
          transaction_type: "loan_disbursement",
          reference: `LOAN-${loanRecord.id.slice(0, 8)}`,
          payment_method: "نقدي",
          idempotency_key: idempotencyKey,
        });

      if (txErr) throw txErr;

      toast.success(`تم إنشاء قرض حسن لـ ${selectedEmp.full_name} بنجاح`);
      resetForm();
      onSuccess();
    } catch (err: any) {
      console.error("Loan creation error:", err);
      toast.error(err.message || "حدث خطأ أثناء إنشاء القرض");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Wallet className="h-5 w-5 text-primary" />
            قرض حسن جديد
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Employee Selection */}
          <div className="relative">
            <Label className="text-xs mb-1.5 block">الموظف *</Label>
            <div className="relative">
              <UserCheck className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={selectedEmp ? selectedEmp.full_name : empSearch}
                onChange={e => { setEmpSearch(e.target.value); setSelectedEmp(null); setShowEmpDrop(true); }}
                onFocus={() => setShowEmpDrop(true)}
                placeholder="ابحث عن موظف..."
                className="pr-9"
              />
            </div>
            {showEmpDrop && !selectedEmp && (
              <div className="absolute z-50 top-full mt-1 w-full bg-card border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {filteredEmps.map(emp => (
                  <button key={emp.id} onClick={() => { setSelectedEmp(emp); setEmpSearch(""); setShowEmpDrop(false); }}
                    className="w-full text-right px-4 py-2.5 hover:bg-secondary transition-colors flex items-center justify-between">
                    <span className="text-sm">{emp.full_name}</span>
                    <span className="text-xs text-muted-foreground">{emp.job_title || ""}</span>
                  </button>
                ))}
                {filteredEmps.length === 0 && <p className="text-center py-3 text-xs text-muted-foreground">لا توجد نتائج</p>}
              </div>
            )}
          </div>

          {selectedEmp && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs">
              <span className="text-muted-foreground">الموظف: </span>
              <span className="font-bold text-foreground">{selectedEmp.full_name}</span>
              {selectedEmp.job_title && <span className="text-muted-foreground mr-2">({selectedEmp.job_title})</span>}
            </div>
          )}

          {/* Loan Details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">مبلغ القرض *</Label>
              <div className="relative">
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₪</span>
                <Input
                  type="number"
                  value={totalAmount}
                  onChange={e => setTotalAmount(e.target.value)}
                  className="pr-8 text-left font-mono"
                  placeholder="0.00"
                  min="0"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">القسط الشهري *</Label>
              <div className="relative">
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₪</span>
                <Input
                  type="number"
                  value={monthlyInstallment}
                  onChange={e => setMonthlyInstallment(e.target.value)}
                  className="pr-8 text-left font-mono"
                  placeholder="0.00"
                  min="0"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">تاريخ أول قسط *</Label>
              <Input type="date" value={firstPaymentDate} onChange={e => setFirstPaymentDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">عدد الأقساط</Label>
              <Input value={totalMonths || "-"} readOnly className="bg-muted/30 font-bold text-center" />
            </div>
          </div>

          {/* Cash Box Selection */}
          <div>
            <Label className="text-xs mb-1.5 block">الصرف من صندوق *</Label>
            <Select value={selectedCashBox} onValueChange={setSelectedCashBox}>
              <SelectTrigger><SelectValue placeholder="اختر الصندوق" /></SelectTrigger>
              <SelectContent>
                {cashBoxes.map(cb => (
                  <SelectItem key={cb.id} value={cb.id}>{cb.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Derived Info */}
          {amount > 0 && installment > 0 && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-muted/40 rounded-lg p-2 text-center">
                <p className="text-[10px] text-muted-foreground">إجمالي القرض</p>
                <p className="font-bold text-foreground">{fmtCurrency(amount)}</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-2 text-center">
                <p className="text-[10px] text-muted-foreground">آخر قسط</p>
                <p className="font-bold text-foreground">{fmtCurrency(lastInstallment)}</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-2 text-center">
                <p className="text-[10px] text-muted-foreground">تاريخ الانتهاء</p>
                <p className="font-bold text-foreground">{lastPaymentDate}</p>
              </div>
            </div>
          )}

          {/* Schedule Preview */}
          {schedule.length > 0 && (
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" />
                معاينة جدول الأقساط ({schedule.length} قسط)
              </div>
              <div className="max-h-48 overflow-y-auto">
                {schedule.map((inst, idx) => (
                  <div key={idx} className={`flex items-center justify-between px-3 py-2 text-xs ${idx % 2 === 0 ? "bg-background" : "bg-muted/10"}`}>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">{inst.month_number}</span>
                      <span className="text-muted-foreground">{inst.due_date}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{fmtCurrency(inst.installment_amount)}</span>
                      <span className="text-[10px] text-muted-foreground">رصيد: {fmtCurrency(inst.balance_after)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs mb-1.5 block">ملاحظات</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات اختيارية..." rows={2} />
          </div>

          {/* Accounting Info */}
          {selectedEmp && amount > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-xs space-y-1">
              <p className="font-semibold text-blue-700 dark:text-blue-400">📋 القيد المحاسبي الذي سيتم إنشاؤه:</p>
              <div className="flex justify-between">
                <span>مدين: ذمم {selectedEmp.full_name} (2180.x)</span>
                <span className="font-mono font-bold">{fmtCurrency(amount)}</span>
              </div>
              <div className="flex justify-between">
                <span>دائن: {cashBoxes.find(cb => cb.id === selectedCashBox)?.name || "الصندوق"} ({cashBoxes.find(cb => cb.id === selectedCashBox)?.gl_account_code || "1110"})</span>
                <span className="font-mono font-bold">{fmtCurrency(amount)}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }} disabled={saving}>
              إلغاء
            </Button>
            <Button onClick={handleSave} disabled={saving || !selectedEmp || amount <= 0 || installment <= 0}>
              {saving ? "جاري الحفظ..." : "إنشاء القرض"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────
// Edit Loan Dialog
// ─────────────────────────────────────────────────
function EditLoanDialog({ loan, open, onOpenChange, userId, companyId, onSuccess }: {
  loan: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  companyId: string | null;
  onSuccess: () => void;
}) {
  const paidMonths = Number(loan.paid_months || 0);
  const hasPaid = paidMonths > 0;
  const fullEdit = !hasPaid;

  const [totalAmount, setTotalAmount] = useState(String(loan.total_amount ?? ""));
  const [monthlyInstallment, setMonthlyInstallment] = useState(String(loan.monthly_installment ?? ""));
  const [firstPaymentDate, setFirstPaymentDate] = useState(loan.first_payment_date || "");
  const [notes, setNotes] = useState(loan.notes || "");
  const [saving, setSaving] = useState(false);

  const amount = parseFloat(totalAmount) || 0;
  const installment = parseFloat(monthlyInstallment) || 0;
  const totalMonths = installment > 0 ? Math.ceil(amount / installment) : 0;
  const lastInstallment = installment > 0 && totalMonths > 0 ? amount - installment * (totalMonths - 1) : 0;

  const schedule = useMemo(() => {
    if (!fullEdit) return [];
    if (!amount || !installment || !firstPaymentDate) return [];
    const items = [];
    let balance = amount;
    const startDate = new Date(firstPaymentDate);
    for (let i = 0; i < totalMonths; i++) {
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      const inst = i === totalMonths - 1 ? lastInstallment : installment;
      balance -= inst;
      items.push({
        month_number: i + 1,
        due_date: dueDate.toISOString().split("T")[0],
        installment_amount: Math.round(inst * 100) / 100,
        balance_after: Math.max(0, Math.round(balance * 100) / 100),
      });
    }
    return items;
  }, [amount, installment, totalMonths, lastInstallment, firstPaymentDate, fullEdit]);

  const lastPaymentDate = schedule.length > 0 ? schedule[schedule.length - 1].due_date : firstPaymentDate;

  const handleSave = async () => {
    setSaving(true);
    try {
      if (fullEdit) {
        if (amount <= 0 || installment <= 0 || !firstPaymentDate) {
          toast.error("الرجاء تعبئة جميع الحقول المطلوبة");
          setSaving(false);
          return;
        }
        if (installment > amount) {
          toast.error("القسط الشهري لا يمكن أن يتجاوز مبلغ القرض");
          setSaving(false);
          return;
        }

        // 1. Update loan
        const { error: upErr } = await supabase
          .from("employee_loans")
          .update({
            total_amount: amount,
            monthly_installment: installment,
            total_months: totalMonths,
            remaining_amount: amount,
            first_payment_date: firstPaymentDate,
            last_payment_date: lastPaymentDate,
            notes,
          })
          .eq("id", loan.id);
        if (upErr) throw upErr;

        // 2. Wipe & recreate installments (safe: paid_months = 0)
        const { error: delErr } = await supabase
          .from("loan_installments")
          .delete()
          .eq("loan_id", loan.id);
        if (delErr) throw delErr;

        const newRows = schedule.map(inst => ({
          loan_id: loan.id,
          user_id: userId,
          company_id: companyId,
          employee_id: loan.employee_id,
          month_number: inst.month_number,
          due_date: inst.due_date,
          installment_amount: inst.installment_amount,
          balance_after: inst.balance_after,
          status: "pending",
        }));
        const { error: insErr } = await supabase.from("loan_installments").insert(newRows);
        if (insErr) throw insErr;

        // 3. Update disbursement transaction amount (matched via idempotency_key)
        const idempotencyKey = `LOAN-${loan.id}`;
        await supabase
          .from("transactions")
          .update({ amount })
          .eq("idempotency_key", idempotencyKey)
          .eq("user_id", userId);

        toast.success("تم تحديث القرض وإعادة توليد الجدول");
      } else {
        // Restricted edit: notes only (financial fields locked once paid)
        const { error } = await supabase
          .from("employee_loans")
          .update({ notes })
          .eq("id", loan.id);
        if (error) throw error;
        toast.success("تم تحديث الملاحظات");
      }
      onSuccess();
    } catch (err: any) {
      console.error("Loan update error:", err);
      toast.error(err.message || "حدث خطأ أثناء التحديث");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Pencil className="h-5 w-5 text-primary" />
            تعديل القرض — {loan.employees?.full_name || ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {hasPaid && (
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-400">
              ⚠️ هذا القرض تم سداد {paidMonths} قسط منه. لحماية السلامة المحاسبية، لا يمكن تعديل المبلغ أو القسط أو التواريخ. يمكنك تعديل الملاحظات فقط.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">مبلغ القرض</Label>
              <div className="relative">
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₪</span>
                <Input
                  type="number"
                  value={totalAmount}
                  onChange={e => setTotalAmount(e.target.value)}
                  className="pr-8 text-left font-mono"
                  disabled={!fullEdit}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">القسط الشهري</Label>
              <div className="relative">
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₪</span>
                <Input
                  type="number"
                  value={monthlyInstallment}
                  onChange={e => setMonthlyInstallment(e.target.value)}
                  className="pr-8 text-left font-mono"
                  disabled={!fullEdit}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">تاريخ أول قسط</Label>
              <Input
                type="date"
                value={firstPaymentDate}
                onChange={e => setFirstPaymentDate(e.target.value)}
                disabled={!fullEdit}
              />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">عدد الأقساط</Label>
              <Input value={fullEdit ? (totalMonths || "-") : loan.total_months} readOnly className="bg-muted/30 font-bold text-center" />
            </div>
          </div>

          {fullEdit && amount > 0 && installment > 0 && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-muted/40 rounded-lg p-2 text-center">
                <p className="text-[10px] text-muted-foreground">آخر قسط</p>
                <p className="font-bold text-foreground">{fmtCurrency(lastInstallment)}</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-2 text-center">
                <p className="text-[10px] text-muted-foreground">تاريخ الانتهاء</p>
                <p className="font-bold text-foreground">{lastPaymentDate}</p>
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs mb-1.5 block">ملاحظات</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>

          {fullEdit && (
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-400">
              ℹ️ سيتم إعادة توليد جدول الأقساط وتحديث قيد الصرف بالمبلغ الجديد.
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
