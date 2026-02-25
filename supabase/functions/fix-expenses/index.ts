import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const AIRTABLE_API_KEY = Deno.env.get('AIRTABLE_API_KEY');
    const AIRTABLE_BASE_ID = Deno.env.get('AIRTABLE_BASE_ID');
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) throw new Error('Airtable not configured');

    // Fetch all accounts
    let allRecords: any[] = [];
    let url: string | null = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts?pageSize=100`;
    while (url) {
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } });
      const data = await res.json();
      allRecords = allRecords.concat(data.records || []);
      url = data.offset ? `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts?pageSize=100&offset=${data.offset}` : null;
    }

    const actions: string[] = [];

    // 1. Fix fuel code: 5420 → 5910 (move out of utilities group 54xx)
    const fuelAccounts = allRecords.filter(r => {
      const name = (r.fields["Account Name"] || "").trim();
      return name.startsWith("5420");
    });
    const toUpdate: { id: string; fields: Record<string, string> }[] = [];
    for (const rec of fuelAccounts) {
      toUpdate.push({ id: rec.id, fields: { "Account Name": "5910 - مصاريف الوقود" } });
      actions.push(`Fixed: 5420 → 5910 مصاريف الوقود`);
    }

    // 2. Find and delete duplicate electricity accounts
    const electricityAccounts = allRecords.filter(r => {
      const name = (r.fields["Account Name"] || "").trim();
      return name.includes("كهرباء") && name.startsWith("5");
    });
    const toDelete: string[] = [];
    if (electricityAccounts.length > 1) {
      // Keep the first one (5400), delete the rest
      for (let i = 1; i < electricityAccounts.length; i++) {
        toDelete.push(electricityAccounts[i].id);
        actions.push(`Deleted duplicate: ${electricityAccounts[i].fields["Account Name"]}`);
      }
    }

    // 3. Check which accounts to add
    const existingCodes = new Set(allRecords.map(r => {
      const match = (r.fields["Account Name"] || "").match(/^(\d{4})/);
      return match ? match[1] : "";
    }));

    const newAccounts: { name: string; type: string }[] = [];

    // Depreciation expense account
    if (!existingCodes.has("5700")) {
      // Already exists as "استهلاكات وإطفاءات"
    }
    // Accumulated depreciation (contra-asset)
    if (!existingCodes.has("1290")) {
      newAccounts.push({ name: "1290 - مجمع الاستهلاك", type: "Asset" });
      actions.push("Added: 1290 - مجمع الاستهلاك");
    }
    // Depreciation - vehicles
    if (!existingCodes.has("5710")) {
      newAccounts.push({ name: "5710 - استهلاك مركبات", type: "Expenses" });
      actions.push("Added: 5710 - استهلاك مركبات");
    }
    // Depreciation - equipment
    if (!existingCodes.has("5720")) {
      newAccounts.push({ name: "5720 - استهلاك معدات وأجهزة", type: "Expenses" });
      actions.push("Added: 5720 - استهلاك معدات وأجهزة");
    }
    // Depreciation - furniture
    if (!existingCodes.has("5730")) {
      newAccounts.push({ name: "5730 - استهلاك أثاث", type: "Expenses" });
      actions.push("Added: 5730 - استهلاك أثاث");
    }
    // Depreciation - buildings
    if (!existingCodes.has("5740")) {
      newAccounts.push({ name: "5740 - استهلاك مباني", type: "Expenses" });
      actions.push("Added: 5740 - استهلاك مباني");
    }

    // Execute updates
    let totalUpdated = 0;
    for (let i = 0; i < toUpdate.length; i += 10) {
      const batch = toUpdate.slice(i, i + 10);
      const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: batch }),
      });
      if (!res.ok) throw new Error(`Update error: ${await res.text()}`);
      totalUpdated += (await res.json()).records?.length || 0;
    }

    // Execute deletes
    let totalDeleted = 0;
    for (let i = 0; i < toDelete.length; i += 10) {
      const batch = toDelete.slice(i, i + 10);
      const params = batch.map(id => `records[]=${id}`).join("&");
      const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts?${params}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` },
      });
      if (!res.ok) throw new Error(`Delete error: ${await res.text()}`);
      totalDeleted += (await res.json()).records?.length || 0;
    }

    // Execute creates
    let totalCreated = 0;
    for (let i = 0; i < newAccounts.length; i += 10) {
      const batch = newAccounts.slice(i, i + 10);
      const records = batch.map(a => ({ fields: { "Account Name": a.name, "Account Type": a.type } }));
      const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Accounts`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      });
      if (!res.ok) throw new Error(`Create error: ${await res.text()}`);
      totalCreated += (await res.json()).records?.length || 0;
    }

    return new Response(JSON.stringify({
      success: true,
      message: `تحديث: ${totalUpdated}، حذف: ${totalDeleted}، إنشاء: ${totalCreated}`,
      actions,
      updated: totalUpdated,
      deleted: totalDeleted,
      created: totalCreated,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Fix expenses error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
