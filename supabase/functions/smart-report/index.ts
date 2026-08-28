import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth gate: this endpoint reads tenant financial data — never allow anonymous callers.
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;
    const authenticatedUserId = authResult.userId;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const { question } = await req.json();
    // The data scope is ALWAYS the authenticated caller — never a client-supplied id.
    const clientId = authenticatedUserId;
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      throw new Error('Question is required');
    }
    if (question.length > 500) throw new Error('Question too long');

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ─── Check if inventory question ───
    const inventoryKeywords = ['المخزون', 'رصيد المخزون', 'كم عندي', 'كمية المنتج', 'حركة مخزون', 'تقرير مخزون', 'قيمة المخزون', 'تحليل مخزون', 'منتجات منخفضة', 'منتجات ناقصة', 'تكلفة المنتج', 'ربحية المنتج', 'الأصناف', 'صنف'];
    const isInventoryQ = inventoryKeywords.some(kw => question.includes(kw));

    if (isInventoryQ && clientId) {
      const { data: products } = await sb.from('products').select('*').eq('user_id', clientId);
      const { data: movements } = await sb.from('stock_movements').select('*, products(name)').eq('user_id', clientId).order('created_at', { ascending: false }).limit(200);

      const productsSummary = (products || []).map((p: any) => ({
        name: p.name, quantity: p.quantity, unit: p.unit, buy_price: p.buy_price, sell_price: p.sell_price, min_quantity: p.min_quantity, category: p.category
      }));
      const movementsSummary = (movements || []).map((m: any) => ({
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

    // ─── Check if account statement question ───
    const accountStatementKeywords = [
      'كشف حساب', 'حركات حساب', 'كشف ال', 'حركات ال',
      'رصيد حساب', 'كشف الصندوق', 'كشف البنك', 'كشف الذمم',
      'كشف الموردين', 'كشف العملاء', 'كشف المصاريف', 'كشف الإيرادات',
      'حركات الصندوق', 'حركات البنك', 'دفتر الأستاذ',
      'كشف المسحوبات', 'كشف حساب المسحوبات', 'كشف المصروفات',
      'كشف بالمصاريف', 'كشف بالمقبوضات', 'كشف بالمصروفات',
      'كشف المبيعات', 'كشف بالمبيعات', 'كشف بالمشتريات',
      'كشف المشتريات', 'كشف رأس المال', 'كشف الأرباح',
      'ملخص المصاريف', 'ملخص المصروفات', 'تفاصيل المصاريف',
      'تفاصيل المصروفات', 'بيان المصاريف', 'بيان المصروفات',
    ];

    const isAccountStatementQ = accountStatementKeywords.some(kw =>
      question.toLowerCase().includes(kw.toLowerCase())
    );

    if (isAccountStatementQ && clientId) {
      // ─── Check if this is a CONTACT-specific statement ───
      const { data: contactsData } = await sb.from('contacts')
        .select('id, contact_name, contact_type')
        .eq('user_id', clientId)
        .eq('is_active', true);
      
      const contacts = contactsData || [];
      // Try to match a contact name in the question
      let matchedContact: any = null;
      for (const c of contacts) {
        if (question.includes(c.contact_name)) {
          matchedContact = c;
          break;
        }
      }

      if (matchedContact) {
        // ─── Contact-specific account statement ───
        const { data: contactTxData } = await sb.from('transactions')
          .select('*')
          .eq('user_id', clientId)
          .eq('is_deleted', false)
          .eq('contact_id', matchedContact.id)
          .order('transaction_date', { ascending: true });

        const contactTx = contactTxData || [];
        const isSupplier = matchedContact.contact_type === 'مورد';

        // Calculate running balance
        let runningBalance = 0;
        const movements = contactTx.map((tx: any) => {
          const amount = tx.amount || 0;
          let debit = 0, credit = 0;

          if (isSupplier) {
            // Supplier: purchases = credit (we owe them), payments = debit (we paid)
            if (['شراء', 'purchase', 'فاتورة شراء'].some(t => (tx.transaction_type || '').includes(t))) {
              credit = amount;
              runningBalance -= amount;
            } else {
              debit = amount;
              runningBalance += amount;
            }
          } else {
            // Customer: sales = debit (they owe us), receipts = credit (they paid)
            if (['بيع', 'sale', 'فاتورة بيع'].some(t => (tx.transaction_type || '').includes(t))) {
              debit = amount;
              runningBalance += amount;
            } else {
              credit = amount;
              runningBalance -= amount;
            }
          }

          return {
            "التاريخ": tx.transaction_date,
            "البيان": tx.description || tx.transaction_type || '',
            "النوع": tx.transaction_type || '',
            "مدين": debit,
            "دائن": credit,
            "الرصيد": Math.abs(runningBalance),
            "الجانب": runningBalance >= 0 ? 'مدين' : 'دائن',
          };
        });

        const totalDebit = movements.reduce((s: number, m: any) => s + (m["مدين"] || 0), 0);
        const totalCredit = movements.reduce((s: number, m: any) => s + (m["دائن"] || 0), 0);
        const finalBalance = runningBalance;
        const balanceSide = finalBalance >= 0 ? 'مدين' : 'دائن';

        const contactLabel = isSupplier ? 'المورد' : 'الزبون';
        const answer = `كشف حساب ${contactLabel} "${matchedContact.contact_name}":\n` +
          `• عدد الحركات: ${movements.length}\n` +
          `• إجمالي المدين: ₪${totalDebit.toLocaleString()}\n` +
          `• إجمالي الدائن: ₪${totalCredit.toLocaleString()}\n` +
          `• الرصيد الختامي: ₪${Math.abs(finalBalance).toLocaleString()} ${balanceSide}`;

        const result = {
          answer,
          total: Math.abs(finalBalance),
          currency: "₪",
          table: movements,
        };

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ─── Chart of accounts statement (original logic) ───
      const [{ data: txData }, { data: accData }] = await Promise.all([
        sb.from('transactions')
          .select('*')
          .eq('user_id', clientId)
          .eq('is_deleted', false)
          .order('transaction_date', { ascending: true }),
        sb.from('accounts')
          .select('account_code, account_name, account_type')
          .eq('user_id', clientId)
          .eq('is_active', true)
          .order('account_code'),
      ]);

      const transactions = txData || [];
      const accounts = accData || [];

      const accountMap: Record<string, { name: string; type: string }> = {};
      accounts.forEach((a: any) => {
        accountMap[a.account_code] = { name: a.account_name, type: a.account_type };
      });

      const accountBalances: Record<string, { name: string; type: string; debit: number; credit: number; balance: number; movements: any[] }> = {};

      for (const tx of transactions) {
        const d = (tx as any).debit_account_code;
        const c = (tx as any).credit_account_code;
        const amount = (tx as any).amount || 0;
        const acc_d = accountMap[d];
        const acc_c = accountMap[c];

        if (d && acc_d) {
          if (!accountBalances[d]) accountBalances[d] = { name: acc_d.name, type: acc_d.type, debit: 0, credit: 0, balance: 0, movements: [] };
          accountBalances[d].debit += amount;
          accountBalances[d].balance += amount;
          accountBalances[d].movements.push({
            date: (tx as any).transaction_date,
            description: (tx as any).description,
            type: (tx as any).transaction_type,
            debit: amount,
            credit: 0,
            balance: accountBalances[d].balance,
          });
        }
        if (c && acc_c) {
          if (!accountBalances[c]) accountBalances[c] = { name: acc_c.name, type: acc_c.type, debit: 0, credit: 0, balance: 0, movements: [] };
          accountBalances[c].credit += amount;
          accountBalances[c].balance -= amount;
          accountBalances[c].movements.push({
            date: (tx as any).transaction_date,
            description: (tx as any).description,
            type: (tx as any).transaction_type,
            debit: 0,
            credit: amount,
            balance: accountBalances[c].balance,
          });
        }
      }

      const accountsList = Object.entries(accountBalances).map(([code, data]) => ({
        code,
        name: data.name,
        type: data.type,
        debit: data.debit,
        credit: data.credit,
        balance: Math.abs(data.balance),
        balanceSide: data.balance >= 0 ? 'مدين' : 'دائن',
        movementsCount: data.movements.length,
        lastMovements: data.movements.slice(-20),
      }));

      const stmtPrompt = `أنت محاسب قانوني خبير. لديك بيانات كاملة من دفتر الأستاذ.

قائمة الحسابات وأرصدتها:
${JSON.stringify(accountsList, null, 0)}

طلب المستخدم: "${question}"

تعليمات:
1. افهم أي حساب يقصد المستخدم (بالاسم أو النوع)
2. ابحث عن الحساب المطلوب في القائمة (مثلاً: "الصندوق"، "البنك"، "الذمم"، "المصاريف"، "الموردين"...)
3. إذا وجدت الحساب: أعد الحركات مرتبة بالتاريخ مع الأرصدة المتراكمة
4. إذا كان السؤال عاماً (مثل "كشف المصاريف") أعد ملخص جميع حسابات المصاريف

أعد JSON فقط بدون أي نص خارجه:
{
  "answer": "ملخص نصي واضح: اسم الحساب، رصيد أول المدة، عدد الحركات، رصيد آخر المدة، الجانب (مدين/دائن)",
  "total": رصيد_آخر_المدة_رقم,
  "currency": "₪",
  "table": [
    { "التاريخ": "...", "البيان": "...", "النوع": "...", "مدين": رقم_أو_0, "دائن": رقم_أو_0, "الرصيد": رقم, "الجانب": "مدين|دائن" }
  ]
}

قواعد الجدول:
- كل صف = حركة واحدة مع الرصيد المتراكم
- أضف صف أول للرصيد الافتتاحي إذا وجد
- أضف صف أخير للإجماليات وآخر للرصيد الختامي
- لا تكتب أي نص خارج JSON`;

      const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{ role: 'user', content: stmtPrompt }],
          temperature: 0.05,
        }),
      });

      if (!aiRes.ok) throw new Error(`AI error [${aiRes.status}]`);
      const aiData = await aiRes.json();
      const content = aiData.choices?.[0]?.message?.content || '';
      let result;
      try {
        const m = content.match(/\{[\s\S]*\}/);
        result = m ? JSON.parse(m[0]) : { answer: 'لم أتمكن من معالجة الطلب', total: null, table: [] };
      } catch {
        result = { answer: content, total: null, table: [] };
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── General financial report — read from Supabase ───
    if (!clientId) {
      return new Response(JSON.stringify({ answer: 'لم يتم تحديد المستخدم', total: null, table: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const [{ data: txData }, { data: accData }] = await Promise.all([
      sb.from('transactions')
        .select('*')
        .eq('user_id', clientId)
        .eq('is_deleted', false)
        .order('transaction_date', { ascending: false }),
      sb.from('accounts')
        .select('account_code, account_name, account_type')
        .eq('user_id', clientId)
        .eq('is_active', true)
        .order('account_code'),
    ]);

    const txSummary = (txData || []).map((tx: any) => ({
      date: tx.transaction_date || '',
      description: tx.description || '',
      type: tx.transaction_type || '',
      amount: tx.amount || 0,
      currency: tx.currency || '',
      debitAccount: tx.debit_account_code || '',
      creditAccount: tx.credit_account_code || '',
      reference: tx.reference || '',
    }));

    const accSummary = (accData || []).map((acc: any) => ({
      code: acc.account_code,
      name: acc.account_name,
      type: acc.account_type,
    }));

    // Build account code -> name map for AI context
    const accMapStr = accSummary.map((a: any) => `${a.code}: ${a.name} (${a.type})`).join('\n');

    const systemPrompt = `أنت محلل مالي ذكي داخل نظام محاسبي متكامل.

مهمتك: تحليل طلبات التقارير المالية وربطها بكامل البيانات المحاسبية.

⚠️ عند طلب أي تقرير: لا تنشئ حركة مالية. لا تنشئ فاتورة. لا تنشئ سند. فقط تحليل وعرض بيانات.

━━━ خريطة الحسابات ━━━
${accMapStr}

━━━ آلية العمل ━━━
- الحسابات المدينة تُحدد بحقل debitAccount (كود الحساب)
- الحسابات الدائنة تُحدد بحقل creditAccount (كود الحساب)
- استخدم خريطة الحسابات أعلاه لتحويل الأكواد لأسماء
- الإيرادات = المعاملات التي creditAccount يبدأ بـ 4
- المصروفات = المعاملات التي debitAccount يبدأ بـ 5
- صافي الربح = إجمالي الإيرادات - إجمالي المصروفات

━━━ طريقة عرض النتيجة ━━━
1️⃣ النتيجة الرقمية أولاً
2️⃣ مقارنة زمنية إن وجدت
3️⃣ تحليل السبب
4️⃣ KPI المرتبطة
5️⃣ توصية عملية

━━━ قواعد حاسمة ━━━
- لا ترفض إنشاء التقرير أبداً إذا وجدت بيانات. حلل ما هو متاح.
- لا تقل "البيانات غير كافية" إلا إذا كان عدد المعاملات = 0.

━━━ صيغة الإخراج ━━━
أعد JSON فقط:
{
  "answer": "النتيجة الرقمية أولاً ثم التحليل ثم التوصية",
  "total": رقم_إجمالي_أو_null,
  "currency": "₪",
  "table": [{"التاريخ": "...", "الوصف": "...", "المبلغ": رقم, "النوع": "...", "الحساب المدين": "...", "الحساب الدائن": "..."}]
}

لا تكتب أي نص خارج JSON.`;

    const userPrompt = `بيانات المعاملات (${txSummary.length} معاملة):
${JSON.stringify(txSummary, null, 0)}

سؤال العميل: ${question}`;

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
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
