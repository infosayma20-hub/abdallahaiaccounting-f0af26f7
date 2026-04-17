// 4-tile financial snapshot driven by Customer360 hook.
// Pure presentation; no data fetching.

import type { LiveFinancials } from "../lib/policyEngine";
import { fmtDateDisplay } from "@/lib/utils";

const fmt = (n: number) => new Intl.NumberFormat("ar", { maximumFractionDigits: 0 }).format(n);

interface Props {
  financials: LiveFinancials | null;
  loading?: boolean;
  effectiveLimit?: number;
}

export default function CustomerFinancialSummary({ financials, loading, effectiveLimit = 0 }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-3 animate-pulse">
            <div className="h-3 w-16 bg-slate-100 rounded" />
            <div className="h-5 w-20 bg-slate-200 rounded mt-2" />
          </div>
        ))}
      </div>
    );
  }

  if (!financials) return null;

  const overduePct = financials.outstanding > 0
    ? (financials.overdue / financials.outstanding) * 100
    : 0;
  const utilization = effectiveLimit > 0
    ? (financials.outstanding / effectiveLimit) * 100
    : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Tile
        label="الرصيد المستحق"
        value={`${fmt(financials.outstanding)} ₪`}
        sub={effectiveLimit > 0 ? `${utilization.toFixed(0)}٪ من السقف` : "بدون سقف ائتمان"}
        tone={utilization >= 80 ? "warn" : "default"}
      />
      <Tile
        label="الرصيد المتأخر"
        value={`${fmt(financials.overdue)} ₪`}
        sub={financials.overdue > 0 ? `${overduePct.toFixed(0)}٪ من المستحق` : "لا يوجد متأخر"}
        tone={financials.overdue > 0 ? "danger" : "good"}
      />
      <Tile
        label="مبيعات السنة"
        value={`${fmt(financials.total_ytd)} ₪`}
        sub={`${financials.invoices_count} فاتورة`}
        tone="good"
      />
      <Tile
        label="آخر فاتورة"
        value={financials.last_sale_date ? fmtDateDisplay(financials.last_sale_date) : "—"}
        sub={financials.last_sale_date ? daysAgo(financials.last_sale_date) : "بدون نشاط"}
        tone="default"
      />
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "default" | "good" | "warn" | "danger" }) {
  const valueClass =
    tone === "danger" ? "text-red-700" :
    tone === "warn" ? "text-amber-700" :
    tone === "good" ? "text-emerald-700" :
    "text-slate-900";

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={`text-base font-bold mt-1 ${valueClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function daysAgo(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return "اليوم";
  if (days === 1) return "أمس";
  if (days < 30) return `قبل ${days} يوم`;
  if (days < 365) return `قبل ${Math.floor(days / 30)} شهر`;
  return `قبل ${Math.floor(days / 365)} سنة`;
}
