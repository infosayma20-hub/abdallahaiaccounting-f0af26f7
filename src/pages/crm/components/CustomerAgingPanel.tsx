// Aging buckets for receivables: current, 1-30, 31-60, 61-90, 90+.

import type { InvoiceRow } from "./CustomerInvoicesList";

const fmt = (n: number) => new Intl.NumberFormat("ar", { maximumFractionDigits: 0 }).format(n);

interface Bucket {
  label: string;
  amount: number;
  count: number;
  color: string;
  bg: string;
}

export default function CustomerAgingPanel({ invoices }: { invoices: InvoiceRow[] }) {
  const today = new Date();
  const buckets: Bucket[] = [
    { label: "غير مستحق",     amount: 0, count: 0, color: "#0369A1", bg: "#E0F2FE" },
    { label: "1 - 30 يوم",   amount: 0, count: 0, color: "#A16207", bg: "#FEF3C7" },
    { label: "31 - 60 يوم",  amount: 0, count: 0, color: "#C2410C", bg: "#FFEDD5" },
    { label: "61 - 90 يوم",  amount: 0, count: 0, color: "#B91C1C", bg: "#FEE2E2" },
    { label: "أكثر من 90",    amount: 0, count: 0, color: "#7F1D1D", bg: "#FCA5A5" },
  ];

  for (const inv of invoices) {
    if (inv.status === "paid" || inv.status === "cancelled") continue;
    const remaining = Number(inv.total_amount || 0) - Number(inv.paid_amount || 0);
    if (remaining <= 0) continue;

    if (!inv.due_date) {
      buckets[0].amount += remaining;
      buckets[0].count += 1;
      continue;
    }
    const due = new Date(inv.due_date);
    const days = Math.floor((today.getTime() - due.getTime()) / 86400000);
    let idx = 0;
    if (days <= 0) idx = 0;
    else if (days <= 30) idx = 1;
    else if (days <= 60) idx = 2;
    else if (days <= 90) idx = 3;
    else idx = 4;
    buckets[idx].amount += remaining;
    buckets[idx].count += 1;
  }

  const total = buckets.reduce((s, b) => s + b.amount, 0);

  return (
    <div>
      <h4 className="text-[12px] font-bold text-slate-700 mb-2">أعمار الذمم</h4>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {buckets.map((b) => {
          const pct = total > 0 ? (b.amount / total) * 100 : 0;
          return (
            <div
              key={b.label}
              className="rounded-lg border p-2.5"
              style={{ background: b.bg, borderColor: b.color + "40" }}
            >
              <div className="text-[10px] font-semibold" style={{ color: b.color }}>{b.label}</div>
              <div className="text-[14px] font-bold mt-1" style={{ color: b.color }}>{fmt(b.amount)} ₪</div>
              <div className="text-[10px] mt-0.5 opacity-70" style={{ color: b.color }}>
                {b.count} فاتورة · {pct.toFixed(0)}٪
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
