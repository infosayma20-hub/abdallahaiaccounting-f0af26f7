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
  showLogo?: boolean;
  showCompanyContact?: boolean;
  showSignatures?: boolean;
  showAging?: boolean;
}

const DEFAULT_PDF_VIEW_OPTS: Required<StatementPDFViewOptions> = {
  showReference: true,
  showDueDate: true,
  showType: true,
  showLogo: true,
  showCompanyContact: true,
  showSignatures: true,
  showAging: true,
};

// ─── Colors ───
const navy: [number, number, number] = [13, 27, 46];       // #0D1B2E
const navyLight: [number, number, number] = [27, 58, 92];  // #1B3A5C
const lightGray: [number, number, number] = [248, 250, 252]; // #F8FAFC
const borderColor: [number, number, number] = [226, 232, 240]; // #E2E8F0
const darkText: [number, number, number] = [30, 30, 30];
const greenText: [number, number, number] = [22, 163, 74];  // #16A34A
const redText: [number, number, number] = [220, 38, 38];    // #DC2626
const warningBg: [number, number, number] = [255, 251, 235];
const warningBorder: [number, number, number] = [234, 179, 8];

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
  const info = [company.phone, company.email, company.address].filter(Boolean).join('  |  ');
  if (info) doc.text(info, W - margin, 23, { align: 'right' });
  if (company.tax_number) doc.text(`Tax No: ${company.tax_number}`, W - margin, 28, { align: 'right' });

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
  const tableHead = [[
    ar('الرصيد'), ar('دائن (له)'), ar('مدين (عليه)'),
    ar('البيان'), ar('المرجع'), ar('التاريخ')
  ]];

  const openRow = [
    `${sym}${fmt(data.openingBalance)}`,
    '—', '—',
    ar('رصيد أول المدة'),
    '—',
    fmtDate(data.dateFrom),
  ];

  const bodyRows = data.rows.map(r => [
    r.isLineItem ? '' : `${sym}${fmt(r.balance)}`,
    r.credit > 0 ? `${sym}${fmt(r.credit)}` : '—',
    r.debit > 0 ? `${sym}${fmt(r.debit)}` : '—',
    ar(r.description),
    r.reference || '—',
    fmtDate(r.date),
  ]);

  const closeRow = [
    `${sym}${fmt(data.closingBalance)}`,
    `${sym}${fmt(data.totalCredit)}`,
    `${sym}${fmt(data.totalDebit)}`,
    ar('رصيد ختامي'),
    '—', '—',
  ];

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
    columnStyles: {
      0: { cellWidth: 30, fontStyle: 'bold' },
      1: { cellWidth: 28, textColor: greenText },
      2: { cellWidth: 28, textColor: redText },
      3: { cellWidth: 'auto', halign: 'right' },
      4: { cellWidth: 25 },
      5: { cellWidth: 24 },
    },
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
  if (data.agingData && currentY + 30 < H - 80) {
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
  if (sigY + 30 < H - 20) {
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
