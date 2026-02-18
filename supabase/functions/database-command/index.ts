import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function fetchAllRecords(baseUrl: string, apiKey: string): Promise<any[]> {
  let allRecords: any[] = [];
  let currentUrl = baseUrl;
  while (currentUrl) {
    const response = await fetch(currentUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
    if (!response.ok) throw new Error(`Airtable error [${response.status}]`);
    const data = await response.json();
    allRecords = allRecords.concat(data.records || []);
    currentUrl = data.offset ? `${baseUrl.replace(/&offset=[^&]*/, '')}&offset=${data.offset}` : '';
  }
  return allRecords;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const AIRTABLE_API_KEY = Deno.env.get('AIRTABLE_API_KEY');
    const AIRTABLE_BASE_ID = Deno.env.get('AIRTABLE_BASE_ID');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!AIRTABLE_API_KEY) throw new Error('AIRTABLE_API_KEY not configured');
    if (!AIRTABLE_BASE_ID) throw new Error('AIRTABLE_BASE_ID not configured');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const { command, clientId } = await req.json();
    if (!command || typeof command !== 'string' || command.trim().length === 0) {
      throw new Error('Command is required');
    }

    // Fetch existing contacts and accounts for context
    const contactsUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Contacts?pageSize=100`;
    const accountsUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts?pageSize=100`;

    const [allContacts, allAccounts] = await Promise.all([
      fetchAllRecords(contactsUrl, AIRTABLE_API_KEY).catch(() => []),
      fetchAllRecords(accountsUrl, AIRTABLE_API_KEY).catch(() => []),
    ]);

    // Filter for this client
    const clientContacts = clientId ? allContacts.filter((c: any) => {
      const cn = c.fields["Client Name"] || c.fields["Client name"];
      if (cn) {
        if (Array.isArray(cn)) return cn.includes(clientId);
        return cn === clientId;
      }
      const cf = c.fields["Client"];
      if (!cf) return false;
      if (Array.isArray(cf)) return cf.some((x: string) => x.includes(clientId));
      return String(cf).includes(clientId);
    }) : allContacts;

    const clientAccounts = clientId ? allAccounts.filter((acc: any) => {
      const cf = acc.fields["Client"];
      if (!cf || (Array.isArray(cf) && cf.length === 0)) return true;
      const cn = acc.fields["Client Name"] || acc.fields["Client name"];
      if (cn) {
        if (Array.isArray(cn)) return cn.includes(clientId);
        return cn === clientId;
      }
      return false;
    }) : allAccounts;

    const contactsList = clientContacts.map((c: any) => ({
      id: c.id,
      name: c.fields["Contact Name"] || c.fields["Name"] || '',
      type: c.fields["Contact Type"] || '',
      phone: c.fields["Phone"] || '',
      email: c.fields["Email"] || '',
    }));

    const accountsList = clientAccounts.map((a: any) => ({
      id: a.id,
      name: a.fields["Account Name"] || '',
      type: a.fields["Account Type"] || '',
    }));

    const systemPrompt = `أنت مساعد ذكي لإدارة قاعدة البيانات المحاسبية. المستخدم سيعطيك أوامر بالعربية لإضافة أو تعديل أو حذف بيانات.

البيانات المتاحة:
1. جهات اتصال (Contacts): زبائن وموردين
2. حسابات (Accounts): شجرة الحسابات المحاسبية

أنواع الحسابات المتاحة: Asset, Liability, Owner's Equity, Revenue, Purchases, Expenses

أعد الإجابة بصيغة JSON فقط:
{
  "action": "add_contact" | "edit_contact" | "delete_contact" | "add_account" | "edit_account" | "delete_account" | "unknown",
  "table": "Contacts" | "Accounts",
  "data": {
    // للإضافة/التعديل - الحقول المطلوبة
    "name": "الاسم",
    "type": "النوع (زبون/مورد للجهات أو Asset/Liability/etc للحسابات)",
    "phone": "رقم الهاتف إن وجد",
    "email": "البريد إن وجد"
  },
  "recordId": "معرف السجل للتعديل/الحذف أو null",
  "message": "رسالة تأكيد بالعربية",
  "confidence": 0.0-1.0
}

إذا طلب حذف أو تعديل، ابحث في القوائم الحالية عن أقرب تطابق وأعد recordId.
إذا لم تفهم الأمر، أعد action: "unknown" مع رسالة توضيحية.
لا تضف أي نص خارج JSON.`;

    const userPrompt = `جهات الاتصال الحالية:
${JSON.stringify(contactsList, null, 0)}

الحسابات الحالية:
${JSON.stringify(accountsList, null, 0)}

أمر المستخدم: ${command}`;

    // Call AI to parse the command
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
          { role: 'user', content: userPrompt },
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
      if (status === 402) {
        return new Response(JSON.stringify({ error: "يرجى إضافة رصيد للاستمرار" }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

    if (!parsed || parsed.action === 'unknown') {
      return new Response(JSON.stringify({
        success: false,
        message: parsed?.message || 'لم أفهم الأمر، حاول مرة أخرى',
        action: 'unknown',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Execute the action on Airtable
    let result;

    // Find client record ID for linking
    let clientRecordId: string | null = null;
    if (clientId) {
      const clientsUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Clients?filterByFormula={Client Name}='${clientId}'&maxRecords=1`;
      const clientRes = await fetch(clientsUrl, { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } });
      if (clientRes.ok) {
        const clientData = await clientRes.json();
        clientRecordId = clientData.records?.[0]?.id || null;
      }
    }

    if (parsed.action === 'add_contact') {
      const fields: any = {
        "Contact Name": parsed.data.name,
        "Contact Type": parsed.data.type || "زبون",
      };
      if (parsed.data.phone) fields["Phone"] = parsed.data.phone;
      if (parsed.data.email) fields["Email"] = parsed.data.email;
      if (clientRecordId) fields["Client"] = [clientRecordId];

      const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Contacts`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: [{ fields }] }),
      });
      if (!res.ok) throw new Error(`Airtable error: ${await res.text()}`);
      result = await res.json();

    } else if (parsed.action === 'edit_contact' && parsed.recordId) {
      const fields: any = {};
      if (parsed.data.name) fields["Contact Name"] = parsed.data.name;
      if (parsed.data.type) fields["Contact Type"] = parsed.data.type;
      if (parsed.data.phone) fields["Phone"] = parsed.data.phone;
      if (parsed.data.email) fields["Email"] = parsed.data.email;

      const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Contacts/${parsed.recordId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) throw new Error(`Airtable error: ${await res.text()}`);
      result = await res.json();

    } else if (parsed.action === 'delete_contact' && parsed.recordId) {
      const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Contacts/${parsed.recordId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` },
      });
      if (!res.ok) throw new Error(`Airtable error: ${await res.text()}`);
      result = { deleted: true };

    } else if (parsed.action === 'add_account') {
      const fields: any = {
        "Account Name": parsed.data.name,
        "Account Type": parsed.data.type || "Asset",
      };
      if (clientRecordId) fields["Client"] = [clientRecordId];

      const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: [{ fields }] }),
      });
      if (!res.ok) throw new Error(`Airtable error: ${await res.text()}`);
      result = await res.json();

    } else if (parsed.action === 'edit_account' && parsed.recordId) {
      const fields: any = {};
      if (parsed.data.name) fields["Account Name"] = parsed.data.name;
      if (parsed.data.type) fields["Account Type"] = parsed.data.type;

      const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts/${parsed.recordId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) throw new Error(`Airtable error: ${await res.text()}`);
      result = await res.json();

    } else if (parsed.action === 'delete_account' && parsed.recordId) {
      const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts/${parsed.recordId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` },
      });
      if (!res.ok) throw new Error(`Airtable error: ${await res.text()}`);
      result = { deleted: true };

    } else {
      return new Response(JSON.stringify({
        success: false,
        message: parsed.message || 'لا يمكن تنفيذ هذا الأمر',
        action: parsed.action,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      success: true,
      message: parsed.message,
      action: parsed.action,
      data: result,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
