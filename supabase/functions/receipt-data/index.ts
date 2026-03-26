import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get('order_id');

    if (!orderId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
      return new Response(JSON.stringify({ error: 'Invalid order ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch order (only paid orders)
    const { data: order, error: oErr } = await supabase
      .from('pos_orders')
      .select('id, order_number, display_number, total, discount, tax, subtotal, state, created_at, paid_at, user_id, session_id, customer_name, guest_count, table_name, company_id, notes')
      .eq('id', orderId)
      .eq('state', 'paid')
      .single();

    if (oErr || !order) {
      return new Response(JSON.stringify({ error: 'Receipt not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch related data in parallel
    const [linesRes, paymentsRes, sessionRes, companyRes, settingsRes] = await Promise.all([
      supabase
        .from('pos_order_lines')
        .select('product_name, qty, unit_price, total, discount, notes, addons')
        .eq('order_id', orderId),
      supabase
        .from('pos_payments')
        .select('payment_method, amount, currency, reference')
        .eq('order_id', orderId),
      supabase
        .from('pos_sessions')
        .select('cashier_name')
        .eq('id', order.session_id)
        .single(),
      // Get company info - try company_id first, then owner_id
      order.company_id
        ? supabase.from('companies').select('name, logo_url, phone, address').eq('id', order.company_id).single()
        : supabase.from('companies').select('name, logo_url, phone, address').eq('owner_id', order.user_id).single(),
      supabase
        .from('company_settings')
        .select('company_name, address, email, receipt_footer, vat_number')
        .eq('id', order.user_id)
        .single(),
    ]);

    // Build safe response (no sensitive data like cost_price, user_id, etc.)
    const companyData = companyRes?.data;
    const settings = settingsRes?.data as any;

    const response = {
      order: {
        id: order.id,
        order_number: order.order_number,
        display_number: order.display_number,
        total: order.total,
        discount: order.discount,
        tax: order.tax,
        subtotal: order.subtotal,
        created_at: order.created_at,
        paid_at: order.paid_at,
        customer_name: order.customer_name,
        guest_count: order.guest_count,
        table_name: order.table_name,
        notes: order.notes,
      },
      lines: (linesRes.data || []).map((l: any) => ({
        product_name: l.product_name,
        qty: l.qty,
        unit_price: l.unit_price,
        total: l.total,
        discount: l.discount,
        notes: l.notes,
        addons: l.addons,
      })),
      payments: (paymentsRes.data || []).map((p: any) => ({
        payment_method: p.payment_method,
        amount: p.amount,
        currency: p.currency,
        reference: p.reference,
      })),
      company: {
        name: settings?.company_name || companyData?.name || '',
        logo_url: companyData?.logo_url || '',
        phone: companyData?.phone || '',
        address: settings?.address || companyData?.address || '',
        email: settings?.email || '',
        vat_number: settings?.vat_number || '',
        receipt_footer: settings?.receipt_footer || '',
      },
      cashier_name: (sessionRes.data as any)?.cashier_name || '',
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
