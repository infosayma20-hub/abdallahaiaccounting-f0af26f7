/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  downloadUrl: string
  fileSizeMb: string
  tablesCount: number
  recordsCount: number
  generatedAt: string
  expiresInDays: number
}

const Email = ({ downloadUrl, fileSizeMb, tablesCount, recordsCount, generatedAt, expiresInDays }: Props) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>النسخة الاحتياطية الأسبوعية جاهزة للتحميل من أموالي</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={h1}>💾 النسخة الاحتياطية الأسبوعية جاهزة</Heading>
          <Text style={subtitle}>تم إنشاء نسخة كاملة من بياناتك بنجاح</Text>
        </Section>

        <Section style={statsBox}>
          <Text style={statRow}><strong>📅 تاريخ الإنشاء:</strong> {generatedAt}</Text>
          <Text style={statRow}><strong>📦 حجم الملف:</strong> {fileSizeMb} MB</Text>
          <Text style={statRow}><strong>📊 عدد الجداول:</strong> {tablesCount}</Text>
          <Text style={statRow}><strong>📝 عدد السجلات:</strong> {recordsCount.toLocaleString()}</Text>
        </Section>

        <Section style={{ textAlign: 'center' as const, margin: '32px 0' }}>
          <Button href={downloadUrl} style={button}>
            ⬇️ تحميل الباك اب
          </Button>
          <Text style={warning}>⚠️ الرابط صالح لمدة {expiresInDays} أيام فقط</Text>
        </Section>

        <Hr style={hr} />

        <Section>
          <Heading as="h2" style={h2}>💡 توصيات مهمة</Heading>
          <Text style={tip}>• حمّل الملف واحتفظ فيه على جهاز آمن أو Google Drive</Text>
          <Text style={tip}>• لا تشارك هذا الرابط مع أي شخص - فيه بياناتك الكاملة</Text>
          <Text style={tip}>• احتفظ بآخر 4 نسخ على الأقل (شهر كامل)</Text>
          <Text style={tip}>• لو ما وصلك إيميل الأسبوع الجاي، تواصل معنا فوراً</Text>
        </Section>

        <Hr style={hr} />

        <Text style={footer}>
          هذا الإيميل مُرسَل تلقائياً من نظام أموالي - نسخة احتياطية أسبوعية
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => `💾 نسخة احتياطية أسبوعية جاهزة - ${data.generatedAt || ''}`,
  displayName: 'Weekly Backup Ready',
  previewData: {
    downloadUrl: 'https://example.com/download',
    fileSizeMb: '12.4',
    tablesCount: 28,
    recordsCount: 45230,
    generatedAt: '2026-07-12',
    expiresInDays: 7,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, "Segoe UI", Tahoma, sans-serif' }
const container = { padding: '32px 24px', maxWidth: '600px', margin: '0 auto' }
const header = { textAlign: 'center' as const, marginBottom: '24px' }
const h1 = { color: '#0D1B2E', fontSize: '24px', fontWeight: 'bold' as const, margin: '0 0 8px' }
const subtitle = { color: '#64748b', fontSize: '14px', margin: '0' }
const h2 = { color: '#0D1B2E', fontSize: '18px', fontWeight: 'bold' as const, margin: '16px 0 12px' }
const statsBox = { backgroundColor: '#f1f5f9', borderRadius: '12px', padding: '20px', margin: '24px 0' }
const statRow = { fontSize: '15px', color: '#1e293b', margin: '6px 0', lineHeight: '1.6' }
const button = { backgroundColor: '#0D1B2E', color: '#ffffff', padding: '14px 32px', borderRadius: '8px', textDecoration: 'none', fontSize: '16px', fontWeight: 'bold' as const, display: 'inline-block' }
const warning = { color: '#dc2626', fontSize: '13px', marginTop: '12px', fontWeight: '600' as const }
const hr = { borderColor: '#e2e8f0', margin: '24px 0' }
const tip = { fontSize: '14px', color: '#334155', margin: '6px 0', lineHeight: '1.7' }
const footer = { fontSize: '12px', color: '#94a3b8', textAlign: 'center' as const, marginTop: '16px' }