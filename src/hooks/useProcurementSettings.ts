import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

// ── Suppliers CRUD ──
export function useSuppliersCrud() {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("pos_suppliers").select("*").order("name");
    setSuppliers((data as any) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (supplier: any) => {
    const { error } = await supabase.from("pos_suppliers").insert({
      ...supplier, user_id: dataOwnerId!,
    } as any);
    if (error) { toast({ title: "❌ خطأ", description: error.message, variant: "destructive" }); return false; }
    toast({ title: "✅ تم حفظ المورد بنجاح" });
    fetch();
    return true;
  };

  const update = async (id: string, supplier: any) => {
    const { error } = await supabase.from("pos_suppliers").update(supplier as any).eq("id", id);
    if (error) { toast({ title: "❌ خطأ", description: error.message, variant: "destructive" }); return false; }
    toast({ title: "✅ تم تحديث المورد بنجاح" });
    fetch();
    return true;
  };

  const remove = async (id: string) => {
    // Check for linked orders/invoices
    const { data: orders } = await supabase.from("procurement_orders" as any).select("id").eq("supplier_id", id).limit(1);
    const { data: invoices } = await supabase.from("purchase_invoices").select("id").eq("supplier_id", id).limit(1);
    if (((orders as any) || []).length > 0 || ((invoices as any) || []).length > 0) {
      return "has_data";
    }
    const { error } = await supabase.from("pos_suppliers").delete().eq("id", id);
    if (error) { toast({ title: "❌ خطأ", description: error.message, variant: "destructive" }); return false; }
    toast({ title: "✅ تم حذف المورد" });
    fetch();
    return true;
  };

  const deactivate = async (id: string) => {
    await supabase.from("pos_suppliers").update({ is_active: false } as any).eq("id", id);
    toast({ title: "✅ تم تعطيل المورد" });
    fetch();
  };

  return { suppliers, loading, refetch: fetch, create, update, remove, deactivate };
}

// ── Categories CRUD ──
export function useCategoriesCrud() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("item_categories").select("*").order("sort_order");
    setCategories((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (cat: any) => {
    const maxSort = categories.length > 0 ? Math.max(...categories.map(c => c.sort_order || 0)) + 1 : 1;
    const { error } = await supabase.from("item_categories").insert({ ...cat, sort_order: cat.sort_order || maxSort, user_id: dataOwnerId! } as any);
    if (error) { toast({ title: "❌ خطأ", description: error.message, variant: "destructive" }); return false; }
    toast({ title: "✅ تم حفظ التصنيف" });
    fetch();
    return true;
  };

  const update = async (id: string, cat: any) => {
    const { error } = await supabase.from("item_categories").update(cat as any).eq("id", id);
    if (error) { toast({ title: "❌ خطأ", description: error.message, variant: "destructive" }); return false; }
    toast({ title: "✅ تم تحديث التصنيف" });
    fetch();
    return true;
  };

  const remove = async (id: string) => {
    const { data: items } = await supabase.from("procurement_items").select("id").eq("category_id", id).limit(1);
    if (((items as any) || []).length > 0) return "has_items";
    const { error } = await supabase.from("item_categories").delete().eq("id", id);
    if (error) { toast({ title: "❌ خطأ", description: error.message, variant: "destructive" }); return false; }
    toast({ title: "✅ تم حذف التصنيف" });
    fetch();
    return true;
  };

  const moveItemsAndDelete = async (fromId: string, toId: string) => {
    await supabase.from("procurement_items").update({ category_id: toId } as any).eq("category_id", fromId);
    await supabase.from("item_categories").delete().eq("id", fromId);
    toast({ title: "✅ تم نقل الأصناف وحذف التصنيف" });
    fetch();
  };

  const reorder = async (orderedIds: string[]) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await supabase.from("item_categories").update({ sort_order: i + 1 } as any).eq("id", orderedIds[i]);
    }
    fetch();
  };

  return { categories, loading, refetch: fetch, create, update, remove, moveItemsAndDelete, reorder };
}

// ── Items CRUD ──
export function useItemsCrud() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("procurement_items").select("*, item_categories(name, color, icon)").order("sort_order");
    setItems((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (item: any) => {
    const { error } = await supabase.from("procurement_items").insert({ ...item, user_id: dataOwnerId! } as any);
    if (error) { toast({ title: "❌ خطأ", description: error.message, variant: "destructive" }); return false; }
    toast({ title: "✅ تم حفظ الصنف" });
    fetch();
    return true;
  };

  const update = async (id: string, item: any) => {
    const { error } = await supabase.from("procurement_items").update(item as any).eq("id", id);
    if (error) { toast({ title: "❌ خطأ", description: error.message, variant: "destructive" }); return false; }
    toast({ title: "✅ تم تحديث الصنف" });
    fetch();
    return true;
  };

  const remove = async (id: string) => {
    // Check pending orders
    const { data: orderItems } = await supabase
      .from("procurement_order_items" as any)
      .select("id, procurement_orders!inner(status)")
      .eq("product_id", id);
    const pendingItems = ((orderItems as any) || []).filter((oi: any) =>
      oi.procurement_orders?.status === "draft" || oi.procurement_orders?.status === "sent"
    );
    if (pendingItems.length > 0) return "in_pending_orders";
    const { error } = await supabase.from("procurement_items").delete().eq("id", id);
    if (error) { toast({ title: "❌ خطأ", description: error.message, variant: "destructive" }); return false; }
    toast({ title: "✅ تم حذف الصنف" });
    fetch();
    return true;
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    await supabase.from("procurement_items").update({ is_active: isActive } as any).eq("id", id);
    toast({ title: isActive ? "✅ تم تفعيل الصنف" : "✅ تم تعطيل الصنف" });
    fetch();
  };

  const bulkChangeCategory = async (ids: string[], categoryId: string) => {
    for (const id of ids) {
      await supabase.from("procurement_items").update({ category_id: categoryId } as any).eq("id", id);
    }
    toast({ title: "✅ تم تغيير التصنيف" });
    fetch();
  };

  const bulkToggleActive = async (ids: string[], isActive: boolean) => {
    for (const id of ids) {
      await supabase.from("procurement_items").update({ is_active: isActive } as any).eq("id", id);
    }
    toast({ title: isActive ? "✅ تم تفعيل الأصناف" : "✅ تم تعطيل الأصناف" });
    fetch();
  };

  return { items, loading, refetch: fetch, create, update, remove, toggleActive, bulkChangeCategory, bulkToggleActive };
}
