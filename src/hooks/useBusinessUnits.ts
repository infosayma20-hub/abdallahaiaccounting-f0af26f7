import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

export interface BusinessUnit {
  id: string;
  name: string;
  code: string | null;
  color: string | null;
  description: string | null;
  cost_center_id: string | null;
  is_active: boolean;
}

const EVT = "unify:active-business-unit";
const key = (ownerId: string) => `active_bu:${ownerId}`;

/** "all" = كل الأنشطة؛ null = لم يُختر بعد */
export function readActiveBusinessUnit(ownerId: string | null): string | null {
  if (!ownerId) return null;
  try { return localStorage.getItem(key(ownerId)); } catch { return null; }
}

export function useBusinessUnits() {
  const { dataOwnerId } = useDataOwnerId();
  const [units, setUnits] = useState<BusinessUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActiveState] = useState<string | null>(() => readActiveBusinessUnit(dataOwnerId));

  const reload = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    const { data } = await supabase
      .from("business_units")
      .select("id,name,code,color,description,cost_center_id,is_active")
      .eq("user_id", dataOwnerId)
      .order("created_at");
    setUnits((data || []) as BusinessUnit[]);
    setLoading(false);
  }, [dataOwnerId]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    setActiveState(readActiveBusinessUnit(dataOwnerId));
    const onChange = () => setActiveState(readActiveBusinessUnit(dataOwnerId));
    window.addEventListener(EVT, onChange);
    window.addEventListener("storage", onChange);
    return () => { window.removeEventListener(EVT, onChange); window.removeEventListener("storage", onChange); };
  }, [dataOwnerId]);

  const setActive = useCallback((id: string) => {
    if (!dataOwnerId) return;
    try { localStorage.setItem(key(dataOwnerId), id); } catch { /* ignore */ }
    window.dispatchEvent(new Event(EVT));
  }, [dataOwnerId]);

  const activeUnits = units.filter((u) => u.is_active);
  return { dataOwnerId, units, activeUnits, loading, reload, active, setActive };
}
