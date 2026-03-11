import { useMemo } from "react";
import { Lightbulb } from "lucide-react";

const DAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const HOURS = Array.from({ length: 15 }, (_, i) => i + 8);

interface Props {
  peakHoursData: Record<string, number>;
}

const POSPeakHoursReport = ({ peakHoursData }: Props) => {
  const { maxVal, insights } = useMemo(() => {
    const values = Object.values(peakHoursData);
    const max = Math.max(...values, 1);

    let peakDay = 0, peakHour = 0, peakVal = 0;
    Object.entries(peakHoursData).forEach(([key, val]) => {
      const [d, h] = key.split("-").map(Number);
      if (val > peakVal) { peakDay = d; peakHour = h; peakVal = val; }
    });

    const dayTotals: Record<number, number> = {};
    Object.entries(peakHoursData).forEach(([key, val]) => {
      const d = parseInt(key.split("-")[0]);
      dayTotals[d] = (dayTotals[d] || 0) + val;
    });
    const bestDay = Object.entries(dayTotals).sort(([, a], [, b]) => b - a)[0];

    return {
      maxVal: max,
      insights: [
        peakVal > 0 ? `وقت الذروة: ${DAYS[peakDay]} الساعة ${peakHour}:00` : null,
        bestDay ? `أفضل يوم: ${DAYS[parseInt(bestDay[0])]} (₪${bestDay[1].toLocaleString()})` : null,
      ].filter(Boolean) as string[],
    };
  }, [peakHoursData]);

  // Gold-based heatmap using FINIX brand colors
  const getColor = (value: number) => {
    if (value === 0) return "hsl(var(--secondary))";
    const ratio = value / maxVal;
    if (ratio > 0.7) return "#E8A020";    // Gold (peak)
    if (ratio > 0.4) return "#F59E0B";    // Amber
    if (ratio > 0.15) return "#FCD34D";   // Light amber
    return "#FEF3C7";                      // Very light amber
  };

  const getTextColor = (value: number) => {
    if (value === 0) return "hsl(var(--muted-foreground))";
    const ratio = value / maxVal;
    return ratio > 0.4 ? "white" : "hsl(var(--foreground))";
  };

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">خريطة أوقات الذروة</h3>
        </div>
        <div className="p-4">
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              <div className="flex gap-1 mb-1">
                <div className="w-14 shrink-0" />
                {HOURS.map(h => (
                  <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground font-mono">{h}</div>
                ))}
              </div>
              {DAYS.map((day, dayIdx) => (
                <div key={day} className="flex gap-1 mb-1">
                  <div className="w-14 shrink-0 text-xs text-muted-foreground flex items-center">{day}</div>
                  {HOURS.map(hour => {
                    const val = peakHoursData[`${dayIdx}-${hour}`] || 0;
                    return (
                      <div
                        key={hour}
                        className="flex-1 h-8 rounded flex items-center justify-center text-[10px] font-mono font-medium cursor-default transition-transform hover:scale-105"
                        style={{ background: getColor(val), color: getTextColor(val) }}
                        title={`${day} ${hour}:00 — ₪${val.toLocaleString()}`}
                      >
                        {val > 0 ? (val >= 1000 ? `${Math.round(val / 1000)}K` : val) : ""}
                      </div>
                    );
                  })}
                </div>
              ))}
              {/* Legend */}
              <div className="flex items-center gap-4 mt-4 text-[10px] text-muted-foreground justify-center">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: "#E8A020" }} /> ذروة</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: "#F59E0B" }} /> نشط</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: "#FCD34D" }} /> متوسط</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: "#FEF3C7" }} /> هادئ</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {insights.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-semibold text-foreground">توصيات</h3>
          </div>
          <div className="p-4 space-y-2">
            {insights.map((insight, i) => (
              <p key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                {insight}
              </p>
            ))}
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
              اقتراح: فعّل عروض خاصة في الأوقات الهادئة لزيادة الحركة
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default POSPeakHoursReport;
