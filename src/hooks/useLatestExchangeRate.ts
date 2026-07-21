import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface LatestRate {
  currency_id: string;
  code: string;
  buy_rate: number;
  sell_rate: number;
  mid_rate: number;
  rate_date: string;
}

/**
 * Canonical source of truth for foreign exchange rates.
 * Reads the latest row per currency from the `exchange_rates` table
 * (the same table populated by the Currency Management screen).
 *
 * Any page that needs to convert a foreign amount MUST use this hook
 * (or `fetchLatestRate` below) — never hard-code a rate.
 */
export function useLatestExchangeRates() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["latest_exchange_rates", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Record<string, LatestRate>> => {
      const { data: currencies } = await supabase
        .from("currencies")
        .select("id, code, is_base")
        .eq("is_active", true);

      const { data: rates } = await supabase
        .from("exchange_rates")
        .select("currency_id, buy_rate, sell_rate, mid_rate, rate_date")
        .order("rate_date", { ascending: false })
        .limit(500);

      const map: Record<string, LatestRate> = {};
      for (const c of currencies || []) {
        if ((c as any).is_base) {
          map[(c as any).code] = {
            currency_id: (c as any).id,
            code: (c as any).code,
            buy_rate: 1, sell_rate: 1, mid_rate: 1,
            rate_date: new Date().toISOString().slice(0, 10),
          };
          continue;
        }
        const r = (rates || []).find((x: any) => x.currency_id === (c as any).id);
        if (r) {
          map[(c as any).code] = {
            currency_id: (c as any).id,
            code: (c as any).code,
            buy_rate: Number(r.buy_rate),
            sell_rate: Number(r.sell_rate),
            mid_rate: Number(r.mid_rate),
            rate_date: (r as any).rate_date,
          };
        }
      }
      return map;
    },
    staleTime: 60_000,
  });
}

/** Imperative fetch (for RPC/mutation paths that can't use hooks). */
export async function fetchLatestRate(code: string): Promise<LatestRate | null> {
  const { data: curr } = await supabase
    .from("currencies")
    .select("id, code, is_base")
    .eq("code", code)
    .maybeSingle();
  if (!curr) return null;
  if ((curr as any).is_base) {
    return {
      currency_id: (curr as any).id, code,
      buy_rate: 1, sell_rate: 1, mid_rate: 1,
      rate_date: new Date().toISOString().slice(0, 10),
    };
  }
  const { data: r } = await supabase
    .from("exchange_rates")
    .select("buy_rate, sell_rate, mid_rate, rate_date")
    .eq("currency_id", (curr as any).id)
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!r) return null;
  return {
    currency_id: (curr as any).id,
    code,
    buy_rate: Number(r.buy_rate),
    sell_rate: Number(r.sell_rate),
    mid_rate: Number(r.mid_rate),
    rate_date: (r as any).rate_date,
  };
}