import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, corsHeaders } from "../_shared/auth.ts";

function isOpeningBalance(text: string): boolean {
  return [/رصيد\s*(ابتدائي|افتتاحي|مدور|أول\s*المدة)/i, /opening\s*balance/i].some(p => p.test(text));
}

function extractJsonFromResponse(response: string): unknown {
  let cleaned = response
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  const jsonStart = cleaned.search(/[\{\[]/);
  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  const jsonEnd = jsonStart !== -1 && cleaned[jsonStart] === '[' ? lastBracket : lastBrace;

  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
    throw new Error('No JSON found in response');
  }

  cleaned = cleaned.substring(jsonStart, jsonEnd + 1);

  try {
    return JSON.parse(cleaned);
  } catch {
    // Fix trailing commas and control characters
    cleaned = cleaned
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .replace(/[\x00-\x1F\x7F]/g, '');
    return JSON.parse(cleaned);
  }
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

    const { text, mentionedContactName, mentionedContactId, editIntent, lastTransactionId } = await req.json();
    if (!text) throw new Error('Transaction text is required');

    // ═══ EDIT/DELETE INTENT HANDLING ═══
    if (editIntent && editIntent.type === 'edit_transaction') {
      const action = editIntent.action || 'edit';
      const target = editIntent.target || '';
      const correction = editIntent.correction || null;

      // Find the target transaction
      let targetTx: any = null;

      // 1. "آخر معاملة" or last recorded
      if (lastTransactionId || /آخر|هلق|هاي|اللي سجلتها/.test(target)) {
        if (lastTransactionId) {
          const { data } = await supabaseAdmin.from('transactions')
            .select('*').eq('id', lastTransactionId).eq('user_id', userId).eq('is_deleted', false).maybeSingle();
          targetTx = data;
        }
        if (!targetTx) {
          const { data } = await supabaseAdmin.from('transactions')
            .select('*').eq('user_id', userId).eq('is_deleted', false)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
          targetTx = data;
        }
      }

      // 2. Reference number match
      if (!targetTx) {
        const refMatch = target.match(/[A-Z]+-\d{4}-\d+/i);
        if (refMatch) {
          const { data } = await supabaseAdmin.from('transactions')
            .select('*').eq('user_id', userId).eq('reference', refMatch[0]).eq('is_deleted', false).maybeSingle();
          targetTx = data;
        }
      }

      // 3. Search by party name from the text
      if (!targetTx && target) {
        const partyWords = target.replace(/فاتورة|سند|معاملة|حساب/g, '').trim();
        if (partyWords.length > 1) {
          const { data } = await supabaseAdmin.from('transactions')
            .select('*').eq('user_id', userId).eq('is_deleted', false)
            .ilike('description', `%${partyWords}%`)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
          targetTx = data;
        }
      }

      // 4. Search by amount
      if (!targetTx) {
        const amtMatch = target.match(/\d+/);
        if (amtMatch) {
          const { data } = await supabaseAdmin.from('transactions')
            .select('*').eq('user_id', userId).eq('is_deleted', false)
            .eq('amount', Number(amtMatch[0]))
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
          targetTx = data;
        }
      }

      if (!targetTx) {
        return new Response(JSON.stringify({
          success: false,
          edit_response: {
            type: 'not_found',
            message: 'ما لقيت المعاملة — حدّدلي أكثر (رقم الفاتورة أو اسم الجهة أو المبلغ)',
            buttons: [{ label: 'افتح السندات ←', action: 'navigate', url: '/transactions' }],
          },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Check linked documents status
      let linkedInvoice: any = null;
      const [invRes, purRes, vchRes, recRes] = await Promise.all([
        supabaseAdmin.from('invoices').select('id, invoice_number, status, paid_amount, total_amount, contact_name')
          .eq('linked_transaction_id', targetTx.id).maybeSingle(),
        supabaseAdmin.from('purchase_invoices').select('id, invoice_number, status, paid_amount, total_amount, supplier_name')
          .eq('linked_transaction_id', targetTx.id).maybeSingle(),
        supabaseAdmin.from('vouchers').select('id, ref_number, status')
          .eq('linked_transaction_id', targetTx.id).maybeSingle(),
        supabaseAdmin.from('receipt_vouchers').select('id, receipt_number, status')
          .eq('linked_transaction_id', targetTx.id).maybeSingle(),
      ]);
      linkedInvoice = invRes.data || purRes.data || null;

      const docStatus = linkedInvoice?.status || vchRes.data?.status || recRes.data?.status || 'draft';
      const paidAmount = linkedInvoice?.paid_amount || 0;
      const totalAmount = linkedInvoice?.total_amount || targetTx.amount || 0;
      const isPaid = paidAmount > 0;
      const docRef = linkedInvoice?.invoice_number || vchRes.data?.ref_number || recRes.data?.receipt_number || targetTx.reference || targetTx.id;
      const partyName = linkedInvoice?.contact_name || linkedInvoice?.supplier_name || targetTx.description || '';

      // ═══ DELETE REQUEST ═══
      if (action === 'delete') {
        if (docStatus === 'draft') {
          await supabaseAdmin.from('transactions').update({ is_deleted: true, idempotency_key: null }).eq('id', targetTx.id);
          return new Response(JSON.stringify({
            success: true,
            edit_response: { type: 'success', message: `✓ تم حذف المعاملة ${docRef} — كانت مسودة` },
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({
          success: false,
          edit_response: {
            type: 'blocked',
            message: `❌ ما أقدر أحذف ${docRef} — هي مؤكدة${isPaid ? ' ومدفوعة' : ''}.`,
            reason: 'حذف المعاملات المؤكدة يكسر القيود المحاسبية والتقارير.',
            alternatives: isPaid
              ? [`أنشئ إشعار دائن بـ ₪${totalAmount} لإلغاء أثرها`]
              : [`غيّر حالتها لـ "ملغاة" من داخل الفاتورة`],
            buttons: isPaid
              ? [{ label: `أنشئ إشعار دائن ₪${totalAmount}`, action: 'create_credit_note', params: { transactionId: targetTx.id, amount: totalAmount } }]
              : [{ label: `افتح الفاتورة ←`, action: 'navigate', url: '/invoices' }],
          },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ═══ EDIT REQUEST ═══
      // Case 1: Draft → edit directly
      if (docStatus === 'draft' || !linkedInvoice) {
        if (correction && correction.field === 'amount' && correction.new_value) {
          const newAmount = Number(correction.new_value);
          await supabaseAdmin.from('transactions').update({ amount: newAmount }).eq('id', targetTx.id);
          if (linkedInvoice) {
            const updateData: any = { subtotal: newAmount, total_amount: newAmount };
            if (!isPaid) { updateData.remaining_amount = newAmount; }
            if (invRes.data) await supabaseAdmin.from('invoices').update(updateData).eq('id', linkedInvoice.id);
            else if (purRes.data) await supabaseAdmin.from('purchase_invoices').update(updateData).eq('id', linkedInvoice.id);
          }
          return new Response(JSON.stringify({
            success: true,
            edit_response: {
              type: 'success',
              message: `✓ تم تعديل ${docRef}\nالمبلغ: ${targetTx.amount} → ₪${newAmount}`,
              buttons: [{ label: `عرض المعاملة ←`, action: 'navigate', url: '/transactions' }],
            },
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({
          success: true,
          edit_response: {
            type: 'open_document',
            message: `المعاملة ${docRef} — افتحها وعدّل من هناك:`,
            buttons: [{ label: `افتح ${docRef} ←`, action: 'navigate', url: '/transactions' }],
          },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Case 2: Confirmed but not paid
      if (['sent', 'confirmed', 'posted', 'approved', 'pending'].includes(docStatus) && !isPaid) {
        return new Response(JSON.stringify({
          success: true,
          edit_response: {
            type: 'open_document',
            message: `الفاتورة ${docRef} مؤكدة بس ما فيها مدفوعات — افتحها وعدّل من هناك:`,
            hint: 'بعد التعديل راجع أن القيد المحاسبي اتحدّث',
            buttons: [{ label: `افتح ${docRef} ←`, action: 'navigate', url: '/invoices' }],
          },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Case 3: Paid → suggest credit/debit note
      if (isPaid && correction?.field === 'amount' && correction.new_value) {
        const newAmount = Number(correction.new_value);
        const diff = newAmount - totalAmount;
        if (Math.abs(diff) < 0.01) {
          return new Response(JSON.stringify({
            success: true, edit_response: { type: 'info', message: 'المبلغ نفسه — ما في شي يتغير' },
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const noteLabel = diff > 0 ? 'إشعار مدين' : 'إشعار دائن';
        const absDiff = Math.abs(diff);
        return new Response(JSON.stringify({
          success: false,
          edit_response: {
            type: 'suggest_note',
            message: `الفاتورة ${docRef} فيها مدفوعات — ما أقدر أعدّل المبلغ مباشرة.`,
            suggestion: {
              title: `الحل: أنشئ ${noteLabel} بمبلغ ₪${absDiff}`,
              explanation: diff > 0
                ? `يعني ${partyName} بده يدفع ₪${absDiff} إضافي`
                : `يعني رح ترجع لـ${partyName} ₪${absDiff}`,
            },
            buttons: [
              { label: `✓ أنشئ ${noteLabel} ₪${absDiff}`, action: 'create_note', params: { type: diff > 0 ? 'debit_note' : 'credit_note', amount: absDiff, transactionId: targetTx.id } },
              { label: 'افتح الفاتورة يدوياً', action: 'navigate', url: '/invoices' },
              { label: 'إلغاء', action: 'cancel' },
            ],
          },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Case 3b: Paid but general edit
      if (isPaid) {
        return new Response(JSON.stringify({
          success: false,
          edit_response: {
            type: 'suggest_note',
            message: `الفاتورة ${docRef} مؤكدة ومدفوعة — ما أقدر أعدّلها مباشرة.`,
            suggestion: { title: 'أنشئ إشعار دائن لإلغاء أثرها أو تصحيحها' },
            buttons: [
              { label: `أنشئ إشعار دائن ₪${totalAmount}`, action: 'create_credit_note', params: { transactionId: targetTx.id, amount: totalAmount } },
              { label: 'افتح الفاتورة ←', action: 'navigate', url: '/invoices' },
            ],
          },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Fallback
      return new Response(JSON.stringify({
        success: true,
        edit_response: {
          type: 'open_document', message: `افتح ${docRef} وعدّلها يدوياً:`,
          buttons: [{ label: `افتح المعاملة ←`, action: 'navigate', url: '/transactions' }],
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // ═══ END EDIT/DELETE HANDLING ═══

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
قواعد المصروفات المباشرة (إلزامية):
عندما يذكر المستخدم دفع مصروف مباشر (كهرباء، ماء، إيجار، محروقات، وقود، بنزين، ديزل، غاز، هاتف، إنترنت، صيانة، ضيافة، قرطاسية، تأمين، رسوم، غرامة، مواصلات، نقل):
- نوع_الحركة = "سند صرف"
- الحساب_المدين = حساب المصروف المناسب من (5xxx)
- الحساب_الدائن = "الصندوق" أو "البنك" حسب السياق

جدول تحويل المصروفات الشائعة (استخدمه حرفياً):
- محروقات / وقود / بنزين / ديزل → "مصاريف التنقل والمواصلات" (5530)
- غاز → "مصروف غاز" (5410)
- كهرباء / ماء / كهرباء وماء → "كهرباء وماء" (5400)
- إيجار → "مصروف إيجار" (5300)
- راتب موظف / رواتب الموظفين → "رواتب وأجور" (5200)
- صيانة → "مصاريف الصيانة" (5510)
- ضيافة / قهوة / ضيوف → "مصاريف الضيافة" (5520)
- هاتف / إنترنت / اتصالات → "مصاريف هاتف وإنترنت" (5580)
- قرطاسية / طباعة / ورق → "مصاريف القرطاسية والطباعة" (5540)
- تأمين → "مصاريف تأمين" (5570)
- رسوم / تراخيص → "رسوم حكومية وتراخيص" (5560)
- إعلان / تسويق → "مصاريف تسويق وإعلان" (5600)
- شحن / بريد / توصيل → "مصاريف البريد والشحن" (5550)
- غرامة / مخالفة → "غرامات وجزاءات" (5950)
- عمولة بنكية / رسوم بنكية → "مصاريف بنكية" (5920)
- أي مصروف غير مذكور أعلاه → "مصروفات أخرى" (5900)

قاعدة ذهبية: سند الصرف دائماً:
  مدين = حساب مصروف (يبدأ بـ 5) أو حساب أصل (يبدأ بـ 1 للموردين)
  دائن = حساب أصل (1xxx) — الصندوق أو البنك فقط
لا تضع حساب إيرادات (4xxx) في أي طرف لسند الصرف.

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
    
    // Parse JSON from AI response with robust extraction
    let parsed;
    try {
      parsed = extractJsonFromResponse(aiContent);
    } catch {
      console.error('Failed to parse AI response:', aiContent);
      // If AI returned a non-JSON conversational response, return it as a chat message
      if (!aiContent.trim().startsWith('{') && !aiContent.trim().startsWith('[') && !aiContent.includes('"نوع_الحركة"')) {
        return new Response(JSON.stringify({
          type: 'chat_response',
          message: aiContent.trim(),
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
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
    let debitAccountCode = parsed['الحساب_المدين'] || parsed['الحساب_مدين'] || parsed.debit_account_code || '';
    let creditAccountCode = parsed['الحساب_الدائن'] || parsed['الحساب_دائن'] || parsed.credit_account_code || '';

    // Try to match by name if the AI returned a name instead of a code
    const resolveAccountCode = (nameOrCode: string): string => {
      if (!nameOrCode) return '';
      
      // 1. Direct code match
      const directMatch = accounts.find(a => a.account_code === nameOrCode);
      if (directMatch) return nameOrCode;

      // 2. "code - name" format
      const codeMatch = nameOrCode.match(/^(\d+)\s*-/);
      if (codeMatch) {
        const codeFound = accounts.find(a => a.account_code === codeMatch[1]);
        if (codeFound) return codeMatch[1];
      }

      // 3. Exact name match
      const exactName = accounts.find(a => a.account_name === nameOrCode);
      if (exactName) return exactName.account_code;

      // 4. Safe partial: account name contains the search term (not reverse)
      const partialMatch = accounts.find(a => a.account_name.includes(nameOrCode));
      if (partialMatch) return partialMatch.account_code;

      return nameOrCode;
    };

    debitAccountCode = resolveAccountCode(debitAccountCode);
    creditAccountCode = resolveAccountCode(creditAccountCode);

    // ═══ Validation: debit ≠ credit ═══
    if (debitAccountCode && creditAccountCode && debitAccountCode === creditAccountCode) {
      const transType = parsed['نوع_الحركة'] || parsed.transaction_type || '';
      if (['سند صرف', 'قيد يومية'].includes(transType)) {
        if (accounts.find(a => a.account_code === '5900')) debitAccountCode = '5900';
        if (accounts.find(a => a.account_code === '1110')) creditAccountCode = '1110';
      } else if (transType === 'سند قبض') {
        if (accounts.find(a => a.account_code === '1110')) debitAccountCode = '1110';
        if (accounts.find(a => a.account_code === '4300')) creditAccountCode = '4300';
      }
      console.warn(`⚠️ debit === credit detected, applied fallback accounts`);
    }

    // ═══ Validation: سند صرف account type checks ═══
    const transactionTypeParsed = parsed['نوع_الحركة'] || parsed.transaction_type || '';
    if (transactionTypeParsed === 'سند صرف') {
      const creditAccount = accounts.find(a => a.account_code === creditAccountCode);
      if (creditAccount && ['إيرادات', 'مصاريف'].includes(creditAccount.account_type)) {
        if (accounts.find(a => a.account_code === '1110')) {
          console.warn(`⚠️ سند صرف: credit was ${creditAccountCode} (${creditAccount.account_type}) → fixed to 1110`);
          creditAccountCode = '1110';
        }
      }
      const debitAccount = accounts.find(a => a.account_code === debitAccountCode);
      if (debitAccount && debitAccount.account_type === 'إيرادات') {
        if (accounts.find(a => a.account_code === '5900')) {
          console.warn(`⚠️ سند صرف: debit was ${debitAccountCode} (إيرادات) → fixed to 5900`);
          debitAccountCode = '5900';
        }
      }
    }

    // Resolve contact ID
    // Resolve contact ID - only use mentionedContactId if it's a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let contactId = (mentionedContactId && uuidRegex.test(mentionedContactId)) ? mentionedContactId : null;
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
      const resolvedType = contactType === 'مورد' ? 'مورد' : 'عميل';
      const parentCode = resolvedType === 'مورد' ? '2110' : '1130';
      const parentName = resolvedType === 'مورد' ? 'ذمم موردين' : 'ذمم عملاء';
      const accountType = resolvedType === 'مورد' ? 'التزامات' : 'أصول';

      // Generate a unique sub-account code under the parent
      const { data: existingSubs } = await supabaseAdmin.from('accounts')
        .select('account_code')
        .eq('user_id', userId)
        .like('account_code', `${parentCode}%`)
        .neq('account_code', parentCode)
        .order('account_code', { ascending: false })
        .limit(1);

      let nextCode = `${parentCode}01`;
      if (existingSubs && existingSubs.length > 0) {
        const lastCode = existingSubs[0].account_code;
        const lastNum = parseInt(lastCode.replace(parentCode, ''), 10) || 0;
        nextCode = `${parentCode}${String(lastNum + 1).padStart(2, '0')}`;
      }

      // Create sub-account in chart of accounts
      const { error: accErr } = await supabaseAdmin.from('accounts').insert({
        user_id: userId,
        account_code: nextCode,
        account_name: contactNameParsed,
        account_type: accountType,
        parent_code: parentCode,
        is_active: true,
        notes: `حساب ${resolvedType} — تم إنشاؤه تلقائياً بواسطة المحاسب الذكي`,
      });
      if (accErr) {
        console.error('Failed to create sub-account for contact:', accErr);
      } else {
        console.log(`Auto-created account ${nextCode} - ${contactNameParsed} under ${parentCode}`);
      }

      // Create contact with linked account
      const { data: newContact, error: contactErr } = await supabaseAdmin.from('contacts').insert({
        user_id: userId,
        contact_name: contactNameParsed,
        contact_type: resolvedType,
        linked_account_code: accErr ? null : nextCode,
        source: 'ai_accountant',
      }).select('id, linked_account_code').single();

      if (!contactErr && newContact) {
        contactId = newContact.id;
        console.log('Auto-created contact:', contactNameParsed, newContact.id, 'linked to', newContact.linked_account_code);

        // Update debit/credit to use the specific contact account instead of generic parent
        if (!accErr) {
          if (resolvedType === 'عميل') {
            // Customer: receivables side uses the sub-account
            if (debitAccountCode === parentCode) debitAccountCode = nextCode;
            if (creditAccountCode === parentCode) creditAccountCode = nextCode;
          } else {
            // Supplier: payables side uses the sub-account
            if (debitAccountCode === parentCode) debitAccountCode = nextCode;
            if (creditAccountCode === parentCode) creditAccountCode = nextCode;
          }
        }
      } else {
        console.error('Failed to auto-create contact:', contactErr);
      }
    }

    // If contact exists and has a linked account, use it instead of generic parent
    if (contactId && !shouldCreateContact) {
      const existingContact = contacts.find(c => c.id === contactId);
      if (existingContact?.linked_account_code) {
        const lac = existingContact.linked_account_code;
        if (debitAccountCode === '1130' || debitAccountCode === '2110') debitAccountCode = lac;
        if (creditAccountCode === '1130' || creditAccountCode === '2110') creditAccountCode = lac;
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

    // ═══ AUTO-CREATE BUSINESS DOCUMENTS ═══
    let invoiceNumber = null;
    let invoiceId = null;
    let voucherId = null;
    let receiptVoucherId = null;

    // Determine document type
    const isSale = ['فاتورة مبيعات'].includes(transactionType) || 
                   (/مبيعات|بعت/.test(description) && transactionType !== 'سند قبض');
    const isPurchase = ['فاتورة مشتريات'].includes(transactionType) || 
                       /مشتريات|اشتريت/.test(description);
    const isReceipt = transactionType === 'سند قبض' || /قبضت|استلمت/.test(description);
    const isPayment = transactionType === 'سند صرف' || (/دفعت|صرفت|سددت/.test(description) && !isPurchase);

    // ═══ Fixed Asset Detection ═══
    const assetKeywords = /سيارة|شاحنة|معدات|آلة|مكينة|أثاث|كمبيوتر|تجهيزات|عقار|أرض|مولد|مكيف|طابعة|خادم|سيرفر/;
    const isFixedAsset = assetKeywords.test(text) && (isPurchase || /اشتريت|جبت/.test(text));

    if (isFixedAsset && amount > 0) {
      // Create fixed asset record
      const assetName = text.match(assetKeywords)?.[0] || 'أصل ثابت';
      const categoryMap: Record<string, string> = {
        'سيارة': 'vehicles', 'شاحنة': 'vehicles',
        'معدات': 'equipment', 'آلة': 'equipment', 'مكينة': 'equipment',
        'أثاث': 'furniture', 'كمبيوتر': 'equipment', 'تجهيزات': 'equipment',
        'عقار': 'buildings', 'أرض': 'land',
        'مولد': 'equipment', 'مكيف': 'equipment', 'طابعة': 'equipment',
        'خادم': 'equipment', 'سيرفر': 'equipment',
      };
      const matchedKeyword = text.match(assetKeywords)?.[0] || '';
      
      // Generate asset number
      const { count: assetCount } = await supabaseAdmin
        .from('assets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      const assetNumber = `AST-${new Date().getFullYear()}-${String((assetCount || 0) + 1).padStart(4, '0')}`;

      const { data: assetData, error: assetErr } = await supabaseAdmin.from('assets').insert({
        user_id: userId,
        asset_number: assetNumber,
        name_ar: assetName,
        acquisition_date: transactionDate,
        acquisition_cost: amount,
        net_book_value: amount,
        depreciation_method: 'straight_line',
        useful_life_years: matchedKeyword === 'أرض' ? null : (matchedKeyword === 'سيارة' || matchedKeyword === 'شاحنة' ? 5 : 10),
        status: 'active',
        description: description,
        supplier_name: contactNameParsed || null,
        notes: 'تم إنشاؤه تلقائياً بواسطة المحاسب الذكي',
      }).select('id, asset_number').single();

      if (assetData) {
        console.log('Auto-created fixed asset:', assetData.asset_number);
      } else {
        console.error('Failed to create fixed asset:', assetErr);
      }
    }

    // ═══ Receipt Voucher (سند قبض) ═══
    if (isReceipt && amount > 0) {
      const { data: recData, error: recErr } = await supabaseAdmin.from('receipt_vouchers').insert({
        user_id: userId,
        amount: amount,
        payment_date: transactionDate,
        payment_method: paymentMethod,
        contact_id: contactId,
        contact_name: contactNameParsed || 'عميل نقدي',
        deposit_account_code: debitAccountCode,
        linked_transaction_id: txData.id,
        notes: description,
        status: 'posted',
      }).select('id, receipt_number').single();

      if (!recErr && recData) {
        receiptVoucherId = recData.id;
        invoiceNumber = recData.receipt_number;
        console.log('Auto-created receipt voucher:', recData.receipt_number);
      } else {
        console.error('Failed to create receipt voucher:', recErr);
      }
    }

    // ═══ Payment Voucher (سند صرف) ═══
    if (isPayment && amount > 0 && !isPurchase) {
      const refNum = `PV-${Date.now()}`;
      const { data: pvData, error: pvErr } = await supabaseAdmin.from('vouchers').insert({
        user_id: userId,
        type: 'صرف',
        ref_number: refNum,
        date: transactionDate,
        amount: amount,
        currency: currency,
        payment_method: paymentMethod,
        description: description,
        contact_id: contactId,
        linked_transaction_id: txData.id,
        status: 'posted',
        notes: 'تم إنشاؤه تلقائياً بواسطة المحاسب الذكي',
      }).select('id, ref_number').single();

      if (!pvErr && pvData) {
        voucherId = pvData.id;
        invoiceNumber = pvData.ref_number;
        console.log('Auto-created payment voucher:', pvData.ref_number);
      } else {
        console.error('Failed to create payment voucher:', pvErr);
      }
    }

    // ═══ Sales Invoice ═══
    if (isSale && amount > 0) {
      const { data: invData, error: invErr } = await supabaseAdmin.from('invoices').insert({
        user_id: userId,
        invoice_type: 'sale',
        contact_id: contactId,
        contact_name: contactNameParsed || 'عميل نقدي',
        invoice_date: transactionDate,
        due_date: paymentMethod === 'آجل' ? null : transactionDate,
        subtotal: amount,
        discount_amount: 0,
        tax_amount: 0,
        total_amount: amount,
        paid_amount: ['نقدي', 'بنك', 'شيك'].includes(paymentMethod) ? amount : 0,
        remaining_amount: ['نقدي', 'بنك', 'شيك'].includes(paymentMethod) ? 0 : amount,
        payment_status: ['نقدي', 'بنك', 'شيك'].includes(paymentMethod) ? 'paid' : 'unpaid',
        payment_method: paymentMethod,
        currency: currency,
        notes: description,
        linked_transaction_id: txData.id,
        source: 'ai_accountant',
        status: 'sent',
      }).select('id, invoice_number').single();

      if (!invErr && invData) {
        invoiceId = invData.id;
        invoiceNumber = invData.invoice_number;
        console.log('Auto-created invoice:', invoiceNumber, invoiceId);

        await supabaseAdmin.from('invoice_items').insert({
          invoice_id: invData.id,
          product_name: description || 'خدمات',
          description: description,
          quantity: 1,
          unit_price: amount,
          total_amount: amount,
        });
      } else {
        console.error('Failed to auto-create invoice:', invErr);
      }
    } else if (isPurchase && amount > 0) {
      const { data: purData, error: purErr } = await supabaseAdmin.from('purchase_invoices').insert({
        user_id: userId,
        supplier_id: contactId,
        supplier_name: contactNameParsed || 'مورد',
        invoice_date: transactionDate,
        subtotal: amount,
        total_amount: amount,
        paid_amount: ['نقدي', 'بنك', 'شيك'].includes(paymentMethod) ? amount : 0,
        remaining_amount: ['نقدي', 'بنك', 'شيك'].includes(paymentMethod) ? 0 : amount,
        payment_method: paymentMethod,
        status: ['نقدي', 'بنك', 'شيك'].includes(paymentMethod) ? 'approved' : 'pending',
        linked_transaction_id: txData.id,
        notes: description,
      }).select('id, invoice_number').single();

      if (!purErr && purData) {
        invoiceId = purData.id;
        invoiceNumber = purData.invoice_number;
        console.log('Auto-created purchase invoice:', invoiceNumber);
      } else {
        console.error('Failed to auto-create purchase invoice:', purErr);
      }
    }

    // ═══ Employee Salary Detection ═══
    const isSalary = /راتب|رواتب|صرّفت راتب|صرفت راتب/.test(text) && /موظف|عامل|عمال/.test(text + ' ' + description);
    if (isSalary && contactNameParsed && amount > 0) {
      // Try to find employee
      const { data: emp } = await supabaseAdmin.from('employees')
        .select('id')
        .eq('user_id', userId)
        .ilike('full_name', `%${contactNameParsed}%`)
        .limit(1)
        .maybeSingle();

      if (emp) {
        const now = new Date();
        await supabaseAdmin.from('employee_payroll').insert({
          user_id: userId,
          employee_id: emp.id,
          period_month: now.getMonth() + 1,
          period_year: now.getFullYear(),
          basic_salary: amount,
          net_salary: amount,
          is_paid: true,
          paid_date: transactionDate,
          linked_transaction_id: txData.id,
        }).then(r => {
          if (r.error) console.error('Failed to create payroll entry:', r.error);
          else console.log('Auto-created payroll entry for:', contactNameParsed);
        });
      } else {
        // Auto-create employee if not found
        const { data: newEmp, error: empErr } = await supabaseAdmin.from('employees').insert({
          user_id: userId,
          full_name: contactNameParsed,
          status: 'active',
          basic_salary: amount,
          hire_date: transactionDate,
          notes: 'تم إنشاؤه تلقائياً بواسطة المحاسب الذكي',
        }).select('id').single();

        if (!empErr && newEmp) {
          console.log('Auto-created employee:', contactNameParsed, newEmp.id);
          const now = new Date();
          await supabaseAdmin.from('employee_payroll').insert({
            user_id: userId,
            employee_id: newEmp.id,
            period_month: now.getMonth() + 1,
            period_year: now.getFullYear(),
            basic_salary: amount,
            net_salary: amount,
            is_paid: true,
            paid_date: transactionDate,
            linked_transaction_id: txData.id,
          }).then(r => {
            if (r.error) console.error('Failed to create payroll entry:', r.error);
            else console.log('Auto-created payroll entry for new employee:', contactNameParsed);
          });
        } else {
          console.error('Failed to auto-create employee:', empErr);
        }
      }
    }

    // ═══ Employee Loan Detection ═══
    const isLoan = /سلف|سلّف|سلفة|أعطيت سلفة/.test(text);
    if (isLoan && contactNameParsed && amount > 0) {
      let { data: emp } = await supabaseAdmin.from('employees')
        .select('id')
        .eq('user_id', userId)
        .ilike('full_name', `%${contactNameParsed}%`)
        .limit(1)
        .maybeSingle();

      // Auto-create employee if not found for loans too
      if (!emp) {
        const { data: newEmp } = await supabaseAdmin.from('employees').insert({
          user_id: userId,
          full_name: contactNameParsed,
          status: 'active',
          hire_date: transactionDate,
          notes: 'تم إنشاؤه تلقائياً بواسطة المحاسب الذكي',
        }).select('id').single();
        if (newEmp) {
          emp = newEmp;
          console.log('Auto-created employee for loan:', contactNameParsed);
        }
      }

      if (emp) {
        await supabaseAdmin.from('employee_loans').insert({
          user_id: userId,
          employee_id: emp.id,
          amount: amount,
          remaining_amount: amount,
          loan_date: transactionDate,
          status: 'active',
          installment_amount: 0,
          notes: 'تم إنشاؤه تلقائياً بواسطة المحاسب الذكي',
        }).then(r => {
          if (r.error) console.error('Failed to create employee loan:', r.error);
          else console.log('Auto-created employee loan for:', contactNameParsed);
        });
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
        invoice_id: invoiceId,
        invoice_number: invoiceNumber,
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
