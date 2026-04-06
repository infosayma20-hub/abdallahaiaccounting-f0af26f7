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
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, contact_name, phone, email, user_id")
      .eq("id", stmt.contact_id)
      .single();

    // Use the contact's user_id (the real data owner)
    const dataOwnerId = contact?.user_id || stmt.user_id;

    // Fetch company info using the data owner
    const { data: company } = await supabase
      .from("companies")
      .select("name, logo_url, phone, email, address")
      .eq("owner_id", dataOwnerId)
      .single();

    // Also check company_settings
    const { data: compSettings } = await supabase
      .from("company_settings")
      .select("company_name, logo_url, phone, email, address")
      .eq("user_id", dataOwnerId)
      .single();

    const companyName = company?.name || (compSettings as any)?.company_name || "";
    const companyLogo = company?.logo_url || (compSettings as any)?.logo_url || "";
    const companyPhone = company?.phone || (compSettings as any)?.phone || "";
    const companyEmail = company?.email || (compSettings as any)?.email || "";

    // Fetch transactions for the date range
    const { data: transactions } = await supabase
      .from("transactions")
      .select("id, transaction_date, description, debit_account_code, credit_account_code, amount, reference, notes, currency, is_deleted, contact_id")
      .eq("user_id", dataOwnerId)
      .eq("is_deleted", false)
      .eq("contact_id", stmt.contact_id)
      .gte("transaction_date", stmt.date_from)
      .lte("transaction_date", stmt.date_to)
      .order("transaction_date", { ascending: true });

    const contactTransactions = transactions || [];

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

      return {
        date: tx.transaction_date,
        reference: tx.reference || "",
        description: tx.description || "",
        notes: tx.notes || "",
        debit: debitAmount,
        credit: creditAmount,
        balance: runningBalance,
      };
    });

    const totalDebit = rows.reduce((s: number, r: any) => s + r.debit, 0);
    const totalCredit = rows.reduce((s: number, r: any) => s + r.credit, 0);

    return respond({
      success: true,
      statement: {
        contactName: stmt.contact_name || contact?.contact_name || "",
        contactPhone: contact?.phone || "",
        dateFrom: stmt.date_from,
        dateTo: stmt.date_to,
        openingBalance,
        closingBalance: runningBalance,
        totalDebit,
        totalCredit,
        rows,
      },
      company: {
        name: companyName,
        logo: companyLogo,
        phone: companyPhone,
        email: companyEmail,
      },
    });
  } catch (err) {
    return respond({ error: "حدث خطأ", details: String(err) }, 500);
  }
});
