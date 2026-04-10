import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Status mapping: English (Qamar) → Arabic (Amwali)
const statusMapToArabic: Record<string, string> = {
  draft: "مسودة",
  new: "جديد",
  reviewing: "قيد المراجعة",
  confirmed: "مؤكد",
  in_production: "قيد التصنيع",
  inspection: "جاهز للفحص",
  ready_to_invoice: "جاهز للفوترة",
  ready_delivery: "جاهز للتسليم",
  delivering: "قيد التوصيل",
  delivered: "تم التسليم",
  invoiced: "مفوتر",
  cancelled: "ملغي",
  postponed: "مؤجل",
};

const DEFAULT_OWNER_ID = "ccdbcaa5-a585-4d84-a559-a4fc94a6075b";

// ── Cascade delete helper ──
const deleteOrderCascade = async (
  supabase: any,
  userId: string,
  orderNumber: string,
  deletedBy: string,
  reason: string
) => {
  // Find order
  const { data: order, error } = await supabase
    .from("qamar_orders")
    .select("id, linked_invoice_id, total, status")
    .eq("reference_number", orderNumber)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !order) {
    return { success: false, error: "Order not found", order_number: orderNumber };
  }

  const orderId = order.id;
  let invoiceDeleted = false;
  let transactionsDeleted = 0;

  // Delete linked invoice + its items + transactions
  if (order.linked_invoice_id) {
    await supabase.from("invoice_items").delete().eq("invoice_id", order.linked_invoice_id);

    // Soft-delete linked transactions by reference
    const { data: linkedTxs } = await supabase
      .from("transactions")
      .select("id")
      .eq("user_id", userId)
      .or(`reference.eq.${orderNumber},idempotency_key.like.%${orderId}%`)
      .eq("is_deleted", false);

    if (linkedTxs?.length) {
      for (const tx of linkedTxs) {
        await supabase.from("transactions").update({ is_deleted: true }).eq("id", tx.id);
        transactionsDeleted++;
      }
    }

    await supabase.from("invoices").delete().eq("id", order.linked_invoice_id);
    invoiceDeleted = true;
  }

  // Soft-delete delivery transactions
  const { data: deliveryTxs } = await supabase
    .from("transactions")
    .select("id")
    .eq("user_id", userId)
    .like("idempotency_key", `DELIVERY-${orderId}%`)
    .eq("is_deleted", false);

  if (deliveryTxs?.length) {
    for (const tx of deliveryTxs) {
      await supabase.from("transactions").update({ is_deleted: true }).eq("id", tx.id);
      transactionsDeleted++;
    }
  }

  // Delete status log
  await supabase.from("order_status_log").delete().eq("order_id", orderId);

  // Delete qamar_order_items
  await supabase.from("qamar_order_items").delete().eq("order_id", orderId);

  // Delete from legacy orders table too
  await supabase.from("order_items").delete().eq("order_id", orderId);
  await supabase.from("orders").delete().eq("order_number", orderNumber).eq("user_id", userId);

  // Delete the qamar order itself
  await supabase.from("qamar_orders").delete().eq("id", orderId);

  // Audit log
  await supabase.from("sync_audit_log").insert({
    user_id: userId,
    action: "order_deleted",
    reference: orderNumber,
    details: {
      order_id: orderId,
      had_invoice: !!order.linked_invoice_id,
      invoice_deleted: invoiceDeleted,
      transactions_deleted: transactionsDeleted,
      deleted_by: deletedBy,
      reason,
      total: order.total,
    },
  });

  return {
    success: true,
    order_number: orderNumber,
    deleted: { invoice: invoiceDeleted, transactions: transactionsDeleted },
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();

    // 1. Validate shared secret
    const SHARED_SECRET = Deno.env.get("QAMAR_SHARED_SECRET");
    if (!SHARED_SECRET || body.secret !== SHARED_SECRET) {
      return json({ error: "Unauthorized" }, 401);
    }

    const order = body.order;
    const syncType = body.sync_type || order?.sync_type || "new";

    // 2. Create Supabase client with service role (bypasses RLS)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Handle order deletion ──
    if (syncType === "order_deleted") {
      const orderNumber = body.order_number || order?.reference_number;
      if (!orderNumber) return json({ error: "Missing order_number" }, 400);
      const result = await deleteOrderCascade(supabase, DEFAULT_OWNER_ID, orderNumber, body.deleted_by || "system", body.reason || "manual");
      return json(result, result.success ? 200 : 404);
    }

    // ── Handle bulk order deletion ──
    if (syncType === "bulk_orders_deleted") {
      const orderNumbers: string[] = body.order_numbers || [];
      if (!orderNumbers.length) return json({ error: "Missing order_numbers" }, 400);
      const results = [];
      for (const orderNumber of orderNumbers) {
        const result = await deleteOrderCascade(supabase, DEFAULT_OWNER_ID, orderNumber, body.deleted_by || "system", body.reason || "test_cleanup");
        results.push(result);
      }
      const succeeded = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      return json({ success: true, total: orderNumbers.length, deleted: succeeded, failed, details: results });
    }

    // ── Handle order_status_updated from Qamar trigger webhook ──
    if (body.event === "order_status_updated" || body.event_type === "order_status_updated") {
      const orderNumber = body.order_number;
      if (!orderNumber) return json({ error: "Missing order_number" }, 400);

      const { data: existingOrder } = await supabase
        .from("qamar_orders")
        .select("id, status")
        .eq("reference_number", orderNumber)
        .eq("user_id", DEFAULT_OWNER_ID)
        .maybeSingle();

      if (!existingOrder) {
        return json({ error: "Order not found", order_number: orderNumber }, 404);
      }

      const newStatusEn = body.new_status?.toLowerCase();
      const arabicNewStatus = statusMapToArabic[newStatusEn] || body.new_status || existingOrder.status;
      const oldStatus = existingOrder.status;

      if (oldStatus === arabicNewStatus) {
        return json({ success: true, skipped: true, message: "Status unchanged" });
      }

      const { error: updateErr } = await supabase
        .from("qamar_orders")
        .update({
          status: arabicNewStatus,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", existingOrder.id);

      if (updateErr) return json({ error: updateErr.message }, 500);

      await supabase.from("order_status_log").insert({
        user_id: DEFAULT_OWNER_ID,
        order_id: existingOrder.id,
        order_table: "qamar_orders",
        from_status: oldStatus,
        to_status: arabicNewStatus,
        changed_by: DEFAULT_OWNER_ID,
        changed_by_name: body.updated_by || "قمر براند (trigger)",
        changed_by_role: "external_system",
        notes: `تحديث حالة تلقائي من قمر براند`,
        metadata: {
          sync_type: "order_status_updated",
          source: "qamar_trigger",
          old_status_en: body.old_status,
          new_status_en: body.new_status,
          qamar_order_id: body.order_id,
          updated_at: body.updated_at,
        },
      });

      return json({
        success: true,
        order_number: orderNumber,
        from_status: oldStatus,
        to_status: arabicNewStatus,
      });
    }

    if (!order) {
      return json({ error: "Missing order data" }, 400);
    }

    const refNumber = order.reference_number;
    if (!refNumber) {
      return json({ error: "Missing reference_number" }, 400);
    }

    // 3. Check if order already exists by reference_number
    const { data: existing } = await supabase
      .from("qamar_orders")
      .select("id, status")
      .eq("reference_number", refNumber)
      .eq("user_id", DEFAULT_OWNER_ID)
      .maybeSingle();

    // Map status from English to Arabic
    const arabicStatus = statusMapToArabic[order.status?.toLowerCase()] || order.status || "جديد";

    // Build address
    const addressParts: string[] = [];
    if (order.customer_city) addressParts.push(order.customer_city);
    if (order.customer_address) addressParts.push(order.customer_address);
    const fullAddress = addressParts.join("، ") || null;

    // Calculate subtotal from items if not provided
    const items = Array.isArray(order.items) ? order.items : [];
    const subtotal =
      order.subtotal ??
      items.reduce(
        (sum: number, item: any) =>
          sum + (item.quantity || 1) * (item.price || 0),
        0
      );

    let amwaliOrderId: string;

    // ─────────────────────────────────────────────
    // Handle by sync_type
    // ─────────────────────────────────────────────

    // ── Handle delivery_settled sync ──
    if (syncType === "delivery_settled" && existing) {
      if (existing.status === "delivery_settled_done") {
        // Already settled - skip unless force
        if (!order.force) {
          return json({ error: "Already settled", reference_number: refNumber }, 409);
        }
      }

      const shippingEstimate = order.shipping_estimate ?? order.shipping_cost ?? 0;
      const shippingFinal = order.shipping_final ?? 0;
      const driverCost = order.driver_cost ?? 0;
      const netDelivery = order.net_delivery ?? (shippingFinal - driverCost);

      const { error: updateErr } = await supabase
        .from("qamar_orders")
        .update({
          shipping_estimate: shippingEstimate,
          shipping_final: shippingFinal,
          driver_cost: driverCost,
          net_delivery: netDelivery,
          shipping_settled: true,
          shipping_settled_at: order.settled_at || new Date().toISOString(),
          shipping_settled_by: order.settled_by || "admin",
          shipping_notes: order.shipping_notes || order.notes || null,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (updateErr) {
        return json({ error: updateErr.message }, 500);
      }

      // If shipping_final differs from estimate, update total
      if (shippingFinal !== shippingEstimate) {
        const { data: currentOrder } = await supabase
          .from("qamar_orders")
          .select("total, shipping_cost")
          .eq("id", existing.id)
          .single();

        if (currentOrder) {
          const oldShipping = currentOrder.shipping_cost || shippingEstimate;
          const totalDiff = shippingFinal - oldShipping;
          await supabase
            .from("qamar_orders")
            .update({
              shipping_cost: shippingFinal,
              total: (currentOrder.total || 0) + totalDiff,
            })
            .eq("id", existing.id);
        }
      }

      // Log settlement
      await supabase.from("order_status_log").insert({
        user_id: DEFAULT_OWNER_ID,
        order_id: existing.id,
        order_table: "qamar_orders",
        from_status: existing.status,
        to_status: existing.status,
        changed_by: DEFAULT_OWNER_ID,
        changed_by_name: order.settled_by || "قمر براند (تسوية)",
        changed_by_role: "external_system",
        notes: `تسوية توصيل: نهائي ₪${shippingFinal} | سائق ₪${driverCost} | صافي ₪${netDelivery}`,
        metadata: {
          sync_type: syncType,
          shipping_estimate: shippingEstimate,
          shipping_final: shippingFinal,
          driver_cost: driverCost,
          net_delivery: netDelivery,
        },
      });

      // Create accounting entry for delivery if amounts exist
      if (shippingFinal > 0 || driverCost > 0) {
        // Delivery revenue entry: debit cash/receivable, credit delivery revenue
        const idempotencyKey = `DELIVERY-${existing.id}`;
        
        // Check if entry already exists
        const { data: existingTx } = await supabase
          .from("transactions")
          .select("id")
          .eq("idempotency_key", idempotencyKey)
          .eq("user_id", DEFAULT_OWNER_ID)
          .maybeSingle();

        if (!existingTx) {
          // Revenue entry: shipping_final as delivery revenue
          if (shippingFinal > 0) {
            await supabase.from("transactions").insert({
              user_id: DEFAULT_OWNER_ID,
              transaction_date: new Date().toISOString().split("T")[0],
              description: `إيراد توصيل — طلبية ${refNumber}`,
              debit_account_code: "1130", // ذمم عملاء
              credit_account_code: "4100", // إيرادات
              amount: shippingFinal,
              currency: "شيكل",
              transaction_type: "delivery_revenue",
              reference: refNumber,
              idempotency_key: idempotencyKey,
            });
          }

          // Expense entry: driver_cost
          if (driverCost > 0) {
            await supabase.from("transactions").insert({
              user_id: DEFAULT_OWNER_ID,
              transaction_date: new Date().toISOString().split("T")[0],
              description: `تكلفة سائق — طلبية ${refNumber}`,
              debit_account_code: "5160", // مصاريف توصيل
              credit_account_code: "1110", // الصندوق
              amount: driverCost,
              currency: "شيكل",
              transaction_type: "delivery_expense",
              reference: refNumber,
              idempotency_key: `${idempotencyKey}-COST`,
            });
          }
        }
      }

      amwaliOrderId = existing.id;

    } else if (syncType === "status_update" && existing) {
      // Only update status + log
      const oldStatus = existing.status;

      // Build update payload
      const updatePayload: Record<string, unknown> = {
        status: arabicStatus,
        last_synced_at: new Date().toISOString(),
      };

      // Enhanced: when ready_to_invoice, also update production data + payment
      const isReadyToInvoice = order.status?.toLowerCase() === "ready_to_invoice";
      if (isReadyToInvoice) {
        if (order.production_cost != null) updatePayload.production_cost = order.production_cost;
        if (order.cost_breakdown != null) updatePayload.cost_breakdown = order.cost_breakdown;
        if (order.gross_profit != null) {
          updatePayload.gross_profit = order.gross_profit;
        } else if (order.production_cost != null && order.total != null) {
          updatePayload.gross_profit = order.total - order.production_cost;
        }
        if (order.payment != null) updatePayload.payment = order.payment;
        if (order.payment?.status) updatePayload.payment_status = order.payment.status;
        if (order.synced_at) updatePayload.synced_at = order.synced_at;
      }

      const { error: updateErr } = await supabase
        .from("qamar_orders")
        .update(updatePayload)
        .eq("id", existing.id);

      if (updateErr) {
        return json({ error: updateErr.message }, 500);
      }

      // Log status change with enhanced notes for ready_to_invoice
      const logNotes = isReadyToInvoice
        ? `تم تأكيد الاستلام من الإشراف — جاهز للفوترة والتوصيل | تكلفة: ₪${order.production_cost ?? 0}`
        : (order.all_notes || null);

      await supabase.from("order_status_log").insert({
        user_id: DEFAULT_OWNER_ID,
        order_id: existing.id,
        order_table: "qamar_orders",
        from_status: oldStatus,
        to_status: arabicStatus,
        changed_by: DEFAULT_OWNER_ID,
        changed_by_name: order.agent_name || "قمر براند",
        changed_by_role: "external_system",
        notes: logNotes,
        metadata: {
          sync_type: syncType,
          source: "qamar_brand",
          ...(isReadyToInvoice ? {
            supervisor_confirmed: true,
            production_cost: order.production_cost,
            cost_breakdown: order.cost_breakdown,
            gross_profit: order.gross_profit ?? ((order.total ?? 0) - (order.production_cost ?? 0)),
            payment_summary: order.payment?.summary || null,
          } : {}),
        },
      });

      amwaliOrderId = existing.id;

    } else if (syncType === "production_done" && existing) {
      // Update production costs + set status to "جاهز للفوترة" or provided status
      const targetStatus = arabicStatus === "جديد" ? "جاهز للفحص" : arabicStatus;
      const { error: updateErr } = await supabase
        .from("qamar_orders")
        .update({
          status: targetStatus,
          production_cost: order.production_cost ?? 0,
          cost_breakdown: order.cost_breakdown ?? null,
          gross_profit: order.gross_profit ?? (order.total ?? subtotal) - (order.production_cost ?? 0),
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (updateErr) {
        return json({ error: updateErr.message }, 500);
      }

      // Log
      await supabase.from("order_status_log").insert({
        user_id: DEFAULT_OWNER_ID,
        order_id: existing.id,
        order_table: "qamar_orders",
        from_status: existing.status,
        to_status: targetStatus,
        changed_by: DEFAULT_OWNER_ID,
        changed_by_name: "قمر براند (إنتاج)",
        changed_by_role: "external_system",
        notes: `تكلفة الإنتاج: ₪${order.production_cost ?? 0}`,
        metadata: {
          sync_type: syncType,
          production_cost: order.production_cost,
          cost_breakdown: order.cost_breakdown,
          gross_profit: order.gross_profit,
        },
      });

      amwaliOrderId = existing.id;

    } else if (existing) {
      // Update existing order (draft → new, or re-sync)
      const { error: updateErr } = await supabase
        .from("qamar_orders")
        .update({
          status: arabicStatus,
          customer_name: order.customer_name || undefined,
          customer_phone: order.customer_phone || undefined,
          customer_city: order.customer_city || undefined,
          customer_address: fullAddress || undefined,
          subtotal,
          discount: order.discount ?? 0,
          shipping_cost: order.shipping_cost ?? order.shipping ?? 0,
          total: order.total ?? subtotal,
          source: order.source || undefined,
          source_key: order.source_key || undefined,
          payment_method: order.payment_method || undefined,
          payment_status: order.payment_status || undefined,
          amount_paid: order.amount_paid ?? undefined,
          customer_notes: order.customer_notes || undefined,
          production_notes: order.production_notes || undefined,
          all_notes: order.all_notes || undefined,
          agent_name: order.agent_name || undefined,
          agent_id: order.agent_id || undefined,
          priority: order.priority || undefined,
          deposit_amount: order.deposit_amount ?? undefined,
          remaining_amount: order.remaining_amount ?? undefined,
          deposit_paid_at: order.deposit_paid_at || undefined,
          payment: order.payment || undefined,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (updateErr) {
        return json({ error: updateErr.message }, 500);
      }

      // Update items if provided
      if (items.length > 0) {
        await supabase.from("qamar_order_items").delete().eq("order_id", existing.id);
        await supabase.from("qamar_order_items").insert(
          items.map((item: any) => ({
            order_id: existing.id,
            product_name: item.product_name || item.name || "منتج",
            product_id: item.product_id || null,
            price: item.price || item.unit_price || 0,
            quantity: item.quantity || 1,
            line_total: item.line_total || (item.quantity || 1) * (item.price || 0),
            note: item.note || item.notes || null,
            product_image: item.product_image || null,
          }))
        );
      }

      // Log if status changed
      if (existing.status !== arabicStatus) {
        await supabase.from("order_status_log").insert({
          user_id: DEFAULT_OWNER_ID,
          order_id: existing.id,
          order_table: "qamar_orders",
          from_status: existing.status,
          to_status: arabicStatus,
          changed_by: DEFAULT_OWNER_ID,
          changed_by_name: order.agent_name || "قمر براند",
          changed_by_role: "external_system",
          metadata: { sync_type: syncType, source: "qamar_brand" },
        });
      }

      amwaliOrderId = existing.id;

    } else {
      // ── Create new order ──
      const initialStatus = syncType === "draft" ? "مسودة" : arabicStatus;

      const { data: newOrder, error: orderError } = await supabase
        .from("qamar_orders")
        .insert({
          user_id: DEFAULT_OWNER_ID,
          reference_number: refNumber,
          customer_name: order.customer_name || "عميل قمر",
          customer_phone: order.customer_phone || null,
          customer_city: order.customer_city || null,
          customer_address: fullAddress,
          subtotal,
          discount: order.discount ?? 0,
          shipping_cost: order.shipping_cost ?? order.shipping ?? 0,
          total: order.total ?? subtotal,
          source: order.source || null,
          source_key: order.source_key || null,
          payment_method: order.payment_method || null,
          payment_status: order.payment_status || "pending",
          amount_paid: order.amount_paid ?? 0,
          customer_notes: order.customer_notes || null,
          production_notes: order.production_notes || null,
          all_notes: order.all_notes || null,
          agent_name: order.agent_name || null,
          agent_id: order.agent_id || null,
          priority: order.priority || "normal",
          status: initialStatus,
          type: order.type || "sales_order",
          sync_type: syncType,
          production_cost: order.production_cost ?? 0,
          cost_breakdown: order.cost_breakdown ?? null,
          gross_profit: order.gross_profit ?? 0,
          deposit_amount: order.deposit_amount ?? 0,
          remaining_amount: order.remaining_amount ?? 0,
          deposit_paid_at: order.deposit_paid_at || null,
          payment: order.payment || {},
        })
        .select("id")
        .single();

      if (orderError) {
        console.error("Qamar order insert error:", orderError);
        return json({ error: orderError.message }, 500);
      }

      // Insert items
      if (items.length > 0) {
        await supabase.from("qamar_order_items").insert(
          items.map((item: any) => ({
            order_id: newOrder.id,
            product_name: item.product_name || item.name || "منتج",
            product_id: item.product_id || null,
            price: item.price || item.unit_price || 0,
            quantity: item.quantity || 1,
            line_total: item.line_total || (item.quantity || 1) * (item.price || 0),
            note: item.note || item.notes || null,
            product_image: item.product_image || null,
          }))
        );
      }

      // Also insert into legacy orders table
      const sourceMap: Record<string, string> = {
        whatsapp: "واتساب",
        website: "متجر إلكتروني",
        phone: "هاتف",
        facebook: "أخرى",
        instagram: "أخرى",
      };
      const mappedSource = order.source || sourceMap[order.source_key?.toLowerCase()] || "أخرى";

      const noteParts: string[] = [];
      if (order.all_notes) noteParts.push(order.all_notes);
      else {
        if (order.customer_notes) noteParts.push(`ملاحظات الزبون: ${order.customer_notes}`);
        if (order.production_notes) noteParts.push(`ملاحظات الإنتاج: ${order.production_notes}`);
      }
      if (order.agent_name) noteParts.push(`الموظف: ${order.agent_name}`);

      await supabase.from("orders").insert({
        user_id: DEFAULT_OWNER_ID,
        order_number: refNumber,
        customer_name: order.customer_name || "عميل قمر",
        customer_phone: order.customer_phone || null,
        customer_address: fullAddress,
        status: initialStatus,
        source: mappedSource,
        subtotal,
        total: order.total ?? subtotal,
        discount: order.discount ?? 0,
        shipping_cost: order.shipping_cost ?? order.shipping ?? 0,
        notes: noteParts.join(" | ") || null,
      });

      // Log initial status
      await supabase.from("order_status_log").insert({
        user_id: DEFAULT_OWNER_ID,
        order_id: newOrder.id,
        order_table: "qamar_orders",
        from_status: null,
        to_status: initialStatus,
        changed_by: DEFAULT_OWNER_ID,
        changed_by_name: "النظام (تلقائي)",
        changed_by_role: "system",
        metadata: {
          sync_type: syncType,
          source: mappedSource,
          agent_name: order.agent_name || null,
          reference_number: refNumber,
        },
      });

      amwaliOrderId = newOrder.id;
    }

    // Build response message
    const statusMsg = arabicStatus ? `تم تحديث الحالة إلى ${arabicStatus}` : "تمت المعالجة";

    console.log(`receive-qamar-order: sync_type=${syncType}, ref=${refNumber}, id=${amwaliOrderId}`);

    return json({
      success: true,
      amwali_order_id: amwaliOrderId,
      message: statusMsg,
    });
  } catch (err) {
    console.error("receive-qamar-order error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500
    );
  }
});
