import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AdvanceLimit = {
  /** null ⇒ لا يوجد سقف (السلوك القديم تماماً) */
  maxAmount: number | null;
  /** الموظفون المستثنون من السقف */
  exemptIds: string[];
};

/**
 * Reads the tenant's advance (سلفة) ceiling from company_settings.
 * Fails soft: on any error the limit stays null ⇒ no restriction at all.
 */
export function useAdvanceLimit(employeeId?: string | null) {
  const [limit, setLimit] = useState<AdvanceLimit>({ maxAmount: null, exemptIds: [] });

  const load = useCallback(async () => {
    try {
      const { data: ownerData } = await supabase.rpc("get_team_owner_id");
      const ownerId = ownerData as string | null;
      if (!ownerId) return;
      const { data } = await (supabase as any)
        .from("company_settings")
        .select("hr_advance_max_amount, hr_advance_limit_exempt_employees")
        .eq("user_id", ownerId)
        .maybeSingle();
      if (!data) return;
      const raw = data.hr_advance_max_amount;
      setLimit({
        maxAmount: raw === null || raw === undefined || Number(raw) <= 0 ? null : Number(raw),
        exemptIds: (data.hr_advance_limit_exempt_employees || []) as string[],
      });
    } catch {
      /* fail soft */
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** السقف الفعلي لهذا الموظف (null = بدون سقف / مستثنى) */
  const effectiveMax =
    limit.maxAmount !== null && employeeId && limit.exemptIds.includes(employeeId)
      ? null
      : limit.maxAmount;

  return { ...limit, effectiveMax, refresh: load };
}
