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

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>رمز التحقق من أموالي</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Img src="https://amwali.app/logos/amwali-full-white.png" alt="أموالي" width="150" style={logoImg} />
          <Text style={tagline}>AMWALI — نظام المحاسبة الذكي</Text>
        </Section>

        <Section style={body}>
          <Heading style={h1}>رمز إعادة التحقق</Heading>
          <Text style={text}>
            استخدم الرمز التالي لتأكيد هويتك:
          </Text>
          <Text style={codeStyle}>{token}</Text>

          <Text style={footerNote}>
            هذا الرمز صالح لفترة قصيرة فقط.<br />
            إذا لم تطلب هذا الرمز، تجاهل هذا الإيميل.
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

export default ReauthenticationEmail

const main = { direction: 'rtl' as const, backgroundColor: '#f4f6fa', fontFamily: 'Tahoma, Arial, sans-serif', margin: 0, padding: '20px 0' }
const container = { maxWidth: '600px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '12px', overflow: 'hidden' as const, border: '1px solid #e5e7eb' }
const header = { backgroundColor: '#0D1B2E', padding: '28px 24px', textAlign: 'center' as const }
const brand = { color: '#ffffff', margin: 0, fontSize: '26px', fontWeight: 'bold' as const, letterSpacing: '1px' }
const tagline = { color: '#a0b0d0', margin: '6px 0 0', fontSize: '13px' }
const body = { padding: '32px 28px', backgroundColor: '#ffffff', textAlign: 'center' as const }
const h1 = { color: '#0D1B2E', fontSize: '20px', fontWeight: 'bold' as const, margin: '0 0 16px' }
const text = { color: '#374151', fontSize: '15px', lineHeight: '1.8', margin: '0 0 16px' }
const codeStyle = { fontFamily: 'Courier, monospace', fontSize: '32px', fontWeight: 'bold' as const, color: '#0D1B2E', letterSpacing: '6px', backgroundColor: '#f4f6fa', padding: '16px', borderRadius: '8px', margin: '0 0 24px' }
const footerNote = { color: '#6b7280', fontSize: '13px', lineHeight: '1.8', margin: '24px 0 0' }
const footer = { backgroundColor: '#0D1B2E', padding: '16px 24px', textAlign: 'center' as const }
const footerText = { color: '#a0b0d0', margin: 0, fontSize: '12px' }
const logoImg = { display: 'block', margin: '0 auto', height: 'auto' }
