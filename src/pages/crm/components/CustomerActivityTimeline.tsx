// Unified timeline: merges CRM activities + invoices + payments into one chronological feed.
// Read-only.

import { FileText, DollarSign } from "lucide-react";
import { fmtDateDisplay } from "@/lib/utils";
import type { CrmActivity } from "../types";
import { ACTIVITY_META } from "../types";

const fmt = (n: number) => new Intl.NumberFormat("ar", { maximumFractionDigits: 0 }).format(n);

export interface InvoiceLite {
  id: string;
  invoice_number?: string | null;
  invoice_date: string;
  total_amount: number;
  status: string;
  invoice_type?: string | null;
}

export interface PaymentLite {
  id: string;
  voucher_date: string;
  amount: number;
  voucher_number?: string | null;
}

interface Props {
  activities: CrmActivity[];
  invoices: InvoiceLite[];
  payments: PaymentLite[];
  limit?: number;
}

type TimelineItem = {
  id: string;
  date: string;
  kind: "activity" | "invoice" | "payment";
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  tone: string;
  bg: string;
};

export default function CustomerActivityTimeline({ activities, invoices, payments, limit = 30 }: Props) {
  const items: TimelineItem[] = [];

  for (const a of activities) {
    const meta = ACTIVITY_META[a.activity_type] ?? ACTIVITY_META.note;
    const date = a.completed_at ?? a.due_date ?? a.scheduled_at ?? a.created_at;
    items.push({
      id: `act-${a.id}`,
      date,
      kind: "activity",
      title: a.title,
      subtitle: a.description ?? undefined,
      icon: <span className="text-base leading-none">{meta.icon}</span>,
      tone: meta.color,
      bg: "#F8FAFC",
    });
  }

  for (const inv of invoices) {
    items.push({
      id: `inv-${inv.id}`,
      date: inv.invoice_date,
      kind: "invoice",
      title: `فاتورة ${inv.invoice_number ?? ""} — ${fmt(Number(inv.total_amount || 0))} ₪`,
      subtitle: inv.status === "paid" ? "مدفوعة" : inv.status === "partial" ? "مدفوعة جزئياً" : "غير مدفوعة",
      icon: <FileText className="h-4 w-4" />,
      tone: "#0369A1",
      bg: "#E0F2FE",
    });
  }

  for (const p of payments) {
    items.push({
      id: `pay-${p.id}`,
      date: p.voucher_date,
      kind: "payment",
      title: `دفعة مستلمة — ${fmt(Number(p.amount || 0))} ₪`,
      subtitle: p.voucher_number ?? undefined,
      icon: <DollarSign className="h-4 w-4" />,
      tone: "#15803D",
      bg: "#DCFCE7",
    });
  }

  const sorted = items
    .filter((i) => i.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);

  if (sorted.length === 0) {
    return (
      <p className="text-[12px] text-slate-400 text-center py-6">لا يوجد نشاط بعد</p>
    );
  }

  return (
    <ol className="relative border-r-2 border-slate-100 pr-4 space-y-3">
      {sorted.map((item) => (
        <li key={item.id} className="relative">
          <span
            className="absolute right-[-25px] top-1 h-6 w-6 rounded-full border-2 border-white flex items-center justify-center"
            style={{ background: item.bg, color: item.tone }}
          >
            {item.icon}
          </span>
          <div className="bg-white border border-slate-100 rounded-lg p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12px] font-semibold text-slate-900 flex-1 truncate">{item.title}</div>
              <div className="text-[10px] text-slate-400 shrink-0">{fmtDateDisplay(item.date)}</div>
            </div>
            {item.subtitle && (
              <div className="text-[11px] text-slate-500 mt-0.5 truncate">{item.subtitle}</div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
