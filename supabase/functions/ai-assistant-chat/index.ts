import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, corsHeaders } from "../_shared/auth.ts";

// ── Intent Detection ──────────────────────────────────
interface QueryIntent {
  type: 'pos_analysis' | 'account_statement' | 'profit_loss' | 'receivables' | 'cheques' | 'inventory_check' | 'employee_info' | 'general';
  dateFrom?: string;
  dateTo?: string;
  contactName?: string;
}

function detectIntent(message: string): QueryIntent {
  // POS Analysis
  if (/نقطة البيع|POS|مبيعات اليوم|فواتير البيع|حلل.*مبيعات|تحليل.*مبيعات|مبيعات.*اليوم|المبيعات|ملخص.*مالي|الملخص المالي/i.test(message)) {
    const date = extractDate(message);
    return { type: 'pos_analysis', dateFrom: date || todayISO(), dateTo: date || todayISO() };
  }
  // Account statement
  if (/كشف حساب|رصيد\s|حساب\s@|بيان حساب/i.test(message)) {
    const contact = extractMention(message);
    return { type: 'account_statement', contactName: contact || undefined };
  }
  // Profit & Loss
  if (/أرباح|خسائر|ربح|الوضع المالي|صافي/i.test(message)) {
    const period = extractPeriod(message);
    return { type: 'profit_loss', ...period };
  }
  // Receivables
  if (/ذمم|متأخر|مستحقات|ديون/i.test(message)) {
    return { type: 'receivables' };
  }
  // Cheques
  if (/شيك|شيكات|cheque/i.test(message)) {
    return { type: 'cheques' };
  }
  // Inventory
  if (/مخزون|مخزن|منتج|بضاعة|كمية/i.test(message)) {
    return { type: 'inventory_check' };
  }
  // Employees
  if (/موظف|رواتب|حضور|غياب/i.test(message)) {
    return { type: 'employee_info' };
  }
  return { type: 'general' };
}

function extractDate(text: string): string | null {
  const match = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  if (/اليوم/.test(text)) return todayISO();
  if (/أمس|البارحة/.test(text)) {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }
  return null;
}

function extractMention(text: string): string | null {
  const match = text.match(/@([^\s@]+)/);
  return match ? match[1] : null;
}

function extractPeriod(text: string): { dateFrom?: string; dateTo?: string } {
  const today = new Date();
  if (/هذا الشهر|الشهر الحالي/.test(text)) {
    return {
      dateFrom: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`,
      dateTo: todayISO(),
    };
  }
  return { dateFrom: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`, dateTo: todayISO() };
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

// ── Data Fetchers ──────────────────────────────────
async function fetchPOSData(supabase: any, userId: string, dateFrom: string, dateTo: string): Promise<string> {
  const { data: orders } = await supabase
    .from('pos_orders')
    .select('id, order_number, created_at, total, subtotal, discount_amount, tax_amount, payment_currency, state, customer_name, currency')
    .eq('user_id', userId)
    .gte('created_at', `${dateFrom}T00:00:00`)
    .lte('created_at', `${dateTo}T23:59:59`)
    .in('state', ['completed', 'paid'])
    .order('created_at', { ascending: true });

  if (!orders || orders.length === 0) {
    return `\n=== بيانات نقطة البيع بتاريخ ${dateFrom} ===\nلا توجد فواتير مسجلة بهذا التاريخ في قاعدة البيانات. قد يكون لم تتم أي عملية بيع في هذا اليوم.\n`;
  }

  const totalSales = orders.reduce((s: number, o: any) => s + (Number(o.total) || 0), 0);
  const totalDiscount = orders.reduce((s: number, o: any) => s + (Number(o.discount_amount) || 0), 0);
  const totalTax = orders.reduce((s: number, o: any) => s + (Number(o.tax_amount) || 0), 0);
  const invoiceCount = orders.length;
  const avgInvoice = Math.round(totalSales / invoiceCount);

  // Payment method breakdown
  const paymentBreakdown: Record<string, { count: number; total: number }> = {};
  orders.forEach((o: any) => {
    const method = o.payment_currency || o.currency || 'نقدي';
    if (!paymentBreakdown[method]) paymentBreakdown[method] = { count: 0, total: 0 };
    paymentBreakdown[method].count++;
    paymentBreakdown[method].total += Number(o.total) || 0;
  });

  // Peak hours
  const hourSales: Record<number, { count: number; total: number }> = {};
  orders.forEach((o: any) => {
    const hour = new Date(o.created_at).getHours();
    if (!hourSales[hour]) hourSales[hour] = { count: 0, total: 0 };
    hourSales[hour].count++;
    hourSales[hour].total += Number(o.total) || 0;
  });
  const peakHour = Object.entries(hourSales).sort((a, b) => b[1].total - a[1].total)[0];

  // Fetch order lines for product analysis
  const orderIds = orders.map((o: any) => o.id);
  let productSection = '';
  if (orderIds.length > 0) {
    const { data: lines } = await supabase
      .from('pos_order_lines')
      .select('product_name, qty, unit_price, total')
      .in('order_id', orderIds.slice(0, 100));

    if (lines && lines.length > 0) {
      const productSales: Record<string, { qty: number; total: number }> = {};
      lines.forEach((l: any) => {
        if (!productSales[l.product_name]) productSales[l.product_name] = { qty: 0, total: 0 };
        productSales[l.product_name].qty += Number(l.qty) || 0;
        productSales[l.product_name].total += Number(l.total) || 0;
      });
      const topProducts = Object.entries(productSales)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10);

      productSection = `\nأكثر المنتجات مبيعاً:\n${topProducts.map(([name, data], i) => `  ${i + 1}. ${name}: ${data.qty} وحدة — ${data.total} ₪`).join('\n')}`;
    }
  }

  return `
=== بيانات نقطة البيع بتاريخ ${dateFrom} (بيانات حقيقية من قاعدة البيانات) ===

إجمالي المبيعات: ${totalSales.toFixed(2)} ₪
عدد الفواتير: ${invoiceCount}
متوسط قيمة الفاتورة: ${avgInvoice} ₪
إجمالي الخصومات: ${totalDiscount.toFixed(2)} ₪
إجمالي الضريبة: ${totalTax.toFixed(2)} ₪
ساعة الذروة: ${peakHour ? `${peakHour[0]}:00 (${peakHour[1].count} فاتورة — ${peakHour[1].total.toFixed(2)} ₪)` : 'غير متاح'}

طرق الدفع:
${Object.entries(paymentBreakdown).map(([method, d]) => `  ${method}: ${d.count} فاتورة — ${d.total.toFixed(2)} ₪`).join('\n')}
${productSection}

توزيع المبيعات بالساعة:
${Object.entries(hourSales).sort((a, b) => Number(a[0]) - Number(b[0])).map(([h, d]) => `  ${h}:00 → ${d.count} فاتورة — ${d.total.toFixed(2)} ₪`).join('\n')}
`;
}

async function fetchAccountData(supabase: any, userId: string, contactName: string): Promise<string> {
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, contact_name, contact_type, current_balance, phone, email, credit_limit')
    .eq('user_id', userId)
    .ilike('contact_name', `%${contactName}%`)
    .limit(1);

  if (!contacts || contacts.length === 0) {
    return `\nلم يتم العثور على جهة اتصال باسم "${contactName}" في قاعدة البيانات.\n`;
  }

  const contact = contacts[0];
  const { data: txs } = await supabase
    .from('transactions')
    .select('transaction_date, description, amount, debit_account_code, credit_account_code')
    .eq('user_id', userId)
    .or(`description.ilike.%${contactName}%`)
    .order('transaction_date', { ascending: false })
    .limit(20);

  return `
=== كشف حساب ${contact.contact_name} ===
النوع: ${contact.contact_type}
الرصيد الحالي: ${contact.current_balance || 0} ₪
حد الائتمان: ${contact.credit_limit || 'غير محدد'} ₪
الهاتف: ${contact.phone || 'غير متاح'}

آخر المعاملات:
${(txs || []).map((t: any) => `  ${t.transaction_date} | ${t.description} | ${t.amount} ₪`).join('\n') || '  لا توجد معاملات'}
`;
}

async function fetchReceivablesData(supabase: any, userId: string): Promise<string> {
  const { data: contacts } = await supabase
    .from('contacts')
    .select('contact_name, contact_type, current_balance, last_transaction_date, overdue_amount')
    .eq('user_id', userId)
    .eq('is_active', true)
    .gt('current_balance', 0)
    .order('current_balance', { ascending: false })
    .limit(20);

  if (!contacts || contacts.length === 0) {
    return '\n=== الذمم المستحقة ===\nلا توجد ذمم مستحقة حالياً.\n';
  }

  const totalReceivables = contacts.reduce((s: number, c: any) => s + (Number(c.current_balance) || 0), 0);

  return `
=== الذمم المستحقة (بيانات حقيقية) ===
إجمالي الذمم: ${totalReceivables.toFixed(2)} ₪
عدد العملاء المدينين: ${contacts.length}

التفاصيل:
${contacts.map((c: any, i: number) => `  ${i + 1}. ${c.contact_name} (${c.contact_type}): ${c.current_balance} ₪ ${c.overdue_amount ? `— متأخر: ${c.overdue_amount} ₪` : ''}`).join('\n')}
`;
}

async function fetchInventoryData(supabase: any, userId: string): Promise<string> {
  const { data: products } = await supabase
    .from('products')
    .select('name, quantity, buy_price, sell_price, sku, is_active')
    .eq('user_id', userId)
    .order('quantity', { ascending: true })
    .limit(30);

  if (!products || products.length === 0) {
    return '\n=== المخزون ===\nلا توجد منتجات مسجلة في النظام.\n';
  }

  const lowStock = products.filter((p: any) => p.quantity <= 5 && p.quantity > 0);
  const outOfStock = products.filter((p: any) => p.quantity <= 0);

  return `
=== بيانات المخزون (حقيقية) ===
إجمالي المنتجات: ${products.length}
نفد من المخزون: ${outOfStock.length} منتج
مخزون منخفض (≤5): ${lowStock.length} منتج

${outOfStock.length > 0 ? `منتجات نفدت:\n${outOfStock.map((p: any) => `  ⚠️ ${p.name}: ${p.quantity} وحدة`).join('\n')}` : ''}
${lowStock.length > 0 ? `\nمنتجات منخفضة:\n${lowStock.map((p: any) => `  ⚠️ ${p.name}: ${p.quantity} وحدة`).join('\n')}` : ''}

جميع المنتجات:
${products.map((p: any) => `  ${p.name}: ${p.quantity} وحدة — شراء ${p.buy_price}₪ — بيع ${p.sell_price}₪`).join('\n')}
`;
}

async function fetchChequesData(supabase: any, userId: string): Promise<string> {
  const { data: cheques } = await supabase
    .from('cheques')
    .select('party_name, amount, cheque_date, cheque_type, status, bank_name, cheque_number')
    .eq('user_id', userId)
    .order('cheque_date', { ascending: true })
    .limit(20);

  if (!cheques || cheques.length === 0) {
    return '\n=== الشيكات ===\nلا توجد شيكات مسجلة في النظام.\n';
  }

  const pending = cheques.filter((c: any) => ['pending', 'registered', 'deposited'].includes(c.status));
  const totalPending = pending.reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0);

  return `
=== بيانات الشيكات (حقيقية) ===
إجمالي الشيكات: ${cheques.length}
شيكات معلقة: ${pending.length} — بقيمة ${totalPending.toFixed(2)} ₪

التفاصيل:
${cheques.map((c: any) => `  ${c.cheque_type === 'incoming' ? '📥' : '📤'} ${c.party_name}: ${c.amount}₪ — ${c.cheque_date} — حالة: ${c.status}`).join('\n')}
`;
}

// ── Main Handler ──────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.userId;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { messages, currentPage, userName, financialContext } = await req.json();

    // Get the last user message for intent detection
    const lastUserMessage = [...messages].reverse().find((m: any) => m.role === 'user')?.content || '';

    // Detect intent and fetch relevant data
    const intent = detectIntent(lastUserMessage);
    let intentDataSection = '';

    try {
      switch (intent.type) {
        case 'pos_analysis':
          intentDataSection = await fetchPOSData(supabaseAdmin, userId, intent.dateFrom!, intent.dateTo!);
          break;
        case 'account_statement':
          if (intent.contactName) {
            intentDataSection = await fetchAccountData(supabaseAdmin, userId, intent.contactName);
          }
          break;
        case 'receivables':
          intentDataSection = await fetchReceivablesData(supabaseAdmin, userId);
          break;
        case 'inventory_check':
          intentDataSection = await fetchInventoryData(supabaseAdmin, userId);
          break;
        case 'cheques':
          intentDataSection = await fetchChequesData(supabaseAdmin, userId);
          break;
      }
    } catch (fetchErr) {
      console.error('Data fetch error:', fetchErr);
      intentDataSection = '\nتعذر جلب بيانات إضافية من قاعدة البيانات.\n';
    }

    // Build base context from client-side financial context
    const pageContextMap: Record<string, string> = {
      '/': 'لوحة التحكم الرئيسية',
      '/transactions': 'صفحة المعاملات',
      '/contacts': 'صفحة العملاء والموردين',
      '/accounts': 'صفحة الحسابات',
      '/invoices': 'صفحة الفواتير',
      '/inventory': 'صفحة المخزون',
      '/profit-loss': 'صفحة الأرباح والخسائر',
      '/smart-report': 'صفحة التقرير الذكي',
      '/cheques': 'صفحة إدارة الشيكات',
      '/smart-accountant': 'المحاسب الذكي',
    };

    const pageContext = pageContextMap[currentPage] || 'صفحة عامة';
    const ctx = financialContext || {};

    let baseDataSection = `
=== البيانات المالية العامة ===
الصندوق: ${ctx.cash ?? 0} ₪
البنك: ${ctx.bank ?? 0} ₪
مبيعات الشهر: ${ctx.sales ?? 0} ₪
مشتريات/مصروفات: ${ctx.expenses ?? 0} ₪
صافي الربح: ${ctx.profit ?? 0} ₪
إجمالي الذمم (لك): ${ctx.receivables ?? 0} ₪
إجمالي الدائنون (عليك): ${ctx.payables ?? 0} ₪`;

    if (ctx.topContacts?.length > 0) {
      baseDataSection += `\n\nأهم العملاء والموردين:\n`;
      baseDataSection += ctx.topContacts.map((c: any) => `  ${c.name} (${c.type}): رصيد ${c.balance} ₪`).join('\n');
    }
    if (ctx.recentTransactions?.length > 0) {
      baseDataSection += `\n\nآخر المعاملات:\n`;
      baseDataSection += ctx.recentTransactions.map((t: any) => `  ${t.date}: ${t.description} — ${t.amount} ₪`).join('\n');
    }
    if (ctx.inventory?.length > 0) {
      baseDataSection += `\n\nالمخزون:\n`;
      baseDataSection += ctx.inventory.map((p: any) => `  ${p.name}: ${p.quantity} وحدة، شراء ${p.buy_price}₪، بيع ${p.sell_price}₪`).join('\n');
    }
    if (ctx.dueCheques?.length > 0) {
      baseDataSection += `\n\nشيكات مستحقة:\n`;
      baseDataSection += ctx.dueCheques.map((c: any) => `  ${c.party_name}: ${c.amount}₪ — استحقاق ${c.cheque_date}`).join('\n');
    }
    if (ctx.employees?.length > 0) {
      baseDataSection += `\n\nالموظفون:\n`;
      baseDataSection += ctx.employees.map((e: any) => `  ${e.full_name} - ${e.department || 'عام'}`).join('\n');
    }

    const systemPrompt = `أنت محاسب ذكي محترف اسمك "المحاسب الذكي". تعمل داخل نظام ZIDNI ERP المحاسبي.

## سياق المستخدم
- اسم المستخدم: ${userName || 'المستخدم'}
- الصفحة الحالية: ${pageContext}

${baseDataSection}
${intentDataSection}

## ⛔ قاعدة ذهبية غير قابلة للكسر ⛔
1. ❌ ممنوع منعاً باتاً أن تطلب من المستخدم تزويدك بأي بيانات موجودة في النظام مثل: إجمالي المبيعات، عدد الفواتير، تكلفة البضاعة، أرقام محاسبية
2. ✅ البيانات الحقيقية موجودة أعلاه — استخدمها مباشرة في تحليلك وإجابتك
3. ✅ إذا لم تجد بيانات في الأقسام أعلاه، قل: "لا توجد بيانات لهذه الفترة في النظام" — ولا تطلب من المستخدم إدخالها يدوياً
4. ✅ أكمل إجابتك كاملة بدون انقطاع — لا تقطعها أبداً
5. ✅ لا تستخدم ** حول النصوص — اكتب بشكل عادي بدون تنسيق markdown
6. ✅ عند التحليل قدم أرقاماً حقيقية ثم ملاحظات وتوصيات عملية
7. عند اقتراح إجراء، استخدم هذا الشكل بالضبط: [action:نص الزر:/المسار]
   أمثلة:
   [action:عرض المبيعات:/invoices]
   [action:ميزان المراجعة:/trial-balance]
   [action:كشف الحساب:/account-statement]
   [action:تقرير الأرباح:/profit-loss]
   [action:عرض المخزون:/inventory]
   [action:إدارة الموظفين:/employees]
   قواعد الأزرار:
   - استخدمها دائماً في نهاية ردك كاقتراحات للخطوة التالية
   - لا تكتب أكثر من 3 أزرار في رد واحد
   - النص يجب أن يكون قصيراً (2-4 كلمات)
   - المسار يبدأ دائماً بـ /
   - لا تضع نقطة أو مسافة بعد ] مباشرة

## المسارات المتاحة للأزرار
  /invoices              → الفواتير
  /contacts              → العملاء والموردين
  /transactions          → الحركات المحاسبية
  /accounts              → شجرة الحسابات
  /journal-entries       → قيود اليومية
  /trial-balance         → ميزان المراجعة
  /profit-loss           → الأرباح والخسائر
  /account-statement     → كشف الحساب
  /balance-sheet         → الميزانية العمومية
  /inventory             → المخزون
  /employees             → الموظفون
  /cheques               → الشيكات
  /pos                   → نقطة البيع
  /reports               → التقارير
  /general-ledger        → دفتر الأستاذ

## قواعد إضافية
- أجب بالعربية الفصحى البسيطة بشكل مختصر ومهني
- قدم إجابات عملية وقابلة للتنفيذ
- إذا طلب تسجيل عملية مالية، ساعده بالصيغة الصحيحة

## صيغ العمليات المالية
- بيع: "بعت @منتج كمية وحدة ل@زبون سعر XX نقداً/آجل/شيك/تحويل"
- شراء: "اشتريت @منتج كمية وحدة من @مورد سعر XX نقداً/آجل/شيك/تحويل"
- قبض: "قبضت من @اسم مبلغ عملة"
- صرف: "دفعت ل@اسم مبلغ عملة"
- شيك وارد: "قبضت شيك من @عميل مبلغ عملة بتاريخ DD/MM/YYYY"
- شيك صادر: "دفعت شيك ل@مورد مبلغ عملة بتاريخ DD/MM/YYYY"

## إدارة الشيكات
- حالات الشيك: مسجل → آجل → مستحق → مودع → محصل (أو مرتجع/ملغي)
- الشيك لا يؤثر على السيولة حتى يتم تحصيله فعلياً`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        stream: true,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "تم تجاوز الحد المسموح، حاول لاحقاً" }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "يرجى إضافة رصيد لاستخدام المساعد الذكي" }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI error [${response.status}]`);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
