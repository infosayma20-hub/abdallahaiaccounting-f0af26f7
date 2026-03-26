import { useNavigate } from "react-router-dom";
import type { RecentActivity } from "@/hooks/useDashboardData";

interface Props {
  activities: RecentActivity[];
  loading: boolean;
}

function fmt(v: number): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const dotColor = { income: "bg-emerald-500", expense: "bg-red-500", other: "bg-primary" };

export default function RecentActivityWidget({ activities, loading }: Props) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="col-span-12 lg:col-span-4 bg-card rounded-2xl p-5 shadow-sm border border-border/30 animate-pulse">
        <div className="h-6 w-32 bg-muted rounded mb-4" />
        {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-10 bg-muted rounded-lg mb-2" />)}
      </div>
    );
  }

  // Group by day
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  return (
    <div className="col-span-12 lg:col-span-4 bg-card rounded-2xl p-5 shadow-sm border border-border/30">
      <h3 className="text-sm font-medium text-foreground mb-4">⚡ آخر النشاطات</h3>

      <div className="space-y-1 max-h-[320px] overflow-y-auto">
        {activities.length === 0 ? (
          <p className="text-center text-muted-foreground text-xs py-8">لا توجد نشاطات بعد</p>
        ) : (
          activities.map((a, i) => {
            const prevDate = i > 0 ? activities[i - 1].date : null;
            const showDivider = prevDate && prevDate !== a.date;
            return (
              <div key={a.id}>
                {showDivider && <div className="border-t border-border/30 my-2" />}
                <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-secondary/40 transition-colors">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor[a.type]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-foreground truncate">{a.description}</p>
                    <p className="text-[9px] text-muted-foreground">{a.timeAgo}</p>
                  </div>
                  <span className={`text-[11px] font-bold tabular-nums flex-shrink-0 ${
                    a.type === "income" ? "text-emerald-600" : a.type === "expense" ? "text-red-500" : "text-foreground"
                  }`} style={{ fontFamily: "JetBrains Mono" }}>
                    {a.type === "expense" ? "-" : ""}₪{fmt(a.amount)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <button
        onClick={() => navigate("/transactions")}
        className="w-full mt-3 text-center text-[11px] text-primary font-medium hover:underline"
      >
        عرض كل الحركات ←
      </button>
    </div>
  );
}
