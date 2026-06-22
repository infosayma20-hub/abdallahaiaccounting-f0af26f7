/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Img,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
  token?: string
}

export const SignupEmail = ({
  siteName,
  recipient,
  token,
}: SignupEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>أكّد بريدك الإلكتروني للانضمام إلى أموالي</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Img src="https://amwali.app/logos/amwali-full-white.png" alt="أموالي" width="150" style={logoImg} />
          <Text style={tagline}>AMWALI — نظام المحاسبة الذكي</Text>
        </Section>

        <Section style={body}>
          <Heading style={h1}>أهلاً بك في {siteName}!</Heading>
          <Text style={text}>
            شكراً لتسجيلك في أموالي.<br />
            لإكمال إنشاء حسابك ({recipient})، أدخل رمز التحقق التالي كاملاً في صفحة التأكيد:
          </Text>

          <Section style={codeWrap}>
            <Text style={codeStyle}>{token || '------'}</Text>
            <Text style={codeHint}>صالح لمدة ساعة واحدة فقط</Text>
          </Section>

          <Text style={footerNote}>
            إذا لم تنشئ هذا الحساب، يمكنك تجاهل هذا الإيميل بأمان.<br />
            لا تشارك هذا الرمز مع أي شخص — فريق أموالي لن يطلبه منك أبداً.
          </Text>
        </Section>

        <Section style={footer}>
          <Text style={footerText}>
            © 2026 أموالي · AMWALI — جميع الحقوق محفوظة
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = { direction: 'rtl' as const, backgroundColor: '#f4f6fa', fontFamily: 'Tahoma, Arial, sans-serif', margin: 0, padding: '20px 0' }
const container = { maxWidth: '600px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '12px', overflow: 'hidden' as const, border: '1px solid #e5e7eb' }
const header = { backgroundColor: '#0D1B2E', padding: '28px 24px', textAlign: 'center' as const }
const brand = { color: '#ffffff', margin: 0, fontSize: '26px', fontWeight: 'bold' as const, letterSpacing: '1px' }
const tagline = { color: '#a0b0d0', margin: '6px 0 0', fontSize: '13px' }
const body = { padding: '32px 28px', backgroundColor: '#ffffff' }
const h1 = { color: '#0D1B2E', fontSize: '20px', fontWeight: 'bold' as const, margin: '0 0 16px' }
const text = { color: '#374151', fontSize: '15px', lineHeight: '1.8', margin: '0 0 24px' }
const codeWrap = { textAlign: 'center' as const, margin: '24px 0 8px', padding: '20px', backgroundColor: '#F7F8FA', borderRadius: '12px', border: '1px dashed #0D1B2E' }
const codeStyle = { color: '#0D1B2E', fontSize: '32px', fontWeight: 'bold' as const, letterSpacing: '8px', margin: 0, fontFamily: 'Consolas, Menlo, monospace' }
const codeHint = { color: '#6b7280', fontSize: '12px', margin: '8px 0 0' }
const footerNote = { color: '#6b7280', fontSize: '13px', lineHeight: '1.8', margin: '24px 0 0' }
const footer = { backgroundColor: '#0D1B2E', padding: '16px 24px', textAlign: 'center' as const }
const footerText = { color: '#a0b0d0', margin: 0, fontSize: '12px' }
const logoImg = { display: 'block', margin: '0 auto', height: 'auto' }
