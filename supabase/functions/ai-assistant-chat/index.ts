import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, corsHeaders } from "../_shared/auth.ts";

// ── Intent Detection ──────────────────────────────────
type IntentType =
  | 'financial_summary' | 'cash_position' | 'contact_balance' | 'account_statement'
  | 'overdue_receivables' | 'overdue_payables' | 'inventory_check' | 'income_statement'
  | 'cheques' | 'exchange_rates' | 'top_customers' | 'hr_summary' | 'oldest_employee'
  | 'account_ledger' | 'search_transactions' | 'pos_analysis' | 'general';

interface QueryIntent {
  type: IntentType;
  dateFrom?: string;
  dateTo?: string;
  contactName?: string;
  productName?: string;
  keyword?: string;
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function monthStartISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function yearStartISO(): string {
  return `${new Date().getFullYear()}-01-01`;
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

function extractPeriod(text: string): { dateFrom: string; dateTo: string } {
  const today = new Date();
  if (/هذا الشهر|الشهر الحالي/.test(text)) {
    return { dateFrom: monthStartISO(), dateTo: todayISO() };
  }
  if (/الشهر الماضي|الشهر السابق/.test(text)) {
    const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return {
      dateFrom: d.toISOString().split('T')[0],
      dateTo: end.toISOString().split('T')[0],
    };
  }
  if (/هذه السنة|هذا العام|السنة الحالية/.test(text)) {
    return { dateFrom: yearStartISO(), dateTo: todayISO() };
  }
  return { dateFrom: monthStartISO(), dateTo: todayISO() };
}

// Extract a person/company name from Arabic text
function extractContactName(text: string): string | null {
  // Remove common prefixes/suffixes
  const cleaned = text
    .replace(/^(كم\s+(على|عند|لي?\s+عند|عليّ?\s+ل))\s*/i, '')
    .replace(/^(كشف\s+حساب|رصيد|حساب|دفتر|شيكات)\s*/i, '')
    .replace(/^(من|ل|مع|عن|إلى)\s*/i, '')
    .replace(/[؟?!\.،,]/g, '')
    .trim();

  // Common patterns for name extraction
  const patterns = [
    /(?:كم\s+(?:على|عند|لي?\s+عند))\s+(.+?)(?:\s*[؟?]|$)/i,
    /(?:كشف\s+حساب|رصيد|حساب|دفتر)\s+(.+?)(?:\s*[؟?]|$)/i,
    /(?:شيكات?)\s+(.+?)(?:\s*[؟?]|$)/i,
    /(?:كم\s+(?:عليّ?|لي?)\s+(?:ل|عند))\s*(.+?)(?:\s*[؟?]|$)/i,
    /(?:وضعي?\s+مع)\s+(.+?)(?:\s*[؟?]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      // Filter out non-name words
      if (name.length > 1 && !/^(اليوم|الشهر|هذا|هذه|كل|جميع|الكل)$/i.test(name)) {
        return name;
      }
    }
  }
  return null;
}

function extractProductName(text: string): string | null {
  const match = text.match(/(?:كم\s+عند[يي]?\s+من|مخزون|كمية)\s+(.+?)(?:\s*[؟?]|$)/i);
  if (match && match[1]) return match[1].trim();
  return null;
}

function detectIntents(message: string): QueryIntent[] {
  const intents: QueryIntent[] = [];
  const period = extractPeriod(message);
  const date = extractDate(message);
  const contactName = extractContactName(message);
  const productName = extractProductName(message);

  // Full financial overview
  if (/وضعي?\s*المالي|ملخص\s*مالي|شو?\s+وضعي|كيف\s+حالي?\s+المالي|الوضع\s+الكامل/i.test(message)) {
    intents.push({ type: 'financial_summary', ...period });
    intents.push({ type: 'cash_position' });
    intents.push({ type: 'overdue_receivables' });
    intents.push({ type: 'cheques' });
  }

  // Situation with a specific contact
  if (contactName && /وضعي?\s+مع|ما\s+وضع/i.test(message)) {
    intents.push({ type: 'contact_balance', contactName });
    intents.push({ type: 'cheques', contactName });
    intents.push({ type: 'overdue_receivables', contactName });
    return intents; // don't add more
  }

  // Contact balance
  if (/كم\s+(على|عند|لي?\s+عند|عليّ?\s+ل)/i.test(message) && contactName) {
    intents.push({ type: 'contact_balance', contactName });
    return intents;
  }

  // Account statement
  if (/كشف\s+حساب|بيان\s+حساب/i.test(message)) {
    intents.push({ type: 'account_statement', contactName: contactName || undefined, ...period });
    return intents;
  }

  // Account ledger
  if (/دفتر|أستاذ/i.test(message)) {
    intents.push({ type: 'account_ledger', contactName: contactName || undefined, ...period });
    return intents;
  }

  // POS
  if (/نقطة البيع|POS|مبيعات\s+اليوم|مبيعات\s+اليومية/i.test(message)) {
    intents.push({ type: 'pos_analysis', dateFrom: date || todayISO(), dateTo: date || todayISO() });
    return intents;
  }

  // Cash position
  if (/كم\s+عند[يي]?|رصيد[يي]?|الصندوق|صندوقي|في\s+البنك|رصيد\s+البنك|السيولة/i.test(message) && !contactName) {
    intents.push({ type: 'cash_position' });
    return intents;
  }

  // Income statement / P&L
  if (/أرباح|خسائر|ربح|قائمة\s+الدخل|صافي\s+الربح/i.test(message)) {
    intents.push({ type: 'income_statement', ...period });
    return intents;
  }

  // Receivables
  if (/ذمم\s+مدينة|متأخر|مستحقات|ديون|من\s+لم\s+يسدد|تعمير/i.test(message)) {
    intents.push({ type: 'overdue_receivables', contactName: contactName || undefined });
    return intents;
  }

  // Payables
  if (/ذمم\s+دائنة|مستحق\s+عل[يي]|كم\s+عل[يي]/i.test(message) && !contactName) {
    intents.push({ type: 'overdue_payables' });
    return intents;
  }

  // Exchange rates & currency conversion
  if (/سعر\s+الصرف|الدولار|اليورو|الدينار|عملة|عملات|صرف|شيكل|لشيكل|بالشيكل|تحويل|كم\s+يساوي/i.test(message)) {
    intents.push({ type: 'exchange_rates', keyword: message });
    return intents;
  }

  // Inventory
  if (/مخزون|مخزن|منتج|بضاعة|كمية|المنتجات/i.test(message)) {
    intents.push({ type: 'inventory_check', productName: productName || undefined });
    return intents;
  }

  // Cheques
  if (/شيك|شيكات|cheque/i.test(message)) {
    intents.push({ type: 'cheques', contactName: contactName || undefined });
    return intents;
  }

  // Top customers
  if (/أفضل\s+زبائن|أكثر\s+مبيعاً|أهم\s+العملاء|تصنيف\s+الزبائن/i.test(message)) {
    intents.push({ type: 'top_customers', ...period });
    return intents;
  }

  // Oldest employee
  if (/من\s+هو\s+أقدم\s+موظف|من\s+هو\s+اقدم\s+موظف|أقدم\s+موظف|اقدم\s+موظف|أول\s+موظف|اول\s+موظف/i.test(message)) {
    intents.push({ type: 'oldest_employee' });
    return intents;
  }

  // HR
  if (/موظف|رواتب|حضور|غياب|إجازة/i.test(message)) {
    intents.push({ type: 'hr_summary' });
    return intents;
  }

  // Search
  if (/ابحث|فاتورة\s+رقم|عملية\s+رقم|بحث/i.test(message)) {
    intents.push({ type: 'search_transactions', keyword: message, ...period });
    return intents;
  }

  // Financial summary as fallback for sales/purchases questions
  if (/مبيعات|المبيعات|مشتريات|المشتريات|إيرادات|الإيرادات|مصاريف|المصاريف/i.test(message)) {
    intents.push({ type: 'financial_summary', ...period });
    return intents;
  }

  // If nothing matched and there's a contact name, try balance
  if (contactName) {
    intents.push({ type: 'contact_balance', contactName });
    return intents;
  }

  if (intents.length === 0) intents.push({ type: 'general' });
  return intents;
}

// ── Data Fetchers ──────────────────────────────────
async function fetchFinancialSummary(supabase: any, userId: string, dateFrom: string, dateTo: string): Promise<string> {
  const { data: txns } = await supabase
    .from('transactions')
    .select('amount, debit_account_code, credit_account_code, transaction_type, is_deleted, is_opening_balance, description')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .gte('transaction_date', dateFrom)
    .lte('transaction_date', dateTo);

  const all = (txns || []).filter((t: any) => !t.is_opening_balance && !/رصيد\s*(ابتدائي|افتتاحي)/i.test(t.description || ''));
  
  const sumByCode = (items: any[], field: string, prefix: string) =>
    items.filter((t: any) => t[field]?.startsWith(prefix)).reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);

  const totalSales = sumByCode(all, 'credit_account_code', '4');
  const totalPurchases = sumByCode(all, 'debit_account_code', '51');
  const totalExpenses = sumByCode(all, 'debit_account_code', '5');
  const grossProfit = totalSales - totalPurchases;
  const netProfit = totalSales - totalExpenses;

  // Count transactions by type
  const typeCounts: Record<string, number> = {};
  all.forEach((t: any) => {
    const type = t.transaction_type || 'other';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });

  return `
=== الملخص المالي من ${dateFrom} إلى ${dateTo} (بيانات حقيقية) ===
إجمالي الإيرادات (حسابات 4xxx): ${totalSales.toFixed(2)} ₪
إجمالي المشتريات (حسابات 51xx): ${totalPurchases.toFixed(2)} ₪
مجمل الربح: ${grossProfit.toFixed(2)} ₪
إجمالي المصاريف (حسابات 5xxx): ${totalExpenses.toFixed(2)} ₪
صافي الربح: ${netProfit.toFixed(2)} ₪
هامش الربح: ${totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : 0}%
عدد الحركات: ${all.length}
${Object.entries(typeCounts).map(([k, v]) => `  ${k}: ${v}`).join('\n')}
`;
}

async function fetchCashPosition(supabase: any, userId: string): Promise<string> {
  // Get all transactions to calculate balances from account codes
  const { data: txns } = await supabase
    .from('transactions')
    .select('amount, debit_account_code, credit_account_code, is_deleted')
    .eq('user_id', userId)
    .eq('is_deleted', false);

  const all = txns || [];
  const calcBalance = (code: string) => {
    const debit = all.filter((t: any) => t.debit_account_code?.startsWith(code)).reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);
    const credit = all.filter((t: any) => t.credit_account_code?.startsWith(code)).reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);
    return debit - credit;
  };

  const cashBalance = calcBalance('1110');
  const bankBalance = calcBalance('1120');
  const receivables = calcBalance('1130');
  const payables = calcBalance('2100');
  // Foreign currency boxes
  const usdBox = calcBalance('1111');
  const jodBox = calcBalance('1112');
  const eurBox = calcBalance('1113');

  // Cash boxes
  const { data: boxes } = await supabase
    .from('cash_boxes')
    .select('name, opening_balance, currency, is_active')
    .eq('user_id', userId)
    .eq('is_active', true);

  // Bank accounts
  const { data: banks } = await supabase
    .from('bank_accounts')
    .select('name, bank_name, opening_balance, currency, is_active')
    .eq('user_id', userId)
    .eq('is_active', true);

  let result = `
=== الوضع النقدي الفوري (بيانات حقيقية) ===
رصيد الصندوق (₪): ${cashBalance.toFixed(2)} ₪
رصيد البنك (₪): ${bankBalance.toFixed(2)} ₪
إجمالي النقد المتاح: ${(cashBalance + bankBalance).toFixed(2)} ₪
ذمم مدينة (لك عند الزبائن): ${receivables.toFixed(2)} ₪
ذمم دائنة (عليك للموردين): ${Math.abs(payables).toFixed(2)} ₪`;

  if (usdBox !== 0) result += `\nصندوق الدولار: ${usdBox.toFixed(2)} $`;
  if (jodBox !== 0) result += `\nصندوق الدينار: ${jodBox.toFixed(2)} د.أ`;
  if (eurBox !== 0) result += `\nصندوق اليورو: ${eurBox.toFixed(2)} €`;

  if (boxes && boxes.length > 0) {
    result += `\n\nالصناديق المسجلة:\n${boxes.map((b: any) => `  ${b.name}: رصيد افتتاح ${b.opening_balance || 0} ${b.currency || '₪'}`).join('\n')}`;
  }
  if (banks && banks.length > 0) {
    result += `\n\nالحسابات البنكية:\n${banks.map((b: any) => `  ${b.name} (${b.bank_name}): رصيد افتتاح ${b.opening_balance || 0} ${b.currency || '₪'}`).join('\n')}`;
  }

  return result;
}

async function fetchContactBalance(supabase: any, userId: string, contactName: string): Promise<string> {
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, contact_name, contact_type, current_balance, phone, email, credit_limit, overdue_amount, total_sales, total_purchases, total_paid, last_transaction_date, payment_terms_days, contact_class')
    .eq('user_id', userId)
    .ilike('contact_name', `%${contactName}%`)
    .limit(5);

  if (!contacts || contacts.length === 0) {
    return `\nلم يتم العثور على جهة اتصال باسم "${contactName}" في قاعدة البيانات.\n`;
  }

  let result = '';
  for (const contact of contacts) {
    // Get recent transactions for this contact
    const { data: txs } = await supabase
      .from('transactions')
      .select('transaction_date, description, amount, debit_account_code, credit_account_code, transaction_type')
      .eq('user_id', userId)
      .eq('contact_id', contact.id)
      .eq('is_deleted', false)
      .order('transaction_date', { ascending: false })
      .limit(15);

    result += `
=== بيانات ${contact.contact_name} (${contact.contact_type}) ===
الرصيد الحالي: ${contact.current_balance || 0} ₪
${contact.overdue_amount ? `مبلغ متأخر: ${contact.overdue_amount} ₪` : ''}
إجمالي المبيعات: ${contact.total_sales || 0} ₪
إجمالي المشتريات: ${contact.total_purchases || 0} ₪
إجمالي المدفوع: ${contact.total_paid || 0} ₪
حد الائتمان: ${contact.credit_limit || 'غير محدد'} ₪
شروط الدفع: ${contact.payment_terms_days ? contact.payment_terms_days + ' يوم' : 'غير محدد'}
التصنيف: ${contact.contact_class || 'غير مصنف'}
آخر معاملة: ${contact.last_transaction_date || 'لا يوجد'}
الهاتف: ${contact.phone || 'غير متاح'}

آخر المعاملات:
${(txs || []).map((t: any) => `  ${t.transaction_date} | ${t.description || t.transaction_type} | ${t.amount} ₪ | مدين:${t.debit_account_code} دائن:${t.credit_account_code}`).join('\n') || '  لا توجد معاملات'}
`;
  }
  return result;
}

async function fetchOverdueReceivables(supabase: any, userId: string, contactName?: string): Promise<string> {
  let query = supabase
    .from('contacts')
    .select('contact_name, contact_type, current_balance, overdue_amount, last_transaction_date, payment_terms_days, contact_class')
    .eq('user_id', userId)
    .eq('is_active', true)
    .gt('current_balance', 0)
    .order('current_balance', { ascending: false })
    .limit(30);

  if (contactName) {
    query = query.ilike('contact_name', `%${contactName}%`);
  }

  const { data: contacts } = await query;

  if (!contacts || contacts.length === 0) {
    return contactName
      ? `\nلا توجد ذمم مستحقة لجهة "${contactName}".\n`
      : '\n=== الذمم المستحقة ===\nلا توجد ذمم مستحقة حالياً.\n';
  }

  const total = contacts.reduce((s: number, c: any) => s + (Number(c.current_balance) || 0), 0);
  const totalOverdue = contacts.reduce((s: number, c: any) => s + (Number(c.overdue_amount) || 0), 0);

  return `
=== الذمم المدينة (لك عند الزبائن) — بيانات حقيقية ===
إجمالي الذمم: ${total.toFixed(2)} ₪
منها متأخر: ${totalOverdue.toFixed(2)} ₪
عدد المدينين: ${contacts.length}

التفاصيل:
${contacts.map((c: any, i: number) => `  ${i + 1}. ${c.contact_name} (${c.contact_type}${c.contact_class ? ' - ' + c.contact_class : ''}): ${c.current_balance} ₪${c.overdue_amount ? ' — متأخر: ' + c.overdue_amount + ' ₪' : ''}${c.last_transaction_date ? ' — آخر معاملة: ' + c.last_transaction_date : ''}`).join('\n')}
`;
}

async function fetchOverduePayables(supabase: any, userId: string): Promise<string> {
  const { data: contacts } = await supabase
    .from('contacts')
    .select('contact_name, contact_type, current_balance, overdue_amount, last_transaction_date')
    .eq('user_id', userId)
    .eq('is_active', true)
    .lt('current_balance', 0)
    .order('current_balance', { ascending: true })
    .limit(30);

  if (!contacts || contacts.length === 0) {
    return '\n=== الذمم الدائنة ===\nلا توجد ذمم للموردين حالياً.\n';
  }

  const total = contacts.reduce((s: number, c: any) => s + Math.abs(Number(c.current_balance) || 0), 0);

  return `
=== الذمم الدائنة (عليك للموردين) — بيانات حقيقية ===
إجمالي المستحق: ${total.toFixed(2)} ₪
عدد الموردين: ${contacts.length}

التفاصيل:
${contacts.map((c: any, i: number) => `  ${i + 1}. ${c.contact_name}: ${Math.abs(c.current_balance)} ₪${c.last_transaction_date ? ' — آخر معاملة: ' + c.last_transaction_date : ''}`).join('\n')}
`;
}

async function fetchInventoryData(supabase: any, userId: string, productName?: string): Promise<string> {
  let query = supabase
    .from('products')
    .select('name, quantity, buy_price, sell_price, sku, is_active, category')
    .eq('user_id', userId)
    .order('quantity', { ascending: true })
    .limit(50);

  if (productName) {
    query = query.ilike('name', `%${productName}%`);
  }

  const { data: products } = await query;

  if (!products || products.length === 0) {
    return productName
      ? `\nلم يتم العثور على منتج باسم "${productName}" في المخزون.\n`
      : '\n=== المخزون ===\nلا توجد منتجات مسجلة في النظام.\n';
  }

  const totalValue = products.reduce((s: number, p: any) => s + ((p.quantity || 0) * (p.buy_price || 0)), 0);
  const lowStock = products.filter((p: any) => p.quantity > 0 && p.quantity <= 5);
  const outOfStock = products.filter((p: any) => p.quantity <= 0);

  return `
=== بيانات المخزون (حقيقية) ===
إجمالي المنتجات: ${products.length}
قيمة المخزون الإجمالية: ${totalValue.toFixed(2)} ₪
نفد من المخزون: ${outOfStock.length} منتج
مخزون منخفض (≤5): ${lowStock.length} منتج

${outOfStock.length > 0 ? `⚠️ منتجات نفدت:\n${outOfStock.map((p: any) => `  ⛔ ${p.name} (${p.sku || '-'})`).join('\n')}` : ''}
${lowStock.length > 0 ? `\n⚠️ مخزون منخفض:\n${lowStock.map((p: any) => `  ⚠️ ${p.name}: ${p.quantity} وحدة`).join('\n')}` : ''}

جميع المنتجات:
${products.map((p: any) => `  ${p.name}: ${p.quantity} وحدة — شراء ${p.buy_price || 0}₪ — بيع ${p.sell_price || 0}₪ — قيمة ${((p.quantity || 0) * (p.buy_price || 0)).toFixed(2)}₪`).join('\n')}
`;
}

async function fetchChequesData(supabase: any, userId: string, contactName?: string): Promise<string> {
  let query = supabase
    .from('cheques')
    .select('party_name, amount, cheque_date, cheque_type, status, bank_name, cheque_number, currency')
    .eq('user_id', userId)
    .order('cheque_date', { ascending: true })
    .limit(30);

  if (contactName) {
    query = query.ilike('party_name', `%${contactName}%`);
  }

  const { data: cheques } = await query;

  if (!cheques || cheques.length === 0) {
    return contactName
      ? `\nلا توجد شيكات مسجلة باسم "${contactName}".\n`
      : '\n=== الشيكات ===\nلا توجد شيكات مسجلة في النظام.\n';
  }

  const incoming = cheques.filter((c: any) => c.cheque_type === 'وارد');
  const outgoing = cheques.filter((c: any) => c.cheque_type === 'صادر');
  const statusCount = (arr: any[], status: string) => arr.filter((c: any) => c.status === status);
  const sumArr = (arr: any[]) => arr.reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0);

  // Due soon (next 7 days)
  const now = new Date();
  const weekLater = new Date(now); weekLater.setDate(weekLater.getDate() + 7);
  const dueSoon = cheques.filter((c: any) => {
    const d = new Date(c.cheque_date);
    return d >= now && d <= weekLater && c.status !== 'محصل' && c.status !== 'ملغي';
  });

  return `
=== بيانات الشيكات (حقيقية) ===
إجمالي الشيكات: ${cheques.length}

شيكات واردة: ${incoming.length} — إجمالي ${sumArr(incoming).toFixed(2)} ₪
  محصل: ${statusCount(incoming, 'محصل').length} (${sumArr(statusCount(incoming, 'محصل')).toFixed(2)} ₪)
  مستحق: ${statusCount(incoming, 'مستحق').length} (${sumArr(statusCount(incoming, 'مستحق')).toFixed(2)} ₪)
  مسجل: ${statusCount(incoming, 'مسجل').length} (${sumArr(statusCount(incoming, 'مسجل')).toFixed(2)} ₪)
  مرتجع: ${statusCount(incoming, 'مرتجع').length}

شيكات صادرة: ${outgoing.length} — إجمالي ${sumArr(outgoing).toFixed(2)} ₪
  محصل: ${statusCount(outgoing, 'محصل').length} (${sumArr(statusCount(outgoing, 'محصل')).toFixed(2)} ₪)
  مستحق: ${statusCount(outgoing, 'مستحق').length} (${sumArr(statusCount(outgoing, 'مستحق')).toFixed(2)} ₪)
  مرتجع: ${statusCount(outgoing, 'مرتجع').length}

${dueSoon.length > 0 ? `⚠️ شيكات مستحقة خلال 7 أيام:\n${dueSoon.map((c: any) => `  ${c.cheque_type} | ${c.party_name}: ${c.amount} ₪ — تاريخ ${c.cheque_date}`).join('\n')}` : 'لا توجد شيكات مستحقة خلال 7 أيام'}

التفاصيل:
${cheques.map((c: any) => `  ${c.cheque_type === 'وارد' ? '📥' : '📤'} ${c.party_name}: ${c.amount}₪ — ${c.cheque_date} — ${c.status}${c.bank_name ? ' — ' + c.bank_name : ''}`).join('\n')}
`;
}

async function fetchExchangeRates(supabase: any, userId: string, keyword?: string): Promise<string> {
  // Always fetch live rates from free API
  const CURRENCY_NAMES: Record<string, string> = {
    USD: 'دولار أمريكي',
    EUR: 'يورو',
    JOD: 'دينار أردني',
    GBP: 'جنيه إسترليني',
    EGP: 'جنيه مصري',
    TRY: 'ليرة تركية',
  };

  let liveRates: Record<string, number> = {};
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/ILS', { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = await res.json();
      if (data.rates) {
        for (const code of Object.keys(CURRENCY_NAMES)) {
          if (data.rates[code] && data.rates[code] > 0) {
            liveRates[code] = Math.round((1 / data.rates[code]) * 10000) / 10000;
          }
        }
      }
    }
  } catch { /* fallback below */ }

  // Fallback to fawazahmed0
  if (Object.keys(liveRates).length < 3) {
    try {
      const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/ils.json', { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = await res.json();
        const ilsRates = data.ils;
        if (ilsRates) {
          for (const code of Object.keys(CURRENCY_NAMES)) {
            if (!liveRates[code] && ilsRates[code.toLowerCase()] && ilsRates[code.toLowerCase()] > 0) {
              liveRates[code] = Math.round((1 / ilsRates[code.toLowerCase()]) * 10000) / 10000;
            }
          }
        }
      }
    } catch { /* use what we have */ }
  }

  // Detect conversion request (e.g., "500 يورو لشيكل كم")
  let conversionInfo = '';
  if (keyword) {
    const convMatch = keyword.match(/(\d[\d,\.]*)\s*(دولار|يورو|دينار|جنيه\s*إسترليني|جنيه\s*مصري|ليرة|شيكل)/i);
    if (convMatch) {
      const amount = parseFloat(convMatch[1].replace(/,/g, ''));
      const currWord = convMatch[2];
      const codeMap: Record<string, string> = {
        'دولار': 'USD', 'يورو': 'EUR', 'دينار': 'JOD',
        'جنيه إسترليني': 'GBP', 'جنيه مصري': 'EGP', 'ليرة': 'TRY', 'شيكل': 'ILS',
      };
      let fromCode = '';
      for (const [word, code] of Object.entries(codeMap)) {
        if (currWord.includes(word) || word.includes(currWord)) { fromCode = code; break; }
      }
      
      if (fromCode && fromCode !== 'ILS' && liveRates[fromCode]) {
        const ilsAmount = amount * liveRates[fromCode];
        conversionInfo = `
=== تحويل العملة ===
${amount} ${CURRENCY_NAMES[fromCode]} = ${ilsAmount.toFixed(2)} ₪ (شيكل إسرائيلي)
سعر الصرف المستخدم: 1 ${CURRENCY_NAMES[fromCode]} = ${liveRates[fromCode]} ₪
`;
      } else if (fromCode === 'ILS') {
        // Converting from ILS to another currency
        const toMatch = keyword.match(/(?:ل|بال|إلى|ب)(دولار|يورو|دينار|جنيه|ليرة)/i);
        if (toMatch) {
          let toCode = '';
          for (const [word, code] of Object.entries(codeMap)) {
            if (toMatch[1].includes(word) || word.includes(toMatch[1])) { toCode = code; break; }
          }
          if (toCode && liveRates[toCode]) {
            const foreignAmount = amount / liveRates[toCode];
            conversionInfo = `
=== تحويل العملة ===
${amount} شيكل = ${foreignAmount.toFixed(2)} ${CURRENCY_NAMES[toCode]}
سعر الصرف المستخدم: 1 ${CURRENCY_NAMES[toCode]} = ${liveRates[toCode]} ₪
`;
          }
        }
      }
    }
  }

  // Also get user's registered currencies
  const { data: currencies } = await supabase
    .from('currencies')
    .select('code, name_ar, symbol, is_base, is_active')
    .eq('user_id', userId)
    .eq('is_active', true);

  let result = '';
  if (conversionInfo) {
    result += conversionInfo;
  }

  result += `
=== أسعار الصرف الحية مقابل الشيكل (₪) ===
${Object.entries(liveRates).map(([code, rate]) => `  1 ${CURRENCY_NAMES[code]} (${code}) = ${rate} ₪`).join('\n')}
تاريخ التحديث: ${new Date().toISOString().split('T')[0]}
`;

  if (currencies && currencies.length > 0) {
    result += `\nالعملات المسجلة في النظام:\n${currencies.map((c: any) => `  ${c.code} (${c.name_ar}) ${c.symbol}${c.is_base ? ' — العملة الأساسية' : ''}`).join('\n')}\n`;
  }

  return result;
}

async function fetchIncomeStatement(supabase: any, userId: string, dateFrom: string, dateTo: string): Promise<string> {
  const { data: txns } = await supabase
    .from('transactions')
    .select('amount, debit_account_code, credit_account_code, description, is_deleted, is_opening_balance')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .gte('transaction_date', dateFrom)
    .lte('transaction_date', dateTo);

  const all = (txns || []).filter((t: any) => !t.is_opening_balance && !/رصيد\s*(ابتدائي|افتتاحي)/i.test(t.description || ''));

  const sumByCode = (field: string, prefix: string) =>
    all.filter((t: any) => t[field]?.startsWith(prefix)).reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);

  const revenue = sumByCode('credit_account_code', '4');
  const cogs = sumByCode('debit_account_code', '51');
  const grossProfit = revenue - cogs;

  // Detailed expenses by sub-category
  const expenseCategories: Record<string, number> = {};
  all.filter((t: any) => t.debit_account_code?.startsWith('5') && !t.debit_account_code?.startsWith('51')).forEach((t: any) => {
    const code = t.debit_account_code?.substring(0, 2) || '59';
    const name = code === '52' ? 'مصاريف إدارية' :
      code === '53' ? 'مصاريف تشغيلية' :
      code === '54' ? 'مصاريف بيعية' :
      t.description?.includes('راتب') || t.description?.includes('أجر') ? 'رواتب وأجور' : 'مصاريف أخرى';
    expenseCategories[name] = (expenseCategories[name] || 0) + (Number(t.amount) || 0);
  });

  const totalOpex = Object.values(expenseCategories).reduce((a, b) => a + b, 0);
  const netProfit = grossProfit - totalOpex;

  // Other income (account 7xxx)
  const otherIncome = sumByCode('credit_account_code', '7');
  const otherExpense = sumByCode('debit_account_code', '7');

  return `
=== قائمة الدخل من ${dateFrom} إلى ${dateTo} (بيانات حقيقية) ===

إيرادات المبيعات:                    ${revenue.toFixed(2)} ₪
(-) تكلفة البضاعة المباعة:          (${cogs.toFixed(2)}) ₪
────────────────────────────
= مجمل الربح:                       ${grossProfit.toFixed(2)} ₪
نسبة مجمل الربح:                    ${revenue > 0 ? ((grossProfit / revenue) * 100).toFixed(1) : 0}%

(-) المصاريف التشغيلية:
${Object.entries(expenseCategories).map(([name, amount]) => `    - ${name}:  (${amount.toFixed(2)}) ₪`).join('\n')}
إجمالي المصاريف التشغيلية:          (${totalOpex.toFixed(2)}) ₪
────────────────────────────
= صافي الربح التشغيلي:              ${(grossProfit - totalOpex).toFixed(2)} ₪
${otherIncome > 0 || otherExpense > 0 ? `(+/-) إيرادات/مصاريف أخرى:         ${(otherIncome - otherExpense).toFixed(2)} ₪` : ''}
────────────────────────────
= صافي الربح النهائي:               ${(netProfit + otherIncome - otherExpense).toFixed(2)} ₪
`;
}

async function fetchTopCustomers(supabase: any, userId: string, dateFrom: string, dateTo: string): Promise<string> {
  const { data: contacts } = await supabase
    .from('contacts')
    .select('contact_name, contact_type, current_balance, total_sales, total_paid, contact_class, avg_payment_days')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('contact_type', ['عميل', 'زبون'])
    .order('total_sales', { ascending: false })
    .limit(10);

  if (!contacts || contacts.length === 0) {
    return '\nلا يوجد زبائن مسجلون.\n';
  }

  const totalAllSales = contacts.reduce((s: number, c: any) => s + (Number(c.total_sales) || 0), 0);

  return `
=== أفضل الزبائن (بيانات حقيقية) ===
${contacts.map((c: any, i: number) => {
    const pct = totalAllSales > 0 ? ((Number(c.total_sales) || 0) / totalAllSales * 100).toFixed(1) : '0';
    return `  ${i + 1}. ${c.contact_name}
     المبيعات: ${c.total_sales || 0} ₪ (${pct}% من الإجمالي)
     المحصل: ${c.total_paid || 0} ₪
     الرصيد: ${c.current_balance || 0} ₪
     التصنيف: ${c.contact_class || '-'}
     متوسط أيام الدفع: ${c.avg_payment_days || '-'}`;
  }).join('\n')}
`;
}

async function fetchOldestEmployee(supabase: any, userId: string): Promise<string> {
  const { data: oldest } = await supabase
    .from('employees')
    .select('full_name, department, job_title, start_date, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .not('start_date', 'is', null)
    .order('start_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!oldest?.start_date) {
    return '\nلا توجد تواريخ تعيين مسجلة للموظفين في النظام.\n';
  }

  const startDate = new Date(oldest.start_date);
  const now = new Date();
  const years = Math.max(0, now.getFullYear() - startDate.getFullYear() - (now < new Date(now.getFullYear(), startDate.getMonth(), startDate.getDate()) ? 1 : 0));

  return `
=== أقدم موظف (بيانات حقيقية) ===
الاسم: ${oldest.full_name}
المسمى الوظيفي: ${oldest.job_title || oldest.department || 'عام'}
تاريخ التعيين: ${oldest.start_date}
سنوات الخدمة التقريبية: ${years} سنة
الحالة: ${oldest.is_active !== false ? 'نشط' : 'غير نشط'}
`;
}

async function fetchHRSummary(supabase: any, userId: string): Promise<string> {
  const { data: employees } = await supabase
    .from('employees')
    .select('full_name, department, base_salary, is_active, start_date, job_title')
    .eq('user_id', userId)
    .limit(500);

  if (!employees || employees.length === 0) {
    return '\nلا يوجد موظفون مسجلون في النظام.\n';
  }

  const active = employees.filter((e: any) => e.is_active !== false);
  const totalSalaries = active.reduce((s: number, e: any) => s + (Number(e.base_salary) || 0), 0);

  // Recent payroll
  const { data: payroll } = await supabase
    .from('employee_payroll')
    .select('employee_id, net_salary, period_month, period_year, is_paid')
    .eq('user_id', userId)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .limit(20);

  return `
=== ملخص الموارد البشرية (بيانات حقيقية) ===
إجمالي الموظفين: ${employees.length}
الموظفون النشطون: ${active.length}
إجمالي الرواتب الشهرية: ${totalSalaries.toFixed(2)} ₪

الموظفون:
${employees.map((e: any) => `  ${e.full_name} — ${e.job_title || e.department || 'عام'} — الراتب: ${e.base_salary || 0} ₪ — تاريخ التعيين: ${e.start_date || 'غير محدد'} — ${e.is_active !== false ? 'نشط' : 'غير نشط'}`).join('\n')}

${payroll && payroll.length > 0 ? `\nآخر الرواتب المسجلة:\n${payroll.slice(0, 10).map((p: any) => `  فترة ${p.period_month}/${p.period_year}: ${p.net_salary} ₪ — ${p.is_paid ? 'مدفوع' : 'معلق'}`).join('\n')}` : ''}
`;
}

async function fetchAccountLedger(supabase: any, userId: string, accountName: string, dateFrom: string, dateTo: string): Promise<string> {
  // Find account by name or code
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, account_code, account_name, account_type')
    .eq('user_id', userId)
    .or(`account_name.ilike.%${accountName}%,account_code.eq.${accountName}`);

  if (!accounts || accounts.length === 0) {
    // Try as contact name
    return await fetchContactBalance(supabase, userId, accountName);
  }

  const account = accounts[0];
  const { data: txns } = await supabase
    .from('transactions')
    .select('transaction_date, description, amount, debit_account_code, credit_account_code, reference')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .or(`debit_account_code.eq.${account.account_code},credit_account_code.eq.${account.account_code}`)
    .gte('transaction_date', dateFrom)
    .lte('transaction_date', dateTo)
    .order('transaction_date', { ascending: true });

  let runningBalance = 0;
  const entries = (txns || []).map((t: any) => {
    const isDebit = t.debit_account_code === account.account_code;
    const debit = isDebit ? t.amount : 0;
    const credit = isDebit ? 0 : t.amount;
    runningBalance += debit - credit;
    return `  ${t.transaction_date} | ${t.description || '-'} | مدين: ${debit} | دائن: ${credit} | رصيد: ${runningBalance.toFixed(2)} ₪`;
  });

  return `
=== دفتر أستاذ: ${account.account_name} (${account.account_code}) — ${account.account_type} ===
الفترة: ${dateFrom} إلى ${dateTo}
عدد الحركات: ${entries.length}

${entries.join('\n') || '  لا توجد حركات في هذه الفترة'}

الرصيد النهائي: ${runningBalance.toFixed(2)} ₪
`;
}

async function fetchSearchTransactions(supabase: any, userId: string, keyword: string, dateFrom: string, dateTo: string): Promise<string> {
  const cleanKeyword = keyword.replace(/ابحث\s+عن|بحث/gi, '').trim();
  
  const { data: txns } = await supabase
    .from('transactions')
    .select('transaction_date, description, amount, transaction_type, reference, debit_account_code, credit_account_code')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .ilike('description', `%${cleanKeyword}%`)
    .gte('transaction_date', dateFrom)
    .lte('transaction_date', dateTo)
    .order('transaction_date', { ascending: false })
    .limit(20);

  if (!txns || txns.length === 0) {
    return `\nلم يتم العثور على نتائج لـ "${cleanKeyword}".\n`;
  }

  return `
=== نتائج البحث عن "${cleanKeyword}" ===
عدد النتائج: ${txns.length}

${txns.map((t: any) => `  ${t.transaction_date} | ${t.description} | ${t.amount} ₪ | ${t.transaction_type} | مرجع: ${t.reference || '-'}`).join('\n')}
`;
}

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
    return `\n=== بيانات نقطة البيع بتاريخ ${dateFrom} ===\nلا توجد فواتير مسجلة بهذا التاريخ.\n`;
  }

  const totalSales = orders.reduce((s: number, o: any) => s + (Number(o.total) || 0), 0);
  const totalDiscount = orders.reduce((s: number, o: any) => s + (Number(o.discount_amount) || 0), 0);
  const invoiceCount = orders.length;
  const avgInvoice = Math.round(totalSales / invoiceCount);

  const paymentBreakdown: Record<string, { count: number; total: number }> = {};
  orders.forEach((o: any) => {
    const method = o.payment_currency || o.currency || 'نقدي';
    if (!paymentBreakdown[method]) paymentBreakdown[method] = { count: 0, total: 0 };
    paymentBreakdown[method].count++;
    paymentBreakdown[method].total += Number(o.total) || 0;
  });

  const hourSales: Record<number, { count: number; total: number }> = {};
  orders.forEach((o: any) => {
    const hour = new Date(o.created_at).getHours();
    if (!hourSales[hour]) hourSales[hour] = { count: 0, total: 0 };
    hourSales[hour].count++;
    hourSales[hour].total += Number(o.total) || 0;
  });
  const peakHour = Object.entries(hourSales).sort((a, b) => b[1].total - a[1].total)[0];

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
      const topProducts = Object.entries(productSales).sort((a, b) => b[1].total - a[1].total).slice(0, 10);
      productSection = `\nأكثر المنتجات مبيعاً:\n${topProducts.map(([name, data], i) => `  ${i + 1}. ${name}: ${data.qty} وحدة — ${data.total} ₪`).join('\n')}`;
    }
  }

  return `
=== بيانات نقطة البيع ${dateFrom} (بيانات حقيقية) ===
إجمالي المبيعات: ${totalSales.toFixed(2)} ₪
عدد الفواتير: ${invoiceCount}
متوسط الفاتورة: ${avgInvoice} ₪
الخصومات: ${totalDiscount.toFixed(2)} ₪
ساعة الذروة: ${peakHour ? `${peakHour[0]}:00 (${peakHour[1].count} فاتورة — ${peakHour[1].total.toFixed(2)} ₪)` : 'غير متاح'}

طرق الدفع:
${Object.entries(paymentBreakdown).map(([method, d]) => `  ${method}: ${d.count} فاتورة — ${d.total.toFixed(2)} ₪`).join('\n')}
${productSection}
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

    // Detect all intents and fetch data in parallel
    const intents = detectIntents(lastUserMessage);
    const dataPromises: Promise<string>[] = [];

    for (const intent of intents) {
      try {
        switch (intent.type) {
          case 'financial_summary':
            dataPromises.push(fetchFinancialSummary(supabaseAdmin, userId, intent.dateFrom || monthStartISO(), intent.dateTo || todayISO()));
            break;
          case 'cash_position':
            dataPromises.push(fetchCashPosition(supabaseAdmin, userId));
            break;
          case 'contact_balance':
            if (intent.contactName) dataPromises.push(fetchContactBalance(supabaseAdmin, userId, intent.contactName));
            break;
          case 'account_statement':
            if (intent.contactName) dataPromises.push(fetchContactBalance(supabaseAdmin, userId, intent.contactName));
            break;
          case 'account_ledger':
            if (intent.contactName) dataPromises.push(fetchAccountLedger(supabaseAdmin, userId, intent.contactName, intent.dateFrom || monthStartISO(), intent.dateTo || todayISO()));
            break;
          case 'overdue_receivables':
            dataPromises.push(fetchOverdueReceivables(supabaseAdmin, userId, intent.contactName));
            break;
          case 'overdue_payables':
            dataPromises.push(fetchOverduePayables(supabaseAdmin, userId));
            break;
          case 'inventory_check':
            dataPromises.push(fetchInventoryData(supabaseAdmin, userId, intent.productName));
            break;
          case 'income_statement':
            dataPromises.push(fetchIncomeStatement(supabaseAdmin, userId, intent.dateFrom || monthStartISO(), intent.dateTo || todayISO()));
            break;
          case 'cheques':
            dataPromises.push(fetchChequesData(supabaseAdmin, userId, intent.contactName));
            break;
          case 'exchange_rates':
            dataPromises.push(fetchExchangeRates(supabaseAdmin, userId, intent.keyword));
            break;
          case 'top_customers':
            dataPromises.push(fetchTopCustomers(supabaseAdmin, userId, intent.dateFrom || yearStartISO(), intent.dateTo || todayISO()));
            break;
          case 'oldest_employee':
            dataPromises.push(fetchOldestEmployee(supabaseAdmin, userId));
            break;
          case 'hr_summary':
            dataPromises.push(fetchHRSummary(supabaseAdmin, userId));
            break;
          case 'search_transactions':
            dataPromises.push(fetchSearchTransactions(supabaseAdmin, userId, intent.keyword || lastUserMessage, intent.dateFrom || yearStartISO(), intent.dateTo || todayISO()));
            break;
          case 'pos_analysis':
            dataPromises.push(fetchPOSData(supabaseAdmin, userId, intent.dateFrom || todayISO(), intent.dateTo || todayISO()));
            break;
        }
      } catch (err) {
        console.error(`Error creating promise for intent ${intent.type}:`, err);
      }
    }

    // Fetch all data in parallel
    let intentDataSection = '';
    try {
      const results = await Promise.allSettled(dataPromises);
      intentDataSection = results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
        .map(r => r.value)
        .join('\n');
    } catch (err) {
      console.error('Data fetch error:', err);
      intentDataSection = '\nتعذر جلب بعض البيانات من قاعدة البيانات.\n';
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
=== البيانات المالية العامة (من الواجهة) ===
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

    // Get company settings
    let companyName = 'الشركة';
    try {
      const { data: settings } = await supabaseAdmin
        .from('company_settings')
        .select('company_name, base_currency')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      if (settings?.company_name) companyName = settings.company_name;
    } catch { /* ignore */ }

    const systemPrompt = `أنت "المحاسب الذكي" — محاسب احترافي مدمج في نظام AMWALI أموالي لإدارة الأعمال والمحاسبة.
اسم الشركة: ${companyName}
اليوم: ${new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

## ═══ تحليل الأوامر المتعددة ═══
المستخدم قد يرسل عدة عمليات محاسبية في رسالة واحدة.
يجب عليك:
1. فصل الرسالة إلى عمليات منفصلة
2. تحليل كل عملية على حدة
3. تنفيذ كل عملية بشكل مستقل
4. إرجاع نتيجة كل عملية منفصلة

كيفية الفصل:
- كل سطر جديد قد يكون عملية جديدة
- الكلمات التي تبدأ عملية جديدة: بعت، شريت، صرفت، قبضت، حولت، دفعت، سجل، أنشئ، استلمت، أودعت، سحبت، حصلت، أعطيت، أخذت
- إذا تغيّر نوع العملية (من بيع إلى صرف مثلاً) = عملية جديدة
- لا تدمج العمليات أبداً ولا تعاملها كرسالة واحدة

مثال: "بعت أحمد 3 كراسي بـ 200 | صرفت 100 بنزين | قبضت 500 من محمد"
= 3 عمليات منفصلة يجب تنفيذ كل واحدة وعرض نتيجتها.

إذا كان هناك غموض في عملية واحدة، اسأل عنها فقط واستمر في تنفيذ الباقي.

## هويتك
- الاسم: المحاسب الذكي
- النظام: AMWALI أموالي
- خبرة 20+ سنة في المحاسبة والمالية والتحليل المالي
- ملم بمعايير المحاسبة الدولية (IFRS/IAS) ومعايير التقارير المالية
- خبير في قانون العمل الفلسطيني والأردني، والضرائب والزكاة
- دورك: محاسب ذكي يجيب على أي سؤال مالي أو محاسبي بدقة 100% من البيانات الفعلية
- شخصيتك: مهني، ودود، واثق، تقدم نصائح عملية بأسلوب محاسب خبير يتحدث مع صاحب العمل

## قواعد التعريف بالنفس
- ✅ "بصفتي المحاسب الذكي في نظام AMWALI أموالي"
- ✅ "حسب بيانات النظام" أو "من واقع سجلاتك في أموالي"
- ❌ لا تذكر QOYOD أو قيود أو ZIDNI أو زِدني أو HASEEB أو حسيب أبداً

## قدراتك
✅ قراءة جميع البيانات المالية والمحاسبية من قاعدة البيانات فوراً
✅ تنفيذ العمليات المحاسبية (قبض، صرف، بيع، شراء، إيداع، سحب)
✅ إضافة زبائن وموردين وموظفين ومنتجات وحسابات مباشرة من المحادثة
✅ توليد التقارير المالية الفورية (أرباح وخسائر، ميزان مراجعة، كشوف حسابات)
✅ تحليل الأداء المالي وتقديم توصيات وتنبيهات مبنية على البيانات
✅ تسجيل الشيكات الواردة والصادرة
✅ تحويل العملات بأسعار حية
✅ تحليل المخزون والمنتجات
✅ حساب نسب مالية (السيولة، الربحية، الدوران)

## كيفية تنفيذ العمليات
عند طلب تسجيل عملية أو إضافة كيان، وجّه المستخدم لكتابة الأمر بالصيغة المناسبة:

### العمليات المالية:
- قبض: "قبضت من محمد 500 شيكل نقداً"
- صرف: "دفعت لشركة النور 2000 شيكل من البنك"
- بيع: "بعت شركة النور 10 كيلو طحين بـ 50 شيكل"
- شراء: "اشتريت من المورد أحمد 20 كرتون بـ 100 الكرتون"
- إيداع: "أودعت في البنك 5000 شيكل"
- سحب: "سحبت من البنك 3000 شيكل"
- شيك وارد: "قبضت شيك من سالم 1000 شيكل بتاريخ 15/4/2026"
- شيك صادر: "دفعت شيك لشركة النور 2000 شيكل بتاريخ 20/5/2026"

### إضافة كيانات جديدة:
- زبون: "أضف زبون أحمد 0599311885"
- مورد: "أضف مورد شركة النور 0598765432"
- موظف: "أضف موظف سامي محاسب راتب 4000"
- منتج: "أضف منتج طحين بيع 25 شراء 18 كمية 100"
- حساب: "أضف حساب مصروفات التسويق رمز 5300 نوع مصروفات"

### الاستعلامات والتقارير:
- "شو وضعي المالي؟" — ملخص مالي شامل
- "كم على محمد؟" — رصيد جهة اتصال
- "أرباح وخسائر الشهر" — قائمة الدخل
- "الذمم المتأخرة" — المبالغ المستحقة
- "كشف حساب أحمد" — حركات مفصلة
- "مبيعات اليوم" — تحليل نقطة البيع
- "سعر الدولار" — أسعار صرف حية
- "كم عندي من طحين؟" — استعلام مخزون
- "آخر 10 معاملات" — آخر الحركات

## سياق المستخدم
- اسم المستخدم: ${userName || 'المستخدم'}
- الصفحة الحالية: ${pageContext}

## البيانات المتاحة من قاعدة البيانات
${baseDataSection}
${intentDataSection}

## ⛔ قواعد ذهبية غير قابلة للكسر ⛔
1. ❌ ممنوع منعاً باتاً أن تخترع أرقاماً — استخدم فقط البيانات الحقيقية الموجودة أعلاه
2. ❌ ممنوع أن تطلب من المستخدم تزويدك بأرقام موجودة في النظام
3. ✅ إذا لم تجد البيانات المطلوبة في الأقسام أعلاه، قل: "لا توجد بيانات لهذا الموضوع في النظام حالياً"
4. ✅ دائماً اذكر مصدر البيانات: "حسب بيانات النظام" أو "من واقع سجلاتك"
5. ✅ للأرقام: استخدم فاصل الآلاف ورمز ₪ (مثال: 12,500 ₪)
6. ✅ أكمل إجابتك كاملة بدون انقطاع
7. ✅ لا تستخدم ** حول النصوص — اكتب بشكل عادي بدون تنسيق markdown
8. ✅ استخدم الأرقام العربية (1, 2, 3) وليس الهندية

## أسلوب الإجابة
- ابدأ بالإجابة المباشرة على السؤال ثم أضف التحليل
- عند عرض أرقام مالية، قدم تحليلاً مختصراً: هل الوضع جيد أم يحتاج انتباه؟
- عند وجود مشاكل مالية (ذمم مرتفعة، سيولة منخفضة)، نبّه بلطف مع اقتراح حل عملي
- لا تكرر السؤال في إجابتك — ادخل مباشرة في الموضوع
- استخدم جمل قصيرة ونقاط مرقمة عند الحاجة
- عند سؤال بسيط (كم رصيدي؟)، أجب بجملة أو اثنتين فقط — لا تطل
- عند سؤال تحليلي (شو وضعي المالي؟)، قدم تحليلاً مفصلاً مع نسب وتوصيات

## استخراج الأسماء
عند ذكر المستخدم لاسم شخص أو شركة:
- استخرج الاسم مباشرة من الجملة بدون الحاجة لأي رمز خاص مثل @
- مثال: "كم على شركة النور" → الاسم هو "شركة النور"
- البيانات عن هذا الشخص/الشركة ستكون في الأقسام أعلاه إذا كانت موجودة في النظام

## أزرار الإجراءات
عند اقتراح إجراء، استخدم هذا الشكل: [action:نص الزر:/المسار]
أمثلة:
[action:عرض المبيعات:/invoices]
[action:ميزان المراجعة:/trial-balance]
[action:كشف الحساب:/account-statement]
[action:تقرير الأرباح:/profit-loss]
[action:عرض المخزون:/inventory]
[action:إدارة الموظفين:/employees]
[action:الشيكات:/cheques]
[action:العملاء والموردين:/contacts]
[action:لوحة المعلومات:/dashboard]

قواعد:
- لا تكتب أكثر من 3 أزرار في رد واحد
- النص 2-4 كلمات
- المسار يبدأ بـ /

## المسارات المتاحة
/invoices /contacts /transactions /accounts /trial-balance /profit-loss
/account-statement /balance-sheet /inventory /employees /cheques /pos
/reports /general-ledger /finance/receipts /finance/payments /orders
/dashboard /billing /settings /reports/periodic

⛔ لا تستخدم مسارات مثل /sales أو /purchases — غير موجودة

## قواعد إضافية
- أجب بالعربية الفصحى البسيطة بشكل مختصر ومهني
- قدم إجابات عملية وقابلة للتنفيذ مع تحليل وملاحظات
- إذا طلب المستخدم تسجيل عملية أو إضافة كيان، أخبره أن النظام سينفذ الأمر مباشرة عند كتابته بالصيغة الصحيحة
- عند سؤال عن تقرير مخزون، استخدم البيانات الموجودة في قسم "بيانات المخزون" أعلاه
- عند سؤال عام عن المحاسبة أو المعايير أو القوانين، أجب من خبرتك دون الحاجة لبيانات النظام
`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
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
