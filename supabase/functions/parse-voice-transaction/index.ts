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

    const systemPrompt = `أنت محاسب ذكي. المستخدم سيعطيك جملة تصف عملية مالية بالعربية. حوّلها إلى قيد محاسبي.

أعد الإجابة بصيغة JSON فقط بدون أي نص إضافي:
{
  "debit": "اسم الحساب المدين",
  "credit": "اسم الحساب الدائن",
  "amount": "المبلغ مع العملة (مثل ₪500)",
  "description": "وصف مختصر للعملية",
  "contactName": "اسم الزبون أو المورد المذكور في النص أو null إذا لم يُذكر"
}

أمثلة:
- "دفعت 500 شيكل كهرباء من الصندوق" → {"debit": "مصروفات الكهرباء", "credit": "الصندوق", "amount": "₪500", "description": "دفع فاتورة كهرباء", "contactName": null}
- "قبضت 1000 شيكل من العميل سلام صايمة" → {"debit": "الصندوق", "credit": "العملاء", "amount": "₪1000", "description": "قبض من الزبون سلام صايمة", "contactName": "سلام صايمة"}
- "شراء بضاعة 2000 شيكل من المورد أحمد" → {"debit": "المشتريات", "credit": "الصندوق", "amount": "₪2000", "description": "شراء بضاعة من المورد أحمد", "contactName": "أحمد"}

إذا لم تتمكن من فهم النص كعملية مالية، أعد:
{"debit": "", "credit": "", "amount": "", "description": "لم أتمكن من فهم العملية", "contactName": null}`;

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

    if (!parsed || (!parsed.debit && !parsed.amount)) {
      return new Response(JSON.stringify({
        transaction: null,
        message: 'لم أتمكن من فهم العملية',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      transaction: {
        debit: parsed.debit || '',
        credit: parsed.credit || '',
        amount: parsed.amount || '',
        description: parsed.description || text,
        contactName: parsed.contactName || null,
      },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
