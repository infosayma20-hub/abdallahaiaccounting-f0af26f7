interface Props {
  data: { inflows: number; outflows: number; net: number; runway: number };
  cashBalance: number;
  loading: boolean;
}

function fmt(v: number): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default function CashFlowWidget({ data, cashBalance, loading }: Props) {
  if (loading) {
    return (
      <div className="col-span-12 lg:col-span-6 bg-card rounded-2xl p-5 shadow-sm border border-border/30 animate-pulse">
        <div className="h-6 w-36 bg-muted rounded mb-4" />
        <div className="h-[180px] bg-muted rounded-xl" />
      </div>
    );
  }

  const total = data.inflows + data.outflows || 1;
  const inflowPct = (data.inflows / total) * 100;
  const outflowPct = (data.outflows / total) * 100;
  const runwayColor = data.runway <= 1 ? "text-red-500 bg-red-500/10" : data.runway <= 3 ? "text-amber-500 bg-amber-500/10" : "text-emerald-500 bg-emerald-500/10";

  return (
    <div className="col-span-12 lg:col-span-6 bg-card rounded-2xl p-5 shadow-sm border border-border/30">
      <h3 className="text-sm font-medium text-foreground mb-4">💧 التدفق النقدي</h3>

      {/* Waterfall visual */}
      <div className="flex items-end gap-2 h-[120px] mb-4">
        {/* Opening */}
        <div className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full bg-muted-foreground/20 rounded-t-lg" style={{ height: `${Math.min(80, 30)}%` }} />
          <span className="text-[9px] text-muted-foreground">الرصيد</span>
          <span className="text-[10px] font-bold tabular-nums" style={{ fontFamily: "JetBrains Mono" }}>₪{fmt(cashBalance)}</span>
        </div>
        {/* Inflows */}
        <div className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full bg-emerald-500/70 rounded-t-lg transition-all" style={{ height: `${Math.min(90, inflowPct)}%` }} />
          <span className="text-[9px] text-muted-foreground">داخل</span>
          <span className="text-[10px] font-bold tabular-nums text-emerald-600" style={{ fontFamily: "JetBrains Mono" }}>₪{fmt(data.inflows)}</span>
        </div>
        {/* Outflows */}
        <div className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full bg-red-500/70 rounded-t-lg transition-all" style={{ height: `${Math.min(90, outflowPct)}%` }} />
          <span className="text-[9px] text-muted-foreground">خارج</span>
          <span className="text-[10px] font-bold tabular-nums text-red-500" style={{ fontFamily: "JetBrains Mono" }}>₪{fmt(data.outflows)}</span>
        </div>
        {/* Net */}
        <div className="flex-1 flex flex-col items-center gap-1">
          <div className={`w-full rounded-t-lg transition-all ${data.net >= 0 ? "bg-primary/60" : "bg-red-500/60"}`} style={{ height: `${Math.min(80, Math.abs(data.net) / total * 100)}%` }} />
          <span className="text-[9px] text-muted-foreground">الصافي</span>
          <span className={`text-[10px] font-bold tabular-nums ${data.net >= 0 ? "text-primary" : "text-red-500"}`} style={{ fontFamily: "JetBrains Mono" }}>₪{fmt(data.net)}</span>
        </div>
      </div>


      {/* Runway */}
      <div className={`rounded-xl p-3 text-center ${runwayColor}`}>
        <p className="text-[11px] font-bold">
          سيولتك تكفي {data.runway > 12 ? "+12" : data.runway} {data.runway === 1 ? "شهر" : "أشهر"} بناءً على معدل صرفك
        </p>
      </div>
    </div>
  );
}
