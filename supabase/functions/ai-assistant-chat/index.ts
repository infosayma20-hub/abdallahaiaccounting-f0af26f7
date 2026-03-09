import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateRequest, corsHeaders } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const { messages, currentPage, userName, financialContext } = await req.json();

    const pageContextMap: Record<string, string> = {
      '/': 'لوحة التحكم الرئيسية',
      '/transactions': 'صفحة المعاملات',
      '/contacts': 'صفحة العملاء والموردين',
      '/accounts': 'صفحة الحسابات',
      '/invoices': 'صفحة الفواتير',
      '/inventory': 'صفحة المخزون',
      '/profit-loss': 'صفحة الأرباح والخسائر',
      '/smart-report': 'صفحة التقرير الذكي',
      '/cheques': 'صفحة إدارة الشيكات',
      '/smart-accountant': 'المحاسب الذكي - الواجهة الرئيسية',
    };

    const pageContext = pageContextMap[currentPage] || 'صفحة عامة';
    const ctx = financialContext || {};

    // Build rich context sections
    let dataSection = `
=== البيانات المالية الحالية ===
الصندوق: ${ctx.cash ?? 0} ₪
البنك: ${ctx.bank ?? 0} ₪
مبيعات الشهر: ${ctx.sales ?? 0} ₪
مشتريات/مصروفات: ${ctx.expenses ?? 0} ₪
صافي الربح: ${ctx.profit ?? 0} ₪
إجمالي الذمم (لك): ${ctx.receivables ?? 0} ₪
إجمالي الدائنون (عليك): ${ctx.payables ?? 0} ₪`;

    if (ctx.topContacts?.length > 0) {
      dataSection += `\n\n=== أهم العملاء والموردين ===\n`;
      dataSection += ctx.topContacts.map((c: any) => `${c.name} (${c.type}): رصيد ${c.balance} ₪`).join('\n');
    }

    if (ctx.recentTransactions?.length > 0) {
      dataSection += `\n\n=== آخر المعاملات ===\n`;
      dataSection += ctx.recentTransactions.map((t: any) => `${t.date}: ${t.description} — ${t.amount} ₪`).join('\n');
    }

    if (ctx.inventory?.length > 0) {
      dataSection += `\n\n=== المخزون ===\n`;
      dataSection += ctx.inventory.map((p: any) => `${p.name}: ${p.quantity} وحدة، شراء ${p.buy_price}₪، بيع ${p.sell_price}₪`).join('\n');
    }

    if (ctx.dueCheques?.length > 0) {
      dataSection += `\n\n=== شيكات مستحقة ===\n`;
      dataSection += ctx.dueCheques.map((c: any) => `${c.party_name}: ${c.amount}₪ — استحقاق ${c.cheque_date}`).join('\n');
    }

    if (ctx.employees?.length > 0) {
      dataSection += `\n\n=== الموظفون ===\n`;
      dataSection += ctx.employees.map((e: any) => `${e.full_name} - ${e.department || 'عام'}`).join('\n');
    }

    const systemPrompt = `أنت محاسب ذكي محترف اسمك "المحاسب الذكي". تعمل داخل نظام ZIDNI ERP المحاسبي.

## سياق المستخدم
- اسم المستخدم: ${userName || 'المستخدم'}
- الصفحة الحالية: ${pageContext}

${dataSection}

## قواعد السلوك
1. استخدم الأرقام الحقيقية أعلاه في إجاباتك دائماً
2. لا تخترع أرقاماً — إذا لم تجد بيانات قل ذلك صراحةً
3. أجب بالعربية الفصحى البسيطة، بشكل مختصر ومهني
4. قدم إجابات عملية وقابلة للتنفيذ
5. أكمل إجابتك كاملة حتى لو كانت طويلة — لا تقطعها أبداً
6. إذا طلب تسجيل عملية مالية، ساعده بالصيغة الصحيحة
7. عند ذكر إجراء، استخدم: [action:نص_الزر:/المسار]

## صيغ العمليات المالية
- بيع: "بعت @منتج كمية وحدة ل@زبون سعر XX نقداً/آجل/شيك/تحويل"
- شراء: "اشتريت @منتج كمية وحدة من @مورد سعر XX نقداً/آجل/شيك/تحويل"
- قبض: "قبضت من @اسم مبلغ عملة"
- صرف: "دفعت ل@اسم مبلغ عملة"
- شيك وارد: "قبضت شيك من @عميل مبلغ عملة بتاريخ DD/MM/YYYY"
- شيك صادر: "دفعت شيك ل@مورد مبلغ عملة بتاريخ DD/MM/YYYY"

## إدارة الشيكات
- حالات الشيك: مسجل → آجل → مستحق → مودع → محصل (أو مرتجع/ملغي)
- الشيك لا يؤثر على السيولة حتى يتم تحصيله فعلياً
- وارد: مدين شيكات واردة، دائن العملاء / صادر: مدين الموردين، دائن شيكات صادرة`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        stream: true,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "تم تجاوز الحد المسموح، حاول لاحقاً" }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "يرجى إضافة رصيد لاستخدام المساعد الذكي" }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI error [${response.status}]`);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
