import { supabase } from "@/integrations/supabase/client";

/**
 * Sync contact from order data — match existing or create new
 */
export async function syncContactFromOrder(order: {
  id: string;
  user_id: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  order_number?: string | null;
  source?: string | null;
}, sourceTable: "orders" | "qamar_orders" = "orders"): Promise<string | null> {
  const userId = order.user_id;
  const customerName = order.customer_name?.trim();
  const customerPhone = order.customer_phone?.replace(/[^0-9+]/g, "")?.trim();

  if (!customerName) return null;

  let contactId: string | null = null;

  // 1. Match by phone (most reliable)
  if (customerPhone && customerPhone.length >= 9) {
    const last9 = customerPhone.slice(-9);
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("user_id", dataOwnerId!)
      .or(`phone.eq.${customerPhone},phone.eq.0${last9},phone.ilike.%${last9}`)
      .limit(1)
      .maybeSingle();
    if (data) contactId = data.id;
  }

  // 2. Match by exact name
  if (!contactId) {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("user_id", dataOwnerId!)
      .eq("contact_name", customerName)
      .limit(1)
      .maybeSingle();
    if (data) contactId = data.id;
  }

  // 3. No match → create new contact
  if (!contactId) {
    const sourceLabel = mapSourceLabel(order.source);
    const { data: newContact } = await supabase
      .from("contacts")
      .insert({
        user_id: dataOwnerId!,
        contact_name: customerName,
        contact_type: "عميل",
        phone: customerPhone || null,
        address: order.customer_address || null,
        source: sourceLabel,
        created_from_order: true,
        is_active: true,
        notes: `تم إنشاؤه تلقائياً من طلبية ${order.order_number || ""}`.trim(),
      } as any)
      .select("id")
      .single();
    contactId = newContact?.id || null;
  } else {
    // Update missing fields on existing contact
    const updates: Record<string, any> = {};
    if (customerPhone) {
      const { data: existing } = await supabase
        .from("contacts")
        .select("phone, address")
        .eq("id", contactId)
        .single();
      if (existing && !existing.phone) updates.phone = customerPhone;
      if (existing && !existing.address && order.customer_address) updates.address = order.customer_address;
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from("contacts").update(updates).eq("id", contactId);
    }
  }

  // 4. Link contact to order
  if (contactId) {
    await supabase
      .from(sourceTable as any)
      .update({ contact_id: contactId } as any)
      .eq("id", order.id);
  }

  return contactId;
}

/**
 * Sync products from order items — match existing or create new
 */
export async function syncProductsFromOrderItems(
  orderId: string,
  userId: string
): Promise<number> {
  // Try order_items first, then qamar_order_items
  let { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId);

  let fromQamar = false;
  if (!items || items.length === 0) {
    const { data: qItems } = await supabase
      .from("qamar_order_items" as any)
      .select("*")
      .eq("order_id", orderId);
    items = (qItems as any[]) || [];
    fromQamar = true;
  }

  if (!items || items.length === 0) return 0;

  let synced = 0;

  for (const item of items) {
    const raw = item as any;
    const productName = (raw.product_name)?.trim();
    if (!productName) continue;
    if (raw.product_id) { synced++; continue; } // already linked

    // 1. Match by name (case-insensitive)
    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .eq("user_id", dataOwnerId!)
      .ilike("name", productName)
      .limit(1)
      .maybeSingle();

    let productId: string | null = existing?.id || null;

    if (!productId) {
      // 2. Create new product
      const unitPrice = fromQamar ? (raw.price || 0) : (raw.unit_price || 0);
      const { data: newProduct, error } = await supabase
        .from("products")
        .insert({
          user_id: dataOwnerId!,
          name: productName,
          sell_price: unitPrice,
          category: "متجر إلكتروني",
          source: "e-commerce",
          is_sold: true,
          is_purchased: false,
          is_pos_product: false,
          quantity: 0,
          notes: "تم إنشاؤه تلقائياً من المتجر الإلكتروني",
        } as any)
        .select("id")
        .single();
      if (error) {
        console.error("Failed to create product:", productName, error.message);
        continue;
      }
      productId = newProduct?.id || null;
    }

    // 3. Link product to order item
    if (productId) {
      const table = fromQamar ? "qamar_order_items" : "order_items";
      await supabase
        .from(table as any)
        .update({ product_id: productId } as any)
        .eq("id", raw.id);
      synced++;
    }
  }

  return synced;
}

/**
 * Retroactive sync: process all orders that have no contact_id
 */
export async function retroactiveSyncOrders(userId: string): Promise<{ contactsLinked: number; productsLinked: number }> {
  let contactsLinked = 0;
  let productsLinked = 0;

  // Sync from orders table
  const { data: unlinkedOrders } = await supabase
    .from("orders")
    .select("id, user_id, customer_name, customer_phone, customer_address, order_number, source")
    .eq("user_id", dataOwnerId!)
    .is("contact_id" as any, null);

  for (const order of (unlinkedOrders || [])) {
    const cid = await syncContactFromOrder(order as any, "orders");
    if (cid) contactsLinked++;
    const ps = await syncProductsFromOrderItems(order.id, userId);
    productsLinked += ps;
  }

  // Sync from qamar_orders table
  const { data: qamarOrders } = await supabase
    .from("qamar_orders" as any)
    .select("id, user_id, customer_name, customer_phone, customer_address, reference_number, source")
    .eq("user_id", dataOwnerId!);

  for (const q of (qamarOrders as any[] || [])) {
    const cid = await syncContactFromOrder({
      id: q.id,
      user_id: q.user_id,
      customer_name: q.customer_name,
      customer_phone: q.customer_phone,
      customer_address: q.customer_address,
      order_number: q.reference_number,
      source: q.source,
    }, "qamar_orders");
    if (cid) contactsLinked++;
    // Also sync products from qamar_order_items
    const ps = await syncProductsFromOrderItems(q.id, userId);
    productsLinked += ps;
  }

  return { contactsLinked, productsLinked };
}

function mapSourceLabel(source?: string | null): string {
  if (!source) return "e-commerce";
  const s = source.toLowerCase();
  if (s.includes("واتساب") || s.includes("whatsapp")) return "whatsapp";
  if (s.includes("انستغرام") || s.includes("instagram")) return "instagram";
  if (s.includes("متجر") || s.includes("e-commerce") || s.includes("قمر")) return "e-commerce";
  return "e-commerce";
}

/**
 * Get display label for contact source
 */
export function getSourceDisplay(source?: string | null): { label: string; icon: string; bg: string; color: string; border: string } {
  switch (source) {
    case "e-commerce":
      return { label: "متجر إلكتروني", icon: "🛒", bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" };
    case "whatsapp":
      return { label: "واتساب", icon: "💬", bg: "#ECFDF5", color: "#065F46", border: "#A7F3D0" };
    case "instagram":
      return { label: "انستغرام", icon: "📸", bg: "#FDF2F8", color: "#9D174D", border: "#FBCFE8" };
    case "manual":
    default:
      return { label: "يدوي", icon: "✏️", bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" };
  }
}
