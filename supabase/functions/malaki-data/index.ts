import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const respond = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Filters out POS orders whose linked accounting transaction was soft-deleted
 * (voided). Used to keep "duplicate offline sync" or admin-voided sales out of
 * every owner / portal report. Mirrors the same logic as the admin reports hook.
 */
async function excludeVoidedOrders<T extends { id: string; transaction_id?: string | null }>(
  supabase: any,
  orders: T[],
): Promise<T[]> {
  if (!orders || orders.length === 0) return orders;
  const txIds = orders.map(o => o.transaction_id).filter(Boolean) as string[];
  if (txIds.length === 0) return orders;
  const voided = new Set<string>();
  // Fire all chunks in parallel — chunks only exist to keep IN-list URL size bounded.
  const chunks: Promise<any>[] = [];
  for (let i = 0; i < txIds.length; i += 500) {
    const chunk = txIds.slice(i, i + 500);
    chunks.push(
      supabase.from("transactions").select("id").in("id", chunk).eq("is_deleted", true)
        .then((r: any) => r.data || [])
    );
  }
  (await Promise.all(chunks)).flat().forEach((t: any) => voided.add(t.id));
  if (voided.size === 0) return orders;
  return orders.filter(o => !o.transaction_id || !voided.has(o.transaction_id));
}

const POS_PAGE_SIZE = 1000;

function palestineBusinessRange(fromDate: string, toDate: string) {
  return {
    startISO: new Date(`${fromDate}T00:00:00+03:00`).toISOString(),
    endISO: new Date(`${toDate}T23:59:59.999+03:00`).toISOString(),
  };
}

async function loadPaidPosOrders(
  supabase: any,
  linkedUserId: string | null,
  startISO: string,
  endISO: string,
  select = "id, total, created_at, session_id, order_number, transaction_id",
) {
  if (!linkedUserId) return [];
  const orders: any[] = [];

  for (let from = 0; ; from += POS_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("pos_orders")
      .select(select)
      .eq("user_id", linkedUserId)
      .eq("state", "paid")
      .gte("created_at", startISO)
      .lte("created_at", endISO)
      .order("created_at", { ascending: false })
      .range(from, from + POS_PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    orders.push(...data);
    if (data.length < POS_PAGE_SIZE) break;
  }

  return excludeVoidedOrders(supabase, orders);
}

// Loads paid POS orders by business_date (respects the 6 AM cutoff).
// Falls back to created_at when business_date is NULL on legacy rows.
async function loadPaidPosOrdersByBusinessDate(
  supabase: any,
  linkedUserId: string | null,
  fromDate: string,
  toDate: string,
  select = "id, total, created_at, session_id, user_id, transaction_id, business_date",
) {
  if (!linkedUserId) return [];
  const orders: any[] = [];

  // 1) Rows with business_date set — primary source of truth.
  for (let from = 0; ; from += POS_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("pos_orders")
      .select(select)
      .eq("user_id", linkedUserId)
      .eq("state", "paid")
      .gte("business_date", fromDate)
      .lte("business_date", toDate)
      .order("business_date", { ascending: false })
      .range(from, from + POS_PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    orders.push(...data);
    if (data.length < POS_PAGE_SIZE) break;
  }

  // 2) Legacy fallback — only for ranges older than ~60 days (backfill safety).
  //    Modern rows always have business_date populated, so skipping this on
  //    recent windows saves an entire full scan per dashboard refresh.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  if (fromDate < cutoffISO) {
    const { startISO, endISO } = palestineBusinessRange(fromDate, toDate);
    for (let from = 0; ; from += POS_PAGE_SIZE) {
      const { data, error } = await supabase
        .from("pos_orders")
        .select(select)
        .eq("user_id", linkedUserId)
        .eq("state", "paid")
        .is("business_date", null)
        .gte("created_at", startISO)
        .lte("created_at", endISO)
        .order("created_at", { ascending: false })
        .range(from, from + POS_PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      orders.push(...data);
      if (data.length < POS_PAGE_SIZE) break;
    }
  }

  return excludeVoidedOrders(supabase, orders);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

  try {
    const body = await req.json();
    const { action } = body;

    // ── Authenticate the portal user from JWT ──
    const authHeader = req.headers.get("Authorization");
    const supabaseAsUser = authHeader?.startsWith("Bearer ") && anonKey
      ? createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
        global: { headers: { Authorization: authHeader } },
      })
      : null;
    let authUserId: string | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      const { data: { user: authUser } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      authUserId = authUser?.id || null;
    }

    // ── Resolve the data owner (linked_user_id) from the portal user's record ──
    let linkedUserId: string | null = null;
    let portalSettings: any = null;
    let activeOwnerPortalUser = false;

    if (authUserId) {
      // First check if this user IS an admin (owner) — they might access portal settings directly
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("user_id, invited_by")
        .eq("user_id", authUserId)
        .single();

      // Find the portal user record linked to this auth user
      const { data: portalUser } = await supabase
        .from("malaki_portal_users")
        .select("user_id, role")
        .eq("auth_user_id", authUserId)
        .eq("is_active", true)
        .single();

      if (portalUser?.user_id) {
        // Portal user — data owner is the admin who created them
        linkedUserId = portalUser.user_id;
        activeOwnerPortalUser = portalUser.role === "owner";
      } else if (adminProfile && !adminProfile.invited_by) {
        // This is an admin/owner viewing their own portal settings
        linkedUserId = authUserId;
      } else if (adminProfile?.invited_by) {
        // Team member — data owner is their inviter
        linkedUserId = adminProfile.invited_by;
      }
    }

    // 🔒 HARD LOCK: Malaky Broast tenant — allow the owner auth account itself
    // plus explicitly active owner portal accounts linked to this tenant only.
    const MALAKY_OWNER_ID = "0b08eba6-c81a-4f6c-b371-e6e324016e73";
    if (linkedUserId === MALAKY_OWNER_ID && authUserId !== MALAKY_OWNER_ID && !activeOwnerPortalUser) {
      return respond({ success: false, error: "forbidden_tenant" }, 403);
    }

    // Fetch portal settings scoped to the resolved data owner
    if (linkedUserId) {
      const { data: settingsRows, error: settingsError } = await supabase
        .from("malaki_portal_settings")
        .select("*")
        .eq("linked_user_id", linkedUserId)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (settingsError) throw settingsError;
      portalSettings = settingsRows?.[0] ?? null;

      // Auto-create portal settings only when none exist for this owner
      if (!portalSettings) {
        const { data: newSettings, error: createSettingsError } = await supabase
          .from("malaki_portal_settings")
          .insert({ linked_user_id: linkedUserId })
          .select("*")
          .single();
        if (createSettingsError) throw createSettingsError;
        portalSettings = newSettings;
      }
    }

    if (action === "get_settings") {
      // Fetch company name and logo from company_settings using service role
      let companyName = "";
      let companyLogo = "";
      if (linkedUserId) {
        // Try company_settings first
        const { data: cs } = await supabase
          .from("company_settings")
          .select("company_name, logo_url")
          .eq("user_id", linkedUserId)
          .single();
        if (cs?.company_name) companyName = cs.company_name;
        if (cs?.logo_url) companyLogo = cs.logo_url;

        // Fallback to companies table if logo/name still empty
        if (!companyName || !companyLogo) {
          const { data: comp } = await supabase
            .from("companies")
            .select("name, logo_url")
            .eq("owner_id", linkedUserId)
            .single();
          if (!companyName && comp?.name) companyName = comp.name;
          if (!companyLogo && comp?.logo_url) companyLogo = comp.logo_url;
        }
      }
      const settingsResponse = portalSettings
        ? { ...portalSettings, linked_user_id: linkedUserId, company_name: companyName, logo_url: companyLogo }
        : { linked_user_id: linkedUserId, company_name: companyName, logo_url: companyLogo };
      return respond({ success: true, settings: settingsResponse });
    }

    if (action === "update_settings") {
      if (!portalSettings?.id) return respond({ error: "No settings found" }, 404);
      // Only the tenant owner (or an owner-role portal account) may change
      // portal configuration.
      if (authUserId !== linkedUserId && !activeOwnerPortalUser) {
        return respond({ success: false, error: "forbidden" }, 403);
      }
      // Whitelist writable keys: `body.updates` is client-supplied, and keys
      // such as `linked_user_id` would let a portal owner repoint the portal
      // at another tenant's data.
      const ALLOWED_SETTINGS_KEYS = ["portal_profile", "hidden_sections"];
      const rawUpdates = (body.updates ?? {}) as Record<string, unknown>;
      const updates: Record<string, unknown> = {};
      for (const key of ALLOWED_SETTINGS_KEYS) {
        if (key in rawUpdates) updates[key] = rawUpdates[key];
      }
      if (updates.portal_profile !== undefined &&
          updates.portal_profile !== null &&
          !["restaurant", "retail", "general"].includes(String(updates.portal_profile))) {
        return respond({ success: false, error: "invalid portal_profile" }, 400);
      }
      if (updates.hidden_sections !== undefined && !Array.isArray(updates.hidden_sections)) {
        return respond({ success: false, error: "invalid hidden_sections" }, 400);
      }
      if (Object.keys(updates).length === 0) {
        return respond({ success: false, error: "no allowed fields to update" }, 400);
      }
      const { error } = await supabase
        .from("malaki_portal_settings")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", portalSettings.id);
      if (error) throw error;
      return respond({ success: true });
    }

    if (!linkedUserId && ["dashboard", "sales", "liquidity", "employee_requests", "supplier_balances", "pos_sales_detailed", "overview", "receivables_list", "payables_list"].includes(action)) {
      return respond({
        success: true,
        needsSetup: true,
        message: "يجب ربط البوابة بحساب أموالي أولاً",
        sales: null,
        liquidity: null,
      });
    }

    // ══════════════════════════════════════════════════════
    // ACTION: owner_sales — Sales breakdown for Owner Portal home cards
    //   * POS vs Invoice split
    //   * by branch, by item, by cashier
    //   * Year-over-Year for same calendar range (prev year)
    // ══════════════════════════════════════════════════════
    if (action === "owner_sales") {
      const today = new Date().toISOString().split("T")[0];
      const dateFrom: string = body.dateFrom || today;
      const dateTo: string = body.dateTo || today;
      const summaryOnly: boolean = body.summaryOnly === true;

      const shiftDate = (d: string, years: number) => {
        const dt = new Date(`${d}T00:00:00`);
        dt.setFullYear(dt.getFullYear() + years);
        return dt.toISOString().split("T")[0];
      };
      const prevFrom = shiftDate(dateFrom, -1);
      const prevTo = shiftDate(dateTo, -1);

      // Fast path: all owner-sales aggregations are computed in PostgreSQL in
      // one RPC per range. This replaces loading thousands of orders/lines and
      // running many sequential PostgREST calls inside the edge function — the
      // main reason the "أمس" filter could sit loading for ~1 minute.
      try {
        const [currentFast, prevFast, histPrev] = await Promise.all([
          supabase.rpc("get_owner_sales_fast", {
            p_user_id: linkedUserId,
            p_from: dateFrom,
            p_to: dateTo,
            p_with_details: !summaryOnly,
          }),
          supabase.rpc("get_owner_sales_fast", {
            p_user_id: linkedUserId,
            p_from: prevFrom,
            p_to: prevTo,
            p_with_details: false,
          }),
          (supabaseAsUser ?? supabase).rpc("get_historical_sales_range", {
            p_user_id: linkedUserId,
            p_from: prevFrom,
            p_to: prevTo,
          }),
        ]);

        if (!currentFast.error && !prevFast.error) {
          const current = currentFast.data || {
            total: 0, posTotal: 0, invTotal: 0, orderCount: 0,
            byBranch: [], byItem: [], byCashier: [],
            summary: { gross: 0, net: 0, cash: 0, card: 0, employeeAccount: 0, credit: 0, employeeMeals: 0, cancelledCount: 0, cancelledTotal: 0 },
          };
          const prevYear = prevFast.data || {
            total: 0, posTotal: 0, invTotal: 0, orderCount: 0,
            byBranch: [], byItem: [], byCashier: [],
            summary: { gross: 0, net: 0, cash: 0, card: 0, employeeAccount: 0, credit: 0, employeeMeals: 0, cancelledCount: 0, cancelledTotal: 0 },
          };

          // Merge archived (pre-system) daily sales into the previous-year side
          // so owners get a real YoY comparison for periods that predate the POS.
          const hist = !histPrev.error && histPrev.data?.allowed ? histPrev.data : null;
          if (hist && Number(hist.total || 0) > 0) {
            prevYear.total = Number(prevYear.total || 0) + Number(hist.total || 0);
            prevYear.posTotal = Number(prevYear.posTotal || 0) + Number(hist.posTotal || 0);
            prevYear.orderCount = Number(prevYear.orderCount || 0) + Number(hist.orderCount || 0);
            const branchMap = new Map<string, any>();
            for (const b of [...(prevYear.byBranch || []), ...(hist.byBranch || [])]) {
              const key = String(b.name || b.id);
              const existing = branchMap.get(key);
              if (existing) {
                existing.total = Number(existing.total || 0) + Number(b.total || 0);
                existing.orderCount = Number(existing.orderCount || 0) + Number(b.orderCount || 0);
              } else {
                branchMap.set(key, { ...b });
              }
            }
            prevYear.byBranch = [...branchMap.values()].sort((a, b) => Number(b.total) - Number(a.total));
          }

          const growthPct = Number(prevYear.total || 0) > 0
            ? ((Number(current.total || 0) - Number(prevYear.total || 0)) / Number(prevYear.total || 0)) * 100
            : (Number(current.total || 0) > 0 ? 100 : 0);

          return respond({
            success: true,
            range: { from: dateFrom, to: dateTo },
            prevRange: { from: prevFrom, to: prevTo },
            current,
            prevYear,
            growthPct,
          });
        }

        console.error("get_owner_sales_fast failed, falling back:", currentFast.error || prevFast.error);
      } catch (e) {
        console.error("get_owner_sales_fast exception, falling back:", e);
      }

      // ───────── Helper: load sales for a given range ─────────
      async function loadRange(fromDate: string, toDate: string, withDetails: boolean) {
        // POS orders — use business_date (6 AM cutoff) so post-midnight sales
        // stay attributed to the correct shift/cashier and don't bleed into the
        // next calendar day.
        const PAGE = 1000;
        const orderList: any[] = await loadPaidPosOrdersByBusinessDate(
          supabase,
          linkedUserId,
          fromDate,
          toDate,
          "id, total, created_at, session_id, user_id, transaction_id, business_date, meal_subsidy_amount, delivery_fee, total_includes_delivery_fee",
        );
        // 🚚 Delivery fee is NOT restaurant revenue — it's collected from the
        // customer on behalf of the delivery company and never enters the
        // restaurant cash flow. Strip it from the order total for ALL
        // downstream aggregation (branch, cashier, payments, summary).
        const netOrderTotal = (o: any) => {
          const t = Number(o?.total) || 0;
          if (o?.total_includes_delivery_fee) {
            return Math.max(0, t - (Number(o?.delivery_fee) || 0));
          }
          return t;
        };

        // Invoice sales — paginated likewise
        const invList: any[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data: chunk, error: chErr } = await supabase
            .from("invoices")
            .select("id, invoice_date, total_amount, contact_name, invoice_number, created_at")
            .eq("user_id", linkedUserId)
            .eq("invoice_type", "sale")
            .eq("is_voided", false)
            .not("status", "in", "(cancelled,void,reversed)")
            .gte("invoice_date", fromDate)
            .lte("invoice_date", toDate)
            .order("invoice_date", { ascending: true })
            .range(from, from + PAGE - 1);
          if (chErr) break;
          if (!chunk || chunk.length === 0) break;
          invList.push(...chunk);
          if (chunk.length < PAGE) break;
          if (from > 100000) break;
        }

        const posTotal = orderList.reduce((s, o) => s + netOrderTotal(o), 0);
        const invTotal = invList.reduce((s, i) => s + (i.total_amount || 0), 0);
        const total = posTotal + invTotal;
        const orderCount = orderList.length + invList.length;

        if (!withDetails) {
          return {
            total, posTotal, invTotal, orderCount,
            byBranch: [], byItem: [], byCashier: [],
            summary: {
              gross: total, net: total, cash: 0, card: 0,
              employeeAccount: 0, employeeMeals: 0,
              cancelledCount: 0, cancelledTotal: 0,
            },
          };
        }

        // ── Sessions + cash boxes (for branch & cashier) ──
        const sessionIds = [...new Set(orderList.map(o => o.session_id).filter(Boolean))];
        const sessionMap: Record<string, { cashBoxId?: string; cashierName?: string; terminalId?: string }> = {};
        for (let i = 0; i < sessionIds.length; i += 200) {
          const chunk = sessionIds.slice(i, i + 200);
          const { data: sessions } = await supabase
            .from("pos_sessions")
            .select("id, cash_box_id, cashier_name, terminal_id")
            .in("id", chunk);
          (sessions || []).forEach((s: any) => {
            sessionMap[s.id] = { cashBoxId: s.cash_box_id, cashierName: s.cashier_name, terminalId: s.terminal_id };
          });
        }
        const cashBoxIds = [...new Set(Object.values(sessionMap).map(s => s.cashBoxId).filter(Boolean) as string[])];
        const cashBoxMap: Record<string, { name: string; location: string; branchId: string | null }> = {};
        if (cashBoxIds.length > 0) {
          const { data: boxes } = await supabase
            .from("cash_boxes")
            .select("id, name, branch_location, branch_id")
            .in("id", cashBoxIds);
          (boxes || []).forEach((b: any) => {
            cashBoxMap[b.id] = { name: b.name, location: b.branch_location, branchId: b.branch_id || null };
          });
        }
        // ── Terminal → branch fallback (when session has no cash_box or cash_box has no branch) ──
        const terminalIds = [...new Set(Object.values(sessionMap).map(s => s.terminalId).filter(Boolean) as string[])];
        const terminalBranchMap: Record<string, string> = {};
        if (terminalIds.length > 0) {
          const { data: terms } = await supabase
            .from("pos_terminals")
            .select("id, branch_id")
            .in("id", terminalIds);
          (terms || []).forEach((t: any) => {
            if (t.branch_id) terminalBranchMap[t.id] = t.branch_id;
          });
        }
        // ── Branch names ──
        const branchIds = [...new Set([
          ...Object.values(cashBoxMap).map(b => b.branchId).filter(Boolean) as string[],
          ...Object.values(terminalBranchMap),
        ])];
        const branchNameMap: Record<string, string> = {};
        if (branchIds.length > 0) {
          const { data: brs } = await supabase
            .from("branches")
            .select("id, name")
            .in("id", branchIds);
          (brs || []).forEach((b: any) => { branchNameMap[b.id] = b.name; });
        }

        // ── POS lines (for item breakdown) ──
        const orderIds = orderList.map(o => o.id);
        let posLines: any[] = [];
        for (let i = 0; i < orderIds.length; i += 200) {
          const chunk = orderIds.slice(i, i + 200);
          const { data } = await supabase
            .from("pos_order_lines")
            .select("order_id, product_name, qty, total")
            .in("order_id", chunk);
          if (data) posLines.push(...data);
        }

        // ── Invoice lines (for item breakdown) ──
        const invIds = invList.map(i => i.id);
        let invLines: any[] = [];
        for (let i = 0; i < invIds.length; i += 200) {
          const chunk = invIds.slice(i, i + 200);
          const { data } = await supabase
            .from("invoice_items")
            .select("invoice_id, product_name, description, quantity, total_amount")
            .in("invoice_id", chunk);
          if (data) invLines.push(...data);
        }

        // ── Payments breakdown (cash / card / employee_account) ──
        // Loaded per paid order, then attributed to its cashier+branch.
        // `cash` bucket = ILS cash only (net after change). Foreign-currency
        // cash (JOD/USD/…) is kept separately in `cashByCurrency` in its
        // native units so the portal can show them alongside the ILS line
        // without inflating the shekel figure.
        const paymentsByOrder: Record<string, {
          cash: number; card: number; employeeAccount: number;
          cashByCurrency: Record<string, number>;
        }> = {};
        for (let i = 0; i < orderIds.length; i += 200) {
          const chunk = orderIds.slice(i, i + 200);
          const { data: pays } = await supabase
            .from("pos_payments")
            .select("order_id, payment_method, amount, currency")
            .in("order_id", chunk);
          (pays || []).forEach((p: any) => {
            const bucket = paymentsByOrder[p.order_id] ||= {
              cash: 0, card: 0, employeeAccount: 0, cashByCurrency: {},
            };
            const amt = Number(p.amount) || 0;
            if (p.payment_method === "cash") {
              const cur = (p.currency || "ILS").toUpperCase();
              if (cur === "ILS") {
                bucket.cash += amt;
              } else {
                bucket.cashByCurrency[cur] = (bucket.cashByCurrency[cur] || 0) + amt;
              }
            }
            else if (p.payment_method === "card") bucket.card += amt;
            else if (p.payment_method === "employee_account") bucket.employeeAccount += amt;
          });
        }
        // 🚚 Strip delivery_fee from cash bucket (customer paid it in cash
        // but the cashier hands it to the driver — not real revenue).
        for (const o of orderList) {
          if (!o?.total_includes_delivery_fee) continue;
          const fee = Number(o?.delivery_fee) || 0;
          if (fee <= 0) continue;
          const bucket = paymentsByOrder[o.id];
          if (!bucket) continue;
          // Deduct from ILS cash first, then card as a defensive fallback.
          const fromCash = Math.min(bucket.cash, fee);
          bucket.cash -= fromCash;
          const remaining = fee - fromCash;
          if (remaining > 0) bucket.card = Math.max(0, bucket.card - remaining);
        }

        // ── Cancelled orders within the same business_date range ──
        // Loaded separately because loadPaidPosOrdersByBusinessDate only returns paid orders.
        const cancelledOrders: any[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from("pos_orders")
            .select("id, total, session_id, business_date, created_at, delivery_fee, total_includes_delivery_fee")
            .eq("user_id", linkedUserId)
            .eq("state", "cancelled")
            .gte("business_date", fromDate)
            .lte("business_date", toDate)
            .range(from, from + PAGE - 1);
          if (error) break;
          if (!data || data.length === 0) break;
          cancelledOrders.push(...data);
          if (data.length < PAGE) break;
        }
        // Sessions referenced only by cancelled orders need cashier/branch lookup too.
        const extraSessionIds = [...new Set(
          cancelledOrders.map(o => o.session_id).filter(Boolean).filter(id => !sessionMap[id])
        )];
        for (let i = 0; i < extraSessionIds.length; i += 200) {
          const chunk = extraSessionIds.slice(i, i + 200);
          const { data: sessions } = await supabase
            .from("pos_sessions")
            .select("id, cash_box_id, cashier_name, terminal_id")
            .in("id", chunk);
          (sessions || []).forEach((s: any) => {
            sessionMap[s.id] = { cashBoxId: s.cash_box_id, cashierName: s.cashier_name, terminalId: s.terminal_id };
          });
        }

        // ── Branch aggregation (group cash boxes under their branch) ──
        const branchAgg: Record<string, {
          id: string; name: string; location: string;
          total: number; orderCount: number;
          gross: number; net: number;
          cash: number; card: number; employeeAccount: number; employeeMeals: number;
          cancelledCount: number; cancelledTotal: number;
          cashByCurrency: Record<string, number>;
        }> = {};
        const ensureBranch = (brId: string, brName: string, location: string) => {
          if (!branchAgg[brId]) branchAgg[brId] = {
            id: brId, name: brName, location,
            total: 0, orderCount: 0,
            gross: 0, net: 0,
            cash: 0, card: 0, employeeAccount: 0, employeeMeals: 0,
            cancelledCount: 0, cancelledTotal: 0,
            cashByCurrency: {},
          };
          return branchAgg[brId];
        };
        for (const o of orderList) {
          const sess = sessionMap[o.session_id];
          const cbId = sess?.cashBoxId || "unknown";
          const box = cashBoxMap[cbId];
          // Fallback chain: cash_box.branch_id → terminal.branch_id → "بدون فرع"
          const fallbackBranchId = sess?.terminalId ? terminalBranchMap[sess.terminalId] : null;
          const resolvedBranchId = box?.branchId || fallbackBranchId || null;
          const brId = resolvedBranchId || "__no_branch__";
          const brName = resolvedBranchId
            ? (branchNameMap[resolvedBranchId] || "فرع غير مسمى")
            : "بدون فرع";
          const row = ensureBranch(brId, brName, box?.location || "");
          const orderTotal = netOrderTotal(o);
          row.total += orderTotal;
          row.orderCount += 1;
          row.gross += orderTotal;
          const pay = paymentsByOrder[o.id] || { cash: 0, card: 0, employeeAccount: 0, cashByCurrency: {} };
          row.cash += pay.cash;
          for (const [cur, amt] of Object.entries(pay.cashByCurrency || {})) {
            row.cashByCurrency[cur] = (row.cashByCurrency[cur] || 0) + (amt as number);
          }
          row.card += pay.card;
          row.employeeAccount += pay.employeeAccount;
          // Employee meals = company-subsidized portion ONLY.
          // employee_account payments are A/R (real revenue collected later from payroll), not a deduction.
          const subsidy = Number(o.meal_subsidy_amount) || 0;
          row.employeeMeals += subsidy;
          row.net += orderTotal - subsidy;
        }
        // Attribute cancellations to their branch.
        for (const o of cancelledOrders) {
          const sess = sessionMap[o.session_id];
          const cbId = sess?.cashBoxId || "";
          const box = cashBoxMap[cbId];
          const fallbackBranchId = sess?.terminalId ? terminalBranchMap[sess.terminalId] : null;
          const resolvedBranchId = box?.branchId || fallbackBranchId || null;
          const brId = resolvedBranchId || "__no_branch__";
          const brName = resolvedBranchId
            ? (branchNameMap[resolvedBranchId] || "فرع غير مسمى")
            : "بدون فرع";
          const row = ensureBranch(brId, brName, box?.location || "");
          row.cancelledCount += 1;
          row.cancelledTotal += netOrderTotal(o);
        }
        if (invList.length > 0) {
          const inv = ensureBranch("__invoices__", "فواتير المبيعات", "المحاسبة");
          inv.total = invTotal;
          inv.orderCount = invList.length;
          inv.gross = invTotal;
          inv.net = invTotal;
        }
        const byBranch = Object.values(branchAgg).sort((a, b) => b.total - a.total);

        // ── Item aggregation (combined POS + invoice) ──
        const itemAgg: Record<string, { name: string; quantity: number; revenue: number }> = {};
        for (const l of posLines) {
          const name = l.product_name || "غير معروف";
          if (!itemAgg[name]) itemAgg[name] = { name, quantity: 0, revenue: 0 };
          itemAgg[name].quantity += l.qty || 0;
          itemAgg[name].revenue += l.total || 0;
        }
        for (const l of invLines) {
          const name = l.product_name || l.description || "غير معروف";
          if (!itemAgg[name]) itemAgg[name] = { name, quantity: 0, revenue: 0 };
          itemAgg[name].quantity += l.quantity || 0;
          itemAgg[name].revenue += l.total_amount || 0;
        }
        const byItem = Object.values(itemAgg).sort((a, b) => b.revenue - a.revenue);

        // ── Cashier aggregation (POS only) ──
        const cashierAgg: Record<string, {
          name: string; branchId: string; branchName: string;
          total: number; orderCount: number;
          gross: number; net: number;
          cash: number; card: number; employeeAccount: number; employeeMeals: number;
          cancelledCount: number; cancelledTotal: number;
          cashByCurrency: Record<string, number>;
        }> = {};
        const ensureCashier = (key: string, name: string, branchId: string, branchName: string) => {
          if (!cashierAgg[key]) cashierAgg[key] = {
            name, branchId, branchName,
            total: 0, orderCount: 0,
            gross: 0, net: 0,
            cash: 0, card: 0, employeeAccount: 0, employeeMeals: 0,
            cancelledCount: 0, cancelledTotal: 0,
            cashByCurrency: {},
          };
          return cashierAgg[key];
        };
        for (const o of orderList) {
          const sess = sessionMap[o.session_id];
          const name = sess?.cashierName || "غير محدد";
          const cbId = sess?.cashBoxId || "";
          const box = cashBoxMap[cbId];
          const fallbackBranchId = sess?.terminalId ? terminalBranchMap[sess.terminalId] : null;
          const resolvedBranchId = box?.branchId || fallbackBranchId || "__no_branch__";
          const branchName = resolvedBranchId !== "__no_branch__"
            ? (branchNameMap[resolvedBranchId] || "فرع غير مسمى")
            : "بدون فرع";
          const key = `${resolvedBranchId}::${name}`;
          const row = ensureCashier(key, name, resolvedBranchId, branchName);
          const orderTotal = netOrderTotal(o);
          row.total += orderTotal;
          row.orderCount += 1;
          row.gross += orderTotal;
          const pay = paymentsByOrder[o.id] || { cash: 0, card: 0, employeeAccount: 0, cashByCurrency: {} };
          row.cash += pay.cash;
          for (const [cur, amt] of Object.entries(pay.cashByCurrency || {})) {
            row.cashByCurrency[cur] = (row.cashByCurrency[cur] || 0) + (amt as number);
          }
          row.card += pay.card;
          row.employeeAccount += pay.employeeAccount;
          const subsidy = Number(o.meal_subsidy_amount) || 0;
          row.employeeMeals += subsidy;
          row.net += orderTotal - subsidy;
        }
        // Attribute cancellations to their cashier.
        for (const o of cancelledOrders) {
          const sess = sessionMap[o.session_id];
          const name = sess?.cashierName || "غير محدد";
          const cbId = sess?.cashBoxId || "";
          const box = cashBoxMap[cbId];
          const fallbackBranchId = sess?.terminalId ? terminalBranchMap[sess.terminalId] : null;
          const resolvedBranchId = box?.branchId || fallbackBranchId || "__no_branch__";
          const branchName = resolvedBranchId !== "__no_branch__"
            ? (branchNameMap[resolvedBranchId] || "فرع غير مسمى")
            : "بدون فرع";
          const key = `${resolvedBranchId}::${name}`;
          const row = ensureCashier(key, name, resolvedBranchId, branchName);
          row.cancelledCount += 1;
          row.cancelledTotal += netOrderTotal(o);
        }
        // (Invoice sales attribution by user is not tracked on invoices table)
        const byCashier = Object.values(cashierAgg).sort((a, b) => b.total - a.total);

        // Top-level summary across the whole range.
        const summary = {
          gross: posTotal + invTotal,
          cash: Object.values(branchAgg).reduce((s, b) => s + b.cash, 0),
          card: Object.values(branchAgg).reduce((s, b) => s + b.card, 0),
          employeeAccount: Object.values(branchAgg).reduce((s, b) => s + b.employeeAccount, 0),
          employeeMeals: Object.values(branchAgg).reduce((s, b) => s + b.employeeMeals, 0),
          cancelledCount: cancelledOrders.length,
          cancelledTotal: cancelledOrders.reduce((s, o) => s + netOrderTotal(o), 0),
          net: 0,
          cashByCurrency: Object.values(branchAgg).reduce((acc, b) => {
            for (const [cur, amt] of Object.entries(b.cashByCurrency || {})) {
              acc[cur] = (acc[cur] || 0) + (amt as number);
            }
            return acc;
          }, {} as Record<string, number>),
        };
        summary.net = summary.gross - summary.employeeMeals;

        return { total, posTotal, invTotal, orderCount, byBranch, byItem, byCashier, summary };
      }

      // Prev-year only needs the total for growth %, never details.
      // Current range honours `summaryOnly` so the lightweight Owner-Home card
      // can skip the heavy item/branch/cashier aggregations.
      const [current, prevYear] = await Promise.all([
        loadRange(dateFrom, dateTo, !summaryOnly),
        loadRange(prevFrom, prevTo, false),
      ]);

      const growthPct = prevYear.total > 0
        ? ((current.total - prevYear.total) / prevYear.total) * 100
        : (current.total > 0 ? 100 : 0);

      return respond({
        success: true,
        range: { from: dateFrom, to: dateTo },
        prevRange: { from: prevFrom, to: prevTo },
        current,
        prevYear,
        growthPct,
      });
    }

    // ══════════════════════════════════════════════════════
    // ACTION: overview — Full accounting KPIs for portal dashboard
    // ══════════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════
    // ACTION: branch_drill — orders + payments + lines for a branch/date range
    //   Scoped to the resolved data owner (linkedUserId). Runs under service
    //   role because portal users don't have direct RLS access to pos_orders.
    // ══════════════════════════════════════════════════════
    if (action === "branch_drill") {
      if (!linkedUserId) return respond({ success: false, error: "not_linked" }, 403);
      const branchId: string | null = body.branchId || null;
      const dateFrom: string = body.dateFrom;
      const dateTo: string = body.dateTo;
      if (!branchId || !dateFrom || !dateTo) return respond({ success: false, error: "missing_params" }, 400);
      // Fetch every paid/cancelled order in range for this owner, then resolve
      // branch the SAME way as the aggregation (cash_box.branch_id →
      // terminal.branch_id fallback). Orders whose pos_orders.branch_id is
      // null still surface under the correct branch, matching the parent card.
      const { data: ordersAll, error: oErr } = await supabase
        .from("pos_orders")
        .select("id, order_number, created_at, total, subtotal, discount_amount, state, customer_name, notes, order_type, cancel_reason, meal_subsidy_amount, delivery_fee, total_includes_delivery_fee, business_date, branch_id, session_id, user_id")
        .eq("user_id", linkedUserId)
        .gte("business_date", dateFrom)
        .lte("business_date", dateTo)
        .in("state", ["paid", "cancelled"])
        .order("created_at", { ascending: false })
        .limit(5000);
      if (oErr) throw oErr;

      // Resolve branch per order via session → cash_box.branch_id → terminal.branch_id.
      const list = ordersAll || [];
      const sessionIds = [...new Set(list.map((o: any) => o.session_id).filter(Boolean))] as string[];
      const sessionMap: Record<string, { cashBoxId?: string; terminalId?: string }> = {};
      if (sessionIds.length > 0) {
        const { data: sessions } = await supabase
          .from("pos_sessions")
          .select("id, cash_box_id, terminal_id")
          .in("id", sessionIds);
        (sessions || []).forEach((s: any) => {
          sessionMap[s.id] = { cashBoxId: s.cash_box_id, terminalId: s.terminal_id };
        });
      }
      const cashBoxIds = [...new Set(Object.values(sessionMap).map(s => s.cashBoxId).filter(Boolean) as string[])];
      const cashBoxBranch: Record<string, string | null> = {};
      if (cashBoxIds.length > 0) {
        const { data: boxes } = await supabase
          .from("cash_boxes")
          .select("id, branch_id")
          .in("id", cashBoxIds);
        (boxes || []).forEach((b: any) => { cashBoxBranch[b.id] = b.branch_id || null; });
      }
      const terminalIds = [...new Set(Object.values(sessionMap).map(s => s.terminalId).filter(Boolean) as string[])];
      const terminalBranch: Record<string, string | null> = {};
      if (terminalIds.length > 0) {
        const { data: terms } = await supabase
          .from("pos_terminals")
          .select("id, branch_id")
          .in("id", terminalIds);
        (terms || []).forEach((t: any) => { terminalBranch[t.id] = t.branch_id || null; });
      }

      const resolveBranch = (o: any): string => {
        const s = o.session_id ? sessionMap[o.session_id] : undefined;
        const boxBr = s?.cashBoxId ? cashBoxBranch[s.cashBoxId] : null;
        const termBr = s?.terminalId ? terminalBranch[s.terminalId] : null;
        return o.branch_id || boxBr || termBr || "__no_branch__";
      };

      const orders = list.filter((o: any) => resolveBranch(o) === branchId);
      const ids = orders.map((o: any) => o.id);
      let payments: any[] = [];
      let lines: any[] = [];
      if (ids.length > 0) {
        const [{ data: p }, { data: l }] = await Promise.all([
          supabase.from("pos_payments").select("order_id, payment_method, amount, currency, notes").in("order_id", ids),
          supabase.from("pos_order_lines").select("order_id, product_name, qty, unit_price, total, notes").in("order_id", ids),
        ]);
        payments = p || [];
        lines = l || [];
      }
      return respond({ success: true, orders, payments, lines });
    }

    if (action === "overview") {
      const { period = "month" } = body;
      const now = new Date();
      const toStr = now.toISOString().split("T")[0];
      let fromStr: string;
      switch (period) {
        case "today": fromStr = toStr; break;
        case "week": { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); fromStr = d.toISOString().split("T")[0]; break; }
        case "year": fromStr = `${now.getFullYear()}-01-01`; break;
        default: fromStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      }

      // ── Fast path: single aggregated RPC replaces loading up to 5,000
      //    transaction rows and reducing them in Deno. All KPIs, the daily
            //    chart, and top debtors/creditors are computed database-side.
      const [kpiRes, cashBoxesRes, chqRes, recentTxRes, portalPsRes, currenciesRes] = await Promise.all([
        supabase.rpc("get_portal_overview_kpis", {
          p_user_id: linkedUserId, p_from: fromStr, p_to: toStr,
        }),
        supabase.from("cash_boxes")
          .select("id, currency")
          .eq("user_id", linkedUserId).eq("is_active", true),
        supabase.from("cheques")
          .select("id, cheque_date, amount, party_name, cheque_type, status")
          .eq("user_id", linkedUserId)
          .not("status", "in", "(محصل,ملغي)")
          .order("cheque_date", { ascending: true })
          .limit(6),
        supabase.from("transactions")
          .select("id, transaction_date, description, amount, debit_account_code, credit_account_code, created_at")
          .eq("user_id", linkedUserId).eq("is_deleted", false)
          .is("reversed_by_id", null)
          .order("created_at", { ascending: false }).limit(10),
        supabase.from("malaki_portal_settings")
          .select("exchange_rate_jod, exchange_rate_usd")
          .eq("user_id", linkedUserId).maybeSingle(),
        supabase.from("currencies")
          .select("id, code")
          .eq("user_id", linkedUserId)
          .in("code", ["JOD", "USD"]),
      ]);

      const kpi = (kpiRes.data && kpiRes.data[0]) || {};
      const revenue    = Number(kpi.revenue || 0);
      const purchases  = Number(kpi.purchases || 0);
      const genExp     = Number(kpi.gen_exp || 0);
      const expenses   = purchases + genExp;
      const netProfit  = revenue - expenses;
      const receivables = Number(kpi.receivables || 0);
      const payables    = Number(kpi.payables || 0);
      const inflows     = Number(kpi.inflows || 0);
      const outflows    = Number(kpi.outflows || 0);
      let cashBalance   = Number(kpi.cash_dr || 0) - Number(kpi.cash_cr || 0);
      const chartRaw = (kpi.chart_json as any[]) || [];
      const chartData = chartRaw.map((r) => ({
        date: r.date,
        revenue: Number(r.revenue || 0),
        expenses: Number(r.expenses || 0),
        profit: Number(r.revenue || 0) - Number(r.expenses || 0),
      }));
      const topDebtors   = ((kpi.top_debtors_json as any[]) || []).map((r) => ({ name: r.name, balance: Number(r.balance || 0) }));
      const topCreditors = ((kpi.top_creditors_json as any[]) || []).map((r) => ({ name: r.name, balance: Number(r.balance || 0) }));

      // ── Override cash balance with real box totals (single source of truth,
      //    matches Liquidity tab). Uses bulk RPC → ONE round trip, not N.
      try {
        const cashBoxesOv = cashBoxesRes.data || [];
        if (cashBoxesOv.length > 0) {
          let jodRate = portalPsRes.data?.exchange_rate_jod || 3.55;
          let usdRate = portalPsRes.data?.exchange_rate_usd || 3.65;
          const currencies = currenciesRes.data || [];
          if (currencies.length > 0) {
            const codeMap: Record<string, string> = {};
            for (const c of currencies) codeMap[c.id] = c.code;
            const { data: rates } = await supabase
              .from("exchange_rates")
              .select("currency_id, mid_rate, sell_rate, rate_date")
              .eq("user_id", linkedUserId)
              .in("currency_id", currencies.map((c: any) => c.id))
              .order("rate_date", { ascending: false });
            const seen = new Set<string>();
            for (const r of rates || []) {
              const code = codeMap[r.currency_id];
              if (code && !seen.has(code)) {
                seen.add(code);
                const rate = r.sell_rate || r.mid_rate || 0;
                if (code === "JOD" && rate > 0) jodRate = rate;
                if (code === "USD" && rate > 0) usdRate = rate;
              }
            }
          }
          const { data: bulkBal } = await supabase.rpc("get_cash_boxes_balances_bulk", {
            p_user_id: linkedUserId,
          });
          const balMap: Record<string, number> = {};
          for (const row of (bulkBal || []) as any[]) balMap[row.box_id] = Number(row.balance || 0);
          let totalILS = 0;
          for (const box of cashBoxesOv) {
            const amount = balMap[box.id] || 0;
            const ccy = box.currency || "ILS";
            if (ccy === "JOD") totalILS += amount * jodRate;
            else if (ccy === "USD") totalILS += amount * usdRate;
            else totalILS += amount;
          }
          cashBalance = totalILS;
        }
      } catch (e) {
        console.error("[overview] cash_boxes override failed, falling back to ledger:", e);
      }

      const cheques = chqRes.data || [];
      const recentTx = recentTxRes.data || [];

      // Upcoming cheques (already filtered + ordered server-side; we just add daysRemaining)
      const upcomingCheques = cheques.map((c: any) => ({
        ...c,
        daysRemaining: Math.floor((new Date(c.cheque_date).getTime() - now.getTime()) / 86400000),
      }));

      // Recent activity (10 rows only)
      const recentActivity = recentTx.map((tx: any) => {
        const txDate = new Date(tx.created_at || tx.transaction_date);
        const diffMin = Math.floor((now.getTime() - txDate.getTime()) / 60000);
        const diffHr = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHr / 24);
        let timeAgo = "الآن";
        if (diffDay > 0) timeAgo = diffDay === 1 ? "أمس" : `منذ ${diffDay} أيام`;
        else if (diffHr > 0) timeAgo = `منذ ${diffHr} ساعة`;
        else if (diffMin > 0) timeAgo = `منذ ${diffMin} دقيقة`;
        const dc = tx.debit_account_code || "";
        const cc = tx.credit_account_code || "";
        let type = "other";
        if (cc.startsWith("4") || dc === "1110" || dc === "1120") type = "income";
        if (dc.startsWith("5") || dc.startsWith("6")) type = "expense";
        return { id: tx.id, description: tx.description || "عملية", amount: tx.amount || 0, type, timeAgo };
      });

      return respond({
        success: true,
        kpis: { revenue, expenses, netProfit, cashBalance, receivables, payables },
        cashFlow: { inflows, outflows, net: inflows - outflows },
        chartData,
        recentActivity,
        upcomingCheques,
        topDebtors,
        topCreditors,
      });
    }

    if (action === "dashboard" || action === "sales" || action === "liquidity") {
      let salesResult = null;
      let liquidityResult = null;

      if (action === "dashboard" || action === "sales") {
        const shiftStart = body.shiftStart;
        const shiftEnd = body.shiftEnd;

        // ── SOURCE A: POS Orders ──
        const orderList: any[] = await loadPaidPosOrders(supabase, linkedUserId, shiftStart, shiftEnd);
        const orderIds = orderList.map((o) => o.id);

        // ── SOURCE B: Regular Sale Invoices ──
        // Convert ISO timestamps to date strings for invoice_date (DATE column)
        const shiftStartDate = shiftStart ? shiftStart.split("T")[0] : null;
        const shiftEndDate = shiftEnd ? shiftEnd.split("T")[0] : null;

        let invoiceQuery = supabase
          .from("invoices")
          .select("id, invoice_date, total_amount, contact_name, payment_method, invoice_number, created_at")
          .eq("user_id", linkedUserId)
          .eq("invoice_type", "sale")
          .eq("is_voided", false)
          .not("status", "in", "(cancelled,void,reversed)");
        if (shiftStartDate) invoiceQuery = invoiceQuery.gte("invoice_date", shiftStartDate);
        if (shiftEndDate) invoiceQuery = invoiceQuery.lte("invoice_date", shiftEndDate);

        const { data: saleInvoices } = await invoiceQuery.order("invoice_date", { ascending: false }).limit(5000);
        const invoiceList: any[] = saleInvoices || [];

        // ── Invoice totals ──
        const invoiceTotalSales = invoiceList.reduce((s: number, inv: any) => s + (inv.total_amount || 0), 0);
        const invoiceOrderCount = invoiceList.length;

        let allLines: any[] = [];
        if (orderIds.length > 0) {
          for (let i = 0; i < orderIds.length; i += 200) {
            const chunk = orderIds.slice(i, i + 200);
            const { data: lines } = await supabase
              .from("pos_order_lines")
              .select("order_id, product_name, qty, total")
              .in("order_id", chunk);
            if (lines) allLines.push(...lines);
          }
        }

        // ── Fetch invoice lines for product breakdown ──
        const invoiceIds = invoiceList.map((inv: any) => inv.id);
        let invoiceLines: any[] = [];
        if (invoiceIds.length > 0) {
          for (let i = 0; i < invoiceIds.length; i += 200) {
            const chunk = invoiceIds.slice(i, i + 200);
            const { data: lines } = await supabase
              .from("invoice_items")
              .select("invoice_id, product_name, description, quantity, total_amount")
              .in("invoice_id", chunk);
            if (lines) invoiceLines.push(...lines);
          }
        }

        const sessionIds = [...new Set(orderList.map((o) => o.session_id).filter(Boolean))];
        const sessionMap: Record<string, string> = {};
        const sessionTerminalMap: Record<string, string> = {};
        if (sessionIds.length > 0) {
          for (let i = 0; i < sessionIds.length; i += 200) {
            const chunk = sessionIds.slice(i, i + 200);
            const { data: sessions } = await supabase
              .from("pos_sessions")
              .select("id, cash_box_id, terminal_id")
              .in("id", chunk);
            (sessions || []).forEach((s: any) => {
              sessionMap[s.id] = s.cash_box_id;
              if (s.terminal_id) sessionTerminalMap[s.id] = s.terminal_id;
            });
          }
        }

        const cashBoxIds = [...new Set(Object.values(sessionMap).filter(Boolean))];
        const cashBoxMap: Record<string, any> = {};
        if (cashBoxIds.length > 0) {
          const { data: boxes } = await supabase
            .from("cash_boxes")
            .select("id, name, branch_location, branch_id")
            .in("id", cashBoxIds);
          (boxes || []).forEach((b: any) => {
            cashBoxMap[b.id] = b;
          });
        }

        // Terminal → branch fallback
        const terminalIdsLive = [...new Set(Object.values(sessionTerminalMap))];
        const terminalBranchMapLive: Record<string, string> = {};
        if (terminalIdsLive.length > 0) {
          const { data: terms } = await supabase
            .from("pos_terminals")
            .select("id, branch_id")
            .in("id", terminalIdsLive);
          (terms || []).forEach((t: any) => {
            if (t.branch_id) terminalBranchMapLive[t.id] = t.branch_id;
          });
        }
        const branchIdsLive = [...new Set([
          ...Object.values(cashBoxMap).map((b: any) => b.branch_id).filter(Boolean) as string[],
          ...Object.values(terminalBranchMapLive),
        ])];
        const branchNameMapLive: Record<string, string> = {};
        if (branchIdsLive.length > 0) {
          const { data: brs } = await supabase
            .from("branches")
            .select("id, name, location")
            .in("id", branchIdsLive);
          (brs || []).forEach((b: any) => {
            branchNameMapLive[b.id] = b.name;
            (branchNameMapLive as any)[b.id + "__loc"] = b.location || "";
          });
        }

        const branchData: Record<string, any> = {};

        // ── Process POS orders into branches ──
        for (const order of orderList) {
          const cashBoxId = sessionMap[order.session_id];
          const box = cashBoxId ? cashBoxMap[cashBoxId] : null;
          // Group by branch (cash_box.branch_id → terminal.branch_id), falling back to cash_box id, then "unknown"
          const terminalId = sessionTerminalMap[order.session_id];
          const resolvedBranchId = box?.branch_id || (terminalId ? terminalBranchMapLive[terminalId] : null);
          const branchKey = resolvedBranchId || cashBoxId || "unknown";
          const resolvedName = resolvedBranchId
            ? (branchNameMapLive[resolvedBranchId] || box?.name || "غير معروف")
            : (box?.name || "غير معروف");
          const resolvedLoc = resolvedBranchId
            ? ((branchNameMapLive as any)[resolvedBranchId + "__loc"] || box?.branch_location || "")
            : (box?.branch_location || "");

          if (!branchData[branchKey]) {
            branchData[branchKey] = {
              id: branchKey,
              name: resolvedName,
              location: resolvedLoc,
              totalSales: 0,
              orderCount: 0,
              orders: [],
              hourlySales: {},
              lastOrderAt: null,
            };
          }

          branchData[branchKey].totalSales += order.total || 0;
          branchData[branchKey].orderCount += 1;
          branchData[branchKey].orders.push(order.id);

          if (!branchData[branchKey].lastOrderAt || order.created_at > branchData[branchKey].lastOrderAt) {
            branchData[branchKey].lastOrderAt = order.created_at;
          }

          const hour = new Date(order.created_at).getHours().toString();
          branchData[branchKey].hourlySales[hour] =
            (branchData[branchKey].hourlySales[hour] || 0) + (order.total || 0);
        }

        // ── Process regular invoices into a "فواتير مبيعات" branch ──
        if (invoiceList.length > 0) {
          const invBranchKey = "invoices";
          branchData[invBranchKey] = {
            id: invBranchKey,
            name: "فواتير مبيعات",
            location: "المحاسبة",
            totalSales: invoiceTotalSales,
            orderCount: invoiceOrderCount,
            orders: invoiceIds,
            hourlySales: {} as Record<string, number>,
            lastOrderAt: invoiceList[0]?.created_at || null,
          };
          // Hourly distribution for invoices
          for (const inv of invoiceList) {
            const hour = new Date(inv.created_at || inv.invoice_date).getHours().toString();
            branchData[invBranchKey].hourlySales[hour] =
              (branchData[invBranchKey].hourlySales[hour] || 0) + (inv.total_amount || 0);
          }
        }

        for (const branchKey of Object.keys(branchData)) {
          const mealMap: Record<string, { quantity: number; revenue: number }> = {};

          if (branchKey === "invoices") {
            // Use invoice lines for product breakdown
            const branchInvIds = new Set(branchData[branchKey].orders);
            const brInvLines = invoiceLines.filter((l: any) => branchInvIds.has(l.invoice_id));
            for (const line of brInvLines) {
              const name = line.product_name || line.description || "غير معروف";
              if (!mealMap[name]) mealMap[name] = { quantity: 0, revenue: 0 };
              mealMap[name].quantity += line.quantity || 0;
              mealMap[name].revenue += line.total_amount || 0;
            }
          } else {
            const branchOrderIds = new Set(branchData[branchKey].orders);
            const branchLines = allLines.filter((l) => branchOrderIds.has(l.order_id));
            for (const line of branchLines) {
              const name = line.product_name || "غير معروف";
              if (!mealMap[name]) mealMap[name] = { quantity: 0, revenue: 0 };
              mealMap[name].quantity += line.qty || 0;
              mealMap[name].revenue += line.total || 0;
            }
          }

          branchData[branchKey].topMeals = Object.entries(mealMap)
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 10);

          branchData[branchKey].avgOrder =
            branchData[branchKey].orderCount > 0
              ? branchData[branchKey].totalSales / branchData[branchKey].orderCount
              : 0;

          delete branchData[branchKey].orders;
        }

        const branches = Object.values(branchData).sort((a: any, b: any) => b.totalSales - a.totalSales);
        const totalSales = branches.reduce((sum: number, b: any) => sum + b.totalSales, 0);
        const totalOrders = branches.reduce((sum: number, b: any) => sum + b.orderCount, 0);

        salesResult = {
          totalSales,
          orderCount: totalOrders,
          avgOrderValue: totalOrders > 0 ? totalSales / totalOrders : 0,
          topBranch:
            branches.length > 0
              ? { name: (branches[0] as any).name, sales: (branches[0] as any).totalSales }
              : null,
          branches,
          // Include invoice details for separate display
          invoiceSales: {
            total: invoiceTotalSales,
            count: invoiceOrderCount,
            // NOTE: Detailed items intentionally omitted from the dashboard
            // response — no consumer reads them, and shipping 5,000 invoice
            // rows on every 60s poll was the largest response-size offender.
            // Use action=pos_sales_detailed / dedicated invoice endpoints
            // when a caller actually needs the line-by-line list.
          },
        };
      }

      if (action === "dashboard" || action === "liquidity") {
        const { data: cashBoxes } = await supabase
          .from("cash_boxes")
          .select("id, name, type, branch_location, currency, opening_balance, is_active")
          .eq("user_id", linkedUserId)
          .eq("is_active", true);

        // ── Bulk balance fetch: one aggregated SQL call instead of N RPCs.
        //    For tenants with dozens of cash boxes this drops the dashboard
        //    liquidity block from ~2N transaction scans to just 3.
        const balanceMap: Record<string, number> = {};
        const { data: bulkBalances, error: bulkErr } = await supabase.rpc(
          "get_cash_boxes_balances_bulk",
          { p_user_id: linkedUserId },
        );
        if (bulkErr) {
          console.error("get_cash_boxes_balances_bulk failed, falling back:", bulkErr);
        } else {
          for (const row of (bulkBalances || []) as any[]) {
            balanceMap[row.box_id] = Number(row.balance || 0);
          }
        }
        const boxesWithBalance = (cashBoxes || []).map((box: any) => ({
          id: box.id,
          name: box.name,
          branchLocation: box.branch_location || "",
          currency: box.currency || "ILS",
          balance: balanceMap[box.id] ?? 0,
          isActive: box.is_active,
          type: box.type,
        }));

        let jodRate = portalSettings?.exchange_rate_jod || 3.55;
        let usdRate = portalSettings?.exchange_rate_usd || 3.65;
        try {
          const { data: currencies } = await supabase
            .from("currencies")
            .select("id, code")
            .eq("user_id", linkedUserId)
            .in("code", ["JOD", "USD"]);

          if (currencies && currencies.length > 0) {
            const currencyIds = currencies.map((c: any) => c.id);
            const { data: rates } = await supabase
              .from("exchange_rates")
              .select("currency_id, mid_rate, sell_rate, rate_date")
              .eq("user_id", linkedUserId)
              .in("currency_id", currencyIds)
              .order("rate_date", { ascending: false });

            if (rates && rates.length > 0) {
              const codeMap: Record<string, string> = {};
              for (const c of currencies) codeMap[c.id] = c.code;

              const seen = new Set<string>();
              for (const r of rates) {
                const code = codeMap[r.currency_id];
                if (code && !seen.has(code)) {
                  seen.add(code);
                  const rate = r.sell_rate || r.mid_rate || 0;
                  if (code === "JOD" && rate > 0) jodRate = rate;
                  if (code === "USD" && rate > 0) usdRate = rate;
                }
              }
            }
          }
        } catch (_) { /* fallback to settings values */ }

        liquidityResult = {
          exchangeRates: {
            jod: jodRate,
            usd: usdRate,
          },
          cashBoxes: boxesWithBalance,
        };
      }

      return respond({
        success: true,
        sales: salesResult,
        liquidity: liquidityResult,
      });
    }

    // ============ POS Sales Detailed ============
    if (action === "pos_sales_detailed") {
      const dateFrom = body.dateFrom;
      const dateTo = body.dateTo;
      const branchFilter = body.branchId;

      const startISO = new Date(dateFrom + "T00:00:00+03:00").toISOString();
      const endISO = new Date(dateTo + "T23:59:59+03:00").toISOString();

      const orderList: any[] = await loadPaidPosOrders(supabase, linkedUserId, startISO, endISO);

      const sessionIds = [...new Set(orderList.map(o => o.session_id).filter(Boolean))];
      const sessionMap: Record<string, string> = {};
      if (sessionIds.length > 0) {
        for (let i = 0; i < sessionIds.length; i += 200) {
          const chunk = sessionIds.slice(i, i + 200);
          const { data: sessions } = await supabase
            .from("pos_sessions")
            .select("id, cash_box_id")
            .in("id", chunk);
          (sessions || []).forEach((s: any) => { sessionMap[s.id] = s.cash_box_id; });
        }
      }

      let filteredOrders = orderList;
      if (branchFilter) {
        filteredOrders = orderList.filter(o => sessionMap[o.session_id] === branchFilter);
      }

      const orderIds = filteredOrders.map(o => o.id);

      let allLines: any[] = [];
      if (orderIds.length > 0) {
        for (let i = 0; i < orderIds.length; i += 200) {
          const chunk = orderIds.slice(i, i + 200);
          const { data: lines } = await supabase
            .from("pos_order_lines")
            .select("order_id, product_name, qty, total, unit_price")
            .in("order_id", chunk);
          if (lines) allLines.push(...lines);
        }
      }

      const itemMap: Record<string, { name: string; qty: number; revenue: number; avgPrice: number }> = {};
      for (const line of allLines) {
        const name = line.product_name || "غير معروف";
        if (!itemMap[name]) itemMap[name] = { name, qty: 0, revenue: 0, avgPrice: 0 };
        itemMap[name].qty += line.qty || 0;
        itemMap[name].revenue += line.total || 0;
      }
      for (const key of Object.keys(itemMap)) {
        itemMap[key].avgPrice = itemMap[key].qty > 0 ? itemMap[key].revenue / itemMap[key].qty : 0;
      }

      const items = Object.values(itemMap).sort((a, b) => b.qty - a.qty);

      const cashBoxIds = [...new Set(Object.values(sessionMap).filter(Boolean))];
      const branches: { id: string; name: string }[] = [];
      if (cashBoxIds.length > 0) {
        const { data: boxes } = await supabase
          .from("cash_boxes")
          .select("id, name, branch_location")
          .in("id", cashBoxIds);
        (boxes || []).forEach((b: any) => {
          branches.push({ id: b.id, name: b.branch_location || b.name });
        });
      }

      const branchTotals: Record<string, { name: string; total: number; orders: number }> = {};
      for (const order of filteredOrders) {
        const boxId = sessionMap[order.session_id] || "unknown";
        if (!branchTotals[boxId]) {
          const branch = branches.find(b => b.id === boxId);
          branchTotals[boxId] = { name: branch?.name || "غير معروف", total: 0, orders: 0 };
        }
        branchTotals[boxId].total += order.total || 0;
        branchTotals[boxId].orders += 1;
      }

      return respond({
        success: true,
        totalSales: filteredOrders.reduce((s, o) => s + (o.total || 0), 0),
        totalOrders: filteredOrders.length,
        items,
        branches,
        branchTotals: Object.entries(branchTotals).map(([id, d]) => ({ id, ...d })).sort((a, b) => b.total - a.total),
      });
    }

    // ============ Employee Requests ============
    if (action === "employee_requests") {
      const { data: forms } = await supabase
        .from("employee_forms")
        .select("id, employee_id, form_type, status, created_at, form_data, template_id, title, review_notes, hr_recommendation, hr_recommendation_notes, hr_reviewed_at, final_decided_at, final_decision_notes")
        .eq("user_id", linkedUserId)
        .order("created_at", { ascending: false })
        .limit(500);

      const empIds = [...new Set((forms || []).map((f: any) => f.employee_id).filter(Boolean))];
      const empMap: Record<string, string> = {};
      if (empIds.length > 0) {
        for (let i = 0; i < empIds.length; i += 200) {
          const chunk = empIds.slice(i, i + 200);
          const { data: emps } = await supabase
            .from("employees")
            .select("id, full_name")
            .in("id", chunk);
          (emps || []).forEach((e: any) => { empMap[e.id] = e.full_name; });
        }
      }

      // Fetch any referenced templates so the portal can render schema-driven views.
      const templateIds = [...new Set((forms || []).map((f: any) => f.template_id).filter(Boolean))];
      const templateMap: Record<string, { name: string; schema: any }> = {};
      if (templateIds.length > 0) {
        const { data: tpls } = await supabase
          .from("form_templates")
          .select("id, name, schema")
          .in("id", templateIds);
        (tpls || []).forEach((t: any) => { templateMap[t.id] = { name: t.name, schema: t.schema || { sections: [] } }; });
      }

      const requests = (forms || []).map((f: any) => {
        const fd = f.form_data || {};
        const tpl = f.template_id ? templateMap[f.template_id] : null;
        return {
          id: f.id,
          employeeName: empMap[f.employee_id] || "غير معروف",
          formType: f.form_type,
          status: f.status,
          amount: fd.amount || fd.advance_amount || fd.loan_amount || null,
          createdAt: f.created_at,
          details: fd,
          templateId: f.template_id || null,
          templateName: tpl?.name || f.title || null,
          templateSchema: tpl?.schema || null,
          title: f.title || null,
          reviewNotes: f.review_notes || null,
          hrRecommendation: f.hr_recommendation || null,
          hrRecommendationNotes: f.hr_recommendation_notes || null,
          hrReviewedAt: f.hr_reviewed_at || null,
          finalDecidedAt: f.final_decided_at || null,
          finalDecisionNotes: f.final_decision_notes || null,
        };
      });

      return respond({ success: true, requests });
    }

    // ============ Final management decision on an employee form ============
    // Two-stage approval: HR records a recommendation first, then management
    // (owner portal / tenant owner) issues the binding final decision.
    if (action === "decide_employee_form") {
      if (!linkedUserId) return respond({ success: false, error: "not_linked" }, 403);
      const formId = String(body.formId || "");
      const decision = String(body.decision || "");
      const notes = body.notes ? String(body.notes).trim() : null;
      if (!formId || !["approved", "rejected"].includes(decision)) {
        return respond({ success: false, error: "invalid_payload" }, 400);
      }

      const { data: form, error: formErr } = await supabase
        .from("employee_forms")
        .select("id, user_id, company_id, status, form_type")
        .eq("id", formId)
        .maybeSingle();
      if (formErr) throw formErr;
      if (!form || form.user_id !== linkedUserId) {
        return respond({ success: false, error: "not_found" }, 404);
      }
      if (form.status !== "pending") {
        return respond({ success: false, error: "already_decided" }, 409);
      }

      const nowISO = new Date().toISOString();
      const { error: updErr } = await supabase
        .from("employee_forms")
        .update({
          status: decision,
          final_decided_by: authUserId,
          final_decided_at: nowISO,
          final_decision_notes: notes,
          reviewed_at: nowISO,
        })
        .eq("id", formId)
        .eq("status", "pending");
      if (updErr) throw updErr;

      if (form.company_id) {
        await supabase.from("employee_form_approvals").insert({
          form_id: formId,
          company_id: form.company_id,
        action: decision === "approved" ? "approve" : "reject",
        actor_user_id: authUserId,
        actor_role: "management",
        notes,
        }).then(() => {}, () => {});
      }

      return respond({ success: true });
    }

    // ============ Supplier Balances ============
    // ============ Disciplinary penalties (correction_requests) ============
    // Branch manager / HR issue a penalty -> HR records a recommendation ->
    // management (owner portal) issues the binding final decision. The employee
    // only sees the penalty after final_decision = 'approved' (enforced by RLS).
    if (action === "employee_penalties") {
      if (!linkedUserId) return respond({ success: false, error: "not_linked" }, 403);
      const { data: emps } = await supabase
        .from("employees")
        .select("id, full_name")
        .eq("user_id", linkedUserId);
      const empMap: Record<string, string> = {};
      (emps || []).forEach((e: any) => { empMap[e.id] = e.full_name; });
      const empIds = Object.keys(empMap);
      if (empIds.length === 0) return respond({ success: true, penalties: [] });

      const rows: any[] = [];
      for (let i = 0; i < empIds.length; i += 200) {
        const { data } = await supabase
          .from("correction_requests")
          .select("id, employee_id, attendance_date, reason, status, created_at, review_notes, hr_recommendation, hr_recommendation_notes, hr_reviewed_at, final_decision, final_decision_notes, final_decided_at, archived_at")
          .eq("request_type", "penalty")
          .in("employee_id", empIds.slice(i, i + 200))
          .order("created_at", { ascending: false })
          .limit(500);
        rows.push(...(data || []));
      }

      const penalties = rows.map((r: any) => {
        let meta: any = null;
        try {
          const m = String(r.reason || "").match(/\[HRMSG\]([\s\S]*?)\[\/HRMSG\]/);
          if (m) meta = JSON.parse(m[1]);
        } catch (_e) { meta = null; }
        return {
          id: r.id,
          employeeId: r.employee_id,
          employeeName: empMap[r.employee_id] || "غير معروف",
          subject: meta?.subject || String(r.reason || "").slice(0, 120),
          body: meta?.body || String(r.reason || ""),
          penaltyKind: meta?.penalty_kind || null,
          issuedByName: meta?.issued_by_name || null,
          violationDate: meta?.violation_date || r.attendance_date || null,
          effectiveDate: meta?.effective_date || null,
          status: r.status,
          createdAt: r.created_at,
          hrRecommendation: r.hr_recommendation || null,
          hrRecommendationNotes: r.hr_recommendation_notes || null,
          hrReviewedAt: r.hr_reviewed_at || null,
          finalDecision: r.final_decision || null,
          finalDecisionNotes: r.final_decision_notes || null,
          finalDecidedAt: r.final_decided_at || null,
          archivedAt: r.archived_at || null,
        };
      });

      return respond({ success: true, penalties });
    }

    if (action === "decide_penalty") {
      if (!linkedUserId) return respond({ success: false, error: "not_linked" }, 403);
      const penaltyId = String(body.penaltyId || "");
      const decision = String(body.decision || "");
      const notes = body.notes ? String(body.notes).trim() : null;
      if (!penaltyId || !["approved", "rejected"].includes(decision)) {
        return respond({ success: false, error: "invalid_payload" }, 400);
      }

      const { data: row, error: rowErr } = await supabase
        .from("correction_requests")
        .select("id, employee_id, request_type, final_decision")
        .eq("id", penaltyId)
        .maybeSingle();
      if (rowErr) throw rowErr;
      if (!row || row.request_type !== "penalty") return respond({ success: false, error: "not_found" }, 404);

      const { data: emp } = await supabase
        .from("employees")
        .select("id")
        .eq("id", row.employee_id)
        .eq("user_id", linkedUserId)
        .maybeSingle();
      if (!emp) return respond({ success: false, error: "not_found" }, 404);
      if (row.final_decision) return respond({ success: false, error: "already_decided" }, 409);

      const nowISO = new Date().toISOString();
      const { error: updErr } = await supabase
        .from("correction_requests")
        .update({
          final_decision: decision,
          final_decision_notes: notes,
          final_decided_at: nowISO,
          final_decided_by: authUserId,
          status: decision === "approved" ? "pending" : "cancelled",
          review_notes: decision === "rejected" ? (notes || "غير معتمد من الإدارة") : null,
          reviewed_at: nowISO,
        })
        .eq("id", penaltyId)
        .is("final_decision", null);
      if (updErr) throw updErr;

      return respond({ success: true });
    }

    if (action === "supplier_balances") {
      const dateFrom = body.dateFrom;
      const dateTo = body.dateTo;

      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, contact_name, contact_type, current_balance")
        .eq("user_id", linkedUserId)
        .in("contact_type", ["supplier", "both", "مورد", "عميل ومورد"])
        .order("contact_name");

      const contactIds = (contacts || []).map((c: any) => c.id);

      let transactions: any[] = [];
      if (contactIds.length > 0) {
        for (let i = 0; i < contactIds.length; i += 200) {
          const chunk = contactIds.slice(i, i + 200);
          let q = supabase
            .from("transactions")
            .select("id, contact_id, amount, debit_account_code, credit_account_code, transaction_date, description, transaction_type")
            .eq("user_id", linkedUserId)
            .eq("is_deleted", false)
            .in("contact_id", chunk);

          if (dateFrom) q = q.gte("transaction_date", dateFrom);
          if (dateTo) q = q.lte("transaction_date", dateTo);

          const { data: txs } = await q;
          if (txs) transactions.push(...txs);
        }
      }

      const supplierData = (contacts || []).map((c: any) => {
        const contactTxs = transactions.filter(t => t.contact_id === c.id);
        let openingBalance = 0;
        let totalPurchases = 0;
        let totalPayments = 0;

        for (const tx of contactTxs) {
          const isOpening = tx.transaction_type === "opening_balance" || tx.transaction_type === "opening";

          if (isOpening) {
            openingBalance += tx.amount || 0;
          } else if (tx.debit_account_code?.startsWith("5") || String(tx.credit_account_code || "").startsWith("2110")) {
            totalPurchases += tx.amount || 0;
          }

          if (!isOpening && String(tx.debit_account_code || "").startsWith("2110")) {
            totalPayments += tx.amount || 0;
          }
        }

        const closingBalance = openingBalance + totalPurchases - totalPayments;

        return {
          id: c.id,
          name: c.contact_name,
          type: c.contact_type,
          openingBalance,
          totalPurchases,
          totalPayments,
          closingBalance,
        };
      });

      return respond({
        success: true,
        suppliers: supplierData.filter((s: any) => s.closingBalance !== 0 || s.totalPurchases > 0),
        totalOwed: supplierData.reduce((sum: number, s: any) => sum + Math.max(s.closingBalance, 0), 0),
      });
    }

    // ============ Attendance ============
    if (action === "attendance") {
      const dateFrom = body.dateFrom; // yyyy-MM-dd
      const dateTo = body.dateTo;     // yyyy-MM-dd

      // Fetch active employees
      const { data: emps } = await supabase
        .from("employees")
        .select("id, full_name, position, job_title, shift_start, shift_end, branch_id, department")
        .eq("user_id", linkedUserId)
        .eq("is_active", true)
        .order("full_name");

      if (!emps?.length) {
        return respond({ success: true, employees: [], summary: { present: 0, absent: 0, left: 0, totalEmployees: 0 } });
      }

      const empIds = emps.map((e: any) => e.id);

      // Fetch branches for grouping
      const { data: branchRows } = await supabase
        .from("branches")
        .select("id, name")
        .eq("user_id", linkedUserId);
      const branchMap = new Map<string, string>((branchRows || []).map((b: any) => [b.id, b.name]));

      // Fetch attendance for date range
      let attQuery = supabase
        .from("attendance_days")
        .select("employee_id, attendance_date, branch_id, first_check_in, last_check_out, total_hours, status, overtime_hours, total_break_minutes, net_work_minutes")
        .in("employee_id", empIds);

      if (dateFrom) attQuery = attQuery.gte("attendance_date", dateFrom);
      if (dateTo) attQuery = attQuery.lte("attendance_date", dateTo);

      const { data: attendance } = await attQuery;

      // Build per-employee summary
      const attByEmp = new Map<string, any[]>();
      (attendance || []).forEach((a: any) => {
        if (!attByEmp.has(a.employee_id)) attByEmp.set(a.employee_id, []);
        attByEmp.get(a.employee_id)!.push(a);
      });

      // For "today" status
      const today = dateFrom === dateTo ? dateFrom : new Date().toISOString().split("T")[0];
      const todayAtt = new Map<string, any>();
      (attendance || []).filter((a: any) => a.attendance_date === today).forEach((a: any) => {
        todayAtt.set(a.employee_id, a);
      });

      // Fetch breaks for the date range
      let breaksQuery = supabase
        .from("attendance_breaks")
        .select("employee_id, break_out, break_in, reason, duration_minutes")
        .in("employee_id", empIds);
      if (dateFrom) breaksQuery = breaksQuery.gte("break_out", `${dateFrom}T00:00:00`);
      if (dateTo) breaksQuery = breaksQuery.lte("break_out", `${dateTo}T23:59:59`);
      const { data: breaks } = await breaksQuery;

      const breaksByEmp = new Map<string, any[]>();
      (breaks || []).forEach((b: any) => {
        if (!breaksByEmp.has(b.employee_id)) breaksByEmp.set(b.employee_id, []);
        breaksByEmp.get(b.employee_id)!.push(b);
      });

      let presentCount = 0, absentCount = 0, leftCount = 0;

      const employeeData = emps.map((emp: any) => {
        const records = attByEmp.get(emp.id) || [];
        const todayRecord = todayAtt.get(emp.id);
        const empBreaks = breaksByEmp.get(emp.id) || [];

        const totalDays = records.length;
        const totalHours = records.reduce((s: number, r: any) => s + (r.total_hours || 0), 0);
        const totalOvertime = records.reduce((s: number, r: any) => s + (r.overtime_hours || 0), 0);
        const totalBreakMinutes = empBreaks.reduce((s: number, b: any) => s + (b.duration_minutes || 0), 0);

        // Check if employee is currently on break
        const openBreak = empBreaks.find((b: any) => !b.break_in);
        const isOnBreak = !!openBreak;

        const hasCheckedIn = !!todayRecord?.first_check_in;
        const hasCheckedOut = !!todayRecord?.last_check_out;
        const isPresent = hasCheckedIn && !hasCheckedOut && !isOnBreak;
        const status = !hasCheckedIn ? "absent" : isOnBreak ? "on_break" : isPresent ? "present" : hasCheckedOut ? "left" : "present";

        if (status === "present" || status === "on_break") presentCount++;
        else if (status === "left") leftCount++;
        else absentCount++;

        // Branch where the employee actually punched (from attendance_days.branch_id)
        const punchBranchId = todayRecord?.branch_id || null;
        const punchBranchName = punchBranchId ? (branchMap.get(punchBranchId) || null) : null;

        return {
          id: emp.id,
          full_name: emp.full_name,
          position: emp.job_title || emp.position || "",
          branch_id: emp.branch_id || null,
          branch_name: emp.branch_id ? (branchMap.get(emp.branch_id) || null) : null,
          punch_branch_id: punchBranchId,
          punch_branch_name: punchBranchName,
          department: emp.department || null,
          shift_start: emp.shift_start,
          shift_end: emp.shift_end,
          status,
          check_in_time: todayRecord?.first_check_in || null,
          check_out_time: todayRecord?.last_check_out || null,
          today_hours: todayRecord?.total_hours || null,
          total_days: totalDays,
          total_hours: Math.round(totalHours * 10) / 10,
          total_overtime: Math.round(totalOvertime * 10) / 10,
          total_break_minutes: totalBreakMinutes,
          net_work_minutes: todayRecord?.net_work_minutes || null,
          break_count: empBreaks.length,
          is_on_break: isOnBreak,
          current_break_reason: openBreak?.reason || null,
          breaks: empBreaks.map((b: any) => ({
            break_out: b.break_out,
            break_in: b.break_in,
            reason: b.reason,
            duration_minutes: b.duration_minutes,
          })),
          records: records.map((r: any) => ({
            date: r.attendance_date,
            branch_id: r.branch_id || null,
            branch_name: r.branch_id ? (branchMap.get(r.branch_id) || null) : null,
            check_in: r.first_check_in,
            check_out: r.last_check_out,
            hours: r.total_hours,
            overtime: r.overtime_hours,
            status: r.status,
            total_break_minutes: r.total_break_minutes || 0,
            net_work_minutes: r.net_work_minutes || null,
          })),
        };
      });

      return respond({
        success: true,
        employees: employeeData,
        summary: {
          present: presentCount,
          absent: absentCount,
          left: leftCount,
          totalEmployees: emps.length,
          totalAttendanceDays: (attendance || []).length,
        },
      });
    }

    // ══════════════════════════════════════════════════════
    // ACTION: receivables_list — Outstanding receivables for WhatsApp SOA feature
    // ══════════════════════════════════════════════════════
    if (action === "receivables_list") {
      // Get ALL customer contacts (don't rely on current_balance which may be stale)
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, contact_name, phone, contact_type")
        .eq("user_id", linkedUserId)
        .eq("is_active", true)
        .eq("contact_type", "عميل");

      // Get ALL transactions for receivables calculation (debit/credit on 1130)
      const { data: txns } = await supabase
        .from("transactions")
        .select("contact_id, debit_account_code, credit_account_code, amount")
        .eq("user_id", linkedUserId)
        .eq("is_deleted", false);

      // Calculate real balance per contact from ledger
      const balanceMap: Record<string, number> = {};
      (txns || []).forEach((t: any) => {
        if (!t.contact_id) return;
        if (!balanceMap[t.contact_id]) balanceMap[t.contact_id] = 0;
        if (String(t.debit_account_code || "").startsWith("1130")) balanceMap[t.contact_id] += (t.amount || 0);
        if (String(t.credit_account_code || "").startsWith("1130")) balanceMap[t.contact_id] -= (t.amount || 0);
      });

      // Get last sent dates from statement_send_log
      const { data: sendLogs } = await supabase
        .from("statement_send_log")
        .select("contact_id, sent_at")
        .eq("user_id", linkedUserId)
        .order("sent_at", { ascending: false });

      const lastSentMap: Record<string, string> = {};
      (sendLogs || []).forEach((log: any) => {
        if (!lastSentMap[log.contact_id]) lastSentMap[log.contact_id] = log.sent_at;
      });

      // Get max overdue days from invoices
      const { data: invoices } = await supabase
        .from("invoices")
        .select("contact_id, invoice_date, due_date, status")
        .eq("user_id", linkedUserId)
        .eq("is_voided", false)
        .in("status", ["issued", "posted", "partial"]);

      const maxDaysMap: Record<string, number> = {};
      const now = new Date();
      (invoices || []).forEach((inv: any) => {
        const dueDate = inv.due_date || inv.invoice_date;
        const days = Math.max(0, Math.floor((now.getTime() - new Date(dueDate).getTime()) / 86400000));
        if (!maxDaysMap[inv.contact_id] || days > maxDaysMap[inv.contact_id]) {
          maxDaysMap[inv.contact_id] = days;
        }
      });

      const receivables = (contacts || [])
        .filter((c: any) => (balanceMap[c.id] || 0) > 0)
        .map((c: any) => ({
          id: c.id,
          name: c.contact_name,
          phone: c.phone || "",
          balance: balanceMap[c.id] || 0,
          maxDays: maxDaysMap[c.id] || 0,
          lastSent: lastSentMap[c.id] || null,
        }))
        .sort((a: any, b: any) => b.balance - a.balance);

      return respond({ success: true, receivables });
    }

    // ACTION: payables_list — Outstanding payables (suppliers)
    if (action === "payables_list") {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, contact_name, phone, contact_type")
        .eq("user_id", linkedUserId)
        .eq("is_active", true)
        .in("contact_type", ["مورد", "supplier", "vendor"]);

      const { data: txns } = await supabase
        .from("transactions")
        .select("contact_id, debit_account_code, credit_account_code, amount")
        .eq("user_id", linkedUserId)
        .eq("is_deleted", false);

      // Supplier balance from ledger: credit on 2110 = we owe more, debit on 2110 = we paid
      const balanceMap: Record<string, number> = {};
      (txns || []).forEach((t: any) => {
        if (!t.contact_id) return;
        if (!balanceMap[t.contact_id]) balanceMap[t.contact_id] = 0;
        if (String(t.credit_account_code || "").startsWith("2110")) balanceMap[t.contact_id] += (t.amount || 0);
        if (String(t.debit_account_code || "").startsWith("2110")) balanceMap[t.contact_id] -= (t.amount || 0);
      });

      const { data: sendLogs } = await supabase
        .from("statement_send_log")
        .select("contact_id, sent_at")
        .eq("user_id", linkedUserId)
        .order("sent_at", { ascending: false });

      const lastSentMap: Record<string, string> = {};
      (sendLogs || []).forEach((log: any) => {
        if (!lastSentMap[log.contact_id]) lastSentMap[log.contact_id] = log.sent_at;
      });

      const { data: invoices } = await supabase
        .from("invoices")
        .select("contact_id, invoice_date, due_date, status")
        .eq("user_id", linkedUserId)
        .eq("invoice_type", "purchase")
        .eq("is_voided", false)
        .in("status", ["issued", "posted", "partial"]);

      const maxDaysMap: Record<string, number> = {};
      const now = new Date();
      (invoices || []).forEach((inv: any) => {
        const dueDate = inv.due_date || inv.invoice_date;
        const days = Math.max(0, Math.floor((now.getTime() - new Date(dueDate).getTime()) / 86400000));
        if (!maxDaysMap[inv.contact_id] || days > maxDaysMap[inv.contact_id]) {
          maxDaysMap[inv.contact_id] = days;
        }
      });

      const payables = (contacts || [])
        .filter((c: any) => (balanceMap[c.id] || 0) > 0)
        .map((c: any) => ({
          id: c.id,
          name: c.contact_name,
          phone: c.phone || "",
          balance: balanceMap[c.id] || 0,
          maxDays: maxDaysMap[c.id] || 0,
          lastSent: lastSentMap[c.id] || null,
        }))
        .sort((a: any, b: any) => b.balance - a.balance);

      return respond({ success: true, payables });
    }

    // ════════════════════════════════════════════════════════════
    // ACTION: sales_rep_orders — list rep orders for the admin portal
    //   - Filters: repId, dateFrom, dateTo, paymentMethod (cash|credit), status
    //   - Returns: orders[], reps[] (for the filter dropdown)
    // ACTION: sales_rep_order_detail — single order with line items
    //   - Body: { invoiceId }
    // ════════════════════════════════════════════════════════════
    if (action === "sales_rep_orders") {
      const repId: string | null = body.repId || null;
      const dateFrom: string | null = body.dateFrom || null;
      const dateTo: string | null = body.dateTo || null;
      const paymentMethod: string | null = body.paymentMethod || null; // 'cash' | 'credit'
      const status: string | null = body.status || null;

      // 1) Reps for this owner (used for filter + name lookup)
      const { data: reps } = await supabase
        .from("sales_representatives")
        .select("id, full_name, default_warehouse_id, cash_box_id")
        .eq("user_id", linkedUserId)
        .order("full_name");

      const repList = (reps || []) as any[];
      const repIdToRep = new Map<string, any>();
      const warehouseToRep = new Map<string, any>();
      for (const r of repList) {
        repIdToRep.set(r.id, r);
        if (r.default_warehouse_id) warehouseToRep.set(r.default_warehouse_id, r);
      }

      const repIds = repList.map((r) => r.id);
      if (repIds.length === 0) {
        return respond({ success: true, reps: [], orders: [], totals: { count: 0, total: 0, cash: 0, credit: 0 } });
      }

      // Phase 7.3: المصدر الموحد = invoices.salesperson_id (لا is_deleted على invoices)
      // Backfill أعاد ربط الفواتير القديمة REP-% بالمندوب الصحيح.
      let q = supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, total_amount, payment_method, status, is_voided, contact_id, contact_name, warehouse_id, salesperson_id, created_at")
        .eq("user_id", linkedUserId)
        .eq("invoice_type", "sale")
        .in("salesperson_id", repId ? [repId] : repIds)
        .order("created_at", { ascending: false })
        .limit(2000);

      if (dateFrom) q = q.gte("invoice_date", dateFrom);
      if (dateTo) q = q.lte("invoice_date", dateTo);
      if (paymentMethod) q = q.eq("payment_method", paymentMethod);
      if (status) q = q.eq("status", status);
      else q = q.eq("is_voided", false).not("status", "in", "(cancelled,void,reversed)");

      const { data: invs, error: invErr } = await q;
      if (invErr) throw invErr;

      const invoices = (invs || []) as any[];

      // Lookup warehouse names + cash box names
      const whIds = Array.from(new Set(invoices.map((i) => i.warehouse_id).filter(Boolean)));
      const cbIds = Array.from(new Set(repList.map((r) => r.cash_box_id).filter(Boolean)));
      const [whRes, cbRes] = await Promise.all([
        whIds.length ? supabase.from("warehouses").select("id, name").in("id", whIds) : Promise.resolve({ data: [] as any[] }),
        cbIds.length ? supabase.from("cash_boxes").select("id, name").in("id", cbIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const whMap = new Map<string, string>(((whRes.data as any[]) || []).map((w: any) => [w.id, w.name]));
      const cbMap = new Map<string, string>(((cbRes.data as any[]) || []).map((c: any) => [c.id, c.name]));

      const orders = invoices.map((inv: any) => {
        const rep = (inv.salesperson_id && repIdToRep.get(inv.salesperson_id)) || warehouseToRep.get(inv.warehouse_id);
        return {
          id: inv.id,
          invoice_number: inv.invoice_number,
          invoice_date: inv.invoice_date,
          created_at: inv.created_at,
          total_amount: Number(inv.total_amount || 0),
          payment_method: inv.payment_method,
          status: inv.status,
          contact_name: inv.contact_name || (inv.payment_method === "cash" ? "زبون نقدي" : "—"),
          rep_id: rep?.id || null,
          rep_name: rep?.full_name || "—",
          warehouse_id: inv.warehouse_id,
          warehouse_name: whMap.get(inv.warehouse_id) || "—",
          cash_box_id: rep?.cash_box_id || null,
          cash_box_name: rep?.cash_box_id ? (cbMap.get(rep.cash_box_id) || "—") : "—",
        };
      });

      const totals = {
        count: orders.length,
        total: orders.reduce((s, o) => s + o.total_amount, 0),
        cash: orders.filter((o) => o.payment_method === "cash").reduce((s, o) => s + o.total_amount, 0),
        credit: orders.filter((o) => o.payment_method === "credit").reduce((s, o) => s + o.total_amount, 0),
      };

      return respond({
        success: true,
        reps: repList.map((r) => ({ id: r.id, name: r.full_name })),
        orders,
        totals,
      });
    }

    if (action === "sales_rep_order_detail") {
      const invoiceId: string | null = body.invoiceId || null;
      if (!invoiceId) return respond({ error: "invoiceId required" }, 400);

      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, total_amount, payment_method, status, is_voided, contact_name, warehouse_id, created_at")
        .eq("id", invoiceId)
        .eq("user_id", linkedUserId)
        .single();
      if (invErr || !inv) return respond({ error: "Order not found" }, 404);

      const { data: items } = await supabase
        .from("invoice_items")
        .select("id, product_id, product_name, description, quantity, unit_price, total_amount")
        .eq("invoice_id", invoiceId);

      // Stock movements for this invoice (warehouse impact)
      const { data: movements } = await supabase
        .from("stock_movements")
        .select("product_id, quantity, movement_type, warehouse_id")
        .eq("reference_id", invoiceId)
        .limit(500);

      // Cash impact: only when payment_method = cash → credited to rep cash box account.
      // Pull related accounting transactions by description / reference if available.
      const { data: cashTx } = await supabase
        .from("transactions")
        .select("id, amount, debit_account_code, credit_account_code, description, transaction_date")
        .eq("user_id", linkedUserId)
        .eq("is_deleted", false)
        .ilike("description", `%${inv.invoice_number}%`)
        .limit(50);

      // Warehouse name
      let warehouseName = "—";
      if (inv.warehouse_id) {
        const { data: wh } = await supabase.from("warehouses").select("name").eq("id", inv.warehouse_id).single();
        warehouseName = wh?.name || "—";
      }

      return respond({
        success: true,
        order: {
          id: inv.id,
          invoice_number: inv.invoice_number,
          invoice_date: inv.invoice_date,
          created_at: inv.created_at,
          total_amount: Number(inv.total_amount || 0),
          payment_method: inv.payment_method,
          status: inv.status,
          contact_name: inv.contact_name || (inv.payment_method === "cash" ? "زبون نقدي" : "—"),
          warehouse_id: inv.warehouse_id,
          warehouse_name: warehouseName,
        },
        items: (items || []).map((it: any) => ({
          id: it.id,
          product_name: it.product_name || it.description || "—",
          quantity: Number(it.quantity || 0),
          unit_price: Number(it.unit_price || 0),
          total_amount: Number(it.total_amount || 0),
        })),
        stockImpact: (movements || []).map((m: any) => ({
          product_id: m.product_id,
          quantity: Number(m.quantity || 0),
          type: m.movement_type,
          warehouse_id: m.warehouse_id,
        })),
        cashImpact: inv.payment_method === "cash"
          ? (cashTx || []).map((t: any) => ({
              id: t.id,
              amount: Number(t.amount || 0),
              debit: t.debit_account_code,
              credit: t.credit_account_code,
              description: t.description,
              date: t.transaction_date,
            }))
          : [],
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // BRANCH HOURS REPORT
    //  • attendance_days  → source of truth for totals + overtime + status.
    //    Approved corrections already recalculate attendance_days (see
    //    attendance edge fn), so this reflects every HR edit.
    //  • attendance_events → used only to compute the 09-17 vs 17-close
    //    split, then scaled proportionally to net_work_minutes so the
    //    per-branch totals ALWAYS match the official day totals.
    //  • correction_requests (approved) → counted per employee/day and
    //    surfaced as an "adjustments" indicator.
    //  • pos_orders → pos_sessions → pos_terminals → branch for sales.
    // ─────────────────────────────────────────────────────────────────
    if (action === "branch_hours_report") {
      if (!linkedUserId) return respond({ success: false, needsSetup: true }, 200);
      const dateFrom: string = body.date_from;
      const dateTo: string = body.date_to;
      const branchFilter: string | null = body.branch_id || null;
      if (!dateFrom || !dateTo) return respond({ error: "date_from & date_to required" }, 400);

      // Keep this report fast by doing the heavy joins/aggregation inside the
      // database in one indexed query, instead of pulling thousands of POS and
      // attendance rows into the edge function and risking the 150s idle limit.
      const { data: fastReport, error: fastReportError } = await supabase.rpc(
        "get_branch_hours_sales_report",
        {
          p_owner_id: linkedUserId,
          p_date_from: dateFrom,
          p_date_to: dateTo,
          p_branch_id: branchFilter,
        },
      );
      if (fastReportError) throw fastReportError;
      return respond(fastReport || { success: true, rows: [], details: [], branches: [] });

      // Local-wall-clock helper (Asia/Hebron incl. DST) — returns a
      // UTC-encoded millisecond stamp that represents local wall-clock.
      const HEBRON_FMT = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Hebron",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      });
      const toLocalWall = (d: Date): { ms: number; date: string; hhmm: string } => {
        const p = HEBRON_FMT.formatToParts(d).reduce<Record<string, string>>((a, x) => {
          if (x.type !== "literal") a[x.type] = x.value; return a;
        }, {});
        const h = p.hour === "24" ? "00" : p.hour;
        const ms = Date.UTC(+p.year, +p.month - 1, +p.day, +h, +p.minute, +p.second);
        return { ms, date: `${p.year}-${p.month}-${p.day}`, hhmm: `${h}:${p.minute}` };
      };
      const overlapH = (a1: number, a2: number, b1: number, b2: number) =>
        Math.max(0, Math.min(a2, b2) - Math.max(a1, b1)) / 3600000;

      // ── 1) All active employees for this tenant (name/dept/branch/shift) ──
      const { data: allEmps, error: empErr } = await supabase
        .from("employees")
        .select("id, full_name, department, position, branch_id, shift_id, shift_start, shift_end, user_id, is_active")
        .eq("user_id", linkedUserId);
      if (empErr) throw empErr;

      const empMap = new Map<string, any>();
      const shiftIds = new Set<string>();
      for (const e of allEmps || []) {
        empMap.set(e.id, e);
        if (e.shift_id) shiftIds.add(e.shift_id);
      }
      const empIds = Array.from(empMap.keys());

      // ── 2..5) Fire every independent tenant-scoped query in parallel.
      //         Previously these ran sequentially (30+ round-trips), which
      //         dominated the report latency even though each query was fast.
      const padFrom = new Date(dateFrom + "T00:00:00Z"); padFrom.setUTCDate(padFrom.getUTCDate() - 1);
      const padTo = new Date(dateTo + "T00:00:00Z"); padTo.setUTCDate(padTo.getUTCDate() + 2);

      const shiftsP = shiftIds.size
        ? supabase.from("work_shifts").select("id, name, start_time, end_time").in("id", Array.from(shiftIds))
        : Promise.resolve({ data: [] as any[] });

      const branchesP = supabase.from("branches").select("id, name").eq("user_id", linkedUserId);

      const daysP = supabase
        .from("attendance_days")
        .select("id, employee_id, branch_id, attendance_date, first_check_in, last_check_out, total_hours, overtime_hours, status, is_manually_adjusted, total_break_minutes, net_work_minutes")
        .gte("attendance_date", dateFrom)
        .lte("attendance_date", dateTo);

      // Parallel chunked fetches for attendance_events + corrections.
      const eventChunks: Promise<any>[] = [];
      for (let i = 0; i < empIds.length; i += 200) {
        const slice = empIds.slice(i, i + 200);
        // Chunks are typically small enough to fit in one page; if not, we
        // still page but only within the chunk (rare in practice).
        eventChunks.push((async () => {
          const rows: any[] = [];
          for (let from = 0; ; from += 1000) {
            const { data, error } = await supabase
              .from("attendance_events")
              .select("employee_id, event_type, event_time")
              .in("employee_id", slice)
              .eq("status", "valid")
              .gte("event_time", padFrom.toISOString())
              .lt("event_time", padTo.toISOString())
              .order("event_time", { ascending: true })
              .range(from, from + 999);
            if (error) throw error;
            rows.push(...(data || []));
            if (!data || data.length < 1000) break;
          }
          return rows;
        })());
      }

      const corrChunks: Promise<any>[] = [];
      for (let i = 0; i < empIds.length; i += 200) {
        const slice = empIds.slice(i, i + 200);
        corrChunks.push(
          supabase
            .from("correction_requests")
            .select("employee_id, attendance_date, request_type, status")
            .in("employee_id", slice)
            .eq("status", "approved")
            .gte("attendance_date", dateFrom)
            .lte("attendance_date", dateTo)
            .then((r: any) => r.data || [])
        );
      }

      const terminalsP = supabase.from("pos_terminals").select("id, branch_id").eq("user_id", linkedUserId);
      const ordersP = loadPaidPosOrdersByBusinessDate(
        supabase, linkedUserId, dateFrom, dateTo,
        "id, total, session_id, business_date, transaction_id, created_at",
      );

      const [
        shiftsRes, branchesRes, daysRes, eventArrs, corrArrs, terminalsRes, orders,
      ] = await Promise.all([
        shiftsP, branchesP, daysP, Promise.all(eventChunks), Promise.all(corrChunks), terminalsP, ordersP,
      ]);

      const shiftMap = new Map<string, { name: string; start_time: string; end_time: string }>();
      (shiftsRes.data || []).forEach((s: any) => shiftMap.set(s.id, s));

      const branches = branchesRes.data || [];
      const branchName = new Map<string, string>();
      branches.forEach((b: any) => branchName.set(b.id, b.name));

      if ((daysRes as any).error) throw (daysRes as any).error;
      const days = (daysRes as any).data || [];
      const tenantDays = days.filter((d: any) => empMap.has(d.employee_id));

      const tenantEvents = eventArrs.flat();
      const corrections = corrArrs.flat();

      // Pair events per employee → list of {inMs, outMs} in LOCAL wall clock
      type Pair = { inMs: number; outMs: number; inDate: string };
      const pairsByEmp = new Map<string, Pair[]>();
      const byEmp = new Map<string, any[]>();
      for (const ev of tenantEvents) {
        (byEmp.get(ev.employee_id) || byEmp.set(ev.employee_id, []).get(ev.employee_id))!.push(ev);
      }
      for (const [emp, list] of byEmp) {
        const out: Pair[] = [];
        let openIn: any = null;
        for (const ev of list) {
          if (ev.event_type === "check_in") openIn = ev;
          else if (ev.event_type === "check_out" && openIn) {
            const inT = new Date(openIn.event_time);
            const outT = new Date(ev.event_time);
            if (outT > inT) {
              const cap = new Date(Math.min(outT.getTime(), inT.getTime() + 16 * 3600 * 1000));
              const inL = toLocalWall(inT);
              const outL = toLocalWall(cap);
              out.push({ inMs: inL.ms, outMs: outL.ms, inDate: inL.date });
            }
            openIn = null;
          }
        }
        pairsByEmp.set(emp, out);
      }

      // Compute split hours per employee/day from pairs (raw, unscaled)
      type Split = { day: number; eve: number; span: number };
      const splitByEmpDay = new Map<string, Split>(); // key emp|date
      for (const [emp, pairs] of pairsByEmp) {
        for (const p of pairs) {
          // For each local date the pair overlaps
          const startDay = new Date(p.inMs); startDay.setUTCHours(0, 0, 0, 0);
          const endDay = new Date(p.outMs); endDay.setUTCHours(0, 0, 0, 0);
          for (let c = startDay.getTime(); c <= endDay.getTime(); c += 24 * 3600 * 1000) {
            const dayStart = c;
            const dayEnd = c + 24 * 3600 * 1000;
            const segS = Math.max(p.inMs, dayStart);
            const segE = Math.min(p.outMs, dayEnd);
            if (segE <= segS) continue;
            const d9 = dayStart + 9 * 3600 * 1000;
            const d17 = dayStart + 17 * 3600 * 1000;
            const dClose = dayStart + 30 * 3600 * 1000; // → 06:00 next day
            const dateKey = new Date(c).toISOString().slice(0, 10);
            // Attribute each pair only to its check-in date to keep the
            // "one employee = one day" contract with attendance_days.
            if (dateKey !== p.inDate) continue;
            const k = `${emp}|${dateKey}`;
            const s = splitByEmpDay.get(k) || { day: 0, eve: 0, span: 0 };
            s.day += overlapH(segS, segE, d9, d17);
            s.eve += overlapH(segS, segE, d17, dClose);
            s.span += (segE - segS) / 3600000;
            splitByEmpDay.set(k, s);
          }
        }
      }

      // ── 4) Approved corrections per employee/day (adjustment indicator) ──
      const corrMap = new Map<string, number>(); // emp|date → count
      (corrections || []).forEach((c: any) => {
        if (!empMap.has(c.employee_id)) return;
        const k = `${c.employee_id}|${c.attendance_date}`;
        corrMap.set(k, (corrMap.get(k) || 0) + 1);
      });

      // ── 5) Sales per branch per business_date ──
      const termBranch = new Map<string, string | null>();
      (terminalsRes.data || []).forEach((t: any) => termBranch.set(t.id, t.branch_id));
      const sessionIds = Array.from(new Set(orders.map(o => o.session_id).filter(Boolean)));
      const sessTerminal = new Map<string, string | null>();
      const sessChunks: Promise<any>[] = [];
      for (let i = 0; i < sessionIds.length; i += 500) {
        const slice = sessionIds.slice(i, i + 500);
        sessChunks.push(
          supabase.from("pos_sessions").select("id, terminal_id").in("id", slice)
            .then((r: any) => r.data || [])
        );
      }
      (await Promise.all(sessChunks)).flat().forEach((s: any) => sessTerminal.set(s.id, s.terminal_id));
      const salesMap = new Map<string, number>();
      const hourlySalesMap = new Map<string, number[]>(); // branch|date → 24 hours
      for (const o of orders) {
        const term = sessTerminal.get(o.session_id) || null;
        const br = term ? termBranch.get(term) || null : null;
        if (branchFilter && br !== branchFilter) continue;
        const dt = o.business_date || (o as any).created_at?.slice(0, 10);
        if (!dt) continue;
        const k = `${br || "__none__"}|${dt}`;
        salesMap.set(k, (salesMap.get(k) || 0) + Number(o.total || 0));
        // Hourly distribution — use local Hebron hour of created_at
        if ((o as any).created_at) {
          const local = toLocalWall(new Date((o as any).created_at));
          const hr = Math.max(0, Math.min(23, parseInt(local.hhmm.slice(0, 2), 10) || 0));
          let arr = hourlySalesMap.get(k);
          if (!arr) { arr = new Array(24).fill(0); hourlySalesMap.set(k, arr); }
          arr[hr] += Number(o.total || 0);
        }
      }

      // ── 6) Build per-employee-per-day details, then aggregate per branch/day ──
      const details: any[] = [];
      type Agg = { emps: Set<string>; day: number; eve: number; total: number; overtime: number; adjustments: number };
      const agg = new Map<string, Agg>();
      // Department breakdown: branch|date → dept → aggregate
      type DeptAgg = { day: number; eve: number; total: number; overtime: number; emps: Set<string> };
      const deptAgg = new Map<string, Map<string, DeptAgg>>();
      const bucket = (br: string | null, date: string) => {
        const k = `${br || "__none__"}|${date}`;
        if (!agg.has(k)) agg.set(k, { emps: new Set(), day: 0, eve: 0, total: 0, overtime: 0, adjustments: 0 });
        return agg.get(k)!;
      };
      const deptBucket = (br: string | null, date: string, dept: string) => {
        const k = `${br || "__none__"}|${date}`;
        let m = deptAgg.get(k);
        if (!m) { m = new Map(); deptAgg.set(k, m); }
        let d = m.get(dept);
        if (!d) { d = { day: 0, eve: 0, total: 0, overtime: 0, emps: new Set() }; m.set(dept, d); }
        return d;
      };

      for (const d of tenantDays) {
        const emp = empMap.get(d.employee_id);
        const br = d.branch_id || emp?.branch_id || null;
        if (branchFilter && br !== branchFilter) continue;

        // Net hours from attendance_days is the AUTHORITATIVE total.
        const netHours = d.net_work_minutes != null
          ? Number(d.net_work_minutes) / 60
          : Number(d.total_hours || 0);

        // Scale raw event-split to match net hours (so totals stay honest).
        const raw = splitByEmpDay.get(`${d.employee_id}|${d.attendance_date}`);
        let dayH = 0, eveH = 0;
        if (raw && (raw.day + raw.eve) > 0.01 && netHours > 0) {
          const scale = netHours / (raw.day + raw.eve);
          dayH = raw.day * scale;
          eveH = raw.eve * scale;
        } else if (netHours > 0 && d.first_check_in && d.last_check_out) {
          // Fallback: use first_check_in/last_check_out span (e.g. manually adjusted rows without paired events)
          const inL = toLocalWall(new Date(d.first_check_in));
          const outL = toLocalWall(new Date(d.last_check_out));
          const dayStart = Math.floor(inL.ms / 86400000) * 86400000;
          const d9 = dayStart + 9 * 3600 * 1000;
          const d17 = dayStart + 17 * 3600 * 1000;
          const dClose = dayStart + 30 * 3600 * 1000;
          const rawDay = overlapH(inL.ms, outL.ms, d9, d17);
          const rawEve = overlapH(inL.ms, outL.ms, d17, dClose);
          const sum = rawDay + rawEve;
          if (sum > 0.01) {
            dayH = (rawDay / sum) * netHours;
            eveH = (rawEve / sum) * netHours;
          } else {
            dayH = netHours; eveH = 0;
          }
        }

        const ot = Number(d.overtime_hours || 0);
        const adj = corrMap.get(`${d.employee_id}|${d.attendance_date}`) || 0;
        const b = bucket(br, d.attendance_date);
        b.emps.add(d.employee_id);
        b.day += dayH;
        b.eve += eveH;
        b.total += netHours;
        b.overtime += ot;
        b.adjustments += adj;

        const deptName = emp?.department || "بدون قسم";
        const dq = deptBucket(br, d.attendance_date, deptName);
        dq.day += dayH;
        dq.eve += eveH;
        dq.total += netHours;
        dq.overtime += ot;
        dq.emps.add(d.employee_id);

        const shift = emp?.shift_id ? shiftMap.get(emp.shift_id) : null;
        const shiftLabel = shift
          ? `${shift.name} (${(shift.start_time || "").slice(0, 5)}–${(shift.end_time || "").slice(0, 5)})`
          : emp?.shift_start && emp?.shift_end
            ? `${String(emp.shift_start).slice(0, 5)}–${String(emp.shift_end).slice(0, 5)}`
            : "—";

        details.push({
          branch_id: br,
          branch_name: br ? (branchName.get(br) || "—") : "بدون فرع",
          date: d.attendance_date,
          employee_id: d.employee_id,
          employee_name: emp?.full_name || "—",
          department: emp?.department || "—",
          position: emp?.position || "—",
          shift: shiftLabel,
          first_check_in: d.first_check_in,
          last_check_out: d.last_check_out,
          break_minutes: Number(d.total_break_minutes || 0),
          day_hours: Number(dayH.toFixed(2)),
          evening_hours: Number(eveH.toFixed(2)),
          total_hours: Number(netHours.toFixed(2)),
          overtime_hours: Number(ot.toFixed(2)),
          status: d.status,
          is_manually_adjusted: !!d.is_manually_adjusted,
          adjustments_count: adj,
        });
      }

      // ── 7) Build branch/day rows including sales-only days (no attendance) ──
      const rows: any[] = [];
      const allKeys = new Set<string>([...agg.keys(), ...salesMap.keys()]);
      for (const k of allKeys) {
        const [br, date] = k.split("|");
        if (date < dateFrom || date > dateTo) continue;
        const a = agg.get(k);
        const sales = salesMap.get(k) || 0;
        const totalH = a?.total || 0;
        const deptMap = deptAgg.get(k);
        const departments = deptMap
          ? Array.from(deptMap.entries()).map(([name, v]) => ({
              department: name,
              employees_count: v.emps.size,
              day_hours: Number(v.day.toFixed(2)),
              evening_hours: Number(v.eve.toFixed(2)),
              total_hours: Number(v.total.toFixed(2)),
              overtime_hours: Number(v.overtime.toFixed(2)),
            })).sort((x, y) => y.total_hours - x.total_hours)
          : [];
        const hourly = hourlySalesMap.get(k) || new Array(24).fill(0);
        rows.push({
          branch_id: br === "__none__" ? null : br,
          branch_name: br === "__none__" ? "بدون فرع" : (branchName.get(br) || "—"),
          date,
          employees_count: a ? a.emps.size : 0,
          day_hours: Number((a?.day || 0).toFixed(2)),
          evening_hours: Number((a?.eve || 0).toFixed(2)),
          total_hours: Number(totalH.toFixed(2)),
          overtime_hours: Number((a?.overtime || 0).toFixed(2)),
          adjustments_count: a?.adjustments || 0,
          sales_total: Number(sales.toFixed(2)),
          sales_per_hour: totalH > 0 ? Number((sales / totalH).toFixed(2)) : 0,
          departments,
          hourly_sales: hourly.map((n: number) => Number(n.toFixed(2))),
        });
      }
      rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.branch_name.localeCompare(b.branch_name)));
      details.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.branch_name.localeCompare(b.branch_name) || a.employee_name.localeCompare(b.employee_name)));

      return respond({
        success: true,
        rows,
        details,
        branches: (branches || []).map((b: any) => ({ id: b.id, name: b.name })),
        meta: {
          source_of_truth: "attendance_days (نفس الحضور الرسمي)",
          split_method: "attendance_events مقاسة على صافي ساعات اليوم",
          overtime_source: "attendance_days.overtime_hours (المعتمد)",
          corrections_source: "correction_requests approved",
        },
      });
    }

    return respond({ error: "Unknown action" }, 400);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return respond({ success: false, error: message }, 500);
  }
});
