import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ChequeItem } from "@/hooks/useDashboardData";
import WidgetBanner from "./WidgetBanner";

interface Props {
  cheques: ChequeItem[];
  loading: boolean;
}

function fmt(v: number): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default function ChequesCalendarWidget({ cheques, loading }: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"in" | "out">("in");

  const filtered = cheques.filter((c) => tab === "in" ? c.chequeType === "وارد" : c.chequeType === "صادر");
  const thisWeek = filtered.filter((c) => c.daysRemaining >= 0 && c.daysRemaining <= 7);
  const weekTotal = thisWeek.reduce((s, c) => s + c.amount, 0);

  if (loading) {
    return (
      <div className="col-span-12 lg:col-span-4 bg-card rounded-2xl p-5 shadow-sm border border-border/30 animate-pulse">
        <div className="h-6 w-32 bg-muted rounded mb-4" />
        {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted rounded-lg mb-2" />)}
      </div>
    );
  }

  return (
    <div className="col-span-12 lg:col-span-4 bg-card rounded-2xl p-5 shadow-sm border border-border/30">
      <WidgetBanner title="الشيكات القادمة" icon="🗓️">
        <div className="flex bg-white/10 rounded-lg p-0.5">
          <button onClick={() => setTab("in")} className={`px-2 py-1 rounded-md text-[10px] transition-all ${tab === "in" ? "bg-white/20 shadow-sm text-white" : "text-white/50"}`}>واردة</button>
          <button onClick={() => setTab("out")} className={`px-2 py-1 rounded-md text-[10px] transition-all ${tab === "out" ? "bg-white/20 shadow-sm text-white" : "text-white/50"}`}>صادرة</button>
        </div>
      </WidgetBanner>

      <div className="space-y-1.5 max-h-[240px] overflow-y-auto mb-3">
        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground text-xs py-6">لا توجد شيكات قادمة</p>
        ) : (
          filtered.map((c) => {
            const dateColor = c.daysRemaining <= 0 ? "bg-red-500 text-white" : c.daysRemaining <= 7 ? "bg-amber-500 text-white" : "bg-primary/10 text-primary";
            const daysLabel = c.daysRemaining <= 0 ? "اليوم!" : c.daysRemaining === 1 ? "غداً" : `${c.daysRemaining} يوم`;
            return (
              <div key={c.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-secondary/40 transition-colors">
                <span className={`px-2 py-1 rounded-lg text-[9px] font-bold flex-shrink-0 ${dateColor}`}>
                  {new Date(c.chequeDate).toLocaleDateString("ar-PS", { day: "numeric", month: "short" })}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-foreground truncate font-medium">{c.partyName}</p>
                  <p className="text-[9px] text-muted-foreground">{daysLabel}</p>
                </div>
                <span className="text-[11px] font-bold tabular-nums text-foreground" style={{ fontFamily: "JetBrains Mono" }}>
                  ₪{fmt(c.amount)}
                </span>
              </div>
            );
          })
        )}
      </div>

      {weekTotal > 0 && (
        <div className="rounded-xl bg-primary/8 p-3 text-center">
          <p className="text-[9px] text-muted-foreground">إجمالي هذا الأسبوع</p>
          <p className="text-lg font-bold text-primary tabular-nums" style={{ fontFamily: "JetBrains Mono" }}>₪{fmt(weekTotal)}</p>
        </div>
      )}

      <button onClick={() => navigate("/cheques")} className="w-full mt-2 text-center text-[11px] text-primary font-medium hover:underline">
        عرض كل الشيكات ←
      </button>
    </div>
  );
}
