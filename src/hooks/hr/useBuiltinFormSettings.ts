import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { BuiltinFormSetting } from "@/lib/hr/builtinForms";

/**
 * Reads/writes the tenant's overrides for the built-in employee forms.
 * Fails soft: on any error the map stays empty → the app keeps its
 * hardcoded defaults exactly as before.
 */
export function useBuiltinFormSettings() {
  const { dataOwnerId } = useDataOwnerId();
  const [settings, setSettings] = useState<Map<string, BuiltinFormSetting>>(new Map());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("builtin_form_settings")
      .select("id, form_key, label_override, description_override, is_enabled, closed_message, sort_order")
      .eq("user_id", dataOwnerId);
    if (!error) {
      const m = new Map<string, BuiltinFormSetting>();
      (data || []).forEach((r: any) => m.set(r.form_key, r as BuiltinFormSetting));
      setSettings(m);
    }
    setLoading(false);
  }, [dataOwnerId]);

  useEffect(() => { refresh(); }, [refresh]);

  const save = useCallback(
    async (s: BuiltinFormSetting) => {
      if (!dataOwnerId) throw new Error("تعذر تحديد الشركة");
      const { error } = await (supabase as any)
        .from("builtin_form_settings")
        .upsert(
          {
            user_id: dataOwnerId,
            form_key: s.form_key,
            label_override: s.label_override?.trim() || null,
            description_override: s.description_override?.trim() || null,
            is_enabled: s.is_enabled,
            closed_message: s.closed_message?.trim() || null,
            sort_order: s.sort_order ?? 0,
          },
          { onConflict: "user_id,form_key" },
        );
      if (error) throw error;
      await refresh();
    },
    [dataOwnerId, refresh],
  );

  return { settings, loading, refresh, save };
}
