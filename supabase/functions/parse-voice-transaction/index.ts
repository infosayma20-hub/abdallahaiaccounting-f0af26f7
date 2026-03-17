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

## الخطوة 0: كشف نية إضافة كيان جديد
إذا احتوى النص على: أضف زبون، أضف عميل، أضف مورد، أضف موظف، أضف منتج، أضف حساب، عميل جديد، مورد جديد، موظف جديد، سجل زبون، سجل مورد
فإن intent = "add_entity"

استخرج:
- entityType: "contact" (زبون/عميل/مورد) أو "employee" (موظف) أو "product" (منتج) أو "account" (حساب)
- contactType: "عميل" أو "مورد" (فقط إذا entityType = "contact")
- name: الاسم المذكور
- phone: رقم الهاتف إن ذُكر
- email: البريد إن ذُكر
- address: العنوان إن ذُكر

أرجع JSON:
{
  "intent": "add_entity",
  "type": "add_entity",
  "entityType": "contact",
  "contactType": "عميل" أو "مورد",
  "name": "",
  "phone": "",
  "email": "",
  "address": "",
  "status": "complete"
}


## الخطوة 0A: كشف نية الشيكات
إذا احتوى النص على: شيك، شيكات، قبضت شيك، دفعت شيك، أودعت شيك، حصّلت شيك، شيك مرتجع
فإن intent = "cheque"

استخرج:
- نوع_الشيك: "وارد" (قبضت/استلمت شيك) أو "صادر" (دفعت/أعطيت شيك)
- الطرف_الاسم: اسم الجهة
- الطرف_النوع: "عميل" أو "مورد"
- رقم_الشيك: إن ذُكر
- البنك: إن ذُكر
- تاريخ_الشيك: التاريخ المذكور (صيغة YYYY-MM-DD)
- المبلغ: الرقم
- العملة: شيكل/دينار/دولار
- الحالة: "آجل" إذا التاريخ مستقبلي، "مستحق" إذا اليوم أو ماضي
- إجراء: "تسجيل" / "إيداع" / "تحصيل" / "إرجاع"

القيد المحاسبي للشيك الوارد عند التسجيل:
مدين: شيكات واردة، دائن: العملاء (لا يؤثر على الصندوق/البنك)

القيد المحاسبي للشيك الصادر عند التسجيل:
مدين: الموردين، دائن: شيكات صادرة (لا يؤثر على البنك)

عند تحصيل شيك وارد: مدين: البنك، دائن: شيكات واردة
عند صرف شيك صادر: مدين: شيكات صادرة، دائن: البنك

أرجع JSON:
{
  "intent": "cheque",
  "type": "cheque",
  "status": "complete" أو "incomplete",
  "chequeType": "وارد" أو "صادر",
  "partyName": "",
  "partyType": "عميل" أو "مورد",
  "chequeNumber": "",
  "bankName": "",
  "chequeDate": "",
  "amount": 0,
  "currency": "",
  "chequeStatus": "آجل" أو "مستحق",
  "action": "تسجيل",
  "debit": "",
  "credit": "",
  "description": "",
  "missingFields": [],
  "confirmationMessage": ""
}

إذا بعض الحقول ناقصة (المبلغ أو التاريخ أو الاسم):
status = "incomplete" مع missingFields

## الخطوة 0B: كشف نية المخزون
إذا احتوى نص المستخدم على أي من الكلمات التالية:
المخزون، رصيد المخزون، كم عندي، كمية المنتج، حركة مخزون، تقرير مخزون، قيمة المخزون، تحليل مخزون، منتجات منخفضة، منتجات ناقصة، تكلفة المنتج، ربحية المنتج

فإن intent = "inventory_report"

في هذه الحالة لا تنشئ أي حركة مالية أو فاتورة أو سند. بدلاً من ذلك حدد نوع التقرير:
- سؤال عن منتج محدد (مثل "كم عندي من كابل كهرباء") → نوع_التقرير = "رصيد منتج"
- "اعرض حركة X" → نوع_التقرير = "حركة منتج"
- "قيمة المخزون" → نوع_التقرير = "تقييم المخزون"
- "منتجات منخفضة" أو "ناقصة" → نوع_التقرير = "منتجات منخفضة"
- "تحليل ربحية X" → نوع_التقرير = "تحليل ربحية منتج"

أرجع JSON:
{
  "intent": "inventory_report",
  "نوع_التقرير": "",
  "اسم_المنتج": "",
  "فترة_من": "",
  "فترة_إلى": "",
  "تحقق_من_الربط": true
}

## الخطوة 1: تصنيف العملية (إذا لم تكن شيك أو مخزون)
- إذا تضمن النص "بعت" أو "بيع" أو "مبيعات" أو ما يشير للبيع → النوع = "فاتورة مبيعات"
- إذا تضمن النص "اشتريت" أو "شراء" أو "مشتريات" أو ما يشير للشراء → النوع = "فاتورة مشتريات"
- إذا تضمن "قبضت" أو "استلمت" أو "تحصيل" (بدون كلمة شيك) → النوع = "سند قبض"
- إذا تضمن "دفعت" أو "صرفت" أو "سددت" (بدون كلمة شيك) → النوع = "سند صرف"
- غير ذلك → حاول تصنيفها

## الخطوة 2: استخراج الحقول

### لعمليات البيع ("بعت"):
المطلوب (إجباري):
- اسم الزبون (customerName)
- اسم المنتج/الخدمة (productName)
- الكمية (quantity)
- طريقة الدفع: نقد / شيك / تحويل / آجل (paymentMethod)
اختياري:
- سعر الوحدة (unitPrice) - إذا لم يُذكر، ضعه 0 ولا تعتبره ناقصاً

### لعمليات الشراء ("اشتريت"):
المطلوب (إجباري):
- اسم المورد (supplierName)
- اسم المنتج/الخدمة (productName)
- الكمية (quantity)
- طريقة الدفع (paymentMethod)
اختياري:
- سعر الوحدة (unitPrice) - إذا لم يُذكر، ضعه 0 ولا تعتبره ناقصاً

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
  "message": "تقريباً انتهينا 🙌\nلكن أحتاج المعلومات التالية لإكمال العملية:",

ملاحظة مهمة جداً: يجب أن تكون أسماء الحقول في missingFields بالعربي دائماً. استخدم هذا التحويل:
- contactName أو customerName أو supplierName → "اسم الجهة"
- productName → "اسم المنتج"
- quantity → "الكمية"
- unitPrice → "سعر الوحدة"
- paymentMethod → "طريقة الدفع"
- amount → "المبلغ"
- description → "الوصف"
لا تستخدم أسماء إنجليزية أبداً في missingFields.
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
- إذا ذُكر "شيك" في سياق فاتورة → paymentMethod = "شيك"
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

    // Handle cheque intent
    if (parsed.intent === 'cheque' || parsed.type === 'cheque') {
      return new Response(JSON.stringify({
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
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Handle inventory report intent
    if (parsed.intent === 'inventory_report') {
      return new Response(JSON.stringify({
        type: 'inventory_report',
        intent: 'inventory_report',
        reportType: parsed['نوع_التقرير'] || '',
        productName: parsed['اسم_المنتج'] || '',
        dateFrom: parsed['فترة_من'] || '',
        dateTo: parsed['فترة_إلى'] || '',
        verifyLink: parsed['تحقق_من_الربط'] ?? true,
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
        missingFields: (parsed.missingFields || []).map((f: string) => {
          const fieldMap: Record<string, string> = {
            'contactName': 'اسم الجهة', 'customerName': 'اسم الزبون', 'supplierName': 'اسم المورد',
            'productName': 'اسم المنتج', 'quantity': 'الكمية', 'unitPrice': 'سعر الوحدة',
            'paymentMethod': 'طريقة الدفع', 'amount': 'المبلغ', 'description': 'الوصف',
          };
          return fieldMap[f] || f;
        }),
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
