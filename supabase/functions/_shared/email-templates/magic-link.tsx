/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Img,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>رابط الدخول السريع إلى {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Img src="https://amwali.app/logos/amwali-full-white.png" alt="أموالي" width="150" style={logoImg} />
          <Text style={tagline}>AMWALI — نظام المحاسبة الذكي</Text>
        </Section>

        <Section style={body}>
          <Heading style={h1}>رابط الدخول السريع</Heading>
          <Text style={text}>
            مرحباً،<br />
            اضغط على الزر أدناه لتسجيل الدخول إلى {siteName} مباشرةً بدون كلمة مرور.
          </Text>

          <Section style={buttonWrap}>
            <Button style={button} href={confirmationUrl}>
              تسجيل الدخول
            </Button>
          </Section>

          <Text style={footerNote}>
            هذا الرابط صالح لفترة قصيرة فقط.<br />
            إذا لم تطلب الدخول، تجاهل هذا الإيميل.
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

export default MagicLinkEmail

const main = { direction: 'rtl' as const, backgroundColor: '#f4f6fa', fontFamily: 'Tahoma, Arial, sans-serif', margin: 0, padding: '20px 0' }
const container = { maxWidth: '600px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '12px', overflow: 'hidden' as const, border: '1px solid #e5e7eb' }
const header = { backgroundColor: '#0D1B2E', padding: '28px 24px', textAlign: 'center' as const }
const brand = { color: '#ffffff', margin: 0, fontSize: '26px', fontWeight: 'bold' as const, letterSpacing: '1px' }
const tagline = { color: '#a0b0d0', margin: '6px 0 0', fontSize: '13px' }
const body = { padding: '32px 28px', backgroundColor: '#ffffff' }
const h1 = { color: '#0D1B2E', fontSize: '20px', fontWeight: 'bold' as const, margin: '0 0 16px' }
const text = { color: '#374151', fontSize: '15px', lineHeight: '1.8', margin: '0 0 24px' }
const buttonWrap = { textAlign: 'center' as const, margin: '32px 0' }
const button = { backgroundColor: '#0D1B2E', color: '#ffffff', padding: '14px 36px', borderRadius: '8px', textDecoration: 'none', fontSize: '15px', fontWeight: 'bold' as const, display: 'inline-block' }
const footerNote = { color: '#6b7280', fontSize: '13px', lineHeight: '1.8', margin: '24px 0 0' }
const footer = { backgroundColor: '#0D1B2E', padding: '16px 24px', textAlign: 'center' as const }
const footerText = { color: '#a0b0d0', margin: 0, fontSize: '12px' }
const logoImg = { display: 'block', margin: '0 auto', height: 'auto' }
