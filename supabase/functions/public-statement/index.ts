import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const respond = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { token } = await req.json();
    if (!token) return respond({ error: "Token required" }, 400);

    // Fetch shared statement
    const { data: stmt, error: stmtErr } = await supabase
      .from("shared_statements")
      .select("*")
      .eq("token", token)
      .single();

    if (stmtErr || !stmt) return respond({ error: "رابط غير صالح" }, 404);

    // Check expiry
    if (new Date(stmt.expires_at) < new Date()) {
      return respond({ error: "هذا الرابط منتهي الصلاحية", expired: true }, 410);
    }

    // Increment view count
    await supabase
      .from("shared_statements")
      .update({
        view_count: (stmt.view_count || 0) + 1,
        viewed_at: new Date().toISOString(),
      })
      .eq("id", stmt.id);

    // Fetch contact info first to get real data owner
    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .select("id, contact_name, phone, email, user_id, tax_number, city, address")
      .eq("id", stmt.contact_id)
      .single();


    // Use the contact's user_id (the real data owner)
    // Also resolve team owner via profiles.invited_by
    let dataOwnerId = contact?.user_id || stmt.user_id;

    // If stmt.user_id is a team member, resolve to their owner
    if (!contact?.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("invited_by")
        .eq("user_id", stmt.user_id)
        .single();
      if (profile?.invited_by) {
        dataOwnerId = profile.invited_by;
      }
    }


    // Fetch company info using the data owner
    const [companyRes, compSettingsRes, profileRes] = await Promise.all([
      supabase
        .from("companies")
        .select("name, logo_url, phone, email, address")
        .eq("owner_id", dataOwnerId)
        .single(),
      supabase
        .from("company_settings")
        .select("company_name, logo_url, phone, email, address")
        .eq("user_id", dataOwnerId)
        .single(),
      supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", dataOwnerId)
        .single(),
    ]);

    const company = companyRes.data;
    const compSettings = compSettingsRes.data as any;
    const profile = profileRes.data;

    const companyName = compSettings?.company_name || company?.name || profile?.full_name || "";
    const companyLogo = compSettings?.logo_url || company?.logo_url || "";
    const companyPhone = compSettings?.phone || company?.phone || "";
    const companyEmail = compSettings?.email || company?.email || "";
    const companyAddress = compSettings?.address || company?.address || "";


    // Fetch transactions for the date range
    const { data: transactions, error: txErr } = await supabase
      .from("transactions")
      .select("id, transaction_date, description, debit_account_code, credit_account_code, amount, reference, notes, currency, is_deleted, contact_id")
      .eq("user_id", dataOwnerId)
      .eq("is_deleted", false)
      .eq("contact_id", stmt.contact_id)
      .gte("transaction_date", stmt.date_from)
      .lte("transaction_date", stmt.date_to)
      .order("transaction_date", { ascending: true });


    const contactTransactions = transactions || [];
    // Fetch invoices with items for this contact in date range
    const { data: invoices, error: invErr } = await supabase
      .from("invoices")
      .select(`
        id,
        invoice_number,
        invoice_date,
        due_date,
        total_amount,
        discount_amount,
        tax_amount,
        status,
        payment_method,
        notes,
        invoice_type,
        invoice_items (
          id,
          description,
          product_name,
          quantity,
          unit_price,
          total_amount
        )
      `)
      .eq("user_id", dataOwnerId)
      .eq("contact_id", stmt.contact_id)
      .eq("is_voided", false)
      .not("status", "in", "(cancelled,void,reversed)")
      .gte("invoice_date", stmt.date_from)
      .lte("invoice_date", stmt.date_to)
      .order("invoice_date", { ascending: true });


    // Build invoice lookup by invoice_number
    const invoiceMap: Record<string, any> = {};
    (invoices || []).forEach((inv: any) => {
      if (inv.invoice_number) {
        invoiceMap[inv.invoice_number] = inv;
      }
    });

    // Calculate opening balance (transactions before date_from)
    const { data: priorTxs } = await supabase
      .from("transactions")
      .select("debit_account_code, credit_account_code, amount")
      .eq("user_id", dataOwnerId)
      .eq("is_deleted", false)
      .eq("contact_id", stmt.contact_id)
      .lt("transaction_date", stmt.date_from);

    let openingBalance = 0;
    (priorTxs || []).forEach((tx: any) => {
      if (tx.debit_account_code?.startsWith("113")) openingBalance += tx.amount;
      if (tx.credit_account_code?.startsWith("113")) openingBalance -= tx.amount;
    });

    // Build statement rows with running balance
    let runningBalance = openingBalance;
    const rows = contactTransactions.map((tx: any) => {
      const isDebit = tx.debit_account_code?.startsWith("113");
      const isCredit = tx.credit_account_code?.startsWith("113");
      const debitAmount = isDebit ? tx.amount : 0;
      const creditAmount = isCredit ? tx.amount : 0;
      runningBalance += debitAmount - creditAmount;

      // Try to find matching invoice for items
      let invoiceItems: any[] = [];
      let dueDate: string | null = null;
      let invoiceStatus: string | null = null;
      let discountAmount = 0;
      let taxAmount = 0;
      let paymentMethod: string | null = null;

      // Extract invoice number from description
      const invMatch = tx.description?.match(/INV-\d{4}-\d{4}/);
      if (invMatch) {
        const inv = invoiceMap[invMatch[0]];
        if (inv) {
          invoiceItems = (inv.invoice_items || []).map((item: any) => ({
            name: item.product_name || item.description || 'صنف',
            quantity: item.quantity || 1,
            unitPrice: item.unit_price || 0,
            total: item.total_amount || 0,
          }));
          dueDate = inv.due_date;
          invoiceStatus = inv.status;
          discountAmount = inv.discount_amount || 0;
          taxAmount = inv.tax_amount || 0;
          paymentMethod = inv.payment_method;
        }
      }

      return {
        date: tx.transaction_date,
        reference: tx.reference || "",
        description: tx.description || "",
        notes: tx.notes || "",
        debit: debitAmount,
        credit: creditAmount,
        balance: runningBalance,
        items: invoiceItems,
        dueDate,
        invoiceStatus,
        discountAmount,
        taxAmount,
        paymentMethod,
      };
    });

    const totalDebit = rows.reduce((s: number, r: any) => s + r.debit, 0);
    const totalCredit = rows.reduce((s: number, r: any) => s + r.credit, 0);

    // Aging analysis
    const today = new Date();
    const aging = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
    (invoices || []).forEach((inv: any) => {
      if (inv.status === 'paid') return;
      const due = new Date(inv.due_date || inv.invoice_date);
      const days = Math.floor((today.getTime() - due.getTime()) / 86400000);
      const remaining = inv.total_amount - (inv.discount_amount || 0);

      if (days <= 0) aging.current += remaining;
      else if (days <= 30) aging.d30 += remaining;
      else if (days <= 60) aging.d60 += remaining;
      else if (days <= 90) aging.d90 += remaining;
      else aging.over90 += remaining;
    });

    // Invoice summaries for WhatsApp message
    const invoiceSummaries = (invoices || []).map((inv: any) => {
      const itemNames = (inv.invoice_items || []).map((it: any) => it.product_name || it.description || 'صنف').join('، ');
      return {
        number: inv.invoice_number,
        amount: inv.total_amount,
        items: itemNames,
        type: inv.type,
      };
    });

    return respond({
      success: true,
      statement: {
        contactName: stmt.contact_name || contact?.contact_name || "",
        contactPhone: contact?.phone || "",
        contactCity: contact?.city || contact?.address || "",
        contactTaxNumber: contact?.tax_number || "",
        dateFrom: stmt.date_from,
        dateTo: stmt.date_to,
        openingBalance,
        closingBalance: runningBalance,
        totalDebit,
        totalCredit,
        rows,
        aging,
        invoiceSummaries,
      },
      company: {
        name: companyName,
        logo: companyLogo,
        phone: companyPhone,
        email: companyEmail,
        address: companyAddress,
      },
    });
  } catch (err) {
    return respond({ error: "حدث خطأ", details: String(err) }, 500);
  }
});
