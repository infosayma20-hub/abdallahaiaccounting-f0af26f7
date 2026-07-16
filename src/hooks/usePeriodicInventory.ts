import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

export interface PeriodicInventoryCount {
  id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  count_date: string;
  opening_value: number;
  closing_value: number;
  costing_method: string;
  notes: string | null;
  status: "draft" | "posted" | "reversed";
  opening_journal_id: string | null;
  closing_journal_id: string | null;
  posted_at: string | null;
  reversed_at: string | null;
  created_at: string;
}

export function usePeriodicInventory() {
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const [items, setItems] = useState<PeriodicInventoryCount[]>([]);
  const [loading, setLoading] = useState(true);

  const ownerId = dataOwnerId || user?.id;

  const refresh = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const { data } = await supabase
      .from("inventory_period_counts" as any)
      .select("*")
      .eq("user_id", ownerId)
      .order("period_end", { ascending: false });
    setItems(((data as unknown) as PeriodicInventoryCount[]) || []);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => { refresh(); }, [refresh]);

  const saveDraft = useCallback(async (payload: {
    id?: string;
    period_start: string;
    period_end: string;
    opening_value: number;
    closing_value: number;
    costing_method: string;
    notes?: string | null;
  }) => {
    if (!ownerId) throw new Error("no user");
    if (payload.id) {
      const { error } = await supabase
        .from("inventory_period_counts" as any)
        .update({
          period_start: payload.period_start,
          period_end: payload.period_end,
          opening_value: payload.opening_value,
          closing_value: payload.closing_value,
          costing_method: payload.costing_method,
          notes: payload.notes ?? null,
        })
        .eq("id", payload.id);
      if (error) throw error;
      return payload.id;
    }
    const { data, error } = await supabase
      .from("inventory_period_counts" as any)
      .insert({
        user_id: ownerId,
        period_start: payload.period_start,
        period_end: payload.period_end,
        opening_value: payload.opening_value,
        closing_value: payload.closing_value,
        costing_method: payload.costing_method,
        notes: payload.notes ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return (data as any)?.id as string;
  }, [ownerId]);

  const post = useCallback(async (id: string) => {
    const { data, error } = await supabase.rpc("post_periodic_inventory_adjustment" as any, { _count_id: id });
    if (error) throw error;
    await refresh();
    return data;
  }, [refresh]);

  const reverse = useCallback(async (id: string) => {
    const { data, error } = await supabase.rpc("reverse_periodic_inventory_adjustment" as any, { _count_id: id });
    if (error) throw error;
    await refresh();
    return data;
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("inventory_period_counts" as any).delete().eq("id", id);
    if (error) throw error;
    await refresh();
  }, [refresh]);

  return { items, loading, refresh, saveDraft, post, reverse, remove };
}
