import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 8AM to 10PM

interface Props {
  peakHoursData: Record<string, number>;
}

const POSPeakHoursReport = ({ peakHoursData }: Props) => {
  const { maxVal, insights } = useMemo(() => {
    const values = Object.values(peakHoursData);
    const max = Math.max(...values, 1);

    // Find peak and quiet times
    let peakDay = 0, peakHour = 0, peakVal = 0;
    let quietDay = 0, quietHour = 0, quietVal = Infinity;

    Object.entries(peakHoursData).forEach(([key, val]) => {
      const [d, h] = key.split("-").map(Number);
      if (val > peakVal) { peakDay = d; peakHour = h; peakVal = val; }
      if (val < quietVal) { quietDay = d; quietHour = h; quietVal = val; }
    });

    // Day totals
    const dayTotals: Record<number, number> = {};
    Object.entries(peakHoursData).forEach(([key, val]) => {
      const d = parseInt(key.split("-")[0]);
      dayTotals[d] = (dayTotals[d] || 0) + val;
    });
    const bestDay = Object.entries(dayTotals).sort(([, a], [, b]) => b - a)[0];

    return {
      maxVal: max,
      insights: [
        peakVal > 0 ? `💡 وقت الذروة: ${DAYS[peakDay]} الساعة ${peakHour}:00` : null,
        quietVal < Infinity && quietVal >= 0 ? `💡 أهدأ وقت: ${DAYS[quietDay]} الساعة ${quietHour}:00` : null,
        bestDay ? `💡 أفضل يوم: ${DAYS[parseInt(bestDay[0])]} (₪${bestDay[1].toLocaleString()})` : null,
      ].filter(Boolean),
    };
  }, [peakHoursData]);

  const getColor = (value: number) => {
    if (value === 0) return "hsl(var(--muted))";
    const ratio = value / maxVal;
    if (ratio > 0.7) return "hsl(0, 60%, 50%)"; // red - peak
    if (ratio > 0.4) return "hsl(25, 80%, 50%)"; // orange - active
    if (ratio > 0.15) return "hsl(45, 90%, 50%)"; // yellow - moderate
    return "hsl(142, 71%, 45%)"; // green - quiet
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">⏰ خريطة أوقات الذروة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Header row */}
              <div className="flex gap-1 mb-1">
                <div className="w-14 shrink-0" />
                {HOURS.map(h => (
                  <div key={h} className="flex-1 text-center text-xs text-muted-foreground">{h}</div>
                ))}
              </div>
              {/* Heatmap rows */}
              {DAYS.map((day, dayIdx) => (
                <div key={day} className="flex gap-1 mb-1">
                  <div className="w-14 shrink-0 text-sm text-muted-foreground flex items-center">{day}</div>
                  {HOURS.map(hour => {
                    const val = peakHoursData[`${dayIdx}-${hour}`] || 0;
                    return (
                      <div
                        key={hour}
                        className="flex-1 h-8 rounded-sm flex items-center justify-center text-xs font-medium transition-all hover:scale-110 cursor-default"
                        style={{ background: getColor(val), color: val > 0 ? "white" : "hsl(var(--muted-foreground))" }}
                        title={`${day} ${hour}:00 - ₪${val.toLocaleString()}`}
                      >
                        {val > 0 ? `₪${val >= 1000 ? Math.round(val / 1000) + "K" : val}` : ""}
                      </div>
                    );
                  })}
                </div>
              ))}
              {/* Legend */}
              <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground justify-center">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: "hsl(0,60%,50%)" }} /> ذروة</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: "hsl(25,80%,50%)" }} /> نشط</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: "hsl(45,90%,50%)" }} /> متوسط</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: "hsl(142,71%,45%)" }} /> هادئ</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {insights.length > 0 && (
        <Card className="border-info/30">
          <CardHeader>
            <CardTitle className="text-lg text-info">🤖 توصيات ذكية</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {insights.map((insight, i) => (
                <p key={i} className="text-sm">{insight}</p>
              ))}
              <p className="text-sm">💡 اقتراح: فعّل عروض خاصة في الأوقات الهادئة لزيادة الحركة</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default POSPeakHoursReport;
