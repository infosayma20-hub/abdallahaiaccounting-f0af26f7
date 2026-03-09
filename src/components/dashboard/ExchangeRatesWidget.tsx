import { useState, useEffect, useCallback } from "react";
import { RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Rate {
  code: string;
  flag: string;
  name: string;
  rate: number;
  change: number;
}

const CURRENCY_META: Record<string, { flag: string; name: string }> = {
  USD: { flag: "🇺🇸", name: "دولار أمريكي" },
  EUR: { flag: "🇪🇺", name: "يورو" },
  JOD: { flag: "🇯🇴", name: "دينار أردني" },
  GBP: { flag: "🇬🇧", name: "جنيه إسترليني" },
  EGP: { flag: "🇪🇬", name: "جنيه مصري" },
  TRY: { flag: "🇹🇷", name: "ليرة تركية" },
};

export default function ExchangeRatesWidget() {
  const [rates, setRates] = useState<Rate[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const fetchRates = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch from frankfurter.app (free, no key needed)
      const codes = Object.keys(CURRENCY_META).join(",");
      const [todayRes, yesterdayRes] = await Promise.all([
        fetch(`https://api.frankfurter.app/latest?from=ILS&to=${codes}`),
        fetch(`https://api.frankfurter.app/${getYesterday()}?from=ILS&to=${codes}`),
      ]);

      if (!todayRes.ok) throw new Error("Failed");

      const todayData = await todayRes.json();
      const yesterdayData = yesterdayRes.ok ? await yesterdayRes.json() : null;

      const result: Rate[] = Object.entries(CURRENCY_META).map(([code, meta]) => {
        const foreignRate = todayData.rates?.[code];
        const yesterdayRate = yesterdayData?.rates?.[code];
        // frankfurter: 1 ILS = X foreign, we want 1 foreign = Y ILS
        const rate = foreignRate ? 1 / foreignRate : 0;
        const prevRate = yesterdayRate ? 1 / yesterdayRate : rate;
        const change = prevRate > 0 ? ((rate - prevRate) / prevRate) * 100 : 0;
        return { code, ...meta, rate: Math.round(rate * 10000) / 10000, change: Math.round(change * 100) / 100 };
      });

      setRates(result);
      setLastUpdated(new Date().toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" }));
    } catch (err) {
      console.error("Exchange rates error:", err);
      // Fallback static rates
      setRates(Object.entries(CURRENCY_META).map(([code, meta]) => ({ code, ...meta, rate: 0, change: 0 })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRates(); }, [fetchRates]);

  // Refresh every 2 hours
  useEffect(() => {
    const interval = setInterval(fetchRates, 2 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchRates]);

  return (
    <div className="col-span-12 lg:col-span-4 bg-card rounded-2xl p-5 shadow-sm border border-border/30">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground">💱 أسعار الصرف اليوم</h3>
        <div className="flex items-center gap-2">
          {lastUpdated && <span className="text-[9px] text-muted-foreground">{lastUpdated}</span>}
          <button
            onClick={fetchRates}
            disabled={loading}
            className="w-6 h-6 rounded-lg hover:bg-secondary flex items-center justify-center transition-colors"
          >
            <RefreshCw className={`h-3 w-3 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading && rates.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-11 bg-muted/50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {rates.map((r) => (
            <div
              key={r.code}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-secondary/40 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">{r.flag}</span>
                <div>
                  <p className="text-[11px] font-bold text-foreground">{r.code}/ILS</p>
                  <p className="text-[9px] text-muted-foreground">{r.name}</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <span
                  className="text-[13px] font-bold tabular-nums text-foreground"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  {r.rate > 0 ? r.rate.toFixed(4) : "—"}
                </span>

                {r.rate > 0 && (
                  <span
                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                      r.change > 0
                        ? "bg-emerald-500/10 text-emerald-600"
                        : r.change < 0
                        ? "bg-red-500/10 text-red-500"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {r.change > 0 ? (
                      <TrendingUp className="h-2.5 w-2.5" />
                    ) : r.change < 0 ? (
                      <TrendingDown className="h-2.5 w-2.5" />
                    ) : (
                      <Minus className="h-2.5 w-2.5" />
                    )}
                    {Math.abs(r.change)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[8px] text-muted-foreground text-center mt-3">
        مقابل الشيكل الإسرائيلي ₪ • المصدر: البنك المركزي الأوروبي
      </p>
    </div>
  );
}

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  // Skip weekends
  if (d.getDay() === 0) d.setDate(d.getDate() - 2);
  if (d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}
