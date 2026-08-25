import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest, corsHeaders } from "../_shared/auth.ts";

// Normalize Arabic text for matching
function normalizeArabic(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

function stripAl(s: string): string {
  return s.split(/\s+/).map(w => w.replace(/^ال/, '')).join(' ');
}

function wordSimilarity(a: string, b: string): number {
  const wordsA = stripAl(normalizeArabic(a)).split(/\s+/).filter(Boolean);
  const wordsB = stripAl(normalizeArabic(b)).split(/\s+/).filter(Boolean);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const matched = wordsA.filter(wa => wordsB.some(wb => wa === wb || wa.includes(wb) || wb.includes(wa)));
  return matched.length / Math.max(wordsA.length, wordsB.length);
}

function findContactByName(
  contacts: { id: string; name: string }[],
  name: string,
): string | null {
  const normalizedName = normalizeArabic(name);
  const strippedName = stripAl(normalizedName);

  for (const contact of contacts) {
    const cn = normalizeArabic(contact.name || "");
    const scn = stripAl(cn);
    if (!cn) continue;
    if (cn === normalizedName || scn === strippedName ||
        normalizedName.includes(cn) || cn.includes(normalizedName) ||
        strippedName.includes(scn) || scn.includes(strippedName)) {
      return contact.id;
    }
  }

  let bestMatch: { id: string; score: number } | null = null;
  for (const contact of contacts) {
    const score = wordSimilarity(name, contact.name || "");
    if (score >= 0.6 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { id: contact.id, score };
    }
  }
  return bestMatch?.id || null;
}

// Detect if text is an opening balance entry
function isOpeningBalance(text: string): boolean {
  const patterns = [
    /رصيد\s*(ابتدائي|افتتاحي|مدور|أول\s*المدة)/i,
    /opening\s*balance/i,
  ];
  return patterns.some(p => p.test(text));
}

// Extract potential contact name from Arabic text
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
      if (!skipWords.some(w => name.includes(w)) && name.length >= 3) {
        return name;
      }
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;
    const authenticatedUserId = authResult.userId;

    const WEBHOOK_URL = Deno.env.get('MAKECOM_WEBHOOK_URL');
    if (!WEBHOOK_URL) throw new Error('MAKECOM_WEBHOOK_URL is not configured');

    const { text, userId, email, companyName, mentionedContactName, mentionedContactId } = await req.json();
    if (!text) throw new Error('Transaction text is required');

    if (userId && userId !== authenticatedUserId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ownerId = userId || authenticatedUserId;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Load the caller's own accounts + contacts from the database
    const [accRes, conRes] = await Promise.all([
      supabase.from('accounts')
        .select('id, account_code, account_name, account_type')
        .eq('user_id', ownerId)
        .limit(500),
      supabase.from('contacts')
        .select('id, contact_name, contact_type, phone, email')
        .eq('user_id', ownerId)
        .limit(500),
    ]);

    const accountsDetailed = (accRes.data || []).map((a: any) => ({
      id: a.id,
      code: a.account_code,
      name: a.account_name,
      type: a.account_type || '',
    }));
    const accountsList = accountsDetailed.map(a => a.name).join(', ');

    const contactsDetailed = (conRes.data || []).map((c: any) => ({
      id: c.id,
      name: c.contact_name,
      type: c.contact_type || '',
      phone: c.phone || '',
      email: c.email || '',
    }));

    let contactName: string | null = mentionedContactName || extractContactName(text);
    let contactRecordId: string | null = null;

    if (mentionedContactId) {
      contactRecordId = mentionedContactId;
    } else if (contactName) {
      contactRecordId = findContactByName(contactsDetailed, contactName);
    }

    // Look up the contact's corresponding account (Customer X / Supplier X)
    let contactAccountName = '';
    let contactAccountId = '';
    if (contactName) {
      const normalizedContact = normalizeArabic(contactName);
      const acc = accountsDetailed.find(a => normalizeArabic(a.name || '').includes(normalizedContact));
      if (acc) {
        contactAccountName = acc.name;
        contactAccountId = acc.id;
      }
    }

    const openingBalance = isOpeningBalance(text);

    // Detect payment method from text
    const paymentMethodHints: Record<string, string> = {};
    const lowerText = text.toLowerCase();
    if (/آجل|على الحساب|بالدين|دين/.test(lowerText)) {
      paymentMethodHints.instruction = 'طريقة الدفع آجل: يجب استخدام حساب "ذمم موردين" (للمشتريات) أو "ذمم العملاء" (للمبيعات) كحساب دائن/مدين. لا تستخدم "بنك" أو "صندوق" أبداً في العمليات الآجلة.';
    } else if (/نقد|كاش|نقداً/.test(lowerText)) {
      paymentMethodHints.instruction = 'طريقة الدفع نقد: استخدم حساب "صندوق" أو "الصندوق".';
    } else if (/شيك/.test(lowerText)) {
      paymentMethodHints.instruction = 'طريقة الدفع شيك: استخدم حساب "شيكات" أو "أوراق قبض/دفع".';
    } else if (/تحويل|بنك/.test(lowerText)) {
      paymentMethodHints.instruction = 'طريقة الدفع تحويل بنكي: استخدم حساب "البنك".';
    }

    let aiInstruction = '';
    if (paymentMethodHints.instruction) {
      aiInstruction += `\n⚠️ قاعدة إلزامية: ${paymentMethodHints.instruction}\n`;
    }

    if (openingBalance) {
      aiInstruction += `تنبيه مهم جداً: هذه العملية هي رصيد افتتاحي/مدور وليست عملية تشغيلية عادية.
يجب أن يكون:
- نوع العملية: "رصيد ابتدائي"
- القيد: إذا مدين → مدين: حساب الجهة، دائن: أرصدة افتتاحية. إذا دائن → العكس.
- لا يؤثر على الأرباح والخسائر.
- is_opening_balance = true
${contactAccountName ? `- استخدم حساب "${contactAccountName}" وليس "العملاء" العام.` : ''}`;
    } else if (contactAccountName) {
      aiInstruction += `تنبيه مهم: عند تسجيل هذه المعاملة، يجب استخدام حساب "${contactAccountName}" كحساب مدين أو دائن (حسب نوع العملية) بدلاً من حساب "العملاء" العام. لا تستخدم "العملاء" أبداً إذا كان هناك حساب خاص بالجهة.`;
    }

    aiInstruction += `\n\nقواعد توجيه الحسابات حسب طريقة الدفع:
- نقد/كاش → صندوق
- تحويل/بنك → البنك
- شيك → شيكات / أوراق قبض أو دفع
- آجل/على الحساب/بالدين → ذمم العملاء (للمبيعات) أو ذمم الموردين (للمشتريات)
لا تخلط أبداً بين هذه الحسابات.`;

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        userId: ownerId,
        email: email || '',
        client_name: companyName || '',
        contactRecordId: contactRecordId || '',
        contactName: contactName || '',
        contactAccountName: contactAccountName || '',
        contactAccountId: contactAccountId || '',
        accounts_list: accountsList,
        accounts_detailed: accountsDetailed,
        contacts_detailed: contactsDetailed,
        timestamp: new Date().toISOString(),
        source: 'web_app',
        is_opening_balance: openingBalance,
        ai_instruction: aiInstruction,
      }),
    });

    let responseData;
    try {
      responseData = await response.json();
    } catch {
      responseData = { status: response.status };
    }

    return new Response(JSON.stringify({ success: true, data: responseData, contactLinked: !!contactRecordId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
