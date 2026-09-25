import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendTemplateEmail, type SendTemplateEmailOptions, type SendTemplateEmailResult } from './send-email.ts'

// Sends through the managed helper and keeps the project's email_send_log
// history (sent / suppressed / failed). A log write never decides the result.
export async function sendTemplateEmailLogged(
  templateName: string,
  to: string,
  options: SendTemplateEmailOptions = {},
): Promise<SendTemplateEmailResult> {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const log = async (status: string, error_message?: string) => {
    const { error } = await supabase.from('email_send_log').insert({
      message_id: null, template_name: templateName, recipient_email: to, status, error_message: error_message ?? null,
    })
    if (error) console.error('email_send_log insert failed', { code: error.code, message: error.message })
  }
  try {
    const result = await sendTemplateEmail(templateName, to, options)
    await log(result.sent ? 'sent' : 'suppressed')
    return result
  } catch (err) {
    await log('failed', err instanceof Error ? err.message : String(err))
    throw err
  }
}
