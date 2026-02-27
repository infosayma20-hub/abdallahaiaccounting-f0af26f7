import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, corsHeaders } from "../_shared/auth.ts";

// Extract contact name from Arabic text
function extractContactName(text: string): string | null {
  const patterns = [
    /(?:(?:رصيد\s*(?:ابتدائي|افتتاحي|مدور)\s*(?:لل?|من\s*)?)(?:الزبون|العميل|الزبونة|العميلة|المورد|المورّد|حساب)?\s*)([^\d,،.]+?)(?:\s+مبلغ|\s+بقيمة|\s*\d)/i,
    /(?:من\s+(?:الزبون|العميل|الزبونة|العميلة|المورد|المورّد|الشركة)\s+)([^\d,،.]+)/i,
    /(?:(?:الزبون|العميل|الزبونة|العميلة|المورد|المورّد)\s+)([^\d,،.]+)/i,
    /(?:من\s+)([^\d,،.]{3,}?)(?:\s+مبلغ|\s+قيمة|\s*$)/i,
    /(?:لـ?\s*)([^\d,،.]{3,}?)(?:\s+مبلغ|\s+قيمة|\s*$)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      const skipWords = ["الصندوق", "البنك", "الكهرباء", "الماء", "الإيجار", "المشتريات", "شيكل", "دينار"];
      if (!skipWords.some(w => name.includes(w)) && name.length >= 3) return name;
    }
  }
  return null;
}

function isOpeningBalance(text: string): boolean {
  return [/رصيد\s*(ابتدائي|افتتاحي|مدور|أول\s*المدة)/i, /opening\s*balance/i].some(p => p.test(text));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.userId;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { text, mentionedContactName, mentionedContactId } = await req.json();
    if (!text) throw new Error('Transaction text is required');

    // Fetch user's accounts and contacts for AI context
    const [accountsRes, contactsRes] = await Promise.all([
      supabaseAdmin.from('accounts').select('account_code, account_name, account_type').eq('user_id', userId),
      supabaseAdmin.from('contacts').select('id, contact_name, contact_type').eq('user_id', userId),
    ]);

    const accounts = accountsRes.data || [];
    const contacts = contactsRes.data || [];
    const accountsList = accounts.map(a => `${a.account_code} - ${a.account_name} (${a.account_type})`).join('\n');
    const contactsList = contacts.map(c => `${c.contact_name} (${c.contact_type})`).join(', ');

    const contactName = mentionedContactName || extractContactName(text);
    const openingBalance = isOpeningBalance(text);

    // Detect payment method
    const lowerText = text.toLowerCase();
    let paymentHint = '';
    if (/آجل|على الحساب|بالدين|دين/.test(lowerText)) paymentHint = 'آجل: استخدم ذمم العملاء أو ذمم الموردين';
    else if (/نقد|كاش|نقداً/.test(lowerText)) paymentHint = 'نقد: استخدم الصندوق';
    else if (/شيك/.test(lowerText)) paymentHint = 'شيك: استخدم شيكات أو أوراق قبض/دفع';
    else if (/تحويل|بنك/.test(lowerText)) paymentHint = 'تحويل: استخدم البنك';

    // Call AI to parse the transaction
    const systemPrompt = `أنت محاسب محترف. حلّل النص التالي واستخرج بيانات المعاملة المالية.

شجرة الحسابات المتاحة:
${accountsList}

جهات الاتصال: ${contactsList || 'لا يوجد'}

${openingBalance ? 'تنبيه: هذه عملية رصيد افتتاحي. نوع المعاملة = "رصيد ابتدائي".' : ''}
${paymentHint ? `تنبيه طريقة الدفع: ${paymentHint}` : ''}
${contactName ? `جهة الاتصال المذكورة: "${contactName}" - استخدم حسابها الخاص إن وجد.` : ''}

أجب بصيغة JSON فقط بدون أي نص إضافي:
{
  "description": "وصف المعاملة",
  "amount": 0,
  "currency": "شيكل",
  "transaction_type": "سند صرف|سند قبض|قيد يومية|فاتورة مشتريات|فاتورة مبيعات|رصيد ابتدائي",
  "debit_account_code": "كود الحساب المدين",
  "credit_account_code": "كود الحساب الدائن",
  "transaction_date": "YYYY-MM-DD",
  "contact_name": "اسم جهة الاتصال إن وجدت أو null"
}`;

    const aiResponse = await fetch('https://api.lovable.dev/v1/chat/completions', {
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
      const errText = await aiResponse.text();
      console.error('AI API error:', errText);
      throw new Error('فشل تحليل المعاملة بواسطة الذكاء الاصطناعي');
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';
    
    // Parse JSON from AI response (handle markdown code blocks)
    let parsed;
    try {
      const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, aiContent];
      parsed = JSON.parse(jsonMatch[1]!.trim());
    } catch {
      console.error('Failed to parse AI response:', aiContent);
      throw new Error('فشل في تحليل رد الذكاء الاصطناعي');
    }

    // Resolve contact ID
    let contactId = mentionedContactId || null;
    if (!contactId && parsed.contact_name) {
      const match = contacts.find(c => 
        c.contact_name.includes(parsed.contact_name) || parsed.contact_name.includes(c.contact_name)
      );
      if (match) contactId = match.id;
    }

    // Insert transaction into local database
    const { data: txData, error: txError } = await supabaseAdmin.from('transactions').insert({
      user_id: userId,
      description: parsed.description || text,
      amount: parsed.amount || 0,
      currency: parsed.currency || 'شيكل',
      transaction_type: parsed.transaction_type || 'قيد يومية',
      debit_account_code: parsed.debit_account_code || '',
      credit_account_code: parsed.credit_account_code || '',
      transaction_date: parsed.transaction_date || new Date().toISOString().split('T')[0],
      contact_id: contactId,
      is_opening_balance: openingBalance,
      reference: `AI-${Date.now()}`,
    }).select().single();

    if (txError) {
      console.error('Insert error:', txError);
      throw new Error('فشل في حفظ المعاملة');
    }

    // Get account names for response
    const debitAcc = accounts.find(a => a.account_code === parsed.debit_account_code);
    const creditAcc = accounts.find(a => a.account_code === parsed.credit_account_code);

    return new Response(JSON.stringify({
      success: true,
      transaction: {
        id: txData.id,
        description: parsed.description,
        amount: parsed.amount,
        currency: parsed.currency,
        transaction_type: parsed.transaction_type,
        debit_account: debitAcc ? `${debitAcc.account_code} - ${debitAcc.account_name}` : parsed.debit_account_code,
        credit_account: creditAcc ? `${creditAcc.account_code} - ${creditAcc.account_name}` : parsed.credit_account_code,
        date: parsed.transaction_date,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
