import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { ISO_MANUALS } from "@/lib/hr/isoManuals";

export type IsoManual = {
  id: string;
  user_id: string;
  code: string;
  name_ar: string;
  owner_role_label: string | null;
  sort_order: number;
  is_active: boolean;
};

/** يجلب مجلدات ISO 22000 للشركة، وينشئ الـ13 مجلد الأساسية أول مرة. */
export function useIsoManuals() {
  const { dataOwnerId } = useDataOwnerId();
  const [manuals, setManuals] = useState<IsoManual[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from("iso_manuals")
        .select("*")
        .eq("user_id", dataOwnerId)
        .order("sort_order");
      let rows = (data || []) as IsoManual[];

      const missing = ISO_MANUALS.filter((m) => !rows.some((r) => r.code === m.code));
      if (missing.length) {
        await supabase.from("iso_manuals").upsert(
          missing.map((m) => ({
            user_id: dataOwnerId,
            code: m.code,
            name_ar: m.name_ar,
            owner_role_label: m.owner_role_label || null,
            sort_order: ISO_MANUALS.findIndex((x) => x.code === m.code),
          })),
          { onConflict: "user_id,code", ignoreDuplicates: true },
        );
        const { data: fresh } = await supabase
          .from("iso_manuals")
          .select("*")
          .eq("user_id", dataOwnerId)
          .order("sort_order");
        rows = (fresh || []) as IsoManual[];
      }
      setManuals(rows);
    } finally {
      setLoading(false);
    }
  }, [dataOwnerId]);

  useEffect(() => { load(); }, [load]);

  return { manuals, loading, reload: load, ownerId: dataOwnerId };
}