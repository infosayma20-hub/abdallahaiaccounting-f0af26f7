// src/constants/brand.ts
// Single source of truth for brand name — never hardcode brand name elsewhere

export const BRAND = {
  nameEn:       'Unify ERP',
  nameAr:       'يونيفاي',
  fullNameEn:   'Unify ERP Software',
  fullNameAr:   'يونيفاي — نظام إدارة الأعمال',
  domain:       'unifyerp.app',
  supportEmail: 'support@unifyerp.app',
  version:      '1.0.0',
  copyright:    `© ${new Date().getFullYear()} Unify ERP. جميع الحقوق محفوظة.`,

  logos: {
    // Unify ERP brand system (2026)
    primary:    '/branding/unify/unify-logo-horizontal.png',
    vertical:   '/branding/unify/unify-logo-vertical.png',
    tagline:    '/branding/unify/unify-logo-horizontal.png',
    mono:       '/branding/unify/unify-logo-horizontal-white.png',
    text:       '/branding/unify/unify-logo-horizontal.png',
    icon:       '/branding/unify/unify-mark.png',
    dark:       '/branding/unify/unify-logo-horizontal-white.png',
    iconSquare: '/branding/icon-square.png',    // App icon — rounded square
    iconCircle: '/branding/icon-circle.png',    // App icon — circle
    iconPlain:  '/branding/unify/unify-mark.png',
    favicon:    '/favicon.png',
    // Backwards-compat aliases (used across legacy print views / PDFs)
    white:      '/branding/unify/unify-logo-horizontal-white.png',
    navy:       '/branding/unify/unify-logo-horizontal.png',
    markNavy:   '/branding/unify/unify-mark.png',
    markWhite:  '/branding/unify/unify-mark.png',
  },

  messages: {
    welcomeAr:  'مرحباً بك في يونيفاي',
    welcomeEn:  'Welcome to Unify ERP',
    taglineAr:  'أعمالك في أبهى صورها',
    taglineEn:  'Your Business at Its Best',
    loginTitle: 'مرحباً بك في يونيفاي',
    loginSub:   'سجل دخولك للمتابعة إلى حسابك',
  }
} as const;
