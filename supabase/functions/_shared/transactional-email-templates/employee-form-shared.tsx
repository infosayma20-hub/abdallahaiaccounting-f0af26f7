import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Section, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  recipientName?: string
  senderName?: string
  formTitle?: string
  pdfUrl?: string
  message?: string
}

const Email = ({ recipientName, senderName, formTitle, pdfUrl, message }: Props) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>{`نموذج جديد: ${formTitle || ''}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>📄 نموذج جديد للمراجعة</Heading>
        <Text style={text}>
          {recipientName ? `أهلاً ${recipientName}،` : 'أهلاً،'}
        </Text>
        <Text style={text}>
          قام <strong>{senderName || 'الموظف'}</strong> بمشاركة نموذج معك:
        </Text>
        <Section style={card}>
          <Text style={cardTitle}>{formTitle || 'نموذج'}</Text>
          {message ? <Text style={cardBody}>{message}</Text> : null}
        </Section>
        {pdfUrl ? (
          <Section style={{ textAlign: 'center', margin: '24px 0' }}>
            <Button href={pdfUrl} style={button}>تحميل النموذج PDF</Button>
          </Section>
        ) : null}
        <Hr style={hr} />
        <Text style={footer}>
          هذه رسالة آلية. الرابط صالح لمدة 7 أيام.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `📄 نموذج جديد: ${d?.formTitle || ''}`,
  displayName: 'مشاركة نموذج موظف',
  previewData: {
    recipientName: 'أحمد',
    senderName: 'سامي مدير التسويق',
    formTitle: 'خطة التسويق الشهرية',
    pdfUrl: 'https://example.com/sample.pdf',
    message: 'يرجى الاطلاع والاعتماد.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Tajawal, Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '600px', margin: '0 auto' }
const h1 = { color: '#0D1B2E', fontSize: '22px', fontWeight: 800 as const, margin: '0 0 16px' }
const text = { color: '#1f2937', fontSize: '14px', lineHeight: '24px', margin: '8px 0' }
const card = { background: '#f8f9fb', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', margin: '12px 0' }
const cardTitle = { fontSize: '16px', fontWeight: 700 as const, color: '#0D1B2E', margin: 0 }
const cardBody = { fontSize: '13px', color: '#4b5563', margin: '8px 0 0' }
const button = { background: '#0D1B2E', color: '#ffffff', padding: '12px 28px', borderRadius: '10px', fontSize: '14px', fontWeight: 700 as const, textDecoration: 'none' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footer = { color: '#9ca3af', fontSize: '11px', textAlign: 'center' as const }