import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, authenticateRequest } from "../_shared/auth.ts";

// One-shot provisioner for رام الله بلازا مول cashiers.
// Creates 2 specific cashier accounts scoped to that branch with restricted
// permissions (no delete / no edit / no cancel / no void).

const BRANCH_ID = "f82642e1-ce32-456e-8ef8-e556d8d65af9";
const POS_COMPANY_ID = "fce51290-60e8-4ded-a3bc-0b542797dd67";
const PASSWORD = "123456";

const CASHIERS = [
  { email: "malakybroast1@plaza.com", name: "كاشير ملكي بلازا 1", terminalName: "MalakyPlaza1", cashAccount: "111010" },
  { email: "malakybroast2@plaza.com", name: "كاشير ملكي بلازا 2", terminalName: "MalakyPlaza2", cashAccount: "111011" },
];

// Restrictive permission set: cashier can take orders, view invoice history
// (incl. call-center orders), print/resend, but CANNOT edit, delete, cancel,
// void, refund, or change prices.
const RESTRICTED_PERMS = {
  can_open_register: true,
  can_close_register: true,
  can_apply_discount: false,
  max_discount_percent: 0,
  can_view_profits: false,
  can_edit_prices: false,
  can_void_sales: false,
  can_refund: false,
  can_view_shift_details: true,
  require_manager_approval: true,
  can_view_invoice_history: true,   // see call-center orders
  can_edit_invoices: false,
  require_manager_for_invoices: true,
  manage_products_categories: false,
  view_invoice_log: true,
  edit_cancel_invoices: false,
  allow_credit_sale: false,
  open_cash_drawer: true,
  print_invoices: true,
  resend_invoice: true,
  edit_products: false,
  delete_products: false,
  view_inventory: false,
  add_customer: true,
  view_customers: true,
  edit_customers: false,
  view_sales_report: false,
  export_reports: false,
  can_add_inventory: false,
  can_create_product: false,
  can_record_purchases: false,
  can_pay_purchases_cash: false,
  can_create_supplier: false,
  can_affect_inventory_on_purchase: false,
  can_record_expenses: false,
  can_create_expense_category: false,
  can_remove_cart_items: false,
  can_cancel_invoices: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Allow either: (a) admin user JWT, or (b) service-role invocation (Lovable agent).
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    let userId: string;

    if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      // Service-role: act as the workspace owner.
      userId = "0b08eba6-c81a-4f6c-b371-e6e324016e73";
    } else {
      const auth = await authenticateRequest(req);
      if (auth instanceof Response) return auth;
      userId = auth.userId;
      const { data: hasAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      if (!hasAdmin) return json({ error: "Not authorized" }, 403);
    }

    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("company_id, company_name")
      .eq("user_id", userId)
      .single();

    // 1) Ensure terminals are correctly mapped
    for (const c of CASHIERS) {
      const { data: existing } = await supabase
        .from("pos_terminals")
        .select("id, cash_account_code")
        .eq("name", c.terminalName)
        .eq("branch_id", BRANCH_ID)
        .maybeSingle();

      if (existing) {
        if (existing.cash_account_code !== c.cashAccount) {
          await supabase.from("pos_terminals").update({ cash_account_code: c.cashAccount }).eq("id", existing.id);
        }
      } else {
        await supabase.from("pos_terminals").insert({
          user_id: userId,
          company_id: POS_COMPANY_ID,
          branch_id: BRANCH_ID,
          name: c.terminalName,
          cash_account_code: c.cashAccount,
        });
      }
    }

    const results: any[] = [];

    for (const c of CASHIERS) {
      try {
        // Create or find auth user
        let authUserId: string;
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email: c.email,
          password: PASSWORD,
          email_confirm: true,
          user_metadata: {
            full_name: c.name,
            role: "cashier",
            invited_by: userId,
            company_name: adminProfile?.company_name || "ملكي بروست",
          },
        });

        if (createErr) {
          if (!createErr.message?.includes("already been registered")) {
            results.push({ email: c.email, status: "error", error: createErr.message });
            continue;
          }
          const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const exists = list?.users?.find((u) => u.email?.toLowerCase() === c.email.toLowerCase());
          if (!exists) { results.push({ email: c.email, status: "error", error: "exists but not found" }); continue; }
          authUserId = exists.id;
          // reset password
          await supabase.auth.admin.updateUserById(authUserId, { password: PASSWORD, email_confirm: true });
        } else {
          authUserId = created!.user!.id;
        }

        // Roles: cashier only
        await supabase.from("user_roles").delete().eq("user_id", authUserId);
        await supabase.from("user_roles").insert({ user_id: authUserId, role: "cashier" });

        // Profile linkage
        await supabase.from("profiles").update({
          invited_by: userId,
          company_id: adminProfile?.company_id ?? null,
          role: "cashier",
          full_name: c.name,
        }).eq("user_id", authUserId);

        // pos_users record (scoped to branch) — manual upsert
        const { data: existingPos } = await supabase
          .from("pos_users")
          .select("id")
          .eq("auth_user_id", authUserId)
          .maybeSingle();

        let posUserId: string;
        if (existingPos) {
          await supabase.from("pos_users").update({
            company_id: POS_COMPANY_ID,
            branch_id: BRANCH_ID,
            name: c.name,
            email: c.email,
            role: "cashier",
            is_active: true,
            has_account: true,
            account_status: "active",
            must_change_password: false,
            is_call_center: false,
          }).eq("id", existingPos.id);
          posUserId = existingPos.id;
        } else {
          const { data: created2, error: posErr } = await supabase.from("pos_users").insert({
            user_id: userId,
            company_id: POS_COMPANY_ID,
            branch_id: BRANCH_ID,
            name: c.name,
            email: c.email,
            pin_hash: "ACCOUNT_LOGIN",
            role: "cashier",
            is_active: true,
            has_account: true,
            auth_user_id: authUserId,
            account_status: "active",
            must_change_password: false,
            is_call_center: false,
          }).select("id").single();
          if (posErr) { results.push({ email: c.email, status: "error", error: "pos_users: " + posErr.message }); continue; }
          posUserId = created2!.id;
        }

        // Restricted permissions
        await supabase.from("pos_user_permissions").upsert({
          user_id: userId,
          pos_user_id: posUserId,
          company_id: POS_COMPANY_ID,
          ...RESTRICTED_PERMS,
        }, { onConflict: "pos_user_id" });

        results.push({ email: c.email, status: "success", auth_user_id: authUserId, pos_user_id: posUserId });
      } catch (e) {
        results.push({ email: c.email, status: "error", error: (e as Error).message });
      }
    }

    return json({ success: true, results });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}