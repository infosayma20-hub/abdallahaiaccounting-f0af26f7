// src/constants/colors.ts
// QOYOD Official Color System — Single Source of Truth

export const QOYOD_COLORS = {
  navy: {
    primary:  '#1B3A5C',
    hover:    '#152d4a',
    light:    '#EEF2F7',
  },
  gold: {
    primary:  '#C9A84C',
    hover:    '#B8963E',
    active:   '#A8862E',
    light:    '#FAF0DC',
    shadow:   'rgba(201, 168, 76, 0.30)',
  },
  white: '#FFFFFF',
  gray: {
    surface:  '#F8F9FA',
    light:    '#F3F4F6',
    icons:    '#F0F4F8',
  },
  text: {
    primary:   '#374151',
    secondary: '#6B7280',
    light:     '#9CA3AF',
    disabled:  '#D1D5DB',
    onNavy:    '#FFFFFF',
    onGold:    '#FFFFFF',
  },
  border: {
    primary:   '#E5E7EB',
    light:     '#F3F4F6',
    buttons:   '#D1D5DB',
    focus:     '#1B3A5C',
    focusRing: 'rgba(27, 58, 92, 0.12)',
  },
  badge: {
    success: { bg: '#DCFCE7', text: '#166534' },
    error:   { bg: '#FEE2E2', text: '#991B1B' },
    pending: { bg: '#DBEAFE', text: '#1E40AF' },
    neutral: { bg: '#F3F4F6', text: '#6B7280' },
    warning: { bg: '#FEF3C7', text: '#92400E' },
  },
  danger: {
    bg:     '#FEF2F2',
    text:   '#EF4444',
    border: '#FECACA',
    solid:  '#DC2626',
  },
} as const;

export type QoyodColors = typeof QOYOD_COLORS;
