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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const { action } = body;

    // ── Authenticate the portal user from JWT ──
    const authHeader = req.headers.get("Authorization");
    let authUserId: string | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      const { data: { user: authUser } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      authUserId = authUser?.id || null;
    }

    // ── Resolve the data owner (linked_user_id) from the portal user's record ──
    let linkedUserId: string | null = null;
    let portalSettings: any = null;

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
        .select("user_id")
        .eq("auth_user_id", authUserId)
        .eq("is_active", true)
        .single();

      if (portalUser?.user_id) {
        // Portal user — data owner is the admin who created them
        linkedUserId = portalUser.user_id;
      } else if (adminProfile && !adminProfile.invited_by) {
        // This is an admin/owner viewing their own portal settings
        linkedUserId = authUserId;
      } else if (adminProfile?.invited_by) {
        // Team member — data owner is their inviter
        linkedUserId = adminProfile.invited_by;
      }
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
      const { error } = await supabase
        .from("malaki_portal_settings")
        .update({ ...body.updates, updated_at: new Date().toISOString() })
        .eq("id", portalSettings.id);
      if (error) throw error;
      return respond({ success: true });
    }

    if (!linkedUserId && ["dashboard", "sales", "liquidity", "employee_requests", "supplier_balances", "pos_sales_detailed", "overview", "receivables_list", "payables_list"].includes(action)) {
      return respond({
        success: true,
        needsSetup: true,
        message: "يجب ربط البوابة بحساب QOYOD أولاً",
        sales: null,
        liquidity: null,
      });
    }

    // ══════════════════════════════════════════════════════
    // ACTION: overview — Full accounting KPIs for portal dashboard
    // ══════════════════════════════════════════════════════
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

      // Fetch transactions, contacts, cheques in parallel
      const [txRes, contactRes, chqRes, recentTxRes] = await Promise.all([
        supabase.from("transactions")
          .select("transaction_date, debit_account_code, credit_account_code, amount, is_opening_balance, transaction_type, contact_id")
          .eq("user_id", linkedUserId).eq("is_deleted", false).limit(5000),
        supabase.from("contacts")
          .select("id, contact_name, contact_type, current_balance")
          .eq("user_id", linkedUserId).eq("is_active", true),
        supabase.from("cheques")
          .select("id, cheque_date, amount, party_name, cheque_type, status")
          .eq("user_id", linkedUserId),
        supabase.from("transactions")
          .select("id, transaction_date, description, amount, debit_account_code, credit_account_code, created_at")
          .eq("user_id", linkedUserId).eq("is_deleted", false)
          .order("created_at", { ascending: false }).limit(10),
      ]);

      const allTx = txRes.data || [];
      const contacts = contactRes.data || [];
      const cheques = chqRes.data || [];
      const recentTx = recentTxRes.data || [];

      const plTx = allTx.filter(t => !t.is_opening_balance && t.transaction_type !== "رصيد ابتدائي");
      const periodTx = plTx.filter(t => t.transaction_date >= fromStr && t.transaction_date <= toStr);

      // KPIs
      const revenue = periodTx.filter(t => t.credit_account_code?.startsWith("4")).reduce((s, t) => s + (t.amount || 0), 0);
      const purchases = periodTx.filter(t => t.debit_account_code?.startsWith("51") || t.debit_account_code?.startsWith("52")).reduce((s, t) => s + (t.amount || 0), 0);
      const genExp = periodTx.filter(t => { const c = t.debit_account_code || ""; return (c.startsWith("5") && !c.startsWith("51") && !c.startsWith("52")) || c.startsWith("6"); }).reduce((s, t) => s + (t.amount || 0), 0);
      const expenses = purchases + genExp;
      const netProfit = revenue - expenses;

      // Balance sheet (cumulative)
      // Receivables: only positive (debit) customer balances. Negative net = customer credit, not a receivable.
      const recDr = allTx.filter(t => t.debit_account_code === "1130").reduce((s, t) => s + (t.amount || 0), 0);
      const recCr = allTx.filter(t => t.credit_account_code === "1130").reduce((s, t) => s + (t.amount || 0), 0);
      const receivables = Math.max(0, recDr - recCr);

      // Payables: amount actually owed to suppliers (account 2110 only; excludes VAT/payroll/other liabilities).
      // Liability nature = credit balance, so payables = credit - debit. Floor at 0 so prepayments don't flip the sign.
      const payCr = allTx.filter(t => t.credit_account_code === "2110").reduce((s, t) => s + (t.amount || 0), 0);
      const payDr = allTx.filter(t => t.debit_account_code === "2110").reduce((s, t) => s + (t.amount || 0), 0);
      const payables = Math.max(0, payCr - payDr);

      const cashDr = allTx.filter(t => t.debit_account_code?.startsWith("111") || t.debit_account_code?.startsWith("112")).reduce((s, t) => s + (t.amount || 0), 0);
      const cashCr = allTx.filter(t => t.credit_account_code?.startsWith("111") || t.credit_account_code?.startsWith("112")).reduce((s, t) => s + (t.amount || 0), 0);
      const cashBalance = cashDr - cashCr;

      // Cash flow
      const inflows = periodTx.filter(t => t.debit_account_code?.startsWith("111") || t.debit_account_code?.startsWith("112")).reduce((s, t) => s + (t.amount || 0), 0);
      const outflows = periodTx.filter(t => t.credit_account_code?.startsWith("111") || t.credit_account_code?.startsWith("112")).reduce((s, t) => s + (t.amount || 0), 0);

      // Daily chart data for current period
      const chartBuckets: Record<string, { revenue: number; expenses: number }> = {};
      periodTx.forEach(tx => {
        const key = tx.transaction_date;
        if (!chartBuckets[key]) chartBuckets[key] = { revenue: 0, expenses: 0 };
        if (tx.credit_account_code?.startsWith("4")) chartBuckets[key].revenue += tx.amount || 0;
        const dc = tx.debit_account_code || "";
        if (dc.startsWith("5") || dc.startsWith("6")) chartBuckets[key].expenses += tx.amount || 0;
      });
      const chartData = Object.entries(chartBuckets).sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({
        date: d, revenue: v.revenue, expenses: v.expenses, profit: v.revenue - v.expenses,
      }));

      // Upcoming cheques
      const upcomingCheques = cheques
        .filter(c => c.status !== "محصل" && c.status !== "ملغي")
        .map(c => ({ ...c, daysRemaining: Math.floor((new Date(c.cheque_date).getTime() - now.getTime()) / 86400000) }))
        .sort((a, b) => a.daysRemaining - b.daysRemaining)
        .slice(0, 6);

      // Recent activity
      const recentActivity = recentTx.map(tx => {
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

      // Top debtors/creditors — computed live from 1130/2110 ledger (NOT contacts.current_balance, which can be stale)
      const contactName = new Map(contacts.map(c => [c.id, { name: c.contact_name, type: c.contact_type }]));
      const debtorMap = new Map<string, number>();
      const creditorMap = new Map<string, number>();
      for (const t of allTx) {
        if (!t.contact_id) continue;
        const amt = t.amount || 0;
        if (t.debit_account_code === "1130") debtorMap.set(t.contact_id, (debtorMap.get(t.contact_id) || 0) + amt);
        if (t.credit_account_code === "1130") debtorMap.set(t.contact_id, (debtorMap.get(t.contact_id) || 0) - amt);
        if (t.credit_account_code === "2110") creditorMap.set(t.contact_id, (creditorMap.get(t.contact_id) || 0) + amt);
        if (t.debit_account_code === "2110") creditorMap.set(t.contact_id, (creditorMap.get(t.contact_id) || 0) - amt);
      }
      const topDebtors = Array.from(debtorMap.entries())
        .filter(([id, bal]) => bal > 0.01 && contactName.has(id))
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([id, bal]) => ({ name: contactName.get(id)!.name, balance: bal }));
      const topCreditors = Array.from(creditorMap.entries())
        .filter(([id, bal]) => bal > 0.01 && contactName.has(id))
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([id, bal]) => ({ name: contactName.get(id)!.name, balance: bal }));

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
        const { data: orders } = await supabase
          .from("pos_orders")
          .select("id, total, created_at, session_id, order_number")
          .eq("user_id", linkedUserId)
          .eq("state", "paid")
          .gte("created_at", shiftStart)
          .lte("created_at", shiftEnd)
          .order("created_at", { ascending: false })
          .limit(5000);

        const orderList: any[] = orders || [];
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
        if (sessionIds.length > 0) {
          for (let i = 0; i < sessionIds.length; i += 200) {
            const chunk = sessionIds.slice(i, i + 200);
            const { data: sessions } = await supabase
              .from("pos_sessions")
              .select("id, cash_box_id")
              .in("id", chunk);
            (sessions || []).forEach((s: any) => {
              sessionMap[s.id] = s.cash_box_id;
            });
          }
        }

        const cashBoxIds = [...new Set(Object.values(sessionMap).filter(Boolean))];
        const cashBoxMap: Record<string, any> = {};
        if (cashBoxIds.length > 0) {
          const { data: boxes } = await supabase
            .from("cash_boxes")
            .select("id, name, branch_location")
            .in("id", cashBoxIds);
          (boxes || []).forEach((b: any) => {
            cashBoxMap[b.id] = b;
          });
        }

        const branchData: Record<string, any> = {};

        // ── Process POS orders into branches ──
        for (const order of orderList) {
          const cashBoxId = sessionMap[order.session_id];
          const box = cashBoxId ? cashBoxMap[cashBoxId] : null;
          const branchKey = cashBoxId || "unknown";

          if (!branchData[branchKey]) {
            branchData[branchKey] = {
              id: branchKey,
              name: box?.name || "غير معروف",
              location: box?.branch_location || "",
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
            items: invoiceList.map((inv: any) => ({
              id: inv.id,
              number: inv.invoice_number,
              date: inv.invoice_date,
              total: inv.total_amount,
              customer: inv.contact_name,
              paymentMethod: inv.payment_method,
            })),
          },
        };
      }

      if (action === "dashboard" || action === "liquidity") {
        const { data: cashBoxes } = await supabase
          .from("cash_boxes")
          .select("id, name, type, branch_location, currency, opening_balance, is_active")
          .eq("user_id", linkedUserId)
          .eq("is_active", true);

        const boxesWithBalance = await Promise.all(
          (cashBoxes || []).map(async (box: any) => {
            const { data: balance } = await supabase.rpc("get_cash_box_balance", {
              p_box_id: box.id,
            });
            return {
              id: box.id,
              name: box.name,
              branchLocation: box.branch_location || "",
              currency: box.currency || "ILS",
              balance: balance || 0,
              isActive: box.is_active,
              type: box.type,
            };
          })
        );

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

      let query = supabase
        .from("pos_orders")
        .select("id, total, created_at, session_id, order_number")
        .eq("user_id", linkedUserId)
        .eq("state", "paid")
        .gte("created_at", startISO)
        .lte("created_at", endISO)
        .order("created_at", { ascending: false })
        .limit(5000);

      const { data: orders } = await query;
      const orderList: any[] = orders || [];

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
        .select("id, employee_id, form_type, status, created_at, form_data")
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

      const requests = (forms || []).map((f: any) => {
        const fd = f.form_data || {};
        return {
          id: f.id,
          employeeName: empMap[f.employee_id] || "غير معروف",
          formType: f.form_type,
          status: f.status,
          amount: fd.amount || fd.advance_amount || fd.loan_amount || null,
          createdAt: f.created_at,
          details: fd,
        };
      });

      return respond({ success: true, requests });
    }

    // ============ Supplier Balances ============
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
          } else if (tx.debit_account_code?.startsWith("5") || tx.credit_account_code === "2110") {
            totalPurchases += tx.amount || 0;
          }

          if (!isOpening && tx.debit_account_code === "2110") {
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
        .select("id, full_name, position, job_title, shift_start, shift_end")
        .eq("user_id", linkedUserId)
        .eq("is_active", true)
        .order("full_name");

      if (!emps?.length) {
        return respond({ success: true, employees: [], summary: { present: 0, absent: 0, left: 0, totalEmployees: 0 } });
      }

      const empIds = emps.map((e: any) => e.id);

      // Fetch attendance for date range
      let attQuery = supabase
        .from("attendance_days")
        .select("employee_id, attendance_date, first_check_in, last_check_out, total_hours, status, overtime_hours, total_break_minutes, net_work_minutes")
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

        return {
          id: emp.id,
          full_name: emp.full_name,
          position: emp.job_title || emp.position || "",
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
        if (t.debit_account_code === "1130") balanceMap[t.contact_id] += (t.amount || 0);
        if (t.credit_account_code === "1130") balanceMap[t.contact_id] -= (t.amount || 0);
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
        if (t.credit_account_code === "2110") balanceMap[t.contact_id] += (t.amount || 0);
        if (t.debit_account_code === "2110") balanceMap[t.contact_id] -= (t.amount || 0);
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

    return respond({ error: "Unknown action" }, 400);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return respond({ success: false, error: message }, 500);
  }
});
