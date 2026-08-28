import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

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

    // ── Auth: only the internal scheduler (service-role key) or a super_admin
    // may trigger a full cross-tenant export.
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    let authorized = token.length > 0 && token === serviceKey
    if (!authorized && token) {
      const { data: { user } } = await supabase.auth.getUser(token)
      if (user) {
        const { data: roleRows } = await supabase.from('user_roles').select('role').eq('user_id', user.id)
        authorized = (roleRows ?? []).some((r: any) => r.role === 'super_admin')
      }
    }
    if (!authorized) {
      return new Response(
        JSON.stringify({ success: false, error: 'UNAUTHORIZED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    console.log('[weekly-backup] starting export of', TABLES.length, 'tables')

    const generatedAt = new Date().toISOString().slice(0, 10)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const folder = `weekly/${timestamp}`
    const expiresIn = 7 * 24 * 60 * 60
    let totalRecords = 0
    let totalBytes = 0
    const errors: string[] = []
    const tableManifest: Array<{ table: string; rows: number; size_kb: number; path: string }> = []

    // Stream each table page-by-page directly to storage to avoid memory limits
    for (const table of TABLES) {
      try {
        let from = 0
        const pageSize = 500
        let page = 0
        let tableRows = 0
        let tableBytes = 0
        const pagePaths: string[] = []
        while (true) {
          const { data, error } = await supabase.from(table).select('*').range(from, from + pageSize - 1)
          if (error) { errors.push(`${table}: ${error.message}`); break }
          if (!data || data.length === 0) break
          const json = JSON.stringify(data)
          const bytes = new TextEncoder().encode(json)
          const partPath = `${folder}/${table}${data.length === pageSize || page > 0 ? `-p${String(page).padStart(3, '0')}` : ''}.json`
          const { error: upErr } = await supabase.storage.from('backups').upload(partPath, bytes, {
            contentType: 'application/json',
            upsert: true,
          })
          if (upErr) { errors.push(`${table} p${page} upload: ${upErr.message}`); break }
          pagePaths.push(partPath)
          tableRows += data.length
          tableBytes += bytes.byteLength
          if (data.length < pageSize) break
          from += pageSize
          page += 1
        }
        if (pagePaths.length > 0) {
          for (const p of pagePaths) {
            tableManifest.push({ table, rows: tableRows, size_kb: Math.round(tableBytes / 1024), path: p })
          }
        }
        totalRecords += tableRows
        totalBytes += tableBytes
        console.log(`[weekly-backup] ${table}: ${tableRows} rows, ${Math.round(tableBytes / 1024)} KB, ${pagePaths.length} file(s)`)
      } catch (e: any) {
        errors.push(`${table}: ${e.message}`)
      }
    }

    // Generate signed URLs for every table file
    const filesWithUrls = await Promise.all(tableManifest.map(async (t) => {
      const { data } = await supabase.storage.from('backups').createSignedUrl(t.path, expiresIn)
      return { ...t, download_url: data?.signedUrl || null }
    }))

    // Build manifest with links
    const manifest = {
      generated_at: new Date().toISOString(),
      app: 'amwali',
      version: '2.0',
      tables_count: tableManifest.length,
      records_count: totalRecords,
      total_size_mb: (totalBytes / 1024 / 1024).toFixed(2),
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      errors,
      files: filesWithUrls,
    }
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2))
    const manifestPath = `${folder}/manifest.json`
    await supabase.storage.from('backups').upload(manifestPath, manifestBytes, {
      contentType: 'application/json',
      upsert: true,
    })
    const { data: manifestSigned } = await supabase.storage
      .from('backups')
      .createSignedUrl(manifestPath, expiresIn)

    const sizeMb = (totalBytes / 1024 / 1024).toFixed(2)

    // Send email
    const { error: mailErr } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'weekly-backup-ready',
        recipientEmail: RECIPIENT,
        idempotencyKey: `weekly-backup-${timestamp}`,
        templateData: {
          downloadUrl: manifestSigned?.signedUrl || '',
          fileSizeMb: sizeMb,
          tablesCount: tableManifest.length,
          recordsCount: totalRecords,
          generatedAt,
          expiresInDays: 7,
        },
      },
    })
    if (mailErr) console.error('[weekly-backup] email error:', mailErr)

    return new Response(
      JSON.stringify({
        success: true,
        folder,
        manifest_path: manifestPath,
        size_mb: sizeMb,
        tables: tableManifest.length,
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