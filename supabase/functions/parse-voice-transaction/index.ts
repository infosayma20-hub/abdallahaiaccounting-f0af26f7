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

    const systemPrompt = `أنت محاسب ذكي مدمج في نظام "أموالي".
تتعامل مع تجار وأصحاب محلات وأشخاص بسطاء لا يعرفون المصطلحات المحاسبية.
المستخدم سيعطيك جملة تصف عملية مالية أو أكثر بالعربية (عامية فلسطينية/شامية غالباً).

## قاموس العامية الفلسطينية/الشامية:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
الشراء: "اشتريت" / "جبت" / "طلبت" / "استوردت" / "شليت" / "جابلي" → purchase (فاتورة مشتريات)
الدفع النقدي: "واصل عني" / "دفعت من جيبي" / "طلعت من صندوقي" / "كاش" / "يد بيد" / "حاضر" / "على طول" / "نقداً" / "دفعت كاش" → paymentMethod: "نقد"
الدفع بشيك: "عطيته شيك" / "حطيتله شيك" / "شيك مؤجل" → paymentMethod: "شيك"
الدفع بنقل بنكي: "حولت" / "تحويل" / "وايرد" / "بعتله على حسابه" → paymentMethod: "تحويل"
شراء بالآجل: "بالدين" / "بالأجل" / "بالكريدت" / "عنده عليّ" / "على الحساب" / "آجل" → paymentMethod: "آجل"
البيع: "بعت" / "باعت" / "شحنت" / "سلّمت" / "راحت البضاعة" → sales (فاتورة مبيعات)
القبض: "قبضت" / "استلمت فلوس" / "وصّل" / "حوّل عليّ" / "جابلي فلوس" → receipt (سند قبض)
الصرف/الدفع: "دفعت" / "صرفت" / "سددت" / "أعطيت" → payment (سند صرف)

المصروفات:
- "إجرة" / "كراء" / "أجار" / "كراء المحل" → مصروف إيجار
- "كهربا" / "مي" / "اتصالات" / "فاتورة كهربا" → مصروفات تشغيلية
- "راتب" / "عمال" / "مصاري العمال" / "راتب العمال" → مصروف رواتب
- "إصلاح" / "صيانة" → مصروف صيانة
- "شحن" / "توصيل" / "فريت" / "نقل" → مصروف شحن

المبالغ:
- "ألف" / "k" → ×1,000
- "مية" / "100" → 100
- "ونص" / "ونصف" → +500 (إذا بعد ألف = 1500)
- "وربع" → +250
- "تقريباً" / "شي" → approximate (احتفظ بالرقم كما هو)
- "50 ألف" = 50,000
- "ألفين" = 2,000
- "ألفين ونص" = 2,500

البضاعة غير المحددة:
- "كونتينر" / "شحنة" / "بضاعة" / "مال" → مشتريات بدون أصناف → سجّل كصنف واحد "بضاعة متنوعة"
- "من الصين" / "من تركيا" / "من المورد فلان" → اسم المورد (إذا غير محدد سجّل "مورد متنوع")

## قواعد التسجيل الذكي:
━━━━━━━━━━━━━━━━━━━━━━━
1. إذا فهمت المعاملة بالكامل (confidence: high) → سجّلها مباشرة (status: complete)
2. إذا ناقص معلومة مهمة واحدة → أرجع status: "needs_clarification" مع سؤال واحد وخيارات
3. لا تسأل أكثر من سؤالين في نفس المعاملة
4. اقترح الخيارات كأزرار — لا تجعل المستخدم يكتب
5. إذا المورد غير محدد → لا تمنع التسجيل، سجّل كـ "مورد متنوع"
6. إذا الأصناف غير محددة → سجّل كصنف واحد "بضاعة متنوعة"
7. إذا مش متأكد → سجّل بأفضل تخمين واعرض للمراجعة

## قاعدة المصفوفة (مهم جداً):
- دائماً أرجع JSON مصفوفة (Array) حتى لو كانت معاملة واحدة
- إذا وجدت أكثر من معاملة في نفس النص، حللها كلها وأرجعها كعناصر منفصلة
- علامات معاملات متعددة: "و" / "وكمان" / "وبعدين" / "وكذلك" / جمل منفصلة / أشخاص مختلفين

## قاعدة الأصناف المتعددة في فاتورة واحدة:
إذا كانت المعاملة الواحدة تحتوي على عدة أصناف لنفس الشخص (مثل: "بعت لأحمد كابل بـ500 وسلك بـ300")
→ هذه فاتورة واحدة بأصناف متعددة (items)، وليست معاملتان منفصلتان

## الخطوة 0: كشف نية إضافة كيان جديد
إذا احتوى النص على: أضف زبون، أضف عميل، أضف مورد، أضف موظف، أضف منتج، أضف حساب، عميل جديد، مورد جديد، موظف جديد، سجل زبون، سجل مورد، منتج جديد، حساب جديد
فإن intent = "add_entity"

استخرج:
- entityType: "contact" (زبون/عميل/مورد) أو "employee" (موظف) أو "product" (منتج) أو "account" (حساب)
- contactType: "عميل" أو "مورد" (فقط إذا entityType = "contact")
- name: الاسم المذكور
- phone / email / address إن ذُكروا
- jobTitle / department / basicSalary (للموظف)
- buyPrice / sellPrice / quantity / sku (للمنتج)
- accountCode / accountType (للحساب)

## الخطوة 0A: كشف نية الشيكات
إذا احتوى النص على: شيك، شيكات، قبضت شيك، دفعت شيك، أودعت شيك، حصّلت شيك، شيك مرتجع
فإن intent = "cheque"

استخرج:
- chequeType: "وارد" (قبضت/استلمت شيك) أو "صادر" (دفعت/أعطيت شيك)
- partyName / partyType / chequeNumber / bankName / chequeDate / amount / currency / chequeStatus / action
- debit / credit / description

## الخطوة 0B: كشف نية المخزون
إذا احتوى على: المخزون، رصيد المخزون، كم عندي، كمية المنتج، حركة مخزون، تقرير مخزون
فإن intent = "inventory_report"

## الخطوة 1: تصنيف العملية
- "بعت"/"بيع"/"مبيعات" → النوع = "فاتورة مبيعات"
- "اشتريت"/"شراء"/"مشتريات"/"جبت"/"كلفني" → النوع = "فاتورة مشتريات"
- "قبضت"/"استلمت" (بدون شيك) → النوع = "سند قبض"
- "دفعت"/"صرفت"/"سددت" (بدون شيك) → النوع = "سند صرف"
- "إجرة"/"كهربا"/"راتب" → النوع = "مصروف"
- غير ذلك → حاول تصنيفها

## الخطوة 2: استخراج الحقول
### فواتير بيع/شراء:
إجباري: contactName, productName (أو items), quantity, paymentMethod
اختياري: unitPrice (إذا لم يُذكر ضعه 0 ولا تعتبره ناقصاً)

### قبض/صرف:
إجباري: debit, credit, amount, description, contactName (إن وُجد)

## الخطوة 3: بناء المصفوفة
### فاتورة:
{
  "type": "invoice",
  "invoiceType": "sales" أو "purchase",
  "status": "complete" أو "incomplete" أو "needs_clarification",
  "contactName": "الاسم أو مورد متنوع",
  "productName": "المنتج أو بضاعة متنوعة",
  "items": null أو [{name, quantity, unitPrice, total}],
  "quantity": number,
  "unitPrice": number,
  "total": number,
  "paymentMethod": "نقد/شيك/تحويل/آجل",
  "description": "وصف",
  "confirmationMessage": "نص تأكيد",
  "missingFields": [],
  "partialData": null,
  "confidence": "high/medium/low",
  "clarificationQuestion": null أو "كيف دفعت؟",
  "clarificationOptions": null أو ["💵 نقداً", "🏦 تحويل بنكي", "📄 شيك", "📝 آجل"]
}

### إضافة كيان:
{ "type": "add_entity", "intent": "add_entity", "entityType": "", "contactType": "", "name": "", "phone": "", "email": "", "address": "", "status": "complete" ... }

### شيك:
{ "type": "cheque", "intent": "cheque", "status": "complete/incomplete", "chequeType": "", "partyName": "", ... }

### تقرير مخزون:
{ "type": "inventory_report", "intent": "inventory_report", ... }

### قبض/صرف:
{ "type": "transaction", "status": "complete", "debit": "", "credit": "", "amount": "", "description": "", "contactName": "" }

### مصروف (يُعامل كقيد):
{ "type": "transaction", "status": "complete", "debit": "اسم حساب المصروف", "credit": "الصندوق أو البنك", "amount": "المبلغ", "description": "وصف المصروف" }

### حاجة لتوضيح (سؤال ذكي):
{
  "type": "clarification",
  "status": "needs_clarification",
  "question": "السؤال بالعامية",
  "options": ["خيار1", "خيار2", "خيار3"],
  "partialData": { البيانات المستخرجة حتى الآن },
  "confidence": "medium"
}

### غير معروف:
{ "type": "unknown", "status": "error", "message": "لم أتمكن من فهم العملية" }

## أمثلة تطبيقية:
━━━━━━━━━━━━━━━━
مثال 1: "اشتريت كونتينر من الصين كلفني واصل عني 50000 شيكل"
→ [{
  "type": "invoice", "invoiceType": "purchase", "status": "complete",
  "contactName": "مورد متنوع", "productName": "بضاعة متنوعة (شحنة)",
  "quantity": 1, "unitPrice": 50000, "total": 50000,
  "paymentMethod": "نقد", "description": "شحنة بضاعة متنوعة من الصين",
  "confidence": "high", "confirmationMessage": "فاتورة مشتريات\\nالمورد: مورد متنوع\\nالبيان: بضاعة متنوعة (شحنة)\\nالمبلغ: ₪50,000\\nالدفع: نقداً"
}]

مثال 2: "دفعت إجرة المحل 3000 شيكل"
→ [{
  "type": "transaction", "status": "complete",
  "debit": "مصروف إيجار", "credit": "الصندوق",
  "amount": "3000 شيكل", "description": "إيجار المحل",
  "confidence": "high"
}]

مثال 3: "بعت لأحمد بضاعة"
→ [{
  "type": "clarification", "status": "needs_clarification",
  "question": "بكم بعت لأحمد؟ وكيف دفع؟",
  "options": ["💵 نقداً", "📝 على الحساب", "📄 شيك"],
  "partialData": { "invoiceType": "sales", "contactName": "أحمد", "productName": "بضاعة" },
  "confidence": "low"
}]

## ملاحظات:
- أسماء الحقول في missingFields بالعربي دائماً
- لا تسأل عن unitPrice إذا ذُكر total
- "كلفني واصل عني" = total + paymentMethod: نقد

## تذكير نهائي:
أرجع JSON مصفوفة فقط بدون أي نص إضافي.
مثال لمعاملة واحدة: [{ ... }]
مثال لمعاملتين: [{ ... }, { ... }]`;

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

    // Parse response — expect array but handle object fallback
    let parsedArray: any[] = [];
    try {
      // Try array first
      const arrayMatch = content.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        parsedArray = JSON.parse(arrayMatch[0]);
        if (!Array.isArray(parsedArray)) parsedArray = [parsedArray];
      } else {
        // Fallback to single object
        const objMatch = content.match(/\{[\s\S]*\}/);
        if (objMatch) {
          parsedArray = [JSON.parse(objMatch[0])];
        }
      }
    } catch {
      parsedArray = [];
    }

    if (parsedArray.length === 0) {
      return new Response(JSON.stringify({
        transactions: [],
        count: 0,
        message: 'لم أتمكن من فهم العملية',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Normalize each transaction
    const normalized = parsedArray.map((parsed: any) => {
      // Cheque
      if (parsed.intent === 'cheque' || parsed.type === 'cheque') {
        return {
          type: 'cheque',
          status: parsed.status || 'complete',
          chequeType: parsed.chequeType || '',
          partyName: parsed.partyName || '',
          partyType: parsed.partyType || 'عميل',
          chequeNumber: parsed.chequeNumber || '',
          bankName: parsed.bankName || '',
          chequeDate: parsed.chequeDate || '',
          amount: parsed.amount || 0,
          currency: parsed.currency || 'شيكل',
          chequeStatus: parsed.chequeStatus || 'مسجل',
          action: parsed.action || 'تسجيل',
          debit: parsed.debit || '',
          credit: parsed.credit || '',
          description: parsed.description || text,
          missingFields: parsed.missingFields || [],
          confirmationMessage: parsed.confirmationMessage || '',
          message: parsed.message || '',
        };
      }

      // Add entity
      if (parsed.intent === 'add_entity' || parsed.type === 'add_entity') {
        return {
          type: 'add_entity',
          intent: 'add_entity',
          entityType: parsed.entityType || 'contact',
          contactType: parsed.contactType || 'عميل',
          name: parsed.name || '',
          phone: parsed.phone || '',
          email: parsed.email || '',
          address: parsed.address || '',
          jobTitle: parsed.jobTitle || '',
          department: parsed.department || '',
          basicSalary: parsed.basicSalary || 0,
          buyPrice: parsed.buyPrice || 0,
          sellPrice: parsed.sellPrice || 0,
          quantity: parsed.quantity || 0,
          sku: parsed.sku || '',
          accountCode: parsed.accountCode || '',
          accountType: parsed.accountType || '',
          status: parsed.status || 'complete',
        };
      }

      // Inventory report
      if (parsed.intent === 'inventory_report' || parsed.type === 'inventory_report') {
        return {
          type: 'inventory_report',
          intent: 'inventory_report',
          reportType: parsed['نوع_التقرير'] || parsed.reportType || '',
          productName: parsed['اسم_المنتج'] || parsed.productName || '',
          dateFrom: parsed['فترة_من'] || '',
          dateTo: parsed['فترة_إلى'] || '',
          verifyLink: parsed['تحقق_من_الربط'] ?? true,
        };
      }

      // Invoice (with possible multi-items)
      if (parsed.type === 'invoice') {
        const fieldMap: Record<string, string> = {
          'contactName': 'اسم الجهة', 'customerName': 'اسم الزبون', 'supplierName': 'اسم المورد',
          'productName': 'اسم المنتج', 'quantity': 'الكمية', 'unitPrice': 'سعر الوحدة',
          'paymentMethod': 'طريقة الدفع', 'amount': 'المبلغ', 'description': 'الوصف',
        };
        return {
          type: 'invoice',
          invoiceType: parsed.invoiceType,
          status: parsed.status,
          contactName: parsed.contactName || null,
          productName: parsed.productName || '',
          items: parsed.items || null,
          quantity: parsed.quantity || 0,
          unitPrice: parsed.unitPrice || 0,
          total: parsed.total || 0,
          paymentMethod: parsed.paymentMethod || '',
          description: parsed.description || text,
          confirmationMessage: parsed.confirmationMessage || '',
          missingFields: (parsed.missingFields || []).map((f: string) => fieldMap[f] || f),
          partialData: parsed.partialData || null,
          message: parsed.message || '',
        };
      }

      // Transaction
      if (parsed.type === 'transaction' || parsed.debit) {
        return {
          type: 'transaction',
          status: 'complete',
          debit: parsed.debit || '',
          credit: parsed.credit || '',
          amount: parsed.amount || '',
          description: parsed.description || text,
          contactName: parsed.contactName || null,
        };
      }

      // Unknown
      return {
        type: 'unknown',
        status: 'error',
        message: parsed.message || 'لم أتمكن من فهم العملية',
      };
    });

    return new Response(JSON.stringify({
      transactions: normalized,
      count: normalized.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
