import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const AMWALI_KEYS = {
  settings: ["amwali", "settings"] as const,
  catalog: ["amwali", "catalog"] as const,
  list: ["amwali", "quotations"] as const,
  one: (id: string) => ["amwali", "quotation", id] as const,
  items: (id: string) => ["amwali", "quotation-items", id] as const,
};

// --- Settings singleton ---
export const useAmwaliSettings = () =>
  useQuery({
    queryKey: AMWALI_KEYS.settings,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("amwali_quotation_settings")
        .select("*")
        .eq("singleton", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const useUpdateAmwaliSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from("amwali_quotation_settings")
        .update(patch as never)
        .eq("singleton", true)
        .select()
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: AMWALI_KEYS.settings }),
  });
};

// --- Catalog ---
export const useAmwaliCatalog = () =>
  useQuery({
    queryKey: AMWALI_KEYS.catalog,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("amwali_quotation_catalog_items")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

// --- List ---
export const useAmwaliQuotationList = () =>
  useQuery({
    queryKey: AMWALI_KEYS.list,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("amwali_quotations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

// --- Single quotation + items ---
export const useAmwaliQuotation = (id?: string) =>
  useQuery({
    queryKey: id ? AMWALI_KEYS.one(id) : ["amwali", "quotation", "new"],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("amwali_quotations")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const useAmwaliQuotationItems = (quotationId?: string) =>
  useQuery({
    queryKey: quotationId ? AMWALI_KEYS.items(quotationId) : ["amwali", "items", "new"],
    enabled: !!quotationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("amwali_quotation_items")
        .select("*")
        .eq("quotation_id", quotationId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

// --- Next quote number RPC ---
export const getNextQuoteNumber = async (): Promise<string> => {
  const { data, error } = await supabase.rpc("next_amwali_quote_number");
  if (error) throw error;
  return data as string;
};