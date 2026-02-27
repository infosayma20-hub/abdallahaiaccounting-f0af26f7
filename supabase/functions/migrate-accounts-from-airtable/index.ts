import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, corsHeaders } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.userId;

    const AIRTABLE_API_KEY = Deno.env.get('AIRTABLE_API_KEY');
    const AIRTABLE_BASE_ID = Deno.env.get('AIRTABLE_BASE_ID');
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) throw new Error('Airtable not configured');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch all accounts from Airtable with pagination
    let allRecords: any[] = [];
    let url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts?pageSize=100`;
    
    while (url) {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` },
      });
      if (!res.ok) throw new Error(`Airtable error: ${res.status}`);
      const data = await res.json();
      allRecords = allRecords.concat(data.records || []);
      url = data.offset ? `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts?pageSize=100&offset=${data.offset}` : '';
    }

    // Use ALL accounts (shared + user's own)
    const userAccounts = allRecords;

    console.log(`Found ${userAccounts.length} accounts to migrate for user ${userId}`);

    // Map account type from English to Arabic
    const typeMap: Record<string, string> = {
      'Assets': 'أصول',
      'Liabilities': 'خصوم',
      'Equity': 'حقوق ملكية',
      'Revenue': 'إيرادات',
      'Expenses': 'مصاريف',
      'Cost of Sales': 'تكلفة المبيعات',
    };

    // Map Airtable fields to local schema
    // Account Name format: "4300 - إيرادات أخرى" → code: "4300", name: "إيرادات أخرى"
    const accountsToInsert = userAccounts.map((acc: any) => {
      const f = acc.fields;
      const fullName = f["Account Name"] || '';
      const accountType = f["Account Type"] || 'عام';
      const isSystem = !f["Client"] || (Array.isArray(f["Client"]) && f["Client"].length === 0);
      
      // Parse "4300 - إيرادات أخرى" format
      let accountCode = '';
      let accountName = fullName;
      const match = fullName.match(/^(\d+)\s*-\s*(.+)$/);
      if (match) {
        accountCode = match[1];
        accountName = match[2].trim();
      } else {
        // If no code prefix, use the full name as both
        accountCode = fullName.replace(/\s/g, '_');
      }

      // Determine parent code from account code hierarchy
      let parentCode: string | null = null;
      if (accountCode.length === 4) {
        // 4-digit: parent is first 2 digits + "00"
        parentCode = accountCode.substring(0, 2) + '00';
      } else if (accountCode.length === 5) {
        // 5-digit: parent is first 4 digits
        parentCode = accountCode.substring(0, 4);
      }

      return {
        user_id: userId,
        account_code: accountCode,
        account_name: accountName,
        account_type: typeMap[accountType] || accountType,
        parent_code: parentCode,
        is_system: isSystem,
        is_active: true,
      };
    }).filter(a => a.account_code && a.account_name);

    if (accountsToInsert.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'لم يتم العثور على حسابات للنسخ',
        migrated: 0,
        raw_sample: userAccounts.slice(0, 3).map(a => a.fields),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Delete existing accounts for this user first to avoid duplicates
    await supabaseAdmin.from('accounts').delete().eq('user_id', userId);

    // Deduplicate by account_code (keep first occurrence)
    const seen = new Set<string>();
    const dedupedAccounts = accountsToInsert.filter(a => {
      if (seen.has(a.account_code)) return false;
      seen.add(a.account_code);
      return true;
    });

    // Insert in batches of 50
    let inserted = 0;
    let errors: string[] = [];
    for (let i = 0; i < dedupedAccounts.length; i += 50) {
      const batch = dedupedAccounts.slice(i, i + 50);
      const { data, error } = await supabaseAdmin.from('accounts').insert(batch).select('id');
      if (error) {
        console.error(`Batch insert error at ${i}:`, error);
        errors.push(`Batch ${i}: ${error.message}`);
      } else {
        inserted += (data?.length || 0);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `تم نسخ ${inserted} حساب من Airtable بنجاح`,
      migrated: inserted,
      total_found: userAccounts.length,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Migration error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
