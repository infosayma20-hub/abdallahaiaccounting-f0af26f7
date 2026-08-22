import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { syncContactFromOrder, syncProductsFromOrderItems } from "@/lib/order-contact-sync";
import { defaultForm, type Item, type OrderForm } from "./constants";

interface UseOrderFormArgs {
  user: { id: string } | null;
  editId?: string;
}

export function useOrderForm({ user, editId }: UseOrderFormArgs) {
  const isEdit = !!editId;
  const navigate = useNavigate();

  const [form, setForm] = useState<OrderForm>(defaultForm);
  const [items, setItems] = useState<Item[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const prods = await fetchAllRows<any>((from, to) =>
        supabase.from("products").select("*").eq("user_id", user.id).range(from, to)
      );
      setProducts(prods || []);

      const cts = await fetchAllRows<any>((from, to) =>
        supabase.from("contacts")
          .select("id, contact_name, phone, address, contact_type")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .in("contact_type", ["عميل", "عميل ومورد"])
          .order("contact_name")
          .range(from, to)
      );
      setContacts(cts || []);

      const { data: sups } = await supabase
        .from("pos_suppliers" as any)
        .select("id, name")
        .eq("user_id", user.id)
        .order("name");
      setSuppliers((sups as any[]) || []);

      if (isEdit && editId) {
        const [{ data: ord }, { data: its }] = await Promise.all([
          supabase.from("orders").select("*").eq("id", editId).maybeSingle(),
          supabase.from("order_items").select("*").eq("order_id", editId),
        ]);
        if (ord) {
          const o: any = ord;
          setForm({
            manual_ref: o.manual_ref || "",
            customer_name: o.customer_name || "",
            customer_phone: o.customer_phone || "",
            customer_address: o.customer_address || "",
            customer_profile_url: o.customer_profile_url || "",
            customer_profile_platform: o.customer_profile_platform || "none",
            order_date: o.order_date,
            delivery_date: o.delivery_date || "",
            status: o.status || "جديد",
            subtotal: Number(o.subtotal || 0),
            discount: Number(o.discount || 0),
            shipping_cost: Number(o.shipping_cost || 0),
            total: Number(o.total || 0),
            payment_status: o.payment_status || "غير مدفوع",
            payment_method: o.payment_method || "كاش",
            shipping_method: o.shipping_method || "",
            tracking_number: o.tracking_number || "",
            source: o.source || "يدوي",
            notes: o.notes || "",
          });
        }
        setItems(((its as any[]) || []).map((it) => ({
          id: it.id,
          product_name: it.product_name,
          fabric: it.fabric ?? null,
          supplier_id: it.supplier_id ?? null,
          procurement_order_id: it.procurement_order_id ?? null,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          discount: Number(it.discount || 0),
          total: Number(it.total),
        })));
        setLoading(false);
      }
    })();
  }, [user, editId, isEdit]);

  const recalcTotal = useCallback((next: Item[]) => {
    const subtotal = next.reduce((s, i) => s + i.total, 0);
    setForm((prev) => ({ ...prev, subtotal, total: subtotal - prev.discount + prev.shipping_cost }));
  }, []);

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, { product_name: "", fabric: null, quantity: 1, unit_price: 0, discount: 0, total: 0 }]);
  }, []);

  const updateItem = useCallback((idx: number, field: keyof Item, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      (next[idx] as any)[field] = value;
      if (field === "product_name") {
        const prod = products.find((p) => p.name === value);
        if (prod) {
          next[idx].unit_price = Number(prod.sell_price);
          next[idx].product_id = prod.id;
        } else {
          next[idx].product_id = null;
        }
      }
      next[idx].total = next[idx].quantity * next[idx].unit_price - next[idx].discount;
      recalcTotal(next);
      return next;
    });
  }, [products, recalcTotal]);

  const removeItem = useCallback((idx: number) => {
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      recalcTotal(next);
      return next;
    });
  }, [recalcTotal]);

  const handleSave = useCallback(async () => {
    if (!user) return;
    if (!form.customer_name.trim()) { toast.error("اسم العميل مطلوب"); return; }
    setSaving(true);
    try {
      const payload: any = {
        ...form,
        user_id: user.id,
        manual_ref: (form as any).manual_ref?.trim() || null,
        delivery_date: form.delivery_date || null,
        customer_profile_platform: form.customer_profile_platform === "none" ? null : form.customer_profile_platform,
        customer_profile_url: form.customer_profile_url?.trim() || null,
      };

      if (isEdit && editId) {
        const { error } = await supabase.from("orders").update(payload).eq("id", editId);
        if (error) throw error;
        await supabase.from("order_items").delete().eq("order_id", editId);
        if (items.length > 0) {
          const rows = items.map((i) => ({
            order_id: editId,
            user_id: user.id,
            product_id: i.product_id || null,
            product_name: i.product_name,
            fabric: i.fabric || null,
            supplier_id: i.supplier_id || null,
            procurement_order_id: i.procurement_order_id || null,
            quantity: i.quantity,
            unit_price: i.unit_price,
            discount: i.discount,
            total: i.total,
          }));
          const { error: itErr } = await supabase.from("order_items").insert(rows as any);
          if (itErr) throw itErr;
        }
        toast.success("تم حفظ التعديلات ✅");
      } else {
        payload.order_number = `ORD-${Date.now().toString(36).toUpperCase()}`;
        const { data, error } = await supabase.from("orders").insert(payload).select();
        if (error || !data?.[0]) throw error || new Error("فشل الإنشاء");
        const newId = data[0].id;
        if (items.length > 0) {
          const rows = items.map((i) => ({
            order_id: newId,
            user_id: user.id,
            product_id: i.product_id || null,
            product_name: i.product_name,
            fabric: i.fabric || null,
            supplier_id: i.supplier_id || null,
            quantity: i.quantity,
            unit_price: i.unit_price,
            discount: i.discount,
            total: i.total,
          }));
          await supabase.from("order_items").insert(rows as any);
        }
        await syncContactFromOrder({
          id: newId,
          user_id: user.id,
          customer_name: form.customer_name,
          customer_phone: form.customer_phone,
          customer_address: form.customer_address,
          order_number: payload.order_number,
          source: form.source,
        }).catch(() => {});
        await syncProductsFromOrderItems(newId, user.id).catch(() => {});
        toast.success("تم إنشاء الطلبية بنجاح ✅");
      }
      navigate("/orders");
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("orders_manual_ref_uniq") || e?.code === "23505") {
        toast.error("رقم الطلبية اليدوي مستخدم مسبقاً في طلبية أخرى — اختر رقماً مختلفاً");
      } else {
        toast.error("خطأ: " + (msg || "غير معروف"));
      }
    } finally {
      setSaving(false);
    }
  }, [user, form, items, isEdit, editId, navigate]);

  /** Quick-add a supplier to the procurement directory from the order form */
  const createSupplier = async (name: string): Promise<string | null> => {
    if (!user) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    const { data, error } = await supabase
      .from("pos_suppliers" as any)
      .insert({ user_id: user.id, name: trimmed } as any)
      .select("id")
      .single();
    if (error) {
      toast.error("فشل إضافة المورد: " + error.message);
      return null;
    }
    const newId = (data as any).id as string;
    setSuppliers((prev) => [...prev, { id: newId, name: trimmed }].sort((a, b) => a.name.localeCompare(b.name, "ar")));
    toast.success(`تمت إضافة المورد «${trimmed}»`);
    return newId;
  };

  return {
    form, setForm,
    items, setItems,
    products, setProducts,
    contacts, setContacts,
    suppliers, createSupplier,
    loading, saving,
    addItem, updateItem, removeItem, recalcTotal,
    handleSave,
    isEdit,
  };
}