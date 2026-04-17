// Invoices tab — list with status, amount, due date, paid amount.

import { useNavigate } from "react-router-dom";
import { fmtDateDisplay } from "@/lib/utils";

const fmt = (n: number) => new Intl.NumberFormat("ar", { maximumFractionDigits: 0 }).format(n);

export interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  paid_amount: number;
  status: string;
  invoice_type?: string | null;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  paid:      { label: "مدفوعة",       color: "#15803D", bg: "#DCFCE7" },
  partial:   { label: "مدفوعة جزئياً", color: "#A16207", bg: "#FEF3C7" },
  unpaid:    { label: "غير مدفوعة",   color: "#0369A1", bg: "#E0F2FE" },
  overdue:   { label: "متأخرة",       color: "#B91C1C", bg: "#FEE2E2" },
  draft:     { label: "مسودة",        color: "#525252", bg: "#F5F5F4" },
  cancelled: { label: "ملغاة",        color: "#525252", bg: "#F5F5F4" },
};

export default function CustomerInvoicesList({ invoices }: { invoices: InvoiceRow[] }) {
  const navigate = useNavigate();
  const today = new Date().toISOString().split("T")[0];

  if (invoices.length === 0) {
    return <p className="text-[12px] text-slate-400 text-center py-6">لا توجد فواتير لهذا العميل</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-slate-500 border-b border-slate-100">
            <th className="text-right py-2 px-2 font-semibold">رقم</th>
            <th className="text-right py-2 px-2 font-semibold">التاريخ</th>
            <th className="text-right py-2 px-2 font-semibold">الاستحقاق</th>
            <th className="text-left py-2 px-2 font-semibold">المبلغ</th>
            <th className="text-left py-2 px-2 font-semibold">المدفوع</th>
            <th className="text-center py-2 px-2 font-semibold">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const isOverdue = inv.status !== "paid" && inv.due_date && inv.due_date < today;
            const statusKey = isOverdue ? "overdue" : inv.status;
            const meta = STATUS_META[statusKey] ?? STATUS_META.unpaid;
            const remaining = Number(inv.total_amount || 0) - Number(inv.paid_amount || 0);

            return (
              <tr
                key={inv.id}
                onClick={() => navigate(`/invoices/${inv.id}`)}
                className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer"
              >
                <td className="py-2 px-2 font-bold text-slate-700">{inv.invoice_number ?? "—"}</td>
                <td className="py-2 px-2 text-slate-600">{fmtDateDisplay(inv.invoice_date)}</td>
                <td className={`py-2 px-2 ${isOverdue ? "text-red-700 font-bold" : "text-slate-600"}`}>
                  {inv.due_date ? fmtDateDisplay(inv.due_date) : "—"}
                </td>
                <td className="py-2 px-2 text-left font-bold text-slate-900">{fmt(Number(inv.total_amount || 0))} ₪</td>
                <td className="py-2 px-2 text-left text-emerald-700">
                  {fmt(Number(inv.paid_amount || 0))} ₪
                  {remaining > 0 && (
                    <div className="text-[10px] text-red-600">باقٍ: {fmt(remaining)}</div>
                  )}
                </td>
                <td className="py-2 px-2 text-center">
                  <span
                    className="inline-block px-2 py-0.5 rounded text-[10px] font-bold"
                    style={{ background: meta.bg, color: meta.color }}
                  >
                    {meta.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
