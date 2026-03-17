export const BRAND = {
  name: 'QOYOD',
  nameAr: 'قيود',
  fullName: 'QOYOD ERP Software',
  fullNameAr: 'قيود — نظام إدارة الأعمال',
  taglineAr: 'أعمالك في أبهى صورها',
  taglineEn: 'Your Business at Its Best',
  copyright: '© 2026 QOYOD قيود — جميع الحقوق محفوظة',
  website: 'https://qoyod.com',

  logo: {
    primary:     '/brand/logo-primary.svg',
    white:       '/brand/logo-white.svg',
    dark:        '/brand/logo-dark.svg',
    iconColor:   '/brand/logo-icon-color.svg',
    iconWhite:   '/brand/logo-icon-white.svg',
    iconDark:    '/brand/logo-icon-dark.svg',
    fallbackPng: '/brand/logo-primary.png',
  },

  sizes: {
    sidebar_expanded:  { width: 148, height: 'auto' as const },
    sidebar_collapsed: { width: 36,  height: 36 },
    login_panel_dark:  { width: 180, height: 'auto' as const },
    login_panel_light: { width: 140, height: 'auto' as const },
    topbar_mobile:     { width: 32,  height: 32 },
    splash_screen:     { width: 200, height: 'auto' as const },
    print_header:      { width: 120, height: 'auto' as const },
    email_header:      { width: 160, height: 'auto' as const },
    favicon:           { width: 32,  height: 32 },
  },

  spacing: {
    logo_padding_x: 16,
    logo_padding_y: 12,
  },
} as const;
