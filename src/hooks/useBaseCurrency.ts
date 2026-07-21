import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface BaseCurrency {
  code: string;         // e.g. "ILS"
  symbol: string;       // e.g. "₪"
  nameAr: string;       // e.g. "شيكل إسرائيلي"
  nameEn: string;       // e.g. "Israeli Shekel"
  decimals: number;     // e.g. 2
  flag: string;         // e.g. "🇮🇱"
}

const FALLBACK: BaseCurrency = {
  code: "ILS",
  symbol: "₪",
  nameAr: "شيكل إسرائيلي",
  nameEn: "Israeli Shekel",
  decimals: 2,
  flag: "🇮🇱",
};

/**
 * Canonical source for the tenant's base (functional) currency.
 *
 * Reads `company_settings.base_currency` and resolves the display metadata
 * from `currencies`. Falls back to ILS so any consumer stays identical
 * to today's behavior until the tenant explicitly switches base currency.
 *
 * IMPORTANT: All existing tenants have base_currency='ILS' — every consumer
 * of this hook receives the same ILS values they had before, guaranteeing
 * zero behavioral change for current users.
 */
export function useBaseCurrency() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["base_currency", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<BaseCurrency> => {
      const { data: settings } = await supabase
        .from("company_settings")
        .select("base_currency")
        .eq("user_id", user!.id)
        .maybeSingle();

      const code = (settings as any)?.base_currency || "ILS";

      const { data: curr } = await supabase
        .from("currencies")
        .select("code, symbol, name_ar, name_en, decimal_places, country_flag")
        .eq("code", code)
        .maybeSingle();

      if (!curr) return { ...FALLBACK, code };

      return {
        code: (curr as any).code,
        symbol: (curr as any).symbol || FALLBACK.symbol,
        nameAr: (curr as any).name_ar || FALLBACK.nameAr,
        nameEn: (curr as any).name_en || FALLBACK.nameEn,
        decimals: Number((curr as any).decimal_places ?? 2),
        flag: (curr as any).country_flag || "",
      };
    },
  });
}