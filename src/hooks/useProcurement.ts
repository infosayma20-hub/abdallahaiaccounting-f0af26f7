import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

// Types
export interface Supplier {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  address: string | null;
  payment_terms: number;
  opening_balance: number;
  opening_balance_date: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface SupplierItem {
  id: string;
  supplier_id: string;
  user_id: string;
  item_name: string;
  unit: string;
  default_price: number;
  item_code: string | null;
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
  supplier?: Supplier;
  branch?: { id: string; name: string };
  items?: ProcurementOrderItem[];
}

export interface ProcurementOrderItem {
  id: string;
  order_id: string;
  item_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes: string | null;
}

export interface ProcurementInvoice {
  id: string;
  user_id: string;
  branch_id: string | null;
  invoice_number: string;
  supplier_id: string;
  purchase_order_id: string | null;
  invoice_date: string;
  supplier_invoice_number: string | null;
  payment_status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total_amount: number;
  notes: string | null;
  created_at: string;
  supplier?: Supplier;
}

export interface ProcurementInvoiceItem {
  id: string;
  invoice_id: string;
  item_name: string;
  unit: string;
  ordered_quantity: number | null;
  received_quantity: number;
  unit_price: number;
  total_price: number;
  notes: string | null;
}

export interface ProcurementPayment {
  id: string;
  user_id: string;
  supplier_id: string;
  invoice_id: string | null;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
}

function getOwnerId(user: any) {
  return user?.id;
}

export function useSuppliers() {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("procurement_suppliers" as any)
      .select("*")
      .order("name");
    if (!error) setSuppliers((data as any) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (s: Partial<Supplier>) => {
    const ownerId = getOwnerId(user);
    const { error } = await supabase
      .from("procurement_suppliers" as any)
      .insert({ ...s, user_id: ownerId } as any);
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return false; }
    toast({ title: "تم إضافة المورد بنجاح" });
    fetch();
    return true;
  };

  const update = async (id: string, s: Partial<Supplier>) => {
    const { error } = await supabase
      .from("procurement_suppliers" as any)
      .update({ ...s, updated_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return false; }
    toast({ title: "تم تحديث المورد" });
    fetch();
    return true;
  };

  return { suppliers, loading, refetch: fetch, create, update };
}

export function useSupplierItems(supplierId: string | null) {
  const { user } = useAuth();
  const [items, setItems] = useState<SupplierItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!supplierId || !user) { setItems([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("procurement_supplier_items" as any)
      .select("*")
      .eq("supplier_id", supplierId)
      .eq("is_active", true)
      .order("item_name");
    setItems((data as any) || []);
    setLoading(false);
  }, [supplierId, user]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (item: Partial<SupplierItem>) => {
    const ownerId = getOwnerId(user);
    const { error } = await supabase
      .from("procurement_supplier_items" as any)
      .insert({ ...item, supplier_id: supplierId, user_id: ownerId } as any);
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return false; }
    toast({ title: "تم إضافة الصنف" });
    fetch();
    return true;
  };

  const update = async (id: string, item: Partial<SupplierItem>) => {
    const { error } = await supabase
      .from("procurement_supplier_items" as any)
      .update(item as any)
      .eq("id", id);
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return false; }
    fetch();
    return true;
  };

  const remove = async (id: string) => {
    const { error } = await supabase
      .from("procurement_supplier_items" as any)
      .update({ is_active: false } as any)
      .eq("id", id);
    if (!error) fetch();
  };

  return { items, loading, refetch: fetch, create, update, remove };
}

export function useProcurementOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<ProcurementOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("procurement_orders" as any)
      .select("*, procurement_suppliers(*), branches(id, name)")
      .order("created_at", { ascending: false });
    const mapped = ((data as any) || []).map((o: any) => ({
      ...o,
      supplier: o.procurement_suppliers,
      branch: o.branches,
    }));
    setOrders(mapped);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  const createOrder = async (order: any, items: any[]) => {
    const ownerId = getOwnerId(user);
    const totalAmount = items.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
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
    const orderItems = items.map(i => ({
      order_id: orderId,
      item_name: i.item_name,
      unit: i.unit,
      quantity: i.quantity,
      unit_price: i.unit_price,
      total_price: i.quantity * i.unit_price,
    }));
    await supabase.from("procurement_order_items" as any).insert(orderItems as any);
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
    toast({ title: `تم تحديث حالة الطلبية إلى ${status === 'sent' ? 'مُرسلة' : status === 'cancelled' ? 'ملغاة' : status}` });
    fetch();
    return true;
  };

  const getOrderItems = async (orderId: string) => {
    const { data } = await supabase
      .from("procurement_order_items" as any)
      .select("*")
      .eq("order_id", orderId);
    return (data as any) || [];
  };

  return { orders, loading, refetch: fetch, createOrder, updateStatus, getOrderItems };
}

export function useProcurementInvoices() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<ProcurementInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("procurement_invoices" as any)
      .select("*, procurement_suppliers(*)")
      .order("created_at", { ascending: false });
    const mapped = ((data as any) || []).map((i: any) => ({
      ...i,
      supplier: i.procurement_suppliers,
    }));
    setInvoices(mapped);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  const createInvoice = async (invoice: any, items: any[], orderId?: string) => {
    const ownerId = getOwnerId(user);
    const subtotal = items.reduce((s, i) => s + (i.received_quantity * i.unit_price), 0);
    const total = subtotal - (invoice.discount || 0) + (invoice.tax || 0);
    const { data, error } = await supabase
      .from("procurement_invoices" as any)
      .insert({
        user_id: ownerId,
        branch_id: invoice.branch_id,
        supplier_id: invoice.supplier_id,
        purchase_order_id: orderId || null,
        invoice_date: invoice.invoice_date,
        supplier_invoice_number: invoice.supplier_invoice_number || null,
        payment_status: invoice.payment_status || "unpaid",
        subtotal,
        discount: invoice.discount || 0,
        tax: invoice.tax || 0,
        total_amount: total,
        notes: invoice.notes || null,
        created_by: user?.id,
      } as any)
      .select()
      .single();
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return null; }
    const invoiceId = (data as any).id;
    const invItems = items.map(i => ({
      invoice_id: invoiceId,
      item_name: i.item_name,
      unit: i.unit,
      ordered_quantity: i.ordered_quantity || null,
      received_quantity: i.received_quantity,
      unit_price: i.unit_price,
      total_price: i.received_quantity * i.unit_price,
    }));
    await supabase.from("procurement_invoice_items" as any).insert(invItems as any);

    // Update PO status if linked
    if (orderId) {
      const orderItems = await supabase
        .from("procurement_order_items" as any)
        .select("quantity")
        .eq("order_id", orderId);
      const totalOrdered = ((orderItems.data as any) || []).reduce((s: number, i: any) => s + Number(i.quantity), 0);
      const totalReceived = items.reduce((s: number, i: any) => s + Number(i.received_quantity), 0);
      const newStatus = totalReceived >= totalOrdered ? "received" : "partially_received";
      await supabase
        .from("procurement_orders" as any)
        .update({ status: newStatus, updated_at: new Date().toISOString() } as any)
        .eq("id", orderId);
    }

    // Create journal entry: DR Inventory (1140) / CR Supplier Payable (2100)
    await supabase.from("transactions").insert({
      user_id: ownerId,
      transaction_date: invoice.invoice_date,
      description: `فاتورة مشتريات - ${(data as any).invoice_number}`,
      debit_account_code: "1140",
      credit_account_code: "2100",
      amount: total,
      currency: "شيكل",
      transaction_type: "purchase_invoice",
      reference: (data as any).invoice_number,
      payment_method: "آجل",
      idempotency_key: `PROC-INV-${invoiceId}`,
    });

    toast({ title: "تم تسجيل فاتورة المشتريات وتحديث المخزون" });
    fetch();
    return data;
  };

  return { invoices, loading, refetch: fetch, createInvoice };
}

export function useProcurementPayments(supplierId?: string) {
  const { user } = useAuth();
  const [payments, setPayments] = useState<ProcurementPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let q = supabase.from("procurement_payments" as any).select("*").order("payment_date", { ascending: false });
    if (supplierId) q = q.eq("supplier_id", supplierId);
    const { data } = await q;
    setPayments((data as any) || []);
    setLoading(false);
  }, [user, supplierId]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (payment: Partial<ProcurementPayment>) => {
    const ownerId = getOwnerId(user);
    const { error } = await supabase
      .from("procurement_payments" as any)
      .insert({ ...payment, user_id: ownerId } as any);
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return false; }
    toast({ title: "تم تسجيل الدفعة بنجاح" });
    fetch();
    return true;
  };

  return { payments, loading, refetch: fetch, create };
}

export function useBranches() {
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    supabase.from("branches").select("id, name").eq("is_active", true).then(({ data }) => {
      setBranches((data as any) || []);
    });
  }, []);
  return branches;
}
