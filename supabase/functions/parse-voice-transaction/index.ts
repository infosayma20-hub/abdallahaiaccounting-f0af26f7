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

    const { text } = await req.json();
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('Text is required');
    }

    const systemPrompt = `أنت محاسب ذكي ومساعد مالي احترافي. المستخدم سيعطيك جملة تصف عملية مالية بالعربية.

## الخطوة 1: تصنيف العملية
- إذا تضمن النص "بعت" أو "بيع" أو "مبيعات" أو ما يشير للبيع → النوع = "فاتورة مبيعات"
- إذا تضمن النص "اشتريت" أو "شراء" أو "مشتريات" أو ما يشير للشراء → النوع = "فاتورة مشتريات"
- إذا تضمن "قبضت" أو "استلمت" أو "تحصيل" → النوع = "سند قبض"
- إذا تضمن "دفعت" أو "صرفت" أو "سددت" → النوع = "سند صرف"
- غير ذلك → حاول تصنيفها

## الخطوة 2: استخراج الحقول

### لعمليات البيع ("بعت"):
المطلوب:
- اسم الزبون (customerName)
- اسم المنتج/الخدمة (productName)
- الكمية (quantity)
- سعر الوحدة (unitPrice)
- طريقة الدفع: نقد / شيك / تحويل / آجل (paymentMethod)

### لعمليات الشراء ("اشتريت"):
المطلوب:
- اسم المورد (supplierName)
- اسم المنتج/الخدمة (productName)
- الكمية (quantity)
- سعر الوحدة (unitPrice)
- طريقة الدفع (paymentMethod)

### لعمليات القبض/الصرف:
المطلوب:
- الحساب المدين (debit)
- الحساب الدائن (credit)
- المبلغ (amount)
- الوصف (description)
- اسم جهة الاتصال إن وُجد (contactName)

## الخطوة 3: التحقق

أعد JSON بالصيغة التالية:

### إذا كانت فاتورة (بيع أو شراء) وجميع الحقول موجودة:
{
  "type": "invoice",
  "invoiceType": "sales" أو "purchase",
  "status": "complete",
  "contactName": "الاسم",
  "productName": "المنتج",
  "quantity": الكمية,
  "unitPrice": السعر,
  "total": الإجمالي,
  "paymentMethod": "نقد/شيك/تحويل/آجل",
  "description": "وصف مختصر",
  "confirmationMessage": "نص تأكيد منسق"
}

### إذا كانت فاتورة لكن بعض الحقول ناقصة:
{
  "type": "invoice",
  "invoiceType": "sales" أو "purchase",
  "status": "incomplete",
  "missingFields": ["الكمية", "سعر الوحدة"],
  "message": "تقريباً انتهينا 🙌\\nلكن أحتاج المعلومات التالية لإكمال العملية:",
  "partialData": { الحقول المتوفرة }
}

### إذا كانت عملية قبض/صرف عادية:
{
  "type": "transaction",
  "status": "complete",
  "debit": "الحساب المدين",
  "credit": "الحساب الدائن",
  "amount": "المبلغ مع العملة",
  "description": "وصف",
  "contactName": "الاسم أو null"
}

### إذا لم تُفهم:
{
  "type": "unknown",
  "status": "error",
  "message": "لم أتمكن من فهم العملية"
}

ملاحظات:
- كلمة "الزبون" و"العميل" لهما نفس المعنى.
- إذا لم يُذكر طريقة الدفع في فاتورة، اعتبرها ناقصة.
- إذا ذُكر "نقداً" أو "كاش" → paymentMethod = "نقد"
- إذا ذُكر "على الحساب" أو "آجل" أو "بالدين" → paymentMethod = "آجل"
- إذا ذُكر "شيك" → paymentMethod = "شيك"
- إذا ذُكر "تحويل" أو "بنك" → paymentMethod = "تحويل"
- اجعل confirmationMessage بهذا الشكل:
"تأكيد العملية:\\nالنوع: مبيعات/مشتريات\\nالجهة: الاسم\\nالمنتج: المنتج\\nالكمية: العدد\\nالسعر: السعر\\nالإجمالي: المجموع\\nطريقة الدفع: الطريقة\\n\\nهل تريد إنشاء الفاتورة الآن؟"

أعد JSON فقط بدون أي نص إضافي.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "تم تجاوز الحد المسموح، حاول لاحقاً" }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI error [${status}]`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';

    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      parsed = null;
    }

    if (!parsed) {
      return new Response(JSON.stringify({
        transaction: null,
        message: 'لم أتمكن من فهم العملية',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Handle invoice type (sales/purchase)
    if (parsed.type === 'invoice') {
      return new Response(JSON.stringify({
        type: 'invoice',
        invoiceType: parsed.invoiceType,
        status: parsed.status,
        transaction: parsed.status === 'complete' ? {
          contactName: parsed.contactName || null,
          productName: parsed.productName || '',
          quantity: parsed.quantity || 0,
          unitPrice: parsed.unitPrice || 0,
          total: parsed.total || 0,
          paymentMethod: parsed.paymentMethod || '',
          description: parsed.description || text,
        } : null,
        missingFields: parsed.missingFields || [],
        message: parsed.status === 'complete'
          ? parsed.confirmationMessage
          : parsed.message,
        partialData: parsed.partialData || null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Handle regular transaction
    if (parsed.type === 'transaction' || parsed.debit) {
      return new Response(JSON.stringify({
        type: 'transaction',
        status: 'complete',
        transaction: {
          debit: parsed.debit || '',
          credit: parsed.credit || '',
          amount: parsed.amount || '',
          description: parsed.description || text,
          contactName: parsed.contactName || null,
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Unknown
    return new Response(JSON.stringify({
      type: 'unknown',
      transaction: null,
      message: parsed.message || 'لم أتمكن من فهم العملية',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
