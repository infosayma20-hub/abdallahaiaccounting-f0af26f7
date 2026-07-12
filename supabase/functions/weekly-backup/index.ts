import { createClient } from 'npm:@supabase/supabase-js@2.45.0'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

// Critical tables to back up (financial, operational, master data)
const TABLES = [
  // Master data
  'companies', 'company_settings', 'branches', 'profiles', 'user_roles',
  // Contacts & accounts
  'contacts', 'accounts', 'bank_accounts', 'cash_boxes',
  // Financial core
  'transactions', 'vouchers', 'voucher_lines',
  'invoices', 'invoice_items', 'purchase_invoices', 'purchase_invoice_items',
  'receipt_vouchers', 'payments', 'payment_invoice_links',
  'cheques', 'cheque_status_history',
  // Inventory
  'products', 'product_batches', 'stock_movements', 'warehouses',
  // POS
  'pos_orders', 'pos_payments', 'pos_sessions', 'pos_shift_audits',
  // HR
  'employees', 'employee_payroll', 'attendance_days', 'employee_leaves',
  // Currencies
  'currencies', 'exchange_rates',
]

const RECIPIENT = 'info.sayma20@gmail.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    console.log('[weekly-backup] starting export of', TABLES.length, 'tables')

    const backup: Record<string, any[]> = {}
    let totalRecords = 0
    const errors: string[] = []

    for (const table of TABLES) {
      try {
        // Fetch in pages of 1000 to handle large tables
        const rows: any[] = []
        let from = 0
        const pageSize = 1000
        while (true) {
          const { data, error } = await supabase.from(table).select('*').range(from, from + pageSize - 1)
          if (error) { errors.push(`${table}: ${error.message}`); break }
          if (!data || data.length === 0) break
          rows.push(...data)
          if (data.length < pageSize) break
          from += pageSize
        }
        backup[table] = rows
        totalRecords += rows.length
        console.log(`[weekly-backup] ${table}: ${rows.length} rows`)
      } catch (e: any) {
        errors.push(`${table}: ${e.message}`)
      }
    }

    const generatedAt = new Date().toISOString().slice(0, 10)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const meta = {
      generated_at: new Date().toISOString(),
      tables_count: Object.keys(backup).length,
      records_count: totalRecords,
      errors,
      app: 'amwali',
      version: '1.0',
    }
    const payload = JSON.stringify({ __meta: meta, data: backup })
    const bytes = new TextEncoder().encode(payload)
    const sizeMb = (bytes.byteLength / 1024 / 1024).toFixed(2)

    // Upload to storage bucket 'backups'
    const objectPath = `weekly/backup-${timestamp}.json`
    const { error: upErr } = await supabase.storage.from('backups').upload(objectPath, bytes, {
      contentType: 'application/json',
      upsert: false,
    })
    if (upErr) throw new Error(`storage upload failed: ${upErr.message}`)

    // Signed URL valid for 7 days
    const expiresIn = 7 * 24 * 60 * 60
    const { data: signed, error: signErr } = await supabase.storage
      .from('backups')
      .createSignedUrl(objectPath, expiresIn)
    if (signErr || !signed) throw new Error(`sign url failed: ${signErr?.message}`)

    // Send email
    const { error: mailErr } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'weekly-backup-ready',
        recipientEmail: RECIPIENT,
        idempotencyKey: `weekly-backup-${timestamp}`,
        templateData: {
          downloadUrl: signed.signedUrl,
          fileSizeMb: sizeMb,
          tablesCount: Object.keys(backup).length,
          recordsCount: totalRecords,
          generatedAt,
          expiresInDays: 7,
        },
      },
    })
    if (mailErr) console.error('[weekly-backup] email error:', mailErr)

    // Cleanup old backups (older than 30 days) — keep last 4 weeks
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const { data: oldFiles } = await supabase.storage.from('backups').list('weekly', { limit: 100 })
    if (oldFiles) {
      const toDelete = oldFiles
        .filter(f => new Date(f.created_at || 0) < cutoff)
        .map(f => `weekly/${f.name}`)
      if (toDelete.length > 0) {
        await supabase.storage.from('backups').remove(toDelete)
        console.log('[weekly-backup] cleaned', toDelete.length, 'old backups')
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        object_path: objectPath,
        size_mb: sizeMb,
        tables: Object.keys(backup).length,
        records: totalRecords,
        errors,
        email_sent: !mailErr,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e: any) {
    console.error('[weekly-backup] fatal:', e)
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})