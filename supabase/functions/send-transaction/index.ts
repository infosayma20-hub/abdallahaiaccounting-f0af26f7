import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getClientRecordId(baseId: string, apiKey: string, clientUUID: string): Promise<string | null> {
  const filter = encodeURIComponent(`{Client Name}="${clientUUID}"`);
  const url = `https://api.airtable.com/v0/${baseId}/Clients?filterByFormula=${filter}&pageSize=1`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` } });
  if (!res.ok) return null;
  const data = await res.json();
  return data.records?.[0]?.id || null;
}

async function findContactByName(baseId: string, apiKey: string, clientUUID: string, name: string): Promise<string | null> {
  // First resolve client UUID to Airtable record ID
  const clientRecordId = await getClientRecordId(baseId, apiKey, clientUUID);
  if (!clientRecordId) {
    console.log(`Client record not found for UUID: ${clientUUID}`);
    return null;
  }
  console.log(`Client UUID ${clientUUID} → Record ID ${clientRecordId}`);

  // Fetch contacts linked to this client record
  const url = `https://api.airtable.com/v0/${baseId}/Contacts?pageSize=100`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` } });
  if (!res.ok) return null;
  const data = await res.json();
  
  const contacts = (data.records || []).filter((c: any) => {
    const cf = c.fields["Client"];
    if (!cf) return false;
    if (Array.isArray(cf)) return cf.includes(clientRecordId);
    return cf === clientRecordId;
  });

  // Normalize Arabic text: remove ال prefix, diacritics, normalize common chars
  function normalizeArabic(s: string): string {
    return s
      .trim()
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, '') // remove tashkeel
      .replace(/[أإآ]/g, 'ا')               // normalize alef variants
      .replace(/ة/g, 'ه')                   // taa marbuta → haa
      .replace(/ى/g, 'ي');                   // alef maqsura → yaa
  }

  // Strip ال from each word for comparison
  function stripAl(s: string): string {
    return s.split(/\s+/).map(w => w.replace(/^ال/, '')).join(' ');
  }

  // Calculate word overlap similarity (0-1)
  function wordSimilarity(a: string, b: string): number {
    const wordsA = stripAl(normalizeArabic(a)).split(/\s+/).filter(Boolean);
    const wordsB = stripAl(normalizeArabic(b)).split(/\s+/).filter(Boolean);
    if (wordsA.length === 0 || wordsB.length === 0) return 0;
    const matched = wordsA.filter(wa => wordsB.some(wb => wa === wb || wa.includes(wb) || wb.includes(wa)));
    return matched.length / Math.max(wordsA.length, wordsB.length);
  }

  // Search for best match
  const normalizedName = normalizeArabic(name);
  const strippedName = stripAl(normalizedName);

  // Pass 1: exact or substring match (with ال normalization)
  for (const contact of contacts) {
    const cn = normalizeArabic(contact.fields["Contact Name"] || "");
    const scn = stripAl(cn);
    if (cn === normalizedName || scn === strippedName ||
        normalizedName.includes(cn) || cn.includes(normalizedName) ||
        strippedName.includes(scn) || scn.includes(strippedName)) {
      return contact.id;
    }
  }

  // Pass 2: high word similarity (≥60% word overlap)
  let bestMatch: { id: string; score: number } | null = null;
  for (const contact of contacts) {
    const cn = contact.fields["Contact Name"] || "";
    const score = wordSimilarity(name, cn);
    if (score >= 0.6 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { id: contact.id, score };
    }
  }
  if (bestMatch) {
    console.log(`Fuzzy match: "${name}" → contact ${bestMatch.id} (score: ${bestMatch.score})`);
    return bestMatch.id;
  }

  return null;
}

async function linkContactToLatestTransaction(baseId: string, apiKey: string, clientUUID: string, contactId: string, description: string, contactName: string) {
  const clientRecordId = await getClientRecordId(baseId, apiKey, clientUUID);
  if (!clientRecordId) {
    console.log('linkContact: client record not found');
    return;
  }

  // Normalize Arabic for matching
  function normAr(s: string): string {
    return s.trim().toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
      .split(/\s+/).map(w => w.replace(/^ال/, '')).join(' ');
  }

  const normContact = normAr(contactName);

  // Retry up to 3 times with increasing delay to wait for Make.com
  for (let attempt = 1; attempt <= 3; attempt++) {
    const url = `https://api.airtable.com/v0/${baseId}/Transactions?sort%5B0%5D%5Bfield%5D=Created&sort%5B0%5D%5Bdirection%5D=desc&pageSize=30`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` } });
    if (!res.ok) {
      console.log('linkContact: failed to fetch transactions', res.status);
      return;
    }
    const data = await res.json();
    
    const records = (data.records || []).filter((r: any) => {
      const client = r.fields["Client"];
      if (!client) return false;
      if (Array.isArray(client)) return client.includes(clientRecordId);
      return client === clientRecordId;
    });

    console.log(`linkContact attempt ${attempt}: found ${records.length} transactions for client, looking for "${contactName}"`);

    // Look for unlinked transaction containing the contact name
    let targetRecord = null;
    for (const rec of records) {
      if (rec.fields["Contact"]) continue; // already linked
      const desc = normAr(rec.fields["Description"] || "");
      if (desc && (desc.includes(normContact) || normContact.split(' ').every((w: string) => desc.includes(w)))) {
        targetRecord = rec;
        break;
      }
    }

    // Fallback: if no description match, link the most recent unlinked transaction (created in last 2 min)
    if (!targetRecord) {
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      for (const rec of records) {
        if (rec.fields["Contact"]) continue;
        const created = rec.createdTime || '';
        if (created >= twoMinAgo) {
          targetRecord = rec;
          console.log(`linkContact: fallback match on recent unlinked transaction ${rec.id}`);
          break;
        }
      }
    }
    
    if (targetRecord) {
      const updateUrl = `https://api.airtable.com/v0/${baseId}/Transactions/${targetRecord.id}`;
      const updateRes = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: { "Contact": [contactId] },
        }),
      });
      console.log(`linkContact: PATCH ${targetRecord.id} → status ${updateRes.status}`);
      return;
    }

    // Wait before retry
    if (attempt < 3) {
      const waitMs = attempt * 5000; // 5s, 10s
      console.log(`linkContact: no match yet, retrying in ${waitMs/1000}s...`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  console.log(`linkContact: failed to find transaction after 3 attempts for "${contactName}"`);
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
  // Common patterns: "من الزبون X", "من العميل X", "من X", "الزبون X", "العميل X", "المورد X", "لـ X"
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
      // Filter out common words that aren't names
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
    const WEBHOOK_URL = Deno.env.get('MAKECOM_WEBHOOK_URL');
    const AIRTABLE_API_KEY = Deno.env.get('AIRTABLE_API_KEY');
    const AIRTABLE_BASE_ID = Deno.env.get('AIRTABLE_BASE_ID');
    if (!WEBHOOK_URL) throw new Error('MAKECOM_WEBHOOK_URL is not configured');

    const { text, userId, email, companyName, mentionedContactName, mentionedContactId } = await req.json();
    if (!text) throw new Error('Transaction text is required');

    // Use explicitly mentioned contact if provided via @ mention, otherwise fall back to regex extraction
    let contactName: string | null = mentionedContactName || extractContactName(text);
    let contactRecordId: string | null = null;

    if (mentionedContactId && AIRTABLE_API_KEY && AIRTABLE_BASE_ID && userId) {
      // mentionedContactId from MentionInput is an Airtable record ID - use it directly
      contactRecordId = mentionedContactId;
      console.log(`Using mentioned contact: "${mentionedContactName}" → ${mentionedContactId}`);
    } else if (contactName && AIRTABLE_API_KEY && AIRTABLE_BASE_ID && userId) {
      contactRecordId = await findContactByName(AIRTABLE_BASE_ID, AIRTABLE_API_KEY, userId, contactName);
      console.log(`Contact search: "${contactName}" → ${contactRecordId || 'not found'}`);
    }

    // Resolve client record ID once for all lookups
    let clientRecordId: string | null = null;
    if (AIRTABLE_API_KEY && AIRTABLE_BASE_ID && userId) {
      clientRecordId = await getClientRecordId(AIRTABLE_BASE_ID, AIRTABLE_API_KEY, userId);
    }

    // Look up the contact's corresponding account (Customer X / Supplier X)
    let contactAccountName = '';
    let contactAccountId = '';

    // Fetch accounts and contacts in parallel (filtered by user)
    let accountsList = '';
    let accountsDetailed: { id: string; name: string; type: string }[] = [];
    let contactsDetailed: { id: string; name: string; type: string; phone: string; email: string }[] = [];

    if (AIRTABLE_API_KEY && AIRTABLE_BASE_ID) {
      try {
        const [accRes, conRes] = await Promise.all([
          fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts?pageSize=100`, { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } }),
          fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Contacts?pageSize=100`, { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } }),
        ]);

        // Process accounts - filter to shared + user's own
        if (accRes.ok) {
          const accData = await accRes.json();
          const allAccounts = (accData.records || []).filter((r: any) => r.fields["Account Name"]);
          
          const userAccounts = clientRecordId
            ? allAccounts.filter((r: any) => {
                const cl = r.fields["Client"];
                if (!cl || (Array.isArray(cl) && cl.length === 0)) return true; // shared
                if (Array.isArray(cl)) return cl.includes(clientRecordId);
                return cl === clientRecordId;
              })
            : allAccounts;

          accountsDetailed = userAccounts.map((r: any) => ({
            id: r.id,
            name: r.fields["Account Name"],
            type: r.fields["Account Type"] || '',
          }));
          accountsList = accountsDetailed.map(a => a.name).join(', ');

          // Find contact's account
          if (contactName) {
            const normalizedContact = contactName.trim().toLowerCase();
            for (const acc of userAccounts) {
              const accName = (acc.fields["Account Name"] || "").trim().toLowerCase();
              if (accName.includes(normalizedContact)) {
                contactAccountName = acc.fields["Account Name"] || "";
                contactAccountId = acc.id;
                break;
              }
            }
          }
          console.log(`COA: ${accountsDetailed.length} accounts for user`);
        }

        // Process contacts - filter to user's own
        if (conRes.ok) {
          const conData = await conRes.json();
          const allContacts = (conData.records || []).filter((r: any) => r.fields["Contact Name"]);
          
          const userContacts = clientRecordId
            ? allContacts.filter((r: any) => {
                const cl = r.fields["Client"];
                if (!cl) return false;
                if (Array.isArray(cl)) return cl.includes(clientRecordId);
                return cl === clientRecordId;
              })
            : [];

          contactsDetailed = userContacts.map((r: any) => ({
            id: r.id,
            name: r.fields["Contact Name"],
            type: r.fields["Contact Type"] || '',
            phone: r.fields["Phone"] || '',
            email: r.fields["Email"] || '',
          }));
          console.log(`Contacts: ${contactsDetailed.length} for user`);
        }
      } catch (e) {
        console.error('Failed to fetch accounts/contacts:', e);
      }
    }

    // Detect opening balance
    const openingBalance = isOpeningBalance(text);
    console.log(`Opening balance: ${openingBalance}, Contact: "${contactName}"`);

    // Detect payment method from text
    const paymentMethodHints: Record<string, string> = {};
    const lowerText = text.toLowerCase();
    if (/آجل|على الحساب|بالدين|دين/.test(lowerText)) {
      paymentMethodHints.method = 'آجل';
      paymentMethodHints.instruction = 'طريقة الدفع آجل: يجب استخدام حساب "ذمم موردين" (للمشتريات) أو "ذمم العملاء" (للمبيعات) كحساب دائن/مدين. لا تستخدم "بنك" أو "صندوق" أبداً في العمليات الآجلة.';
    } else if (/نقد|كاش|نقداً/.test(lowerText)) {
      paymentMethodHints.method = 'نقد';
      paymentMethodHints.instruction = 'طريقة الدفع نقد: استخدم حساب "صندوق" أو "الصندوق".';
    } else if (/شيك/.test(lowerText)) {
      paymentMethodHints.method = 'شيك';
      paymentMethodHints.instruction = 'طريقة الدفع شيك: استخدم حساب "شيكات" أو "أوراق قبض/دفع".';
    } else if (/تحويل|بنك/.test(lowerText)) {
      paymentMethodHints.method = 'تحويل';
      paymentMethodHints.instruction = 'طريقة الدفع تحويل بنكي: استخدم حساب "البنك".';
    }

    // Build AI instruction
    let aiInstruction = '';

    // Payment method rules (highest priority)
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

    // Add general payment-account mapping rules
    aiInstruction += `\n\nقواعد توجيه الحسابات حسب طريقة الدفع:
- نقد/كاش → صندوق
- تحويل/بنك → البنك
- شيك → شيكات / أوراق قبض أو دفع
- آجل/على الحساب/بالدين → ذمم العملاء (للمبيعات) أو ذمم الموردين (للمشتريات)
لا تخلط أبداً بين هذه الحسابات.`;

    // Send to Make.com webhook
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        userId: userId || '',
        email: email || '',
        client_name: companyName || '',
        clientRecordId: clientRecordId || '',
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

    // After webhook succeeds, try to link contact to the transaction in Airtable
    if (contactRecordId && AIRTABLE_API_KEY && AIRTABLE_BASE_ID && userId) {
      // Wait for Make.com to create the transaction, then retry with backoff
      await new Promise(resolve => setTimeout(resolve, 8000));
      try {
        await linkContactToLatestTransaction(AIRTABLE_BASE_ID, AIRTABLE_API_KEY, userId, contactRecordId, text, contactName || '');
      } catch (err) {
        console.error('Failed to link contact to transaction:', err);
      }
    }

    return new Response(JSON.stringify({ success: true, data: responseData, contactLinked: !!contactRecordId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
