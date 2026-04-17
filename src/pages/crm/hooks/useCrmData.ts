import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { CrmLead, CrmOpportunity, CrmActivity } from "../types";

export function useCrmLeads() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("crm_leads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("تعذر تحميل العملاء المحتملين");
    setLeads((data as any) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  return { leads, loading, refetch };
}

export function useCrmOpportunities() {
  const { user } = useAuth();
  const [opportunities, setOpportunities] = useState<CrmOpportunity[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("crm_opportunities")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("تعذر تحميل الفرص");
    setOpportunities((data as any) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  return { opportunities, loading, refetch };
}

export function useCrmActivities() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("crm_activities")
      .select("*")
      .order("due_date", { ascending: true, nullsFirst: false });
    if (error) toast.error("تعذر تحميل المتابعات");
    setActivities((data as any) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  return { activities, loading, refetch };
}
