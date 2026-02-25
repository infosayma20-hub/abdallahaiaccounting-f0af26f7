import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function fetchAllRecords(baseUrl: string, apiKey: string): Promise<any[]> {
  let allRecords: any[] = [];
  let currentUrl = baseUrl;
  while (currentUrl) {
    const response = await fetch(currentUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error(`Airtable error [${response.status}]`);
    const data = await response.json();
    allRecords = allRecords.concat(data.records || []);
    currentUrl = data.offset ? `${baseUrl.replace(/&offset=[^&]*/, '')}&offset=${data.offset}` : '';
  }
  return allRecords;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const AIRTABLE_API_KEY = Deno.env.get('AIRTABLE_API_KEY');
    const AIRTABLE_BASE_ID = Deno.env.get('AIRTABLE_BASE_ID');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!AIRTABLE_API_KEY) throw new Error('AIRTABLE_API_KEY not configured');
    if (!AIRTABLE_BASE_ID) throw new Error('AIRTABLE_BASE_ID not configured');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const { question, clientId } = await req.json();
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      throw new Error('Question is required');
    }
    if (question.length > 500) throw new Error('Question too long');

    // Check if this is an inventory question
    const inventoryKeywords = ['المخزون', 'رصيد المخزون', 'كم عندي', 'كمية المنتج', 'حركة مخزون', 'تقرير مخزون', 'قيمة المخزون', 'تحليل مخزون', 'منتجات منخفضة', 'منتجات ناقصة', 'تكلفة المنتج', 'ربحية المنتج', 'الأصناف', 'صنف'];
    const isInventoryQ = inventoryKeywords.some(kw => question.includes(kw));

    if (isInventoryQ && clientId) {
      // Query Supabase products + stock_movements
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const { data: products } = await sb.from('products').select('*').eq('user_id', clientId);
      const { data: movements } = await sb.from('stock_movements').select('*, products(name)').eq('user_id', clientId).order('created_at', { ascending: false }).limit(200);

      const productsSummary = (products || []).map(p => ({
        name: p.name, quantity: p.quantity, unit: p.unit, buy_price: p.buy_price, sell_price: p.sell_price, min_quantity: p.min_quantity, category: p.category
      }));
      const movementsSummary = (movements || []).map(m => ({
        product: (m as any).products?.name || '', type: m.movement_type, quantity: m.quantity, note: m.reference_note || '', date: m.created_at
      }));

      const invPrompt = `أنت محاسب محترف. لديك بيانات المخزون التالية:

المنتجات (${productsSummary.length}):
${JSON.stringify(productsSummary, null, 0)}

حركات المخزون (${movementsSummary.length}):
${JSON.stringify(movementsSummary, null, 0)}

سؤال المستخدم: ${question}

أجب بدقة بناءً على البيانات. أعد JSON فقط:
{
  "answer": "نص الإجابة",
  "total": رقم_أو_null,
  "currency": "₪",
  "table": [{"الصنف": "...", "الكمية": ..., "الوحدة": "...", "سعر الشراء": ..., "سعر البيع": ..., "القيمة": ...}]
}

إذا سأل عن منتجات منخفضة، فلتر المنتجات حيث quantity <= min_quantity.
إذا سأل عن قيمة المخزون، احسب quantity * buy_price لكل منتج.
إذا سأل عن ربحية منتج، احسب (sell_price - buy_price) / buy_price * 100.
لا تكتب أي نص خارج JSON.`;

      const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'google/gemini-2.5-flash', messages: [{ role: 'user', content: invPrompt }], temperature: 0.1 }),
      });
      if (!aiRes.ok) throw new Error(`AI error [${aiRes.status}]`);
      const aiData = await aiRes.json();
      const content = aiData.choices?.[0]?.message?.content || '';
      let result;
      try { const m = content.match(/\{[\s\S]*\}/); result = m ? JSON.parse(m[0]) : { answer: content, total: null, table: [] }; } catch { result = { answer: content, total: null, table: [] }; }
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Resolve Supabase UUID to Airtable Client record ID
    let airtableClientRecordId = '';
    if (clientId) {
      const clientLookupUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Clients?filterByFormula=${encodeURIComponent(`{UserID}="${clientId}"`)}&pageSize=1`;
      const clientRes = await fetch(clientLookupUrl, {
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` },
      });
      if (clientRes.ok) {
        const clientData = await clientRes.json();
        if (clientData.records && clientData.records.length > 0) {
          airtableClientRecordId = clientData.records[0].id;
          console.log(`smart-report: resolved client ${clientId} → ${airtableClientRecordId}`);
        } else {
          console.log(`smart-report: no Airtable client found for UUID ${clientId}`);
        }
      } else {
        console.log(`smart-report: client lookup failed with status ${clientRes.status}`);
      }
    }

    // CRITICAL: If clientId was provided but we couldn't resolve it, return empty data to prevent data leakage
    if (clientId && !airtableClientRecordId) {
      return new Response(JSON.stringify({
        answer: "لم يتم العثور على حسابك في النظام. تأكد من إعداد حسابك بشكل صحيح.",
        total: null,
        currency: null,
        table: []
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Always fetch all, then filter in memory (Airtable linked record filters are unreliable)
    const txUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Transactions?pageSize=100`;
    const accUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts?pageSize=100`;

    const [allTx, allAcc] = await Promise.all([
      fetchAllRecords(txUrl, AIRTABLE_API_KEY),
      fetchAllRecords(accUrl, AIRTABLE_API_KEY),
    ]);

    // Filter transactions by client
    let clientTx = allTx;
    if (airtableClientRecordId) {
      clientTx = allTx.filter((tx: any) => {
        const clientField = tx.fields["Client"];
        if (!clientField) return false;
        if (Array.isArray(clientField)) return clientField.includes(airtableClientRecordId);
        return clientField === airtableClientRecordId;
      });
      console.log(`smart-report: filtered ${clientTx.length}/${allTx.length} transactions for client ${airtableClientRecordId}`);
    }

    // Filter accounts for this client
    const clientAcc = airtableClientRecordId ? allAcc.filter((acc: any) => {
      const clientField = acc.fields["Client"];
      if (!clientField || (Array.isArray(clientField) && clientField.length === 0)) return true; // shared accounts
      if (Array.isArray(clientField)) return clientField.includes(airtableClientRecordId);
      return clientField === airtableClientRecordId;
    }) : allAcc;

    // Prepare data summary for AI
    const txSummary = clientTx.map((tx: any) => ({
      date: tx.fields.Date || '',
      description: tx.fields.Description || '',
      type: tx.fields["Transaction Type"] || '',
      amount: tx.fields.Amount || 0,
      currency: tx.fields.Currency || '',
      debitAccount: tx.fields["Debit Account Name"] || '',
      creditAccount: tx.fields["Credit Account Name"] || '',
      debitType: tx.fields["Debit Account Rollup"] || '',
      creditType: tx.fields["Credit Account Rollup"] || '',
      reference: tx.fields.Reference || '',
    }));

    const accSummary = clientAcc.map((acc: any) => ({
      name: acc.fields["Account Name"] || '',
      type: acc.fields["Account Type"] || '',
    }));

    const systemPrompt = `أنت محلل مالي ذكي داخل نظام محاسبي متكامل.

مهمتك: تحليل طلبات التقارير المالية وربطها بكامل البيانات المحاسبية (الفواتير، الذمم، المخزون، الحسابات، القيود، الأرصدة، والتحليلات).

⚠️ عند طلب أي تقرير: لا تنشئ حركة مالية. لا تنشئ فاتورة. لا تنشئ سند. فقط تحليل وعرض بيانات.

━━━ تحديد نوع التقرير ━━━
إذا احتوى السؤال على: أرباح، خسارة، صافي، إجمالي، مبيعات، مشتريات، مصاريف، كشف حساب، رصيد، مخزون، قيمة، ذمم، تحصيل، وضع مالي، KPI، تحليل، أداء — حدد intent = financial_report.

أنواع التقارير المدعومة:
- الأرباح والخسائر / إجمالي المبيعات / إجمالي المشتريات / صافي الربح
- كشف حساب (عميل / مورد / صندوق / مصاريف / بنك / مسحوبات شخصية)
- الذمم المتأخرة / تحليل المخزون / تقييم المخزون
- تحليل السيولة / تحليل الأداء الشهري / ملخص مالي / KPI Dashboard
- المقبوضات / المصروفات / آخر معاملات

━━━ آلية العمل ━━━
قبل عرض أي نتيجة:
1. اقرأ جميع الحركات المرحّلة فقط
2. تحقق أن القيود متوازنة (مدين = دائن)
3. احسب الأرصدة من واقع دفتر الأستاذ
4. اربط الفواتير بالمدفوعات
5. اربط المخزون بالمشتريات والمبيعات
6. تأكد أنه لا يوجد مخزون سالب
7. احسب المتوسطات إن وجدت
إذا اكتشفت خلل: أظهر تحذير واضح قبل عرض النتائج.

━━━ طريقة عرض النتيجة ━━━
دائماً اعرض:
1️⃣ النتيجة الرقمية أولاً بشكل واضح ومختصر
2️⃣ مقارنة زمنية إن وجدت
3️⃣ تحليل السبب
4️⃣ KPI المرتبطة
5️⃣ توصية عملية

━━━ ربط التقارير بالأرصدة ━━━
- صافي الربح = إيرادات – تكلفة مبيعات – مصاريف
- قيمة المخزون = الكمية × متوسط التكلفة
- الذمم المتأخرة = الفواتير غير المسددة التي تجاوزت تاريخ الاستحقاق
- السيولة = الصندوق + أرصدة البنوك
- نسبة الدين للنقد = إجمالي الالتزامات ÷ السيولة

━━━ KPI المدعومة ━━━
احسب إن أمكن: هامش الربح، نسبة المصاريف للإيرادات، معدل دوران المخزون، متوسط فترة التحصيل، نسبة السيولة السريعة، نسبة الدين للنقد، نمو الإيرادات، أعلى 3 منتجات ربحية، أعلى 3 عملاء مساهمة.

━━━ أسلوب الرد ━━━
واضح، رقمي، مختصر، تحليلي، غير إنشائي، لا مبالغة، لا تعميم، لا شرح زائد.
النتيجة أولاً → ثم التحليل → ثم التوصية.

━━━ صيغة الإخراج ━━━
أعد الإجابة بصيغة JSON فقط:
{
  "answer": "النتيجة الرقمية أولاً ثم التحليل ثم التوصية",
  "total": رقم_إجمالي_أو_null,
  "currency": "₪",
  "table": [{"التاريخ": "...", "الوصف": "...", "المبلغ": رقم, "النوع": "مدين/دائن", "الحساب المدين": "...", "الحساب الدائن": "..."}]
}

إذا لم تجد بيانات مطابقة:
{"answer": "لم أجد بيانات مطابقة لسؤالك. تأكد من وجود معاملات مسجلة.", "total": null, "currency": null, "table": []}

لا تكتب أي نص خارج JSON.`;

    const userPrompt = `بيانات الحسابات:
${JSON.stringify(accSummary, null, 0)}

بيانات المعاملات (${txSummary.length} معاملة):
${JSON.stringify(txSummary, null, 0)}

سؤال العميل: ${question}`;

    // Call AI
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
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI API error [${aiResponse.status}]: ${errText}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';

    // Parse JSON from AI response
    let result;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { answer: content, total: null, table: [] };
    } catch {
      result = { answer: content, total: null, table: [] };
    }

    return new Response(JSON.stringify(result), {
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
