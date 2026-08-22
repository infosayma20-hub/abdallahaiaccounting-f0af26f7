import { useTT } from "@/i18n/dict";
interface HealthData {
  score: number;
  label: string;
  profitMargin: number;
  currentRatio: number;
  collectionEff: number;
  debtRatio: number;
}

interface Props {
  data: HealthData;
  loading: boolean;
}

function GaugeSVG({ score }: { score: number }) {
  const angle = (score / 100) * 180;
  const r = 80;
  const cx = 100;
  const cy = 95;

  const arcPath = (startAngle: number, endAngle: number) => {
    const s = ((180 - startAngle) * Math.PI) / 180;
    const e = ((180 - endAngle) * Math.PI) / 180;
    const x1 = cx + r * Math.cos(s);
    const y1 = cy - r * Math.sin(s);
    const x2 = cx + r * Math.cos(e);
    const y2 = cy - r * Math.sin(e);
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 0 ${x2} ${y2}`;
  };

  const needleAngle = ((180 - angle) * Math.PI) / 180;
  const nx = cx + (r - 15) * Math.cos(needleAngle);
  const ny = cy - (r - 15) * Math.sin(needleAngle);

  return (
    <svg viewBox="0 0 200 115" className="w-full max-w-[200px] mx-auto">
      {/* Background arc */}
      <path d={arcPath(0, 72)} fill="none" stroke="#DC2626" strokeWidth="12" strokeLinecap="round" opacity={0.25} />
      <path d={arcPath(72, 126)} fill="none" stroke="#F59E0B" strokeWidth="12" strokeLinecap="round" opacity={0.25} />
      <path d={arcPath(126, 180)} fill="none" stroke="#16A34A" strokeWidth="12" strokeLinecap="round" opacity={0.25} />
      {/* Active arc */}
      <path d={arcPath(0, Math.min(angle, 180))} fill="none" stroke={score >= 70 ? "#16A34A" : score >= 40 ? "#F59E0B" : "#DC2626"} strokeWidth="12" strokeLinecap="round" />
      {/* Needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="4" fill="white" />
      {/* Score */}
      <text x={cx} y={cy - 15} textAnchor="middle" fill="white" fontSize="28" fontWeight="800" fontFamily="Inter, sans-serif">{score}</text>
    </svg>
  );
}

function MetricBar({ label, value, displayValue, max, thresholdGood }: { label: string; value: number; displayValue: string; max: number; thresholdGood: boolean }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = thresholdGood ? "bg-emerald-400" : "bg-red-400";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-white/60">{label}</span>
        <span className="text-white font-bold tabular-nums" style={{ fontFamily: "JetBrains Mono" }}>{displayValue}</span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function FinancialHealthWidget({ data, loading }: Props) {
  const tt = useTT();
  if (loading) {
    return (
      <div className="col-span-12 lg:col-span-4 rounded-2xl p-5 animate-pulse" style={{ background: "linear-gradient(160deg, hsl(var(--navy)), hsl(var(--teal-dark, 195 100% 28%)))" }}>
        <div className="h-6 w-32 bg-white/10 rounded mb-4" />
        <div className="h-[200px] bg-white/5 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="col-span-12 lg:col-span-4 rounded-2xl p-5 shadow-sm" style={{ background: "linear-gradient(160deg, hsl(var(--navy)), hsl(195 100% 28%))" }}>
      <p className="text-[13px] text-white/60 font-medium mb-2">{tt("الصحة المالية")}</p>

      <GaugeSVG score={data.score} />

      <p className="text-center text-white/80 text-xs font-bold mt-1 mb-4">{data.label}</p>

      <div className="space-y-3">
        <MetricBar label={tt("نسبة التداول")} value={data.currentRatio} displayValue={`${data.currentRatio}`} max={3} thresholdGood={data.currentRatio >= 1.5} />
        <MetricBar label={tt("هامش الربح")} value={data.profitMargin} displayValue={`${data.profitMargin}%`} max={50} thresholdGood={data.profitMargin >= 15} />
        <MetricBar label={tt("كفاءة التحصيل")} value={data.collectionEff} displayValue={`${data.collectionEff}%`} max={100} thresholdGood={data.collectionEff >= 80} />
        <MetricBar label={tt("نسبة المديونية")} value={data.debtRatio * 100} displayValue={`${data.debtRatio}`} max={100} thresholdGood={data.debtRatio < 0.6} />
      </div>
    </div>
  );
}
