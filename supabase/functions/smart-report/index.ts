import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
        }
      }
    }

    // Fetch transactions with client filter if possible
    const filterFormula = airtableClientRecordId
      ? `&filterByFormula=${encodeURIComponent(`{Client}="${airtableClientRecordId}"`)}`
      : '';
    const txUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Transactions?pageSize=100${filterFormula}`;
    const accUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts?pageSize=100`;

    const [allTx, allAcc] = await Promise.all([
      fetchAllRecords(txUrl, AIRTABLE_API_KEY),
      fetchAllRecords(accUrl, AIRTABLE_API_KEY),
    ]);

    // If filter didn't work via formula, filter in memory
    let clientTx = allTx;
    if (airtableClientRecordId && !filterFormula) {
      clientTx = allTx.filter((tx: any) => {
        const clientField = tx.fields["Client"];
        if (!clientField) return false;
        if (Array.isArray(clientField)) return clientField.includes(airtableClientRecordId);
        return clientField === airtableClientRecordId;
      });
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

    const systemPrompt = `أنت محاسب محترف ومحلل مالي ذكي. لديك بيانات مالية كاملة للعميل (معاملات وحسابات) وتحتاج الإجابة على سؤاله بدقة.

أنواع التقارير التي يمكنك إعدادها:
1. **أرباح وخسائر**: احسب الإيرادات (حسابات نوع Revenue/إيرادات) ناقص المصروفات (حسابات نوع Expense/مصروفات). اعرض ملخص بالفئات.
2. **المشتريات**: فلتر المعاملات التي حسابها المدين من نوع مخزون/بضاعة أو وصفها يحتوي "شراء".
3. **المبيعات**: فلتر المعاملات التي حسابها الدائن من نوع إيرادات أو وصفها يحتوي "بيع/مبيعات".
4. **المسحوبات الشخصية**: فلتر المعاملات المرتبطة بحساب "مسحوبات شخصية" أو "سحب شخصي" أو "جاري المالك".
5. **كشف حساب**: اعرض جميع المعاملات المرتبطة بالحساب المطلوب (مدين أو دائن) مع رصيد متراكم.
6. **كشف حساب زبون/مورد**: فلتر المعاملات المرتبطة بالاسم المذكور في الوصف أو الحساب.
7. **الذمم المتأخرة**: المعاملات المستحقة (ذمم مدينة/دائنة) التي لم تُسدد.
8. **المقبوضات**: المعاملات التي حسابها المدين صندوق أو بنك (نقد وارد).
9. **المصاريف/المصروفات**: جميع المعاملات على حسابات المصروفات.
10. **الوضع المالي**: ملخص شامل بالأصول والالتزامات وحقوق الملكية والإيرادات والمصروفات وصافي الربح.
11. **آخر معاملات**: أحدث المعاملات مرتبة بالتاريخ تنازلياً.

القواعد:
1. أجب باللغة العربية دائماً
2. إذا السؤال عن مبلغ إجمالي، احسبه من البيانات بدقة
3. إذا السؤال عن كشف حساب أو تفاصيل، أعد جدول بالمعاملات المطلوبة مرتبة بالتاريخ
4. استخدم أسماء الحسابات المدينة والدائنة لتحديد نوع المعاملة
5. العملة الافتراضية ₪ ما لم تظهر عملة أخرى
6. أعد الإجابة بصيغة JSON فقط بهذا الشكل:
{
  "answer": "نص الإجابة المختصر والواضح",
  "total": رقم_إجمالي_إن_وجد_أو_null,
  "currency": "₪",
  "table": [
    {"التاريخ": "...", "الوصف": "...", "المبلغ": رقم, "النوع": "مدين/دائن", "الحساب المدين": "...", "الحساب الدائن": "..."}
  ]
}

إذا لم تجد بيانات مطابقة، أعد:
{"answer": "لم أجد بيانات مطابقة لسؤالك. تأكد من وجود معاملات مسجلة.", "total": null, "currency": null, "table": []}

لا تضف أي نص خارج JSON.`;

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
