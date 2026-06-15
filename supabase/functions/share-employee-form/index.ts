import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') || ''

    // user-scoped client (for caller validation)
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

    const body = await req.json()
    const { formId, channel, recipient, recipientName, message, pdfUrl, companyId } = body || {}
    if (!formId || !channel || !pdfUrl || !companyId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!['whatsapp', 'management', 'hr', 'email'].includes(channel)) {
      return new Response(JSON.stringify({ error: 'Invalid channel' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(supabaseUrl, serviceKey)

    // Load form + sender employee
    const { data: form } = await admin
      .from('employee_forms')
      .select('id, title, employee_id, company_id, workflow_status, user_id')
      .eq('id', formId)
      .maybeSingle()
    if (!form) {
      return new Response(JSON.stringify({ error: 'Form not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: senderEmployee } = await admin
      .from('employees')
      .select('id, full_name')
      .eq('id', form.employee_id)
      .maybeSingle()

    let shareStatus = 'sent'
    let errorMsg: string | null = null

    // Channel-specific work
    if (channel === 'management' || channel === 'hr') {
      const targetRoles = channel === 'management' ? ['admin'] : ['hr_manager', 'admin']
      let userIds: string[] = []
      if (recipient) {
        userIds = [recipient]
      } else {
        const { data: roleRows } = await admin
          .from('user_roles')
          .select('user_id')
          .in('role', targetRoles)
        userIds = (roleRows || []).map((r: any) => r.user_id)
      }

      // Filter to same company via profiles
      if (userIds.length) {
        const { data: profs } = await admin
          .from('profiles')
          .select('id, company_id')
          .in('id', userIds)
          .eq('company_id', companyId)
        userIds = (profs || []).map((p: any) => p.id)
      }

      // Insert notifications
      for (const uid of userIds) {
        await admin.from('admin_notifications').insert({
          user_id: uid,
          company_id: companyId,
          type: 'employee_form_shared',
          title: `📄 نموذج جديد: ${form.title || 'بدون عنوان'}`,
          message: `${senderEmployee?.full_name || 'موظف'} أرسل نموذجاً ${
            channel === 'management' ? 'للإدارة' : 'لـ HR'
          }. ${message || ''}\n${pdfUrl}`,
          metadata: { form_id: formId, pdf_url: pdfUrl, channel },
        })
      }
    } else if (channel === 'email') {
      const { error: emailErr } = await admin.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'employee-form-shared',
          recipientEmail: recipient,
          idempotencyKey: `form-share-${formId}-${Date.now()}`,
          templateData: {
            recipientName: recipientName || '',
            senderName: senderEmployee?.full_name || 'موظف',
            formTitle: form.title || 'نموذج',
            pdfUrl,
            message: message || '',
          },
        },
      })
      if (emailErr) {
        shareStatus = 'failed'
        errorMsg = emailErr.message
      }
    }
    // whatsapp: link is built client-side; we just log it.

    // Log share
    await admin.from('employee_form_shares').insert({
      form_id: formId,
      company_id: companyId,
      shared_by_employee_id: form.employee_id,
      shared_by_user_id: user.id,
      channel,
      recipient: recipient || null,
      recipient_name: recipientName || null,
      pdf_url: pdfUrl,
      message: message || null,
      status: shareStatus,
      error_message: errorMsg,
    })

    // Bump workflow_status if still draft and going to management/hr
    if (form.workflow_status === 'draft' && (channel === 'management' || channel === 'hr')) {
      await admin
        .from('employee_forms')
        .update({
          workflow_status: 'submitted',
          current_approver_role: channel === 'management' ? 'management' : 'hr',
        })
        .eq('id', formId)
    }

    return new Response(JSON.stringify({ ok: true, status: shareStatus }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('share-employee-form error', e)
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})