import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AmiriRegular, AmiriBold } from './amiri-font';
import { ar } from './arabic-pdf-utils';

// ─── Types ───
export interface StatementPDFRow {
  date: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  isLineItem?: boolean;
  dueDate?: string;
  transaction_type?: string;
}

export interface StatementPDFData {
  entityName: string;
  entityType: string;
  entityPhone?: string;
  entityCode?: string;
  dateFrom: string;
  dateTo: string;
  statementNumber: string;
  currency: string;
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  rows: StatementPDFRow[];
  detailsMap?: unknown;
  agingData?: {
    current: number;
    d1_30: number;
    d31_60: number;
    d60plus: number;
    total: number;
  } | null;
}

export interface StatementCompanyData {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  tax_number?: string;
  logo_url?: string;
}

/**
 * View options that mirror the on-screen "خيارات العرض" panel.
 * Lets the PDF be a faithful copy of what the user sees.
 */
export interface StatementPDFViewOptions {
  showReference?: boolean;
  showDueDate?: boolean;
  showType?: boolean;
  showCompanyLogo?: boolean;
  showContactInfo?: boolean;
  showSignature?: boolean;
  showAging?: boolean;
}

const DEFAULT_PDF_VIEW_OPTS: Required<StatementPDFViewOptions> = {
  showReference: true,
  showDueDate: true,
  showType: true,
  showCompanyLogo: true,
  showContactInfo: true,
  showSignature: true,
  showAging: true,
  monochrome: false,
};

// ─── Colors ───
let navy: [number, number, number] = [13, 27, 46];       // #0D1B2E
let navyLight: [number, number, number] = [27, 58, 92];  // #1B3A5C
const lightGray: [number, number, number] = [248, 250, 252]; // #F8FAFC
let borderColor: [number, number, number] = [226, 232, 240]; // #E2E8F0
const darkText: [number, number, number] = [30, 30, 30];
let greenText: [number, number, number] = [22, 163, 74];  // #16A34A
let redText: [number, number, number] = [220, 38, 38];    // #DC2626
let warningBg: [number, number, number] = [255, 251, 235];
let warningBorder: [number, number, number] = [234, 179, 8];

const applyMonochrome = () => {
  navy = [0, 0, 0];
  navyLight = [60, 60, 60];
  borderColor = [180, 180, 180];
  greenText = [30, 30, 30];
  redText = [30, 30, 30];
  warningBg = [245, 245, 245];
  warningBorder = [160, 160, 160];
};

// ─── Helpers ───
const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getCurrencySymbol = (c: string): string => {
  if (c === 'دولار' || c === 'USD') return '$';
  if (c === 'دينار' || c === 'JOD') return 'د.أ';
  if (c === 'يورو' || c === 'EUR') return '€';
  if (c === 'جنيه' || c === 'EGP') return '£';
  return '₪';
};

const fmtCurrency = (n: number, currency: string) => {
  const sym = getCurrencySymbol(currency);
  return `${sym}${fmt(Math.abs(n))}`;
};

const fmtDate = (d: string) => {
  if (!d) return '—';
  const parts = d.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
};

const getPdfTypeLabel = (t: string): string => {
  if (!t) return 'حركة';
  if (t.includes('reversal') || t.includes('reverse')) return 'قيد عكسي';
  if (t.includes('pos')) return 'مبيعات POS';
  if (t.includes('sale') || t.includes('فاتورة')) return 'فاتورة مبيعات';
  if (t.includes('receipt') || t.includes('قبض')) return 'سند قبض';
  if (t.includes('payment') || t.includes('صرف')) return 'سند صرف';
  if (t.includes('purchase') || t.includes('مشتريات')) return 'فاتورة مشتريات';
  if (t.includes('journal') || t.includes('قيد') || t.includes('salary')) return 'قيد محاسبي';
  if (t.includes('cheque')) return 'شيك';
  if (t.includes('opening_balance')) return 'رصيد افتتاحي';
  return 'حركة';
};

// ─── Register Arabic font ───
const registerArabicFont = (doc: jsPDF) => {
  doc.addFileToVFS('Amiri-Regular.ttf', AmiriRegular);
  doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
  doc.addFileToVFS('Amiri-Bold.ttf', AmiriBold);
  doc.addFont('Amiri-Bold.ttf', 'Amiri', 'bold');
  doc.setFont('Amiri', 'normal');
};

// ─── Draw right-aligned Arabic label + value pair ───
const drawLabelValue = (
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  labelColor: [number, number, number] = navy,
  valueColor: [number, number, number] = darkText
) => {
  doc.setFont('Amiri', 'bold');
  doc.setTextColor(...labelColor);
  doc.setFontSize(8);
  doc.text(ar(label), x, y, { align: 'right' });
  doc.setFont('Amiri', 'normal');
  doc.setTextColor(...valueColor);
  doc.text(ar(value || '—'), x, y + 5, { align: 'right' });
};

// ─── Main Generator ───
export const generateStatementPDF = (
  data: StatementPDFData,
  company: StatementCompanyData,
  viewOpts: StatementPDFViewOptions = {}
): jsPDF => {
  const opts = { ...DEFAULT_PDF_VIEW_OPTS, ...viewOpts };
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.width;
  const H = doc.internal.pageSize.height;
  const sym = getCurrencySymbol(data.currency);
  const margin = 12;

  registerArabicFont(doc);

  // ══════ HEADER BAR ══════
  doc.setFillColor(...navy);
  doc.rect(0, 0, W, 36, 'F');
  doc.setFillColor(...navyLight);
  doc.rect(0, 36, W, 1.5, 'F');

  // Company name (right side)
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('Amiri', 'bold');
  doc.text(ar(company.name || 'AMWALI'), W - margin, 16, { align: 'right' });

  // Company details under name
  doc.setTextColor(200, 210, 220);
  doc.setFontSize(7);
  doc.setFont('Amiri', 'normal');
  if (opts.showContactInfo) {
    const info = [company.phone, company.email, company.address].filter(Boolean).join('  |  ');
    if (info) doc.text(info, W - margin, 23, { align: 'right' });
    if (company.tax_number) doc.text(`Tax No: ${company.tax_number}`, W - margin, 28, { align: 'right' });
  }

  // Title (left side)
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('Amiri', 'bold');
  doc.text(ar('كشف حساب'), margin, 16);
  doc.setFontSize(8);
  doc.setFont('Amiri', 'normal');
  doc.text('STATEMENT OF ACCOUNT', margin, 23);

  // Statement number & dates
  doc.setFontSize(8);
  doc.setTextColor(...navyLight);
  doc.text(data.statementNumber, margin, 30);

  // Center: Logo (between company details on right and title on left)
  if (opts.showCompanyLogo && company.logo_url) {
    try {
      const logoMaxH = 22;
      const logoMaxW = 40;
      const logoY = (36 - logoMaxH) / 2;
      const logoX = (W - logoMaxW) / 2;
      doc.addImage(company.logo_url, 'PNG', logoX, logoY, logoMaxW, logoMaxH, undefined, 'FAST');
    } catch (e) {
      // ignore logo errors
    }
  }

  // ══════ DETAILS SECTION ══════
  let currentY = 42;

  // Left: Statement details
  doc.setFillColor(252, 252, 253);
  doc.roundedRect(margin, currentY, W - margin * 2, 30, 2, 2, 'F');
  doc.setDrawColor(230, 230, 235);
  doc.roundedRect(margin, currentY, W - margin * 2, 30, 2, 2, 'S');

  // Right column: Entity info
  doc.setFontSize(7.5);
  doc.setFont('Amiri', 'bold');
  doc.setTextColor(...navy);
  doc.text(ar('صادر إلى'), W - margin - 5, currentY + 7, { align: 'right' });
  
  doc.setFontSize(12);
  doc.setFont('Amiri', 'bold');
  doc.setTextColor(...darkText);
  doc.text(ar(data.entityName), W - margin - 5, currentY + 14, { align: 'right' });

  // Entity type badge
  doc.setFillColor(240, 245, 255);
  doc.setDrawColor(...navy);
  const typeText = ar(data.entityType);
  const typeWidth = doc.getTextWidth(typeText) + 6;
  doc.roundedRect(W - margin - 5 - typeWidth, currentY + 17, typeWidth, 6, 1, 1, 'FD');
  doc.setFontSize(7);
  doc.setTextColor(...navy);
  doc.text(typeText, W - margin - 5 - typeWidth / 2, currentY + 21, { align: 'center' });

  // Left column: Statement metadata
  const metaX = margin + 75;
  doc.setFontSize(7.5);

  const drawMeta = (label: string, value: string, y: number) => {
    doc.setFont('Amiri', 'bold');
    doc.setTextColor(100, 100, 110);
    doc.text(ar(label), metaX, y, { align: 'right' });
    doc.setFont('Amiri', 'normal');
    doc.setTextColor(...darkText);
    doc.text(value, metaX - 30, y, { align: 'right' });
  };

  drawMeta('رقم الكشف:', data.statementNumber, currentY + 7);
  drawMeta('تاريخ الإصدار:', fmtDate(new Date().toISOString().split('T')[0]), currentY + 12);
  drawMeta('من:', fmtDate(data.dateFrom), currentY + 17);
  drawMeta('إلى:', fmtDate(data.dateTo), currentY + 22);
  
  // Currency
  const currLabel = data.currency === 'شيكل' || data.currency === 'ILS' ? `(${sym} ILS) شيكل إسرائيلي` : data.currency;
  drawMeta('العملة:', currLabel, currentY + 27);

  currentY += 35;

  // ══════ 4 SUMMARY CARDS ══════
  const cardW = (W - margin * 2 - 9) / 4;
  const cardH = 22;
  const cards = [
    { label: 'رصيد افتتاحي', value: data.openingBalance, color: navy, sub: '' },
    { label: 'إجمالي المدين', value: data.totalDebit, color: redText, sub: '' },
    { label: 'إجمالي الدائن', value: data.totalCredit, color: greenText, sub: '' },
    {
      label: 'الرصيد المستحق',
      value: data.closingBalance,
      color: navy,
      sub: data.closingBalance >= 0 ? '(مدين - عليه)' : '(دائن - له)',
    },
  ];

  cards.forEach((card, i) => {
    const x = margin + i * (cardW + 3);
    
    // Card background
    const bgColor: [number, number, number] = i === 0 ? [248, 250, 252] 
      : i === 1 ? [255, 245, 245] 
      : i === 2 ? [245, 255, 245] 
      : [248, 250, 252];
    doc.setFillColor(...bgColor);
    doc.roundedRect(x, currentY, cardW, cardH, 2, 2, 'F');
    doc.setDrawColor(220, 225, 230);
    doc.roundedRect(x, currentY, cardW, cardH, 2, 2, 'S');

    // Label
    doc.setFontSize(7);
    doc.setFont('Amiri', 'normal');
    doc.setTextColor(100, 100, 110);
    doc.text(ar(card.label), x + cardW / 2, currentY + 6, { align: 'center' });

    // Value
    doc.setFontSize(11);
    doc.setFont('Amiri', 'bold');
    doc.setTextColor(...card.color);
    doc.text(`${sym}${fmt(Math.abs(card.value))}`, x + cardW / 2, currentY + 14, { align: 'center' });

    // Sub label
    if (card.sub) {
      doc.setFontSize(6);
      doc.setFont('Amiri', 'normal');
      doc.setTextColor(120, 120, 130);
      doc.text(ar(card.sub), x + cardW / 2, currentY + 19, { align: 'center' });
    }
  });

  currentY += cardH + 5;

  // ══════ TRANSACTIONS TABLE ══════
  // Build columns dynamically based on view options.
  // Order in array = visual order in the RTL table (rightmost first when reversed).
  // We declare in left→right order to match autoTable expectations.
  const cols: { key: string; head: string; width?: number; halign?: 'left'|'right'|'center'; color?: [number,number,number]; bold?: boolean }[] = [];
  cols.push({ key: 'balance', head: ar('الرصيد'), width: 28, halign: 'center', bold: true });
  cols.push({ key: 'credit',  head: ar('دائن (له)'),  width: 26, halign: 'center', color: greenText });
  cols.push({ key: 'debit',   head: ar('مدين (عليه)'), width: 26, halign: 'center', color: redText });
  if (opts.showType)      cols.push({ key: 'type', head: ar('النوع'), width: 22, halign: 'center' });
  if (opts.showDueDate)   cols.push({ key: 'due',  head: ar('الاستحقاق'), width: 20, halign: 'center' });
  cols.push({ key: 'description', head: ar('البيان'), halign: 'right' });
  if (opts.showReference) cols.push({ key: 'reference', head: ar('المرجع'), width: 24, halign: 'center' });
  cols.push({ key: 'date', head: ar('التاريخ'), width: 22, halign: 'center' });

  const cellFor = (key: string, ctx: 'open'|'body'|'close', r?: StatementPDFRow): string => {
    if (ctx === 'open') {
      switch (key) {
        case 'balance':     return `${sym}${fmt(data.openingBalance)}`;
        case 'credit':      return data.openingBalance < 0 ? `${sym}${fmt(data.openingBalance)}` : '—';
        case 'debit':       return data.openingBalance > 0 ? `${sym}${fmt(data.openingBalance)}` : '—';
        case 'description': return ar('رصيد أول المدة');
        case 'date':        return fmtDate(data.dateFrom);
        default:            return '—';
      }
    }
    if (ctx === 'close') {
      switch (key) {
        case 'balance':     return `${sym}${fmt(data.closingBalance)}`;
        case 'credit':      return `${sym}${fmt(data.totalCredit)}`;
        case 'debit':       return `${sym}${fmt(data.totalDebit)}`;
        case 'description': return ar('رصيد ختامي');
        default:            return '—';
      }
    }
    if (!r) return '';
    switch (key) {
      case 'balance':     return r.isLineItem ? '' : `${sym}${fmt(r.balance)}`;
      case 'credit':      return r.credit > 0 ? `${sym}${fmt(r.credit)}` : '—';
      case 'debit':       return r.debit > 0 ? `${sym}${fmt(r.debit)}` : '—';
      case 'description': return ar(r.description);
      case 'reference':   return r.reference || '—';
      case 'due':         return r.dueDate ? fmtDate(r.dueDate) : '—';
      case 'type':        return ar(getPdfTypeLabel(r.transaction_type || ''));
      case 'date':        return fmtDate(r.date);
      default:            return '';
    }
  };

  const tableHead = [cols.map(c => c.head)];
  const openRow = cols.map(c => cellFor(c.key, 'open'));
  const bodyRows = data.rows.map(r => cols.map(c => cellFor(c.key, 'body', r)));
  const closeRow = cols.map(c => cellFor(c.key, 'close'));

  const columnStyles: Record<number, any> = {};
  cols.forEach((c, i) => {
    columnStyles[i] = {
      ...(c.width ? { cellWidth: c.width } : { cellWidth: 'auto' }),
      ...(c.halign ? { halign: c.halign } : {}),
      ...(c.color ? { textColor: c.color } : {}),
      ...(c.bold ? { fontStyle: 'bold' } : {}),
    };
  });

  autoTable(doc, {
    startY: currentY,
    head: tableHead,
    body: [openRow, ...bodyRows, closeRow],
    theme: 'grid',
    tableWidth: 'auto',
    styles: {
      font: 'Amiri',
      fontSize: 7.5,
      cellPadding: 2.5,
      halign: 'center',
      lineColor: borderColor,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: navy,
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
      halign: 'center',
      cellPadding: 3,
    },
    bodyStyles: {
      textColor: darkText,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles,
    didParseCell: (hookData) => {
      const rowIdx = hookData.row.index;
      const lastIdx = data.rows.length + 1;
      // Opening balance row
      if (rowIdx === 0 && hookData.section === 'body') {
        hookData.cell.styles.fillColor = [240, 248, 255];
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.textColor = navy;
      }
      // Closing balance row
      if (rowIdx === lastIdx && hookData.section === 'body') {
        hookData.cell.styles.fillColor = navyLight;
        hookData.cell.styles.textColor = [255, 255, 255];
        hookData.cell.styles.fontStyle = 'bold';
      }
      // Line item sub-rows
      if (hookData.section === 'body' && rowIdx > 0 && rowIdx < lastIdx) {
        const dataRowIdx = rowIdx - 1;
        if (data.rows[dataRowIdx]?.isLineItem) {
          hookData.cell.styles.fontSize = 6.5;
          hookData.cell.styles.textColor = [100, 100, 100];
          hookData.cell.styles.fillColor = [253, 253, 255];
        }
      }
    },
    margin: { left: margin, right: margin },
  });

  currentY = (doc as any).lastAutoTable?.finalY || currentY + 30;

  // ══════ AGING ANALYSIS ══════
  if (opts.showAging && data.agingData && currentY + 30 < H - 80) {
    currentY += 6;
    doc.setFontSize(9);
    doc.setFont('Amiri', 'bold');
    doc.setTextColor(...navy);
    doc.text(ar('تحليل التقادم') + '  |  Aging Analysis', W - margin, currentY, { align: 'right' });
    currentY += 4;

    autoTable(doc, {
      startY: currentY,
      head: [[
        ar('الإجمالي'), ar('+60 يوم'), ar('31-60 يوم'),
        ar('1-30 يوم'), ar('جاري')
      ]],
      body: [[
        fmtCurrency(data.agingData.total, data.currency),
        fmtCurrency(data.agingData.d60plus, data.currency),
        fmtCurrency(data.agingData.d31_60, data.currency),
        fmtCurrency(data.agingData.d1_30, data.currency),
        fmtCurrency(data.agingData.current, data.currency),
      ]],
      theme: 'grid',
      styles: { font: 'Amiri' },
      headStyles: {
        fillColor: navy,
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold',
        halign: 'center',
        cellPadding: 3,
      },
      bodyStyles: {
        fontSize: 8,
        halign: 'center',
        fontStyle: 'bold',
        cellPadding: 3,
      },
      columnStyles: {
        0: { textColor: navy },
        1: { textColor: [220, 38, 38] },
        2: { textColor: [234, 88, 12] },
        3: { textColor: [202, 138, 4] },
        4: { textColor: greenText },
      },
      margin: { left: 30, right: 30 },
    });

    currentY = (doc as any).lastAutoTable?.finalY || currentY + 20;
  }

  // ══════ BALANCE WARNING BANNER ══════
  if (data.closingBalance !== 0) {
    currentY += 6;
    if (currentY + 16 < H - 70) {
      doc.setFillColor(...warningBg);
      doc.setDrawColor(...warningBorder);
      doc.roundedRect(margin, currentY, W - margin * 2, 14, 2, 2, 'FD');

      doc.setTextColor(...redText);
      doc.setFontSize(8);
      doc.setFont('Amiri', 'bold');
      const balType = data.closingBalance >= 0 ? ar('مدين (عليه)') : ar('دائن (له)');
      doc.text(
        `${sym}${fmt(Math.abs(data.closingBalance))} ${balType} :${ar('يوجد رصيد مستحق بقيمة')}`,
        W / 2, currentY + 6, { align: 'center' }
      );
      doc.setFontSize(6.5);
      doc.setFont('Amiri', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(ar('يرجى التواصل لترتيب السداد'), W / 2, currentY + 11, { align: 'center' });
      currentY += 18;
    }
  }

  // ══════ SIGNATURES SECTION ══════
  const sigY = Math.max(currentY + 10, H - 60);
  if (opts.showSignature && sigY + 30 < H - 20) {
    // Title
    doc.setFontSize(9);
    doc.setFont('Amiri', 'bold');
    doc.setTextColor(...navy);
    doc.text(ar('للمطابقة والاستفسار:'), W - margin, sigY, { align: 'right' });

    // Signature boxes
    doc.setDrawColor(200, 200, 210);
    doc.setLineWidth(0.3);

    // Client signature (right)
    const sig1X = W - margin - 55;
    doc.roundedRect(sig1X, sigY + 5, 50, 18, 1, 1, 'S');
    doc.setFontSize(7);
    doc.setFont('Amiri', 'normal');
    doc.setTextColor(100, 100, 110);
    doc.text(ar('اعتماد العميل'), sig1X + 25, sigY + 27, { align: 'center' });

    // Company stamp (left)
    const sig2X = margin + 10;
    doc.roundedRect(sig2X, sigY + 5, 55, 18, 1, 1, 'S');
    doc.text(ar('ختم الشركة وتوقيع المحاسب'), sig2X + 27.5, sigY + 27, { align: 'center' });

    // Note
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(ar('يرجى الإشارة إلى رقم الكشف عند التواصل'), W - margin, sigY + 32, { align: 'right' });
  }

  // ══════ FOOTER ══════
  doc.setFillColor(...navy);
  doc.rect(0, H - 12, W, 12, 'F');
  doc.setFillColor(...navyLight);
  doc.rect(0, H - 14, W, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont('Amiri', 'normal');

  // Right: print date
  doc.text(`${fmtDate(new Date().toISOString().split('T')[0])} :${ar('طُبع بتاريخ')}`, W - margin, H - 5, { align: 'right' });

  // Center: company name
  doc.setTextColor(255, 255, 255);
  doc.setFont('Amiri', 'bold');
  doc.text(ar(company.name || 'AMWALI'), W / 2, H - 5, { align: 'center' });

  // Left: page number
  doc.setTextColor(255, 255, 255);
  doc.setFont('Amiri', 'normal');
  doc.text('1 ' + ar('من') + ' 1 ' + ar('صفحة'), margin, H - 5);

  return doc;
};
