// Template Designer Types

export interface DesignElement {
  id: string;
  type: 'text' | 'dynamic' | 'table' | 'totals' | 'signature' | 'divider' | 'image' | 'textbox' | 'colorstrip';
  zone: 'header' | 'body' | 'footer';
  content: string;
  style: ElementStyle;
  /** For dynamic type — variable key like {{company_name}} */
  variable?: string;
  /** For table — which columns to show */
  tableColumns?: string[];
  /** For image — source url or variable */
  imageSrc?: string;
  /** Position within zone (px) */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ElementStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: string;
  textDecoration?: string;
  textAlign?: 'right' | 'center' | 'left';
  color?: string;
  backgroundColor?: string;
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: string;
  borderRadius?: number;
  padding?: number;
  marginTop?: number;
  marginBottom?: number;
  width?: string;
  height?: number;
  opacity?: number;
  lineHeight?: number;
}

export interface DesignTheme {
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  pageBackground: string;
  fontFamily: string;
  titleFont: string;
  watermark: { enabled: boolean; opacity: number };
}

export interface DesignPage {
  size: 'A4' | 'A5' | 'Letter';
  orientation: 'portrait' | 'landscape';
  margins: { top: number; right: number; bottom: number; left: number };
  direction: 'rtl' | 'ltr';
}

export interface DesignZones {
  header: { height: number; background: string };
  footer: { height: number; background: string };
}

export interface TemplateDesign {
  templateType: string;
  name: string;
  version: number;
  theme: DesignTheme;
  page: DesignPage;
  zones: DesignZones;
  elements: DesignElement[];
}

export const DYNAMIC_VARIABLES = [
  { key: '{{company_name}}', label: 'اسم الشركة' },
  { key: '{{company_logo}}', label: 'لوجو الشركة' },
  { key: '{{client_name}}', label: 'اسم العميل' },
  { key: '{{client_address}}', label: 'عنوان العميل' },
  { key: '{{doc_number}}', label: 'رقم المستند' },
  { key: '{{doc_date}}', label: 'التاريخ' },
  { key: '{{doc_total}}', label: 'الإجمالي' },
  { key: '{{doc_total_words}}', label: 'المبلغ كتابةً' },
  { key: '{{validity_days}}', label: 'صلاحية العرض' },
  { key: '{{payment_terms}}', label: 'شروط الدفع' },
  { key: '{{notes}}', label: 'الملاحظات' },
  { key: '{{signatory_name}}', label: 'اسم الموقّع' },
];

export const PRESET_THEMES: { id: string; label: string; theme: Partial<DesignTheme> }[] = [
  { id: 'white', label: 'كلاسيك أبيض', theme: { primaryColor: '#111827', secondaryColor: '#6B7280', textColor: '#111827', pageBackground: '#FFFFFF' } },
  { id: 'navy', label: 'نيفي داكن', theme: { primaryColor: '#1B2B4B', secondaryColor: '#2C3E6B', textColor: '#1A1A2E', pageBackground: '#FFFFFF' } },
  { id: 'gray', label: 'رمادي راقي', theme: { primaryColor: '#374151', secondaryColor: '#9CA3AF', textColor: '#1F2937', pageBackground: '#F9FAFB' } },
  { id: 'gold', label: 'ذهبي فاخر', theme: { primaryColor: '#92400E', secondaryColor: '#C9A84C', textColor: '#1C1917', pageBackground: '#FFFBEB' } },
  { id: 'green', label: 'أخضر أعمال', theme: { primaryColor: '#065F46', secondaryColor: '#10B981', textColor: '#064E3B', pageBackground: '#ECFDF5' } },
];

/** Grid snap size in px */
export const GRID_SIZE = 8;

/** Snap threshold for guides */
export const SNAP_THRESHOLD = 6;

export function createDefaultDesign(templateType: string): TemplateDesign {
  return {
    templateType,
    name: 'قالب جديد',
    version: 1,
    theme: {
      primaryColor: '#1B2B4B',
      secondaryColor: '#2C3E6B',
      textColor: '#1A1A2E',
      pageBackground: '#FFFFFF',
      fontFamily: 'Cairo',
      titleFont: 'Amiri',
      watermark: { enabled: false, opacity: 0.06 },
    },
    page: {
      size: 'A4',
      orientation: 'portrait',
      margins: { top: 20, right: 25, bottom: 20, left: 25 },
      direction: 'rtl',
    },
    zones: {
      header: { height: 120, background: '#1B2B4B' },
      footer: { height: 40, background: '#1B2B4B' },
    },
    elements: [
      { id: 'title-1', type: 'text', zone: 'header', content: 'عرض سعر', x: 20, y: 20, w: 300, h: 50, style: { fontFamily: 'Amiri', fontSize: 32, fontWeight: 700, color: '#FFFFFF', textAlign: 'right' } },
      { id: 'company-1', type: 'dynamic', zone: 'header', content: '', variable: '{{company_name}}', x: 20, y: 75, w: 250, h: 25, style: { fontSize: 15, fontWeight: 600, color: '#FFFFFF', textAlign: 'right' } },
      { id: 'logo-1', type: 'image', zone: 'header', content: '', imageSrc: '{{company_logo}}', x: 445, y: 15, w: 80, h: 80, style: { width: '80px', height: 80 } },
      { id: 'sep-1', type: 'divider', zone: 'body', content: '', x: 0, y: 0, w: 545, h: 4, style: { borderColor: '#1B2B4B', borderWidth: 2 } },
      { id: 'info-1', type: 'dynamic', zone: 'body', content: '', variable: '{{doc_number}}', x: 350, y: 12, w: 195, h: 20, style: { fontSize: 11, color: '#6B7280', textAlign: 'left' } },
      { id: 'info-2', type: 'dynamic', zone: 'body', content: '', variable: '{{doc_date}}', x: 350, y: 34, w: 195, h: 20, style: { fontSize: 11, color: '#6B7280', textAlign: 'left' } },
      { id: 'client-1', type: 'dynamic', zone: 'body', content: '', variable: '{{client_name}}', x: 0, y: 12, w: 300, h: 24, style: { fontSize: 16, fontWeight: 700, color: '#1B2B4B', textAlign: 'right' } },
      { id: 'body-text', type: 'text', zone: 'body', content: 'يسرنا أن نضع بين أيديكم عرض سعر لتنفيذ الأعمال المطلوبة:', x: 0, y: 60, w: 545, h: 24, style: { fontSize: 13, lineHeight: 2 } },
      { id: 'table-1', type: 'table', zone: 'body', content: '', tableColumns: ['#', 'البند', 'الكمية', 'سعر الوحدة', 'الإجمالي'], x: 0, y: 92, w: 545, h: 80, style: { fontSize: 11 } },
      { id: 'totals-1', type: 'totals', zone: 'body', content: '', x: 0, y: 180, w: 545, h: 30, style: { fontSize: 12, fontWeight: 700 } },
      { id: 'sig-1', type: 'signature', zone: 'body', content: 'ختم الشركة وتوقيع المدير', x: 170, y: 260, w: 200, h: 40, style: { fontSize: 10, color: '#6B7280' } },
      { id: 'footer-name', type: 'dynamic', zone: 'footer', content: '', variable: '{{company_name}}', x: 0, y: 8, w: 300, h: 20, style: { fontSize: 9, color: '#FFFFFF', textAlign: 'right' } },
    ],
  };
}
