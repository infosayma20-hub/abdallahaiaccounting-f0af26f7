import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface KioskCategory {
  id: string;
  name: string;
  color?: string | null;
  display_order?: number | null;
}

export interface KioskProduct {
  id: string;
  name: string;
  name_en?: string | null;
  price: number;
  image_url?: string | null;
  category_id?: string | null;
  is_pos_available?: boolean | null;
  description?: string | null;
}

export interface KioskModifierOption {
  id: string;
  group_id: string;
  name: string;
  name_en?: string | null;
  extra_price: number;
  is_default?: boolean | null;
  sort_order?: number | null;
}

export interface KioskModifierGroup {
  id: string;
  name: string;
  name_en?: string | null;
  selection_type: "single" | "multiple";
  is_required: boolean;
  min_select: number;
  max_select: number;
  options: KioskModifierOption[];
}

export function useKioskMenu(userId: string | null) {
  const [categories, setCategories] = useState<KioskCategory[]>([]);
  const [products, setProducts] = useState<KioskProduct[]>([]);
  const [productGroups, setProductGroups] = useState<Record<string, string[]>>({});
  const [groups, setGroups] = useState<Record<string, KioskModifierGroup>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [catsRes, prodsRes, pmgRes, mgRes, moRes] = await Promise.all([
        supabase.from("pos_categories").select("id,name,color,display_order").eq("user_id", userId).eq("is_active", true).order("display_order"),
        supabase.from("products").select("id,name,name_en,price,image_url,category_id,is_pos_available,description").eq("user_id", userId).eq("is_pos_available", true),
        supabase.from("product_modifier_groups").select("product_id,group_id"),
        supabase.from("modifier_groups").select("*").eq("user_id", userId).eq("is_active", true),
        supabase.from("modifier_options").select("*").eq("is_active", true).order("sort_order"),
      ]);
      if (cancelled) return;

      const gMap: Record<string, KioskModifierGroup> = {};
      (mgRes.data || []).forEach((g: any) => {
        gMap[g.id] = {
          id: g.id,
          name: g.name,
          name_en: g.name_en,
          selection_type: g.selection_type === "multiple" ? "multiple" : "single",
          is_required: !!g.is_required,
          min_select: g.min_select ?? 0,
          max_select: g.max_select ?? 1,
          options: [],
        };
      });
      (moRes.data || []).forEach((o: any) => {
        if (gMap[o.group_id]) gMap[o.group_id].options.push({
          id: o.id, group_id: o.group_id, name: o.name, name_en: o.name_en,
          extra_price: Number(o.extra_price || 0), is_default: o.is_default, sort_order: o.sort_order,
        });
      });

      const pgMap: Record<string, string[]> = {};
      (pmgRes.data || []).forEach((row: any) => {
        if (!pgMap[row.product_id]) pgMap[row.product_id] = [];
        pgMap[row.product_id].push(row.group_id);
      });

      setCategories((catsRes.data as any) || []);
      setProducts(((prodsRes.data as any) || []).map((p: any) => ({ ...p, price: Number(p.price || 0) })));
      setProductGroups(pgMap);
      setGroups(gMap);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return { categories, products, productGroups, groups, loading };
}