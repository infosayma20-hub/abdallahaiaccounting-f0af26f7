// UNIFY daily cloud backup -> Backblaze B2 (S3-compatible), one organized folder per tenant.
// Layout:
//   العملاء/<اسم الشركة>__<id8>/النسخ-الاحتياطية/<YYYY>/<MM>/<DD>/<القسم>/<table>/part-000.json
//   العملاء/<اسم الشركة>__<id8>/الملفات/<bucket>/<path>          (incremental copy)
// Read-only on the database. Never modifies tenant data.
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'
import { AwsClient } from 'npm:aws4fetch@1.0.20'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-backup-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const B2_ENDPOINT = 'https://s3.ca-east-006.backblazeb2.com'
const B2_REGION = 'ca-east-006'
const B2_BUCKET = 'unifyerp-storage'
const PAGE = 1000

// Child tables with no tenant column: exported via their parent's ids.
const CHILDREN: Record<string, { fk: string; parent: string }> = {
  invoice_items: { fk: 'invoice_id', parent: 'invoices' },
  purchase_invoice_items: { fk: 'invoice_id', parent: 'purchase_invoices' },
  voucher_lines: { fk: 'voucher_id', parent: 'vouchers' },
  procurement_order_items: { fk: 'order_id', parent: 'procurement_orders' },
  procurement_request_items: { fk: 'request_id', parent: 'procurement_requests' },
  delivery_note_items: { fk: 'delivery_note_id', parent: 'delivery_notes' },
  attendance_days: { fk: 'employee_id', parent: 'employees' },
  attendance_events: { fk: 'employee_id', parent: 'employees' },
  attendance_breaks: { fk: 'employee_id', parent: 'employees' },
  correction_requests: { fk: 'employee_id', parent: 'employees' },
}
// Platform-wide tables that are not tenant business data.
const SKIP = new Set(['app_perf_samples', 'activity_log', 'device_tokens', 'ai_memory', 'ai_conversations',
  'active_owner_context', 'domain_events_outbox', 'email_send_log', 'admin_notifications'])

function category(t: string): string {
  if (/^(pos_|kds_|kitchen_|kiosk_|bop_|call_center|modifier|order_item|employee_hot)/.test(t)) return 'نقطة-البيع'
  if (/^(employee|attendance|hr_|payroll|monthly_payroll|leave|shift|daily_roster|departments|job_|correction|branch_manager)/.test(t)) return 'الموارد-البشرية'
  if (/^(product|stock|inventory|warehouse|item_categor|batch|procurement|purchase|import_|production|delivery_note)/.test(t)) return 'الأصناف-والمخزون'
  if (/^(account|transaction|voucher|journal|invoice|cheque|cash_|bank_|currenc|exchange|cost_center|fiscal|payment|receipt|asset|financial|posting|commission|tax|vat|credit|debit|return|settlement|loan)/.test(t)) return 'المالية-والمحاسبة'
  if (/^(contact|customer|crm_|loyalty|marketing|sales|quotation|cs_)/.test(t)) return 'المبيعات-والعملاء'
  return 'الإعدادات-والعام'
}
const slug = (s: string) => (s || 'بدون-اسم').replace(/[\\/:*?"<>|#%]+/g, '').replace(/\s+/g, '-').slice(0, 60)
const enc = (key: string) => key.split('/').map(encodeURIComponent).join('/')
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })

  // Auth: scheduler (service key / apikey) or super_admin only.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
  const apikey = req.headers.get('apikey') ?? ''
  const { data: cfg } = await sb.from('cloud_backup_config').select('cron_token').eq('id', 1).maybeSingle()
  const cronToken = cfg?.cron_token as string | undefined
  const given = req.headers.get('x-backup-token') ?? ''
  let ok = token === serviceKey || apikey === serviceKey || (!!cronToken && given === cronToken)
  if (!ok && token) {
    const { data: { user } } = await sb.auth.getUser(token)
    if (user) {
      const { data } = await sb.from('user_roles').select('role').eq('user_id', user.id)
      ok = (data ?? []).some((r: any) => r.role === 'super_admin')
    }
  }
  if (!ok) return json({ success: false, error: 'UNAUTHORIZED' }, 401)

  const body = await req.json().catch(() => ({}))
  const ownerId: string | undefined = body.owner_id

  // Dispatcher: start one background job per tenant.
  if (!ownerId) {
    const { data: cos } = await sb.from('companies').select('owner_id').not('owner_id', 'is', null)
    const owners = [...new Set((cos ?? []).map((c: any) => c.owner_id))]
    const results = await Promise.allSettled(owners.map((o) => fetch(`${url}/functions/v1/cloud-backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-backup-token': cronToken ?? '', Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY') ?? ''}` },
      body: JSON.stringify({ owner_id: o }),
    })))
    return json({ success: true, dispatched: owners.length, failed: results.filter((r) => r.status === 'rejected').length })
  }

  const keyId = Deno.env.get('B2_KEY_ID'), appKey = Deno.env.get('B2_APPLICATION_KEY')
  if (!keyId || !appKey) return json({ success: false, error: 'B2_NOT_CONFIGURED' }, 500)
  const s3 = new AwsClient({ accessKeyId: keyId, secretAccessKey: appKey, service: 's3', region: B2_REGION })
  // UNSIGNED-PAYLOAD avoids hashing large bodies (keeps CPU low).
  const put = async (key: string, data: BodyInit, type = 'application/json') => {
    const r = await s3.fetch(`${B2_ENDPOINT}/${B2_BUCKET}/${enc(key)}`, {
      method: 'PUT', body: data, headers: { 'Content-Type': type, 'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD' },
    })
    if (!r.ok) throw new Error(`B2 ${r.status}: ${(await r.text()).slice(0, 200)}`)
  }
  const exists = async (key: string) =>
    (await s3.fetch(`${B2_ENDPOINT}/${B2_BUCKET}/${enc(key)}`, { method: 'HEAD', headers: { 'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD' } })).ok
  const continueRun = (runId: string) => fetch(`${url}/functions/v1/cloud-backup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-backup-token': cronToken ?? '' },
    body: JSON.stringify({ owner_id: ownerId, run_id: runId }),
  })

  type Task = { t: string; q: string; kind: 'rows' } | { kind: 'files' }
  let runId: string = body.run_id
  let st: any
  if (!runId) {
    const { data: companies } = await sb.from('companies').select('id,name').eq('owner_id', ownerId)
    const companyIds = (companies ?? []).map((c: any) => c.id)
    const companyName = companies?.[0]?.name ?? ''
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Hebron' }))
    const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0')
    const root = `العملاء/${slug(companyName)}__${ownerId.slice(0, 8)}`
    const folder = `${root}/النسخ-الاحتياطية/${y}/${m}/${d}`
    const { data: catalog, error } = await sb.rpc('cloud_backup_table_catalog')
    if (error) return json({ success: false, error: error.message }, 500)
    const colOf: Record<string, string> = {}
    const tasks: Task[] = []
    for (const { table_name: t, filter_column: col } of catalog as any[]) {
      colOf[t] = col
      if (SKIP.has(t) || CHILDREN[t]) continue
      let q: string
      if (t === 'companies') q = `owner_id=eq.${ownerId}`
      else if (col === 'company_id') q = `company_id=in.(${[ownerId, ...companyIds].join(',')})`
      else q = `${col}=eq.${ownerId}`
      tasks.push({ kind: 'rows', t, q: `select=*&${q}` })
    }
    for (const [t, { fk, parent }] of Object.entries(CHILDREN)) {
      const pc = colOf[parent] || 'user_id'
      const val = pc === 'company_id' ? `in.(${[ownerId, ...companyIds].join(',')})` : `eq.${ownerId}`
      tasks.push({ kind: 'rows', t, q: `select=*,__p:${parent}!${fk}!inner(${pc})&__p.${pc}=${val}` })
    }
    tasks.push({ kind: 'files' })
    st = { root, folder, companyName, tasks, i: 0, from: 0, part: 0, rows: 0, fileIdx: 0,
      records: 0, bytes: 0, files: 0, manifest: [], errors: [] }
    const { data: run } = await sb.from('cloud_backup_runs')
      .insert({ owner_id: ownerId, company_name: companyName, folder, state: st }).select('id').single()
    runId = run!.id
  } else {
    const { data: run } = await sb.from('cloud_backup_runs').select('state,status').eq('id', runId).single()
    if (!run || run.status !== 'running') return json({ success: false, error: 'RUN_NOT_ACTIVE' }, 409)
    st = run.state
  }

  const work = async () => {
    const deadline = Date.now() + 40_000
    const restHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: 'count=none' }
    try {
      while (st.i < st.tasks.length && Date.now() < deadline) {
        const task = st.tasks[st.i]
        if (task.kind === 'rows') {
          const cat = category(task.t)
          const fetchPage = (order: boolean) => fetch(
            `${url}/rest/v1/${task.t}?${task.q}${order ? '&order=id.asc' : ''}&limit=${PAGE}&offset=${st.from}`,
            { headers: restHeaders })
          let r = await fetchPage(true)
          if (!r.ok && r.status === 400) { await r.body?.cancel(); r = await fetchPage(false) }
          if (!r.ok) {
            st.errors.push(`${task.t}: ${r.status} ${(await r.text()).slice(0, 150)}`)
          } else {
            const range = r.headers.get('content-range') ?? ''
            const mm = range.match(/^(\d+)-(\d+)/)
            const n = mm ? Number(mm[2]) - Number(mm[1]) + 1 : 0
            if (n > 0) {
              const buf = new Uint8Array(await r.arrayBuffer())
              await put(`${st.folder}/${cat}/${task.t}/part-${String(st.part).padStart(3, '0')}.json`, buf)
              st.rows += n; st.records += n; st.bytes += buf.byteLength; st.part++
              if (n === PAGE) { st.from += PAGE; continue }
            } else await r.body?.cancel()
          }
          if (st.rows) st.manifest.push({ table: task.t, category: cat, rows: st.rows, files: st.part })
          st.i++; st.from = 0; st.part = 0; st.rows = 0
        } else {
          const { data: objs, error: fErr } = await sb.rpc('cloud_backup_list_files', { _owner: ownerId })
          if (fErr) { st.errors.push(`files: ${fErr.message}`); st.i++; continue }
          const list = (objs ?? []) as any[]
          while (st.fileIdx < list.length && Date.now() < deadline) {
            const o = list[st.fileIdx++]
            const key = `${st.root}/الملفات/${o.bucket_id}/${o.name}`
            try {
              if (await exists(key)) continue
              const { data: blob, error } = await sb.storage.from(o.bucket_id).download(o.name)
              if (error || !blob) { st.errors.push(`file ${o.bucket_id}/${o.name}: ${error?.message}`); continue }
              await put(key, blob, o.mimetype || 'application/octet-stream')
              st.files++; st.bytes += o.size || 0
            } catch (e: any) { st.errors.push(`file ${o.name}: ${e.message}`) }
          }
          if (st.fileIdx >= list.length) st.i++
        }
      }
    } catch (e: any) {
      st.errors.push(`${st.tasks[st.i]?.t ?? 'files'}: ${e.message}`)
      st.i++; st.from = 0; st.part = 0; st.rows = 0
    }

    if (st.i < st.tasks.length) {
      await sb.from('cloud_backup_runs').update({
        state: st, tables_count: st.manifest.length, records_count: st.records, files_count: st.files, size_bytes: st.bytes,
      }).eq('id', runId)
      await continueRun(runId)
      return
    }
    try {
      await put(`${st.folder}/manifest.json`, JSON.stringify({
        app: 'UNIFY', owner_id: ownerId, company: st.companyName, generated_at: new Date().toISOString(),
        records: st.records, new_files: st.files, tables: st.manifest, errors: st.errors,
      }, null, 2))
    } catch (e: any) { st.errors.push(`manifest: ${e.message}`) }
    await sb.from('cloud_backup_runs').update({
      status: st.errors.length ? 'partial' : 'success', state: {},
      tables_count: st.manifest.length, records_count: st.records, files_count: st.files, size_bytes: st.bytes,
      errors: st.errors.slice(0, 200), finished_at: new Date().toISOString(),
    }).eq('id', runId)
    console.log(`[cloud-backup] ${ownerId} done: ${st.records} rows, ${st.files} files, ${st.errors.length} errors`)
  }

  // @ts-ignore EdgeRuntime is provided by the platform
  EdgeRuntime.waitUntil(work())
  return json({ success: true, started: true, run_id: runId, folder: st.folder }, 202)
})
