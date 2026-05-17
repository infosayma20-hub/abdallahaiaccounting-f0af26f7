import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const today = new Date().toISOString().split("T")[0];

    // Fetch all active recurring invoices due today or earlier
    const { data: recurring, error: fetchErr } = await supabase
      .from("recurring_invoices")
      .select("*")
      .eq("is_active", true)
      .lte("next_due_date", today);

    if (fetchErr) throw fetchErr;
    if (!recurring || recurring.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;

    for (const rec of recurring) {
      // Check end_date
      if (rec.end_date && rec.next_due_date > rec.end_date) {
        await supabase.from("recurring_invoices").update({ is_active: false }).eq("id", rec.id);
        continue;
      }

      // Create the invoice
      const { error: invErr } = await supabase.from("invoices").insert({
        user_id: rec.user_id,
        invoice_type: rec.invoice_type,
        invoice_date: rec.next_due_date,
        contact_name: rec.contact_name,
        contact_id: rec.contact_id,
        subtotal: rec.subtotal,
        tax_amount: rec.tax_amount,
        discount_amount: rec.discount_amount,
        total_amount: rec.total_amount,
        currency: rec.currency,
        payment_method: rec.payment_method,
        notes: rec.notes ? `${rec.notes} (فاتورة دورية تلقائية)` : "فاتورة دورية تلقائية",
        status: "draft",
        source: "recurring",
      });

      if (invErr) {
        console.error(`Failed to create invoice for recurring ${rec.id}:`, invErr);
        continue;
      }

      // Calculate next due date
      const nextDate = new Date(rec.next_due_date);
      const interval = rec.interval_value || 1;

      switch (rec.frequency) {
        case "weekly":
          nextDate.setDate(nextDate.getDate() + 7 * interval);
          break;
        case "monthly":
          nextDate.setMonth(nextDate.getMonth() + interval);
          break;
        case "quarterly":
          nextDate.setMonth(nextDate.getMonth() + 3 * interval);
          break;
        case "semi_annual":
          nextDate.setMonth(nextDate.getMonth() + 6 * interval);
          break;
        case "yearly":
          nextDate.setFullYear(nextDate.getFullYear() + interval);
          break;
      }

      const nextDueDate = nextDate.toISOString().split("T")[0];

      // Check if next date exceeds end_date
      const shouldDeactivate = rec.end_date && nextDueDate > rec.end_date;

      await supabase.from("recurring_invoices").update({
        next_due_date: nextDueDate,
        last_generated_at: new Date().toISOString(),
        generated_count: (rec.generated_count || 0) + 1,
        is_active: !shouldDeactivate,
      }).eq("id", rec.id);

      processed++;
    }

    return new Response(JSON.stringify({ processed, total: recurring.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error processing recurring invoices:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
