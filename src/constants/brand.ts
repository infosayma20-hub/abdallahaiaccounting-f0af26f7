// src/constants/brand.ts
// Single source of truth for brand name — never hardcode brand name elsewhere

export const BRAND = {
  nameEn:       'AMWALI',
  nameAr:       'أموالي',
  fullNameEn:   'AMWALI ERP Software',
  fullNameAr:   'أموالي — نظام إدارة الأعمال',
  domain:       'amwali.app',
  supportEmail: 'support@amwali.app',
  version:      '1.0.0',
  copyright:    `© ${new Date().getFullYear()} AMWALI. جميع الحقوق محفوظة.`,

  logos: {
    // New approved Amwali brand system (2026)
    primary:    '/branding/logo-primary.png',   // Horizontal Ar+En+icon — default
    vertical:   '/branding/logo-vertical.png',  // Stacked
    tagline:    '/branding/logo-tagline.png',   // With tagline
    mono:       '/branding/logo-mono.png',      // Single-color full
    text:       '/branding/logo-text.png',      // Text only (أموالي + amwali)
    icon:       '/branding/logo-icon-only.png', // A mark only (transparent)
    dark:       '/branding/logo-dark.png',      // Inverted (white on navy)
    iconSquare: '/branding/icon-square.png',    // App icon — rounded square
    iconCircle: '/branding/icon-circle.png',    // App icon — circle
    iconPlain:  '/branding/icon-plain.png',     // Plain 'a' mark
    favicon:    '/favicon.png',
    // Backwards-compat aliases (used across legacy print views / PDFs)
    white:      '/branding/logo-dark.png',      // logo for dark backgrounds (white text on navy)
    navy:       '/branding/logo-primary.png',   // logo for light backgrounds
    markNavy:   '/branding/icon-plain.png',
    markWhite:  '/branding/logo-icon-only.png',
  },

  messages: {
    welcomeAr:  'مرحباً بك في أموالي',
    welcomeEn:  'Welcome to AMWALI',
    taglineAr:  'أعمالك في أبهى صورها',
    taglineEn:  'Your Business at Its Best',
    loginTitle: 'مرحباً بك في أموالي',
    loginSub:   'سجل دخولك للمتابعة إلى حسابك',
  }
} as const;
