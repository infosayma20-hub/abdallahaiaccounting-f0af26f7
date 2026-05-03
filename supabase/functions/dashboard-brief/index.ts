import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BriefContext {
  period_label: string;
  sales_total: number;
  sales_count: number;
  purchases_total: number;
  expenses_total: number;
  net_profit: number;
  top_products: { name: string; qty: number }[];
  low_stock_count: number;
  receivables_total: number;
}

function periodRange(period: string): { from: string; to: string; label: string } {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  let label = "اليوم";
  if (period === "today") { from.setHours(0, 0, 0, 0); }
  else if (period === "week") { from.setDate(now.getDate() - 7); label = "آخر 7 أيام"; }
  else if (period === "month") { from.setDate(1); from.setHours(0, 0, 0, 0); label = "هذا الشهر"; }
  else if (period === "year") { from.setMonth(0, 1); from.setHours(0, 0, 0, 0); label = "هذه السنة"; }
  return { from: from.toISOString(), to: to.toISOString(), label };
}

async function buildContext(supabase: any, userId: string, period: string): Promise<BriefContext> {
  const { from, to, label } = periodRange(period);

  const [salesRes, purchasesRes, expensesRes, productsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, total_amount")
      .eq("user_id", userId)
      .eq("invoice_type", "sale")
      .eq("is_voided", false)
      .not("status", "in", "(cancelled,void,reversed)")
      .gte("invoice_date", from)
      .lte("invoice_date", to),
    supabase
      .from("invoices")
      .select("total_amount")
      .eq("user_id", userId)
      .eq("invoice_type", "purchase")
      .eq("is_voided", false)
      .not("status", "in", "(cancelled,void,reversed)")
      .gte("invoice_date", from)
      .lte("invoice_date", to),
    supabase
      .from("transactions")
      .select("amount")
      .eq("user_id", userId)
      .in("transaction_type", ["expense", "سند صرف"])
      .gte("transaction_date", from)
      .lte("transaction_date", to),
    supabase.from("products").select("id, name, quantity, min_quantity").eq("user_id", userId),
  ]);

  const salesRows = salesRes.data || [];
  const sales_total = salesRows.reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
  const purchases_total = (purchasesRes.data || []).reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
  const expenses_total = (expensesRes.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

  // Top products: query invoice_items joined with this period's invoices
  const invoiceIds = salesRows.map((r: any) => r.id);
  let top_products: { name: string; qty: number }[] = [];
  if (invoiceIds.length > 0) {
    const { data: items } = await supabase
      .from("invoice_items")
      .select("product_name, quantity")
      .in("invoice_id", invoiceIds);
    const productMap: Record<string, number> = {};
    (items || []).forEach((it: any) => {
      const name = it.product_name || "—";
      productMap[name] = (productMap[name] || 0) + Number(it.quantity || 0);
    });
    top_products = Object.entries(productMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, qty]) => ({ name, qty }));
  }

  const products = productsRes.data || [];
  const low_stock_count = products.filter((p: any) =>
    p.min_quantity && Number(p.quantity || 0) <= Number(p.min_quantity)
  ).length;

  // Receivables = open sales not fully paid
  const { data: openInvoices } = await supabase
    .from("invoices")
    .select("total_amount, paid_amount")
    .eq("user_id", userId)
    .eq("invoice_type", "sale")
    .eq("is_voided", false)
    .not("status", "in", "(cancelled,void,reversed)")
    .neq("payment_status", "paid");
  const receivables_total = (openInvoices || []).reduce(
    (s: number, r: any) => s + Math.max(0, Number(r.total_amount || 0) - Number(r.paid_amount || 0)),
    0
  );

  return {
    period_label: label,
    sales_total,
    sales_count: salesRows.length,
    purchases_total,
    expenses_total,
    net_profit: sales_total - purchases_total - expenses_total,
    top_products,
    low_stock_count,
    receivables_total,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { period = "today", mode = "brief" } = await req.json().catch(() => ({}));
    const ctx = await buildContext(supabase, user.id, period);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = mode === "insights"
      ? "أنت محلل مالي خبير. اكتب 3-5 ملاحظات تشغيلية مهمة بالعربية الفصحى المبسطة. استخدم رموز تعبيرية بسيطة (📈 📉 ⚠️ ✅). كل ملاحظة سطر واحد قصير. لا تكرر الأرقام كما هي بل حللها."
      : "أنت مساعد إداري ذكي يقدّم ملخصاً يومياً قصيراً جداً للمالك. اكتب فقرة واحدة (3-4 جمل) بالعربية تلخص الأداء وتقترح أولوية واحدة لليوم. ابدأ بتحية قصيرة. استخدم نبرة إيجابية وعملية.";

    const userPrompt = `بيانات الفترة (${ctx.period_label}):
- المبيعات: ${ctx.sales_total.toFixed(2)} (${ctx.sales_count} فاتورة)
- المشتريات: ${ctx.purchases_total.toFixed(2)}
- المصروفات: ${ctx.expenses_total.toFixed(2)}
- صافي الربح التقديري: ${ctx.net_profit.toFixed(2)}
- ذمم مدينة مفتوحة: ${ctx.receivables_total.toFixed(2)}
- منتجات بمخزون منخفض: ${ctx.low_stock_count}
- أكثر المنتجات مبيعاً: ${ctx.top_products.map(p => `${p.name} (${p.qty})`).join("، ") || "لا يوجد"}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "تجاوزت الحد المسموح، حاول لاحقاً" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "نفدت أرصدة الذكاء الاصطناعي" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI error:", t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ai = await aiRes.json();
    const content = ai.choices?.[0]?.message?.content || "لا يوجد ملخص متاح";

    return new Response(JSON.stringify({ content, context: ctx }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("dashboard-brief error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
