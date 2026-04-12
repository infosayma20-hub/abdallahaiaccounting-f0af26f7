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

    const systemPrompt = `أنت محاسب ذكي ومساعد مالي احترافي. المستخدم سيعطيك جملة تصف عملية مالية أو أكثر بالعربية.

## قاعدة المصفوفة (مهم جداً):
- دائماً أرجع JSON مصفوفة (Array) حتى لو كانت معاملة واحدة
- إذا وجدت أكثر من معاملة في نفس النص، حللها كلها وأرجعها كعناصر منفصلة في المصفوفة
- علامات وجود معاملات متعددة: "و" / "وكمان" / "وبعدين" / "وكذلك" / جمل منفصلة بأحداث مالية مختلفة / أشخاص مختلفين

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
- phone: رقم الهاتف إن ذُكر
- email: البريد إن ذُكر
- address: العنوان إن ذُكر

### إذا entityType = "employee":
- jobTitle: المسمى الوظيفي إن ذُكر
- department: القسم إن ذُكر
- basicSalary: الراتب إن ذُكر (رقم فقط)

### إذا entityType = "product":
- buyPrice: سعر الشراء إن ذُكر (رقم فقط)
- sellPrice: سعر البيع إن ذُكر (رقم فقط)
- quantity: الكمية الأولية إن ذُكرت (رقم فقط)
- sku: الرمز أو الباركود إن ذُكر

### إذا entityType = "account":
- accountCode: رمز الحساب إن ذُكر
- accountType: نوع الحساب (أصول/خصوم/مصروفات/إيرادات/حقوق ملكية)

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

## الخطوة 0B: كشف نية المخزون
إذا احتوى نص المستخدم على أي من الكلمات التالية:
المخزون، رصيد المخزون، كم عندي، كمية المنتج، حركة مخزون، تقرير مخزون، قيمة المخزون، تحليل مخزون، منتجات منخفضة، منتجات ناقصة، تكلفة المنتج، ربحية المنتج

فإن intent = "inventory_report"

في هذه الحالة لا تنشئ أي حركة مالية أو فاتورة أو سند. بدلاً من ذلك حدد نوع التقرير:
- سؤال عن منتج محدد → نوع_التقرير = "رصيد منتج"
- "اعرض حركة X" → نوع_التقرير = "حركة منتج"
- "قيمة المخزون" → نوع_التقرير = "تقييم المخزون"
- "منتجات منخفضة" أو "ناقصة" → نوع_التقرير = "منتجات منخفضة"
- "تحليل ربحية X" → نوع_التقرير = "تحليل ربحية منتج"

## الخطوة 1: تصنيف العملية
- إذا تضمن النص "بعت" أو "بيع" أو "مبيعات" → النوع = "فاتورة مبيعات"
- إذا تضمن النص "اشتريت" أو "شراء" أو "مشتريات" → النوع = "فاتورة مشتريات"
- إذا تضمن "قبضت" أو "استلمت" أو "تحصيل" (بدون كلمة شيك) → النوع = "سند قبض"
- إذا تضمن "دفعت" أو "صرفت" أو "سددت" (بدون كلمة شيك) → النوع = "سند صرف"
- غير ذلك → حاول تصنيفها

## الخطوة 2: استخراج الحقول

### لعمليات البيع ("بعت"):
المطلوب (إجباري):
- اسم الزبون (customerName)
- اسم المنتج/الخدمة (productName) — أو items إذا أصناف متعددة
- الكمية (quantity)
- طريقة الدفع: نقد / شيك / تحويل / آجل (paymentMethod)
اختياري:
- سعر الوحدة (unitPrice) - إذا لم يُذكر، ضعه 0 ولا تعتبره ناقصاً

### لعمليات الشراء ("اشتريت"):
المطلوب (إجباري):
- اسم المورد (supplierName)
- اسم المنتج/الخدمة (productName) — أو items إذا أصناف متعددة
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

## الخطوة 3: بناء المصفوفة

### فاتورة بصنف واحد:
{
  "type": "invoice",
  "invoiceType": "sales" أو "purchase",
  "status": "complete" أو "incomplete",
  "contactName": "الاسم",
  "productName": "المنتج",
  "quantity": الكمية,
  "unitPrice": السعر,
  "total": الإجمالي,
  "paymentMethod": "نقد/شيك/تحويل/آجل",
  "description": "وصف مختصر",
  "confirmationMessage": "نص تأكيد",
  "missingFields": [],
  "partialData": null
}

### فاتورة بأصناف متعددة (لنفس الشخص):
{
  "type": "invoice",
  "invoiceType": "sales" أو "purchase",
  "status": "complete",
  "contactName": "الاسم",
  "items": [
    { "name": "كابل", "quantity": 1, "unitPrice": 500, "total": 500 },
    { "name": "سلك", "quantity": 1, "unitPrice": 300, "total": 300 }
  ],
  "total": 800,
  "paymentMethod": "نقد",
  "description": "وصف مختصر",
  "confirmationMessage": "نص تأكيد"
}

### إضافة كيان:
{
  "type": "add_entity",
  "intent": "add_entity",
  "entityType": "",
  "contactType": "",
  "name": "",
  "phone": "",
  "email": "",
  "address": "",
  "jobTitle": "",
  "department": "",
  "basicSalary": 0,
  "buyPrice": 0,
  "sellPrice": 0,
  "quantity": 0,
  "sku": "",
  "accountCode": "",
  "accountType": "",
  "status": "complete"
}

### شيك:
{
  "type": "cheque",
  "intent": "cheque",
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

### تقرير مخزون:
{
  "type": "inventory_report",
  "intent": "inventory_report",
  "نوع_التقرير": "",
  "اسم_المنتج": "",
  "فترة_من": "",
  "فترة_إلى": "",
  "تحقق_من_الربط": true
}

### عملية قبض/صرف:
{
  "type": "transaction",
  "status": "complete",
  "debit": "الحساب المدين",
  "credit": "الحساب الدائن",
  "amount": "المبلغ مع العملة",
  "description": "وصف",
  "contactName": "الاسم أو null"
}

### غير معروف:
{
  "type": "unknown",
  "status": "error",
  "message": "لم أتمكن من فهم العملية"
}

## ملاحظات:
- كلمة "الزبون" و"العميل" لهما نفس المعنى.
- إذا لم يُذكر طريقة الدفع في فاتورة، اعتبرها ناقصة.
- إذا ذُكر "نقداً" أو "كاش" → paymentMethod = "نقد"
- إذا ذُكر "على الحساب" أو "آجل" أو "بالدين" → paymentMethod = "آجل"
- إذا ذُكر "شيك" في سياق فاتورة → paymentMethod = "شيك"
- إذا ذُكر "تحويل" أو "بنك" → paymentMethod = "تحويل"
- اجعل confirmationMessage بهذا الشكل:
"تأكيد العملية:\\nالنوع: مبيعات/مشتريات\\nالجهة: الاسم\\nالمنتج: المنتج\\nالكمية: العدد\\nالسعر: السعر\\nالإجمالي: المجموع\\nطريقة الدفع: الطريقة\\n\\nهل تريد إنشاء الفاتورة الآن؟"
- ملاحظة مهمة: يجب أن تكون أسماء الحقول في missingFields بالعربي دائماً.

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
