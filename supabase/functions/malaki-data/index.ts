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

    if (action === "dashboard" || action === "sales" || action === "liquidity") {
      if (!linkedUserId) {
        return respond({
          success: true,
          needsSetup: true,
          message: "يجب ربط البوابة بحساب FINIX أولاً",
          sales: null,
          liquidity: null,
        });
      }

      let salesResult = null;
      let liquidityResult = null;

      if (action === "dashboard" || action === "sales") {
        const shiftStart = body.shiftStart;
        const shiftEnd = body.shiftEnd;

        // Fetch paid orders in date range
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

        // Fetch order lines for top meals
        let allLines: any[] = [];
        if (orderIds.length > 0) {
          for (let i = 0; i < orderIds.length; i += 200) {
            const chunk = orderIds.slice(i, i + 200);
            const { data: lines } = await supabase
              .from("pos_order_lines")
              .select("order_id, product_name, qty, line_total")
              .in("order_id", chunk);
            if (lines) allLines.push(...lines);
          }
        }

        // Fetch sessions for branch mapping
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

        // Fetch cash boxes for branch names
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

        // Aggregate by branch (cash_box)
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

        // Top meals per branch
        for (const branchKey of Object.keys(branchData)) {
          const branchOrderIds = new Set(branchData[branchKey].orders);
          const branchLines = allLines.filter((l) => branchOrderIds.has(l.order_id));

          const mealMap: Record<string, { quantity: number; revenue: number }> = {};
          for (const line of branchLines) {
            const name = line.product_name || "غير معروف";
            if (!mealMap[name]) mealMap[name] = { quantity: 0, revenue: 0 };
            mealMap[name].quantity += line.qty || 0;
            mealMap[name].revenue += line.line_total || 0;
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

        liquidityResult = {
          exchangeRates: {
            jod: settings?.exchange_rate_jod || 3.55,
            usd: settings?.exchange_rate_usd || 3.65,
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

    return respond({ error: "Unknown action" }, 400);
  } catch (err: unknown) {
    console.error("malaki-data error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return respond({ success: false, error: message }, 500);
  }
});
