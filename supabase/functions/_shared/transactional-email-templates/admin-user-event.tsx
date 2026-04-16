/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Amwali'

interface AdminUserEventProps {
  eventType?: 'signup' | 'email_verified' | 'first_login'
  userEmail?: string
  userName?: string
  eventTime?: string
}

const labels = {
  signup: { ar: '📝 تسجيل جديد', color: '#2563eb' },
  email_verified: { ar: '✅ تم تفعيل الإيميل', color: '#16a34a' },
  first_login: { ar: '🔓 أول دخول للبرنامج', color: '#9333ea' },
}

const AdminUserEventEmail = ({
  eventType = 'signup',
  userEmail = 'user@example.com',
  userName = 'مستخدم جديد',
  eventTime,
}: AdminUserEventProps) => {
  const label = labels[eventType] || labels.signup
  const time = eventTime || new Date().toLocaleString('ar-EG', { timeZone: 'Asia/Jerusalem' })

  return (
    <Html lang="ar" dir="rtl">
      <Head />
      <Preview>{label.ar} — {userEmail}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={{ ...badge, backgroundColor: label.color }}>
            <Text style={badgeText}>{label.ar}</Text>
          </Section>

          <Heading style={h1}>حدث جديد على {SITE_NAME}</Heading>

          <Section style={card}>
            <Text style={row}><strong>الاسم:</strong> {userName}</Text>
            <Text style={row}><strong>الإيميل:</strong> {userEmail}</Text>
            <Text style={row}><strong>الوقت:</strong> {time}</Text>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            رسالة تلقائية من نظام مراقبة المستخدمين — {SITE_NAME}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: AdminUserEventEmail,
  subject: (data: Record<string, any>) => {
    const t = data?.eventType || 'signup'
    const labelMap: Record<string, string> = {
      signup: '📝 تسجيل جديد',
      email_verified: '✅ تفعيل إيميل',
      first_login: '🔓 أول دخول',
    }
    return `${labelMap[t] || labelMap.signup} — ${data?.userEmail || ''}`
  },
  displayName: 'إشعار حدث مستخدم للأدمن',
  previewData: {
    eventType: 'signup',
    userEmail: 'newuser@example.com',
    userName: 'محمد أحمد',
    eventTime: '16/04/2026 14:30',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Tahoma, Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const badge = { padding: '8px 16px', borderRadius: '8px', display: 'inline-block', marginBottom: '20px' }
const badgeText = { color: '#ffffff', fontSize: '14px', fontWeight: 'bold', margin: '0' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 20px' }
const card = { backgroundColor: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }
const row = { fontSize: '15px', color: '#334155', margin: '8px 0', lineHeight: '1.6' }
const hr = { borderColor: '#e2e8f0', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#94a3b8', textAlign: 'center' as const, margin: '0' }
