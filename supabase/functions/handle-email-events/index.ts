import { createEmailWebhookHandler } from 'npm:@lovable.dev/email-js@0.1.0'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

// Notification-only record keeping (Lovable enforces suppression at send time).
async function record(
  eventId: string,
  recipient: string,
  messageId: string | null | undefined,
  reason: 'bounce' | 'complaint' | 'unsubscribe',
  status: 'bounced' | 'complained' | 'suppressed',
  message: string,
) {
  const email = recipient.toLowerCase()
  const { error: supErr } = await supabase
    .from('suppressed_emails')
    .upsert({ email, reason, metadata: null }, { onConflict: 'email' })
  if (supErr) {
    console.error('suppressed_emails upsert failed', { code: supErr.code, message: supErr.message, event_id: eventId })
    throw new Error('suppressed_emails upsert failed')
  }
  const { error: logErr } = await supabase.from('email_send_log').insert({
    message_id: messageId ?? null,
    template_name: 'system',
    recipient_email: email,
    status,
    error_message: message,
    metadata: null,
  })
  if (logErr) {
    console.error('email_send_log insert failed', { code: logErr.code, message: logErr.message, event_id: eventId })
    throw new Error('email_send_log insert failed')
  }
}

const handler = createEmailWebhookHandler({
  apiKey: Deno.env.get('LOVABLE_API_KEY')!,
  on: {
    'email.bounced': async (event) => {
      await record(event.event_id, event.data.recipient, event.data.message_id, 'bounce', 'bounced',
        'Permanent bounce — email address is invalid or does not exist')
    },
    'email.complaint': async (event) => {
      await record(event.event_id, event.data.recipient, event.data.message_id, 'complaint', 'complained',
        'Spam complaint — recipient marked email as spam')
    },
    'email.unsubscribed': async (event) => {
      await record(event.event_id, event.data.recipient, event.data.message_id, 'unsubscribe', 'suppressed',
        'Recipient unsubscribed')
    },
  },
})

Deno.serve((req) => handler(req))
