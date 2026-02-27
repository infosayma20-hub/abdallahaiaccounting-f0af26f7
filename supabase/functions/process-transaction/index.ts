import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, corsHeaders } from "../_shared/auth.ts";

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
      supabaseAdmin.from('contacts').select('id, contact_name, contact_type, linked_account_code').eq('user_id', userId),
    ]);

    const accounts = accountsRes.data || [];
    const contacts = contactsRes.data || [];
    const accountsList = accounts.map(a => `${a.account_code} - ${a.account_name} (${a.account_type})`).join('\n');

    const today = new Date().toISOString().split('T')[0];
    const openingBalance = isOpeningBalance(text);

    // Build contact context for the AI
    let contactContext = '';
    if (mentionedContactId) {
      const c = contacts.find(ct => ct.id === mentionedContactId);
      if (c) {
        contactContext = `جهة الاتصال المحددة: "${c.contact_name}" (${c.contact_type})${c.linked_account_code ? ` - حسابها: ${c.linked_account_code}` : ''}`;
      }
    } else if (mentionedContactName) {
      contactContext = `جهة الاتصال المذكورة: "${mentionedContactName}"`;
    }

    // Full prompt matching Make.com ChatGPT module
    const systemPrompt = `أنت محاسب قانوني خبير ونظام ذكاء محاسبي ذكي.

مهمتك:
تحليل النص العربي المُدخل من المستخدم وتحويله إلى JSON محاسبي دقيق ومتوافق مع شجرة الحسابات المعتمدة.

================================
القواعد العامة:
أرجع JSON فقط بدون أي شرح أو نص إضافي.
ممنوع استخدام Markdown أو \`\`\` أو أي تنسيق.
القيم النصية تكون عربية واضحة.
لو المعلومة غير موجودة صراحة، اتركها فارغة "".
لا تخمّن أسماء أشخاص أو حسابات غير مذكورة.

================================
التواريخ:
تاريخ العملية (التاريخ):
هو تاريخ تنفيذ الحركة الفعلية، استخدم: ${today}

تاريخ الشيك (تاريخ_الشيك):
يُستخرج فقط إذا ذُكر: (شيك، مستحق، بتاريخ، آجل، بعد شهر، بعد 30 يوم، الخ)
إذا لم يُذكر → اجعل "تاريخ_الشيك": ""

================================
العملة:
"شيكل" أو "دولار" أو "دينار"
إذا لم تُذكر العملة صراحة → استخدم "شيكل"

================================
المبلغ:
رقم صحيح فقط، بدون فواصل، بدون كتابة عملة

================================
نوع الحركة (إلزامي):
اختر واحدًا فقط:
- سند قبض (قبضت، استلمت، دخل، قبض شيك، استلم شيك)
- سند صرف (دفعت، صرفت، سحبت، دفعت شيك)
- قيد يومية (تحويل، شيك آجل، راتب، مصروف، تسوية)
- فاتورة مبيعات (بعت، أصدرت فاتورة، مبيعات)
- فاتورة مشتريات (اشتريت، فاتورة مورد)
${openingBalance ? '- رصيد ابتدائي (رصيد ابتدائي، رصيد افتتاحي، رصيد مدور)' : ''}

================================
الشيكات:
إذا ذُكر شيك:
طريقة_الدفع = "شيك"
أضف: رقم_الشيك (إن وُجد)، بنك_الشيك (إن وُجد)
حالة_الشيك: "آجل" إذا له تاريخ مستقبلي، "مستحق" إذا بتاريخ اليوم أو سابق
وإلا: طريقة_الدفع = "نقدي"

================================
الحسابات (مدين / دائن):
المدين = من يستلم المال
الدائن = من يدفع المال
استخدم فقط الحسابات من شجرة الحسابات التالية. لا تُنشئ حسابات جديدة خارجها.

${accountsList}

================================
العملاء والموردين (ذكاء مهم):
${contactContext}

إذا ذُكر اسم شخص أو جهة:
- إذا ذُكر (عميل، زبون) → النوع = "عميل"
- إذا ذُكر (مورد، شركة، محل) → النوع = "مورد"
- إذا لم يُذكر نوعه صراحة: في القبض → عميل، في الدفع → مورد

أضف الحقول التالية:
- الطرف_الاسم: الاسم الحقيقي فقط بدون أدوات الجر
- الطرف_النوع: "عميل" أو "مورد"
- إنشاء_طرف_جديد: true → إذا الاسم غير عام (ليس: البنك، الصندوق)، false → إذا حساب عام

================================
الرواتب (تفريق متقدم ودقيق):
إذا ذُكرت كلمة (راتب / رواتب) وكان المقصود راتب مستلم للمستخدم نفسه مثل:
"نزل راتبي"، "استلمت راتبي"، "راتب إلي"، "قبضت راتب"، "أعطوني راتب"
عندها يُعامل الراتب كـ إيراد وليس مصروف:
- نوع_الحركة = "سند قبض"
- الحساب_المدين = "البنك - حساب جاري شيكل فلسطين" أو "الصندوق" حسب النص
- الحساب_الدائن = "إيرادات الرواتب والأجور"
- لا تستخدم "مصاريف الرواتب"

إذا كان الراتب خارج من الشركة (دفعت رواتب، رواتب الموظفين):
- الحساب_المدين = "مصاريف الرواتب"
- الحساب_الدائن = "الصندوق" أو "البنك" حسب النص

قاعدة ذهبية: الراتب الداخل على المستخدم = إيراد. الراتب الخارج من الشركة = مصروف.

================================
رأس المال:
إذا احتوى النص على: (رأس مال / ضخ رأس مال / استثمار من المالك / تمويل من المالك)
- نوع_الحركة = "قيد يومية"
- الحساب_المدين: "الصندوق" إذا نقداً، "البنك" إذا بنك، إن لم يُذكر → "الصندوق"
- الحساب_الدائن: "رأس المال"
- حتى لو احتوى النص على كلمة "دفعت"، لا تعتبرها سند صرف
- لا تُنشئ طرف جديد

إذا احتوى النص على: (سحبت من رأس المال / سحب شخصي / مسحوبات)
- نوع_الحركة = "قيد يومية"
- الحساب_المدين = "رأس المال"
- الحساب_الدائن: "الصندوق" إذا نقداً، "البنك" إذا بنك

================================
قواعد تحديد الحسابات:
- دفع لمورد → مدين: الموردين / دائن: الصندوق (إلا إذا ذكر بنك)
- قبض من زبون → مدين: الصندوق / دائن: العملاء
- إذا ذُكر بنك → الدائن أو المدين يكون البنك حسب السياق

================================
قواعد مهمة جداً:
1) لا تدمج كلمات مثل "المورد" أو "الزبون" داخل الاسم.
2) استخرج الاسم الحقيقي فقط بدون أدوات الجر (لـ، للمورد، من المورد، إلى الزبون…).
3) إذا ذُكر "مورد" اجعل الطرف_النوع = مورد.
4) إذا ذُكر "زبون" أو "عميل" اجعل الطرف_النوع = عميل.

================================
شكل الـ JSON النهائي (إجباري):
{
"نوع_الحركة":"",
"التاريخ":"${today}",
"تاريخ_الشيك":"",
"المبلغ":0,
"العملة":"شيكل",
"طريقة_الدفع":"نقدي",
"رقم_الشيك":"",
"بنك_الشيك":"",
"حالة_الشيك":"",
"الحساب_المدين":"",
"الحساب_الدائن":"",
"الطرف_الاسم":"",
"الطرف_النوع":"",
"إنشاء_طرف_جديد":false,
"البيان":"",
"المرجع":""
}`;

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

    console.log('AI parsed result:', JSON.stringify(parsed));

    // Map Arabic field names to English for DB insertion
    const transactionType = parsed['نوع_الحركة'] || parsed.transaction_type || 'قيد يومية';
    const amount = parsed['المبلغ'] || parsed.amount || 0;
    const currency = parsed['العملة'] || parsed.currency || 'شيكل';
    const description = parsed['البيان'] || parsed.description || text;
    const contactNameParsed = parsed['الطرف_الاسم'] || parsed.contact_name || '';
    const contactType = parsed['الطرف_النوع'] || '';
    const shouldCreateContact = parsed['إنشاء_طرف_جديد'] || false;
    const paymentMethod = parsed['طريقة_الدفع'] || 'نقدي';
    const chequeNumber = parsed['رقم_الشيك'] || '';
    const chequeBank = parsed['بنك_الشيك'] || '';
    const chequeStatus = parsed['حالة_الشيك'] || '';
    const chequeDate = parsed['تاريخ_الشيك'] || '';
    const reference = parsed['المرجع'] || parsed.reference || `AI-${Date.now()}`;

    // Validate and fix transaction_date
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    let transactionDate = parsed['التاريخ'] || parsed.transaction_date || today;
    if (!dateRegex.test(transactionDate)) transactionDate = today;

    // Resolve account codes - AI returns account NAMES, we need CODES
    let debitAccountCode = parsed['الحساب_المدين'] || parsed.debit_account_code || '';
    let creditAccountCode = parsed['الحساب_الدائن'] || parsed.credit_account_code || '';

    // Try to match by name if the AI returned a name instead of a code
    const resolveAccountCode = (nameOrCode: string): string => {
      // If already a valid code
      const directMatch = accounts.find(a => a.account_code === nameOrCode);
      if (directMatch) return nameOrCode;

      // Try matching by name (exact or partial)
      const byName = accounts.find(a => 
        a.account_name === nameOrCode || 
        a.account_name.includes(nameOrCode) || 
        nameOrCode.includes(a.account_name)
      );
      if (byName) return byName.account_code;

      // Try matching "code - name" format
      const codeMatch = nameOrCode.match(/^(\d+)\s*-/);
      if (codeMatch) return codeMatch[1];

      return nameOrCode;
    };

    debitAccountCode = resolveAccountCode(debitAccountCode);
    creditAccountCode = resolveAccountCode(creditAccountCode);

    // Resolve contact ID
    let contactId = mentionedContactId || null;
    if (!contactId && contactNameParsed) {
      const match = contacts.find(c => 
        c.contact_name === contactNameParsed ||
        c.contact_name.includes(contactNameParsed) || 
        contactNameParsed.includes(c.contact_name)
      );
      if (match) contactId = match.id;
    }

    // Auto-create contact if AI says so and contact doesn't exist
    if (shouldCreateContact && contactNameParsed && !contactId) {
      const { data: newContact, error: contactErr } = await supabaseAdmin.from('contacts').insert({
        user_id: userId,
        contact_name: contactNameParsed,
        contact_type: contactType === 'مورد' ? 'مورد' : 'عميل',
      }).select('id').single();

      if (!contactErr && newContact) {
        contactId = newContact.id;
        console.log('Auto-created contact:', contactNameParsed, newContact.id);
      } else {
        console.error('Failed to auto-create contact:', contactErr);
      }
    }

    // Insert transaction
    const { data: txData, error: txError } = await supabaseAdmin.from('transactions').insert({
      user_id: userId,
      description: description,
      amount: amount,
      currency: currency,
      transaction_type: transactionType,
      debit_account_code: debitAccountCode,
      credit_account_code: creditAccountCode,
      transaction_date: transactionDate,
      contact_id: contactId,
      is_opening_balance: openingBalance || transactionType === 'رصيد ابتدائي',
      reference: reference || `AI-${Date.now()}`,
    }).select().single();

    if (txError) {
      console.error('Insert error:', txError);
      throw new Error('فشل في حفظ المعاملة');
    }

    // Auto-create cheque record if payment method is cheque
    let chequeId = null;
    if (paymentMethod === 'شيك' && amount > 0) {
      const isReceived = ['سند قبض'].includes(transactionType);
      const chequeType = isReceived ? 'صادر' : 'وارد';
      
      let parsedChequeDate = chequeDate;
      if (chequeDate && !dateRegex.test(chequeDate)) {
        parsedChequeDate = today;
      }

      const { data: chequeData, error: chequeErr } = await supabaseAdmin.from('cheques').insert({
        user_id: userId,
        cheque_type: isReceived ? 'وارد' : 'صادر',
        amount: amount,
        currency: currency,
        cheque_date: parsedChequeDate || transactionDate,
        cheque_number: chequeNumber || null,
        bank_name: chequeBank || null,
        party_name: contactNameParsed || 'غير محدد',
        party_type: contactType === 'مورد' ? 'مورد' : 'عميل',
        status: chequeStatus === 'آجل' ? 'مسجل' : 'مسجل',
        linked_account: debitAccountCode,
        notes: `تم إنشاؤه تلقائياً من المعاملة: ${txData.id}`,
      }).select('id').single();

      if (!chequeErr && chequeData) {
        chequeId = chequeData.id;
        console.log('Auto-created cheque:', chequeId);
      } else {
        console.error('Failed to auto-create cheque:', chequeErr);
      }
    }

    // Get account names for response
    const debitAcc = accounts.find(a => a.account_code === debitAccountCode);
    const creditAcc = accounts.find(a => a.account_code === creditAccountCode);

    return new Response(JSON.stringify({
      success: true,
      transaction: {
        id: txData.id,
        description: description,
        amount: amount,
        currency: currency,
        transaction_type: transactionType,
        debit_account: debitAcc ? `${debitAcc.account_code} - ${debitAcc.account_name}` : debitAccountCode,
        credit_account: creditAcc ? `${creditAcc.account_code} - ${creditAcc.account_name}` : creditAccountCode,
        date: transactionDate,
        payment_method: paymentMethod,
        contact_name: contactNameParsed,
        contact_created: shouldCreateContact && contactId ? true : false,
        cheque_id: chequeId,
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
