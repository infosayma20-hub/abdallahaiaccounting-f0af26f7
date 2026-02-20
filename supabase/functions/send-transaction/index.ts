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

  // Search for best match
  const normalizedName = name.trim().toLowerCase();
  for (const contact of contacts) {
    const contactName = (contact.fields["Contact Name"] || "").trim().toLowerCase();
    if (contactName && (contactName === normalizedName || normalizedName.includes(contactName) || contactName.includes(normalizedName))) {
      return contact.id;
    }
  }
  return null;
}

async function linkContactToLatestTransaction(baseId: string, apiKey: string, clientUUID: string, contactId: string, description: string, contactName: string) {
  const clientRecordId = await getClientRecordId(baseId, apiKey, clientUUID);
  if (!clientRecordId) {
    console.log('linkContact: client record not found');
    return;
  }

  const url = `https://api.airtable.com/v0/${baseId}/Transactions?sort%5B0%5D%5Bfield%5D=Date&sort%5B0%5D%5Bdirection%5D=desc&pageSize=20`;
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

  console.log(`linkContact: found ${records.length} transactions for client, looking for "${contactName}"`);

  // Only link transactions whose description contains the contact name
  const normalizedContactName = contactName.trim().toLowerCase();
  let targetRecord = null;
  for (const rec of records) {
    if (rec.fields["Contact"]) continue;
    const desc = (rec.fields["Description"] || "").toLowerCase();
    if (desc && desc.includes(normalizedContactName)) {
      targetRecord = rec;
      break;
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
    console.log(`linkContact: PATCH ${targetRecord.id} (${(targetRecord.fields["Description"] || "").substring(0, 30)}) → status ${updateRes.status}`);
  } else {
    console.log(`linkContact: no unlinked transaction found containing "${contactName}"`);
  }
}
// Extract potential contact name from Arabic text
function extractContactName(text: string): string | null {
  // Common patterns: "من الزبون X", "من العميل X", "من X", "الزبون X", "العميل X", "المورد X", "لـ X"
  const patterns = [
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

    const { text, userId, email, companyName } = await req.json();
    if (!text) throw new Error('Transaction text is required');

    // Extract contact name from text
    const contactName = extractContactName(text);
    let contactRecordId: string | null = null;

    if (contactName && AIRTABLE_API_KEY && AIRTABLE_BASE_ID && userId) {
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
      // Wait a bit for Make.com to create the transaction
      await new Promise(resolve => setTimeout(resolve, 5000));
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
