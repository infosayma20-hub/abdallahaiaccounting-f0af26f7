// src/constants/brand.ts
// Single source of truth for brand name — never hardcode brand name elsewhere

export const BRAND = {
  nameEn:       'AMWALI',
  nameAr:       'أموالي',
  fullNameEn:   'AMWALI ERP Software',
  fullNameAr:   'أموالي — نظام إدارة الأعمال',
  domain:       'amwali.com',
  supportEmail: 'support@amwali.com',
  copyright:    `© ${new Date().getFullYear()} AMWALI. جميع الحقوق محفوظة.`,

  logos: {
    white:      '/logos/amwali-white.jpg',
    navy:       '/logos/amwali-navy.jpg',
    markNavy:   '/logos/amwali-mark-navy.png',
    markWhite:  '/logos/amwali-mark-white.png',
    favicon:    '/logos/amwali-mark-only.svg',
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
