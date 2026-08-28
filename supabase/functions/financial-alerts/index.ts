import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface FinancialAlert {
  type: "financial_alert";
  priority: "high" | "medium" | "low" | "positive";
  title: string;
  description: string;
  cta_text: string;
  cta_action: string;
  icon: string;
  metrics?: Record<string, any>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Auth: tenant scope comes from the verified JWT, never the body ──────
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { transactions, revenue, expenses, totalIncome, totalOutcome, cashBalance, receivables, payables } = await req.json();

    // Resolve the tenant owner for the authenticated user (team owner if any).
    let clientId = user.id;
    try {
      const { data: ownerId } = await sb.rpc('get_team_owner_id', { _user_id: user.id });
      if (ownerId) clientId = ownerId as unknown as string;
    } catch (_e) { /* fall back to the user's own scope */ }

    const alerts: FinancialAlert[] = [];

    // Products with no movement in 60 days AND created more than 60 days ago
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const { data: allProducts } = await sb.from('products').select('id, name, quantity, buy_price, created_at').eq('user_id', clientId).gt('quantity', 0);
    const { data: recentMovements } = await sb.from('stock_movements').select('product_id, created_at').eq('user_id', clientId).order('created_at', { ascending: false });

    // Build map of last movement date per product
    const lastMovementDate = new Map<string, string>();
    for (const m of (recentMovements || [])) {
      if (!lastMovementDate.has(m.product_id)) {
        lastMovementDate.set(m.product_id, m.created_at);
      }
    }

    const staleProducts = (allProducts || []).filter(p => {
      // Product created less than 60 days ago is NOT stale
      if (p.created_at && p.created_at > sixtyDaysAgo) return false;
      // Check last movement date
      const lastMove = lastMovementDate.get(p.id);
      if (lastMove && lastMove > sixtyDaysAgo) return false;
      return true;
    });
    const staleValue = staleProducts.reduce((s, p) => s + (p.quantity * p.buy_price), 0);

    // Calculate actual days since last activity for description
    const staleDays = staleProducts.length > 0 ? staleProducts.map(p => {
      const lastMove = lastMovementDate.get(p.id);
      const refDate = lastMove || p.created_at;
      return Math.floor((Date.now() - new Date(refDate).getTime()) / (1000 * 60 * 60 * 24));
    }) : [];
    const maxStaleDays = staleDays.length > 0 ? Math.max(...staleDays) : 0;

    // ═══ PRIORITY 1: Overdue receivables ═══
    if (receivables > 0) {
      // Check for overdue invoices (receivables with dates > 30 days old)
      const overdueTx = (transactions || []).filter((tx: any) => {
        if (tx.fields?.["Debit Account Rollup"] !== "Asset" || tx.fields?.["Credit Account Rollup"] !== "Revenue") return false;
        const txDate = tx.fields?.Date;
        if (!txDate) return false;
        const daysDiff = Math.floor((Date.now() - new Date(txDate).getTime()) / (1000 * 60 * 60 * 24));
        return daysDiff > 30;
      });

      if (overdueTx.length > 0) {
        const overdueAmount = overdueTx.reduce((s: number, tx: any) => s + (tx.fields?.Amount || 0), 0);
        const oldestDate = overdueTx.reduce((oldest: string, tx: any) => {
          const d = tx.fields?.Date || '';
          return d < oldest ? d : oldest;
        }, overdueTx[0]?.fields?.Date || '');
        const daysSince = Math.floor((Date.now() - new Date(oldestDate).getTime()) / (1000 * 60 * 60 * 24));

        alerts.push({
          type: "financial_alert",
          priority: "high",
          title: "ذمم متأخرة",
          description: `لديك ${overdueTx.length} فواتير متأخرة بقيمة ${overdueAmount.toLocaleString()} شيكل\nآخر استحقاق كان منذ ${daysSince} يوم`,
          cta_text: "اقترح خطة تحصيل",
          cta_action: "generate_collection_plan",
          icon: "⚠️",
          metrics: { count: overdueTx.length, amount: overdueAmount, daysSince },
        });
      }
    }

    // ═══ PRIORITY 2: Low liquidity ═══
    if (payables > 0 && cashBalance < payables * 0.3) {
      alerts.push({
        type: "financial_alert",
        priority: "high",
        title: "سيولة منخفضة",
        description: `مستوى السيولة منخفض\nالنقد الحالي ${cashBalance.toLocaleString()} شيكل\nالالتزامات ${payables.toLocaleString()} شيكل`,
        cta_text: "عرض تحليل السيولة",
        cta_action: "analyze_liquidity",
        icon: "⚠️",
        metrics: { cash: cashBalance, liabilities: payables, ratio: Math.round((cashBalance / payables) * 100) },
      });
    }

    // ═══ PRIORITY 3: Stale inventory ═══
    if (staleProducts.length > 0 && maxStaleDays >= 60) {
      const staleMonths = Math.floor(maxStaleDays / 30);
      const staleLabel = staleMonths >= 2 ? `${staleMonths} أشهر` : `${maxStaleDays} يوم`;
      alerts.push({
        type: "financial_alert",
        priority: "medium",
        title: "مخزون راكد",
        description: `لديك ${staleProducts.length} منتجات بدون حركة منذ ${staleLabel}\nقيمة المخزون الراكد ${staleValue.toLocaleString()} شيكل`,
        cta_text: "تحليل المخزون الراكد",
        cta_action: "analyze_stale_inventory",
        icon: "📦",
        metrics: { count: staleProducts.length, value: staleValue, days: maxStaleDays, products: staleProducts.map(p => p.name).slice(0, 5) },
      });
    }

    // ═══ PRIORITY 4: Excellent performance ═══
    if (revenue > 0 && expenses > 0) {
      // Compare current month vs previous (simplified: check margin)
      const margin = Math.round(((revenue - expenses) / revenue) * 100);
      if (margin > 15) {
        alerts.push({
          type: "financial_alert",
          priority: "positive",
          title: "أداء ممتاز",
          description: `أداء ممتاز هذا الشهر\nهامش الربح +${margin}%`,
          cta_text: "عرض تحليل الأرباح",
          cta_action: "analyze_profits",
          icon: "📈",
          metrics: { margin, revenue, expenses },
        });
      }
    }

    // ═══ PRIORITY 5: Irregular recording ═══
    if (transactions && transactions.length > 0) {
      const sortedDates = (transactions as any[])
        .map(tx => tx.fields?.Date)
        .filter(Boolean)
        .sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime());
      
      if (sortedDates.length > 0) {
        const lastTxDate = new Date(sortedDates[0]);
        const daysSinceLast = Math.floor((Date.now() - lastTxDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceLast >= 3) {
          alerts.push({
            type: "financial_alert",
            priority: "low",
            title: "تسجيل غير منتظم",
            description: `لم يتم تسجيل أي عملية منذ ${daysSinceLast} أيام\nهل تريد تسجيل حركة الآن؟`,
            cta_text: "تسجيل عملية",
            cta_action: "record_transaction",
            icon: "⚡",
            metrics: { daysSinceLast },
          });
        }
      }
    } else if (!transactions || transactions.length === 0) {
      alerts.push({
        type: "financial_alert",
        priority: "low",
        title: "لا توجد عمليات",
        description: "لم يتم تسجيل أي عملية بعد\nابدأ بإضافة أول عملية مالية",
        cta_text: "تسجيل عملية",
        cta_action: "record_transaction",
        icon: "⚡",
      });
    }

    // Return the highest priority alert (or null)
    return new Response(JSON.stringify({
      alert: alerts.length > 0 ? alerts[0] : null,
      allAlerts: alerts,
      alertCount: alerts.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
