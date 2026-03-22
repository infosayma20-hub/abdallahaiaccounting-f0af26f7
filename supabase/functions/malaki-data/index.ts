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

    // Get settings
    const { data: settings } = await supabase
      .from("malaki_portal_settings")
      .select("*")
      .limit(1)
      .single();

    if (action === "get_settings") {
      return respond({ success: true, settings });
    }

    if (action === "update_settings") {
      const { error } = await supabase
        .from("malaki_portal_settings")
        .update({ ...body.updates, updated_at: new Date().toISOString() })
        .eq("id", settings!.id);
      if (error) throw error;
      return respond({ success: true });
    }

    const linkedUserId = settings?.linked_user_id;

    if (!linkedUserId && ["dashboard", "sales", "liquidity", "employee_requests", "supplier_balances", "pos_sales_detailed"].includes(action)) {
      return respond({
        success: true,
        needsSetup: true,
        message: "يجب ربط البوابة بحساب QOYOD أولاً",
        sales: null,
        liquidity: null,
      });
    }

    if (action === "dashboard" || action === "sales" || action === "liquidity") {
      let salesResult = null;
      let liquidityResult = null;

      if (action === "dashboard" || action === "sales") {
        const shiftStart = body.shiftStart;
        const shiftEnd = body.shiftEnd;

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

        for (const branchKey of Object.keys(branchData)) {
          const branchOrderIds = new Set(branchData[branchKey].orders);
          const branchLines = allLines.filter((l) => branchOrderIds.has(l.order_id));

          const mealMap: Record<string, { quantity: number; revenue: number }> = {};
          for (const line of branchLines) {
            const name = line.product_name || "غير معروف";
            if (!mealMap[name]) mealMap[name] = { quantity: 0, revenue: 0 };
            mealMap[name].quantity += line.qty || 0;
            mealMap[name].revenue += line.total || 0;
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

        // Fetch exchange rates from the currencies + exchange_rates tables
        let jodRate = settings?.exchange_rate_jod || 3.55;
        let usdRate = settings?.exchange_rate_usd || 3.65;
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

              // Get the latest rate for each currency
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

    // ============ NEW: POS Sales Detailed (with items and branch filter) ============
    if (action === "pos_sales_detailed") {
      const dateFrom = body.dateFrom; // YYYY-MM-DD
      const dateTo = body.dateTo; // YYYY-MM-DD
      const branchFilter = body.branchId; // optional cash_box_id

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

      // Get session -> cash_box mapping
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

      // Filter by branch if specified
      let filteredOrders = orderList;
      if (branchFilter) {
        filteredOrders = orderList.filter(o => sessionMap[o.session_id] === branchFilter);
      }

      const orderIds = filteredOrders.map(o => o.id);

      // Get all lines
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

      // Aggregate items
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

      // Get branches list
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

      // Per-branch totals
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

    // ============ NEW: Employee Requests ============
    if (action === "employee_requests") {
      const { data: forms } = await supabase
        .from("employee_forms")
        .select("id, employee_id, form_type, status, created_at, form_data")
        .eq("user_id", linkedUserId)
        .order("created_at", { ascending: false })
        .limit(500);

      // Get employee names
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

      const requests = (forms || []).map((f: any) => ({
        id: f.id,
        employeeName: empMap[f.employee_id] || "غير معروف",
        formType: f.form_type,
        status: f.status,
        amount: f.amount,
        createdAt: f.created_at,
        details: f.details,
      }));

      return respond({ success: true, requests });
    }

    // ============ NEW: Supplier Balances ============
    if (action === "supplier_balances") {
      const dateFrom = body.dateFrom; // YYYY-MM-DD
      const dateTo = body.dateTo; // YYYY-MM-DD

      // Get suppliers (contacts with type supplier or both)
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, contact_name, contact_type, opening_balance")
        .eq("user_id", linkedUserId)
        .in("contact_type", ["supplier", "both"])
        .order("contact_name");

      const contactIds = (contacts || []).map((c: any) => c.id);

      // Get transactions for these contacts in date range
      let transactions: any[] = [];
      if (contactIds.length > 0) {
        for (let i = 0; i < contactIds.length; i += 200) {
          const chunk = contactIds.slice(i, i + 200);
          let q = supabase
            .from("transactions")
            .select("id, contact_id, amount, debit_account_code, credit_account_code, transaction_date, description")
            .eq("user_id", linkedUserId)
            .eq("is_deleted", false)
            .in("contact_id", chunk);

          if (dateFrom) q = q.gte("transaction_date", dateFrom);
          if (dateTo) q = q.lte("transaction_date", dateTo);

          const { data: txs } = await q;
          if (txs) transactions.push(...txs);
        }
      }

      // Calculate balances
      const supplierData = (contacts || []).map((c: any) => {
        const contactTxs = transactions.filter(t => t.contact_id === c.id);
        let totalPurchases = 0;
        let totalPayments = 0;

        for (const tx of contactTxs) {
          // Purchases: debit is expense (5xxx), credit is supplier account (2100)
          if (tx.debit_account_code?.startsWith("5") || tx.credit_account_code === "2100") {
            totalPurchases += tx.amount || 0;
          }
          // Payments to supplier: debit is 2100 (reducing liability)
          if (tx.debit_account_code === "2100") {
            totalPayments += tx.amount || 0;
          }
        }

        const openingBalance = c.opening_balance || 0;
        const closingBalance = openingBalance + totalPurchases - totalPayments;

        return {
          id: c.id,
          name: c.contact_name,
          openingBalance,
          totalPurchases,
          totalPayments,
          closingBalance,
        };
      });

      return respond({
        success: true,
        suppliers: supplierData.filter(s => s.totalPurchases > 0 || s.openingBalance !== 0 || s.closingBalance !== 0),
      });
    }

    return respond({ error: "Unknown action" }, 400);
  } catch (err: unknown) {
    console.error("malaki-data error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return respond({ success: false, error: message }, 500);
  }
});
