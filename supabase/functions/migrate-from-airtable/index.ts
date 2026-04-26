import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, corsHeaders } from "../_shared/auth.ts";

async function fetchAllAirtableRecords(baseId: string, apiKey: string, table: string, filter?: string) {
  let allRecords: any[] = [];
  let offset: string | undefined;
  do {
    let url = `https://api.airtable.com/v0/${baseId}/${table}?pageSize=100`;
    if (filter) url += `&filterByFormula=${encodeURIComponent(filter)}`;
    if (offset) url += `&offset=${offset}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error(`Airtable error: ${res.status}`);
    const data = await res.json();
    allRecords = allRecords.concat(data.records || []);
    offset = data.offset;
  } while (offset);
  return allRecords;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.userId;

    const AIRTABLE_API_KEY = Deno.env.get('AIRTABLE_API_KEY');
    const AIRTABLE_BASE_ID = Deno.env.get('AIRTABLE_BASE_ID');
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) throw new Error('Airtable credentials not configured');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Get user's Airtable client record ID
    const clientFilter = `{Client Name}="${userId}"`;
    const clients = await fetchAllAirtableRecords(AIRTABLE_BASE_ID, AIRTABLE_API_KEY, 'Clients', clientFilter);
    const clientRecordId = clients[0]?.id;
    if (!clientRecordId) {
      return new Response(JSON.stringify({ error: 'No Airtable client found for this user' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = { accounts: 0, contacts: 0, transactions: 0, errors: [] as string[] };

    // 1. Migrate Accounts
    const allAccounts = await fetchAllAirtableRecords(AIRTABLE_BASE_ID, AIRTABLE_API_KEY, 'Accounts');
    const userAccounts = allAccounts.filter(r => {
      const cl = r.fields["Client"];
      if (!cl || (Array.isArray(cl) && cl.length === 0)) return true; // shared
      if (Array.isArray(cl)) return cl.includes(clientRecordId);
      return cl === clientRecordId;
    });

    for (const acc of userAccounts) {
      const name = acc.fields["Account Name"] || '';
      const match = name.match(/^(\d{4})\s*[-–]\s*(.+)/);
      const code = match ? match[1] : name.substring(0, 4);
      const label = match ? match[2].trim() : name;

      const { error } = await supabaseAdmin.from('accounts').upsert({
        user_id: userId,
        account_code: code,
        account_name: label,
        account_type: acc.fields["Account Type"] || 'عام',
        is_system: false,
      }, { onConflict: 'user_id,account_code' });

      if (error) results.errors.push(`Account ${code}: ${error.message}`);
      else results.accounts++;
    }

    // 2. Migrate Contacts
    const allContacts = await fetchAllAirtableRecords(AIRTABLE_BASE_ID, AIRTABLE_API_KEY, 'Contacts');
    const userContacts = allContacts.filter(r => {
      const cl = r.fields["Client"];
      if (!cl) return false;
      if (Array.isArray(cl)) return cl.includes(clientRecordId);
      return cl === clientRecordId;
    });

    // Map airtable contact ID → local contact ID
    const contactMap: Record<string, string> = {};

    for (const con of userContacts) {
      const { data, error } = await supabaseAdmin.from('contacts').upsert({
        user_id: userId,
        contact_name: con.fields["Contact Name"] || 'بدون اسم',
        contact_type: con.fields["Contact Type"] || 'عميل',
        phone: con.fields["Phone"] || null,
        email: con.fields["Email"] || null,
        address: con.fields["Address"] || null,
      }, { onConflict: 'user_id,contact_name', ignoreDuplicates: false }).select('id').single();

      if (error) results.errors.push(`Contact ${con.fields["Contact Name"]}: ${error.message}`);
      else {
        results.contacts++;
        if (data) contactMap[con.id] = data.id;
      }
    }

    // 3. Migrate Transactions
    const allTransactions = await fetchAllAirtableRecords(AIRTABLE_BASE_ID, AIRTABLE_API_KEY, 'Transactions');
    const userTransactions = allTransactions.filter(r => {
      const cl = r.fields["Client"];
      if (!cl) return false;
      if (Array.isArray(cl)) return cl.includes(clientRecordId);
      return cl === clientRecordId;
    });

    // Build account name → code map
    const accNameToCode: Record<string, string> = {};
    for (const acc of userAccounts) {
      const name = acc.fields["Account Name"] || '';
      const match = name.match(/^(\d{4})\s*[-–]\s*(.+)/);
      if (match) {
        accNameToCode[name] = match[1];
        accNameToCode[match[2].trim()] = match[1];
      }
    }

    for (const tx of userTransactions) {
      if (tx.fields["Deleted"]) continue;

      const debitName = tx.fields["Debit Account Name"] || (tx.fields["Debit Account Rollup"] || '');
      const creditName = tx.fields["Credit Account Name"] || (tx.fields["Credit Account Rollup"] || '');
      
      // Try to resolve account codes
      let debitCode = '';
      let creditCode = '';
      for (const [key, code] of Object.entries(accNameToCode)) {
        if (debitName.includes(key) || key.includes(debitName)) debitCode = code;
        if (creditName.includes(key) || key.includes(creditName)) creditCode = code;
      }

      // Resolve contact
      let contactId = null;
      const contactRef = tx.fields["Contact"];
      if (contactRef) {
        const airtableContactId = Array.isArray(contactRef) ? contactRef[0] : contactRef;
        contactId = contactMap[airtableContactId] || null;
      }

      const { error } = await supabaseAdmin.from('transactions').insert({
        user_id: userId,
        description: tx.fields["Description"] || '',
        amount: tx.fields["Amount"] || 0,
        currency: tx.fields["Currency"] || 'شيكل',
        transaction_type: tx.fields["Transaction Type"] || 'قيد يومية',
        debit_account_code: debitCode,
        credit_account_code: creditCode,
        transaction_date: tx.fields["Date"] || new Date().toISOString().split('T')[0],
        contact_id: contactId,
        reference: `AT-${tx.id}`,
        is_opening_balance: false,
        is_deleted: false,
      });

      if (error) results.errors.push(`Tx ${tx.id}: ${error.message}`);
      else results.transactions++;
    }

    return new Response(JSON.stringify({
      success: true,
      migrated: results,
      message: `تم نقل ${results.accounts} حساب، ${results.contacts} جهة اتصال، ${results.transactions} معاملة`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Migration error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
