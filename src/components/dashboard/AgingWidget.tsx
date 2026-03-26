import { useState } from "react";
import type { AgingBucket } from "@/hooks/useDashboardData";
import WidgetBanner from "./WidgetBanner";

interface Props {
  receivables: AgingBucket[];
  payables: AgingBucket[];
  loading: boolean;
}

function fmt(v: number): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default function AgingWidget({ receivables, payables, loading }: Props) {
  const [tab, setTab] = useState<"recv" | "pay">("recv");
  const data = tab === "recv" ? receivables : payables;

  const totals = data.reduce(
    (acc, d) => ({
      b0: acc.b0 + d.bucket_0_30,
      b30: acc.b30 + d.bucket_31_60,
      b60: acc.b60 + d.bucket_61_90,
      b90: acc.b90 + d.bucket_90_plus,
    }),
    { b0: 0, b30: 0, b60: 0, b90: 0 }
  );

  if (loading) {
    return (
      <div className="col-span-12 lg:col-span-4 bg-card rounded-2xl p-5 shadow-sm border border-border/30 animate-pulse">
        <div className="h-6 w-32 bg-muted rounded mb-4" />
        <div className="h-[200px] bg-muted rounded-xl" />
      </div>
    );
  }

  return (
    <div className="col-span-12 lg:col-span-4 bg-card rounded-2xl p-5 shadow-sm border border-border/30">
      <WidgetBanner title="أعمار الذمم" icon="📊">
        <div className="flex bg-white/10 rounded-lg p-0.5">
          <button onClick={() => setTab("recv")} className={`px-3 py-1 rounded-md text-[10px] transition-all ${tab === "recv" ? "bg-white/20 shadow-sm text-white" : "text-white/50"}`}>
            مدينون (لك)
          </button>
          <button onClick={() => setTab("pay")} className={`px-3 py-1 rounded-md text-[10px] transition-all ${tab === "pay" ? "bg-white/20 shadow-sm text-white" : "text-white/50"}`}>
            دائنون (عليك)
          </button>
        </div>
      </WidgetBanner>

      {data.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-xs">لا توجد ذمم حالياً</div>
      ) : (
        <>
          {/* Stacked bars */}
          <div className="space-y-2 mb-4">
            {data.slice(0, 5).map((item) => {
              const total = item.total || 1;
              return (
                <div key={item.contactId} className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-foreground font-medium truncate max-w-[60%]">{item.contactName}</span>
                    <span className="text-muted-foreground tabular-nums" style={{ fontFamily: "JetBrains Mono" }}>₪{fmt(item.total)}</span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden flex bg-secondary/30">
                    {item.bucket_0_30 > 0 && <div className="bg-emerald-500/70 h-full" style={{ width: `${(item.bucket_0_30 / total) * 100}%` }} />}
                    {item.bucket_31_60 > 0 && <div className="bg-amber-500/70 h-full" style={{ width: `${(item.bucket_31_60 / total) * 100}%` }} />}
                    {item.bucket_61_90 > 0 && <div className="bg-orange-500/70 h-full" style={{ width: `${(item.bucket_61_90 / total) * 100}%` }} />}
                    {item.bucket_90_plus > 0 && <div className="bg-red-500/70 h-full" style={{ width: `${(item.bucket_90_plus / total) * 100}%` }} />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Buckets summary */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "0-30", sublabel: "جديد", value: totals.b0, color: "bg-emerald-500/10 text-emerald-600" },
              { label: "31-60", sublabel: "تأخير", value: totals.b30, color: "bg-amber-500/10 text-amber-600" },
              { label: "61-90", sublabel: "خطر", value: totals.b60, color: "bg-orange-500/10 text-orange-600" },
              { label: "+90", sublabel: "حرج", value: totals.b90, color: "bg-red-500/10 text-red-500" },
            ].map((b) => (
              <div key={b.label} className={`rounded-xl p-2 text-center ${b.color}`}>
                <p className="text-[9px] font-bold">{b.label} يوم</p>
                <p className="text-[10px] font-bold tabular-nums" style={{ fontFamily: "JetBrains Mono" }}>₪{fmt(b.value)}</p>
                <p className="text-[8px] opacity-70">{b.sublabel}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
