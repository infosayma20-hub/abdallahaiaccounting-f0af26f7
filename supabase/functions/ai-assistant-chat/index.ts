import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const { messages, currentPage, userName } = await req.json();

    const pageContextMap: Record<string, string> = {
      '/': 'لوحة التحكم الرئيسية - يمكنك مساعدته في تحليل وضعه المالي أو تسجيل عمليات',
      '/transactions': 'صفحة المعاملات - يمكنك مساعدته في البحث عن معاملات أو تسجيل قيود',
      '/contacts': 'صفحة العملاء والموردين - يمكنك مساعدته في إدارة جهات الاتصال',
      '/accounts': 'صفحة الحسابات - يمكنك مساعدته في فهم أرصدة حساباته',
      '/invoices': 'صفحة الفواتير - يمكنك مساعدته في إنشاء أو مراجعة الفواتير',
      '/inventory': 'صفحة المخزون - يمكنك مساعدته في إدارة المنتجات والكميات',
      '/profit-loss': 'صفحة الأرباح والخسائر - يمكنك شرح التقارير المالية',
      '/smart-report': 'صفحة التقرير الذكي - يمكنك مساعدته في تحليل البيانات',
      '/menu': 'القائمة الرئيسية - يمكنك إرشاده للميزات المتاحة',
    };

    const pageContext = pageContextMap[currentPage] || 'صفحة عامة في التطبيق';

    const systemPrompt = `أنت مساعد مالي ذكي احترافي داخل تطبيق محاسبة عربي. اسمك "المساعد المالي الذكي".

## سياق المستخدم
- اسم المستخدم: ${userName || 'المستخدم'}
- الصفحة الحالية: ${pageContext}

## قواعد السلوك
1. كن مختصراً ومهنياً وودوداً
2. استخدم العربية الفصحى البسيطة
3. قدم إجابات عملية وقابلة للتنفيذ
4. إذا طلب تسجيل عملية مالية، ساعده بالصيغة الصحيحة
5. إذا سأل عن تحليل مالي، قدم نصائح ذكية
6. لا تكرر نفسك ولا تكن مزعجاً

## صيغ العمليات المالية الصحيحة
- بيع: "بعت @منتج كمية وحدة ل@زبون سعر الوحدة XX نقداً/آجل/شيك/تحويل"
- شراء: "اشتريت @منتج كمية وحدة من @مورد سعر الوحدة XX نقداً/آجل/شيك/تحويل"
- قبض: "قبضت من @اسم مبلغ عملة"
- صرف: "دفعت ل@اسم مبلغ عملة"

## أزرار الإجراءات السريعة
عند الحاجة، اقترح أزرار إجراءات سريعة بهذا الشكل:
[action:نص_الزر:المسار]
مثال: [action:تسجيل عملية:/] أو [action:عرض الفواتير:/invoices]

أجب بشكل مختصر ومفيد.`;

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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
