import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ADMIN_EMAIL = 'info.sayma20@gmail.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { notification_id, event_type, user_email, user_name } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Send email via internal transactional sender
    const { error: sendError } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'admin-user-event',
        recipientEmail: ADMIN_EMAIL,
        idempotencyKey: `admin-event-${notification_id}`,
        templateData: {
          eventType: event_type,
          userEmail: user_email,
          userName: user_name || user_email.split('@')[0],
          eventTime: new Date().toLocaleString('ar-EG', { timeZone: 'Asia/Jerusalem' }),
        },
      },
    })

    if (sendError) {
      console.error('Failed to send admin email', sendError)
      return new Response(JSON.stringify({ error: 'send_failed', details: sendError }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Mark as sent
    if (notification_id) {
      await supabase
        .from('admin_notifications')
        .update({ email_sent: true, email_sent_at: new Date().toISOString() })
        .eq('id', notification_id)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('notify-admin-signup error', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
