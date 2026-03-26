import { useState, useEffect, useCallback } from "react";
import { RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import WidgetBanner from "./WidgetBanner";

interface Rate {
  code: string;
  flag: string;
  name: string;
  rate: number;
  change: number;
  source: string;
}

const CURRENCY_META: Record<string, { flag: string; name: string }> = {
  USD: { flag: "🇺🇸", name: "دولار أمريكي" },
  EUR: { flag: "🇪🇺", name: "يورو" },
  JOD: { flag: "🇯🇴", name: "دينار أردني" },
  GBP: { flag: "🇬🇧", name: "جنيه إسترليني" },
  EGP: { flag: "🇪🇬", name: "جنيه مصري" },
  TRY: { flag: "🇹🇷", name: "ليرة تركية" },
};

const FALLBACK_RATES: Record<string, number> = {
  USD: 3.68,
  EUR: 3.98,
  JOD: 5.19,
  GBP: 4.65,
  EGP: 0.073,
  TRY: 0.107,
};

const CACHE_KEY = "finix_exchange_rates_v2";
const CACHE_MAX_AGE = 30 * 60 * 1000; // 30 min

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  if (d.getDay() === 0) d.setDate(d.getDate() - 2);
  if (d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

// Strategy 1: fawazahmed0 — covers ALL currencies including JOD, EGP
async function fetchFromFawazahmed0(codes: string[]): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/ils.json",
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const ilsRates = data.ils;
    if (!ilsRates) return null;

    const result: Record<string, number> = {};
    codes.forEach((code) => {
      const key = code.toLowerCase();
      if (ilsRates[key] && ilsRates[key] > 0) {
        result[code] = Math.round((1 / ilsRates[key]) * 10000) / 10000;
      }
    });
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

// Strategy 2: open.er-api.com — free, covers all currencies
async function fetchFromOpenER(codes: string[]): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(
      "https://open.er-api.com/v6/latest/ILS",
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.rates) return null;

    const result: Record<string, number> = {};
    codes.forEach((code) => {
      if (data.rates[code] && data.rates[code] > 0) {
        result[code] = Math.round((1 / data.rates[code]) * 10000) / 10000;
      }
    });
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

// Strategy 3: frankfurter.app — ECB data (missing JOD, EGP)
async function fetchFromFrankfurter(codes: string[]): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=ILS&to=${codes.join(",")}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.rates) return null;

    const result: Record<string, number> = {};
    Object.entries(data.rates).forEach(([code, foreignRate]) => {
      if (typeof foreignRate === "number" && foreignRate > 0) {
        result[code] = Math.round((1 / foreignRate) * 10000) / 10000;
      }
    });
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

// Yesterday rates for change %
async function fetchYesterdayRates(codes: string[]): Promise<Record<string, number>> {
  try {
    const dateStr = getYesterday();
    const res = await fetch(
      `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${dateStr}/v1/currencies/ils.json`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return {};
    const data = await res.json();
    const ilsRates = data.ils;
    if (!ilsRates) return {};

    const result: Record<string, number> = {};
    codes.forEach((code) => {
      const key = code.toLowerCase();
      if (ilsRates[key] && ilsRates[key] > 0) {
        result[code] = Math.round((1 / ilsRates[key]) * 10000) / 10000;
      }
    });
    return result;
  } catch {
    return {};
  }
}

export default function ExchangeRatesWidget() {
  const [rates, setRates] = useState<Rate[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const fetchRates = useCallback(async () => {
    setLoading(true);
    const codes = Object.keys(CURRENCY_META);

    try {
      // Try sources in order until we get full coverage
      let todayRates: Record<string, number> = {};
      let source = "fallback";

      // Source 1: fawazahmed0 (best coverage)
      const fawaz = await fetchFromFawazahmed0(codes);
      if (fawaz && Object.keys(fawaz).length >= 4) {
        todayRates = { ...todayRates, ...fawaz };
        source = "fawazahmed0";
      }

      // Source 2: Fill gaps with open.er-api
      const missing = codes.filter((c) => !todayRates[c]);
      if (missing.length > 0) {
        const openER = await fetchFromOpenER(codes);
        if (openER) {
          missing.forEach((c) => {
            if (openER[c]) todayRates[c] = openER[c];
          });
          if (!source || source === "fallback") source = "open.er-api";
        }
      }

      // Source 3: Fill remaining gaps with frankfurter
      const stillMissing = codes.filter((c) => !todayRates[c]);
      if (stillMissing.length > 0) {
        const frank = await fetchFromFrankfurter(stillMissing);
        if (frank) {
          stillMissing.forEach((c) => {
            if (frank[c]) todayRates[c] = frank[c];
          });
        }
      }

      // Final fallback for any still missing
      codes.forEach((c) => {
        if (!todayRates[c]) todayRates[c] = FALLBACK_RATES[c] || 0;
      });

      // Get yesterday rates for change calculation
      const yesterdayRates = await fetchYesterdayRates(codes);

      const result: Rate[] = codes.map((code) => {
        const meta = CURRENCY_META[code];
        const rate = todayRates[code];
        const prevRate = yesterdayRates[code] || rate;
        const change = prevRate > 0 ? Math.round(((rate - prevRate) / prevRate) * 10000) / 100 : 0;

        return {
          code,
          ...meta,
          rate,
          change,
          source,
        };
      });

      setRates(result);
      setLastUpdated(new Date().toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" }));

      // Cache
      localStorage.setItem(CACHE_KEY, JSON.stringify({ rates: result, timestamp: Date.now() }));
    } catch (err) {
      console.error("Exchange rates error:", err);

      // Try cache
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { rates: cachedRates } = JSON.parse(cached);
        setRates(cachedRates);
      } else {
        setRates(
          codes.map((code) => ({
            code,
            ...CURRENCY_META[code],
            rate: FALLBACK_RATES[code] || 0,
            change: 0,
            source: "fallback",
          }))
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Check cache freshness
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { rates: cachedRates, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_MAX_AGE) {
          setRates(cachedRates);
          setLastUpdated(new Date(timestamp).toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" }));
          setLoading(false);
          return;
        }
      } catch {}
    }
    fetchRates();
  }, [fetchRates]);

  // Auto-refresh every 30 min
  useEffect(() => {
    const interval = setInterval(fetchRates, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchRates]);

  return (
    <div className="col-span-12 lg:col-span-4 bg-card rounded-2xl p-5 shadow-sm border border-border/30">
      <WidgetBanner title="أسعار الصرف اليوم" icon="💱">
        <div className="flex items-center gap-2">
          {lastUpdated && <span className="text-[9px] text-white/50">{lastUpdated}</span>}
          <button
            onClick={fetchRates}
            disabled={loading}
            className="w-6 h-6 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <RefreshCw className={`h-3 w-3 text-white/60 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </WidgetBanner>

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
        مقابل الشيكل الإسرائيلي ₪ • تحديث تلقائي كل 30 دقيقة
      </p>
    </div>
  );
}
