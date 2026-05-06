import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

// Types
export interface PosSupplier {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  account_name: string | null;
}

export interface ItemCategory {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
}

export interface ProcurementItem {
  id: string;
  category_id: string | null;
  name: string;
  unit: string;
  default_price: number;
  is_active: boolean;
}

export interface ProcurementOrder {
  id: string;
  user_id: string;
  branch_id: string | null;
  order_number: string;
  supplier_id: string;
  order_date: string;
  expected_delivery_date: string | null;
  status: string;
  total_amount: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  supplier?: PosSupplier;
  branch?: { id: string; name: string };
  linked_invoice?: { invoice_number: string } | null;
}

export interface ProcurementOrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  item_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes: string | null;
}

function getOwnerId(user: any) {
  return user?.id;
}

// Fetch suppliers from pos_suppliers
export function useSuppliers() {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<PosSupplier[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("pos_suppliers")
      .select("*")
      .order("name");
    setSuppliers((data as any) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);
  return { suppliers, loading, refetch: fetch };
}

// Fetch item categories
export function useItemCategories() {
  const [categories, setCategories] = useState<ItemCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("item_categories")
      .select("*")
      .order("sort_order")
      .then(({ data }) => {
        setCategories((data as any) || []);
        setLoading(false);
      });
  }, []);

  return { categories, loading };
}

// Fetch procurement items catalog
export function useProcurementItems() {
  const [items, setItems] = useState<ProcurementItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("procurement_items")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => {
        setItems((data as any) || []);
        setLoading(false);
      });
  }, []);

  return { items, loading };
}

// Procurement Orders
export function useProcurementOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<ProcurementOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("procurement_orders" as any)
      .select("*, pos_suppliers(*), branches(id, name)")
      .order("created_at", { ascending: false });
    
    const orderIds = ((data as any) || []).map((o: any) => o.id);
    let linkedInvoices: Record<string, string> = {};
    if (orderIds.length > 0) {
      const { data: invData } = await supabase
        .from("purchase_invoices")
        .select("id, invoice_number, procurement_order_id")
        .in("procurement_order_id", orderIds);
      ((invData as any) || []).forEach((inv: any) => {
        if (inv.procurement_order_id) {
          linkedInvoices[inv.procurement_order_id] = inv.invoice_number;
        }
      });
    }

    const mapped = ((data as any) || []).map((o: any) => ({
      ...o,
      supplier: o.pos_suppliers,
      branch: o.branches,
      linked_invoice: linkedInvoices[o.id] ? { invoice_number: linkedInvoices[o.id] } : null,
    }));
    setOrders(mapped);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  const createOrder = async (order: any, items: any[]) => {
    const ownerId = getOwnerId(user);
    const totalAmount = items.reduce((s: number, i: any) => s + (i.quantity * i.unit_price), 0);
    const { data, error } = await supabase
      .from("procurement_orders" as any)
      .insert({
        user_id: ownerId,
        branch_id: order.branch_id,
        supplier_id: order.supplier_id,
        order_date: order.order_date,
        expected_delivery_date: order.expected_delivery_date || null,
        notes: order.notes || null,
        total_amount: totalAmount,
        created_by: user?.id,
        status: "draft",
      } as any)
      .select()
      .single();
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return null; }
    const orderId = (data as any).id;
    const orderItems = items.map((i: any) => ({
      order_id: orderId,
      product_id: i.product_id || null,
      item_name: i.item_name,
      unit: i.unit,
      quantity: i.quantity,
      unit_price: i.unit_price,
      total_price: i.quantity * i.unit_price,
      branch_id: i.branch_id || null,
    }));
    const { error: itemsError } = await supabase.from("procurement_order_items" as any).insert(orderItems as any);
    if (itemsError) { console.error("Failed to insert order items:", itemsError); toast({ title: "تحذير", description: "تم إنشاء الطلبية لكن فشل حفظ البنود: " + itemsError.message, variant: "destructive" }); }
    toast({ title: "تم إنشاء الطلبية بنجاح" });
    fetch();
    return data;
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("procurement_orders" as any)
      .update({ status, updated_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return false; }
    const labels: Record<string, string> = { sent: "مُرسلة", cancelled: "ملغاة", received: "مستلمة", draft: "مسودة" };
    toast({ title: `تم تحديث حالة الطلبية إلى ${labels[status] || status}` });
    fetch();
    return true;
  };

  const getOrderItems = async (orderId: string): Promise<ProcurementOrderItem[]> => {
    const { data } = await supabase
      .from("procurement_order_items" as any)
      .select("*")
      .eq("order_id", orderId);
    return (data as any) || [];
  };

  return { orders, loading, refetch: fetch, createOrder, updateStatus, getOrderItems };
}

// Purchase invoices
export function usePurchaseInvoices() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("purchase_invoices")
      .select("*, pos_suppliers(*)")
      .order("created_at", { ascending: false });
    const mapped = ((data as any) || []).map((i: any) => ({
      ...i,
      supplier: i.pos_suppliers,
    }));
    setInvoices(mapped);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  const createInvoice = async (invoice: any, items: any[], orderId?: string) => {
    const ownerId = getOwnerId(user);
    const subtotal = items.reduce((s: number, i: any) => s + (i.received_quantity * i.unit_price), 0);
    const total = subtotal - (invoice.discount || 0) + (invoice.tax || 0);

    const isPaid = invoice.payment_status === "paid";
    const creditAccount = isPaid ? "1110" : "2110";
    const dbPaymentMethod = isPaid ? "cash" : "credit";
    const displayPaymentMethod = isPaid ? "نقدي" : "آجل";

    const { data, error } = await supabase
      .from("purchase_invoices")
      .insert({
        user_id: ownerId,
        branch_id: invoice.branch_id || null,
        supplier_id: invoice.supplier_id,
        supplier_name: invoice.supplier_name || null,
        invoice_date: invoice.invoice_date,
        reference_no: invoice.supplier_invoice_number || null,
        subtotal,
        discount_amount: invoice.discount || 0,
        tax_amount: invoice.tax || 0,
        total_amount: total,
        remaining_amount: isPaid ? 0 : total,
        paid_amount: isPaid ? total : 0,
        status: isPaid ? "approved" : "pending",
        payment_method: dbPaymentMethod,
        notes: invoice.notes || null,
        created_by: user?.id,
        procurement_order_id: orderId || null,
        image_url: invoice.image_url || null,
      } as any)
      .select()
      .single();
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return null; }
    const invoiceId = (data as any).id;

    const invItems = items.map((i: any) => ({
      invoice_id: invoiceId,
      product_id: i.product_id || null,
      product_name: i.item_name,
      unit: i.unit,
      quantity: i.received_quantity,
      unit_price: i.unit_price,
      total_amount: i.received_quantity * i.unit_price,
      expiry_date: i.expiry_date || null,
    }));
    await supabase.from("purchase_invoice_items").insert(invItems as any);

    if (orderId) {
      const { data: orderItems } = await supabase
        .from("procurement_order_items" as any)
        .select("quantity")
        .eq("order_id", orderId);
      const totalOrdered = ((orderItems as any) || []).reduce((s: number, i: any) => s + Number(i.quantity), 0);
      const totalReceived = items.reduce((s: number, i: any) => s + Number(i.received_quantity), 0);
      const newStatus = totalReceived >= totalOrdered ? "received" : "partially_received";
      await supabase
        .from("procurement_orders" as any)
        .update({ status: newStatus, updated_at: new Date().toISOString() } as any)
        .eq("id", orderId);
    }

    // Ensure supplier exists in contacts table for account statement linking
    let contactId: string | null = null;
    // First try to find existing contact by name match (since pos_suppliers and contacts have different IDs)
    const supplierName = invoice.supplier_name || "";
    if (supplierName) {
      const { data: contactByName } = await supabase
        .from("contacts")
        .select("id")
        .eq("user_id", ownerId)
        .eq("contact_type", "مورد")
        .eq("contact_name", supplierName)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (contactByName) {
        contactId = contactByName.id;
      }
    }
    // Fallback: try by supplier_id directly (in case IDs match)
    if (!contactId) {
      const { data: contactById } = await supabase.from("contacts").select("id").eq("id", invoice.supplier_id).maybeSingle();
      if (contactById) contactId = contactById.id;
    }
    // Last resort: create a new contact record
    if (!contactId) {
      const { data: newContact } = await supabase.from("contacts").insert({
        user_id: ownerId,
        contact_name: supplierName || "مورد",
        contact_type: "مورد",
        phone: invoice.supplier_phone || null,
        is_active: true,
        linked_account_code: "2110",
      } as any).select("id").single();
      if (newContact) contactId = (newContact as any).id;
    }

    const { data: txData, error: txError } = await supabase.from("transactions").insert({
      user_id: ownerId,
      transaction_date: invoice.invoice_date,
      description: `فاتورة مشتريات - ${(data as any).invoice_number} - ${invoice.supplier_name || ""}`,
      debit_account_code: "1140",
      credit_account_code: creditAccount,
      amount: total,
      currency: "شيكل",
      transaction_type: "purchase_invoice",
      reference: (data as any).invoice_number,
      payment_method: displayPaymentMethod,
      idempotency_key: `PROC-INV-${invoiceId}`,
      contact_id: contactId,
    }).select("id").single();
    if (txError) { console.error("Transaction insert failed:", txError); }

    // Link transaction back to purchase invoice
    if (txData) {
      await supabase.from("purchase_invoices")
        .update({ linked_transaction_id: (txData as any).id } as any)
        .eq("id", invoiceId);
    }

    toast({ title: "✅ تم إنشاء فاتورة المشتريات وتحديث المخزون والقيد المحاسبي" });
    fetch();
    return data;
  };

  return { invoices, loading, refetch: fetch, createInvoice };
}

export function useBranches() {
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const fetchBranches = useCallback(() => {
    supabase.from("branches").select("id, name").eq("is_active", true).then(({ data }) => {
      setBranches((data as any) || []);
    });
  }, []);
  useEffect(() => { fetchBranches(); }, [fetchBranches]);
  return { branches, refetchBranches: fetchBranches };
}
