import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AmiriRegular, AmiriBold } from './amiri-font';

// ─── Types ───
export interface StatementPDFRow {
  date: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  isLineItem?: boolean;
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

// ─── Colors ───
const navy: [number, number, number] = [27, 58, 92];
const gold: [number, number, number] = [201, 168, 76];
const lightGray: [number, number, number] = [248, 249, 250];
const darkText: [number, number, number] = [30, 30, 30];
const greenText: [number, number, number] = [34, 139, 34];
const redText: [number, number, number] = [220, 38, 38];

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

// ─── Reverse Arabic text for RTL rendering in jsPDF ───
const isArabic = (text: string) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);

const rtl = (text: string): string => {
  if (!isArabic(text)) return text;
  // Split mixed text: keep numbers/symbols LTR, reverse Arabic segments
  const segments = text.split(/(\d[\d,.]*\d|\d|[A-Za-z]+[\w.-]*|[₪$€£]|د\.أ|[\(\)\[\]{}|:—\-–/]|\s+)/g);
  return segments.filter(Boolean).reverse().join('');
};

// ─── Main Generator ───
export const generateStatementPDF = (
  data: StatementPDFData,
  company: StatementCompanyData
): jsPDF => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.width;
  const H = doc.internal.pageSize.height;
  const sym = getCurrencySymbol(data.currency);

  registerArabicFont(doc);

  // ══════ HEADER ══════
  doc.setFillColor(...navy);
  doc.rect(0, 0, W, 38, 'F');
  doc.setFillColor(...gold);
  doc.rect(0, 38, W, 1.5, 'F');

  // Company name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('Amiri', 'bold');
  doc.text(rtl(company.name || 'QOYOD'), W / 2, 13, { align: 'center' });

  // Company info
  doc.setTextColor(200, 210, 220);
  doc.setFontSize(7);
  doc.setFont('Amiri', 'normal');
  const info = [company.phone, company.email, company.address].filter(Boolean).join('  |  ');
  if (info) doc.text(rtl(info), W / 2, 19, { align: 'center' });
  if (company.tax_number) doc.text(`Tax No: ${company.tax_number}`, W / 2, 24, { align: 'center' });

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('Amiri', 'bold');
  doc.text('ACCOUNT STATEMENT', W - 15, 13, { align: 'right' });
  doc.text(rtl('كشف حساب'), 15, 13);

  doc.setFontSize(8);
  doc.setTextColor(...gold);
  doc.text(data.statementNumber, W - 15, 19, { align: 'right' });
  doc.text(`${fmtDate(data.dateFrom)} — ${fmtDate(data.dateTo)}`, 15, 19);

  // ══════ ENTITY INFO BAR ══════
  let currentY = 43;
  doc.setFillColor(...lightGray);
  doc.roundedRect(10, currentY, W - 20, 18, 2, 2, 'F');

  const drawField = (label: string, value: string, x: number, y: number) => {
    doc.setFont('Amiri', 'bold');
    doc.setTextColor(...navy);
    doc.setFontSize(7.5);
    doc.text(rtl(label), x, y, { align: 'right' });
    doc.setFont('Amiri', 'normal');
    doc.setTextColor(...darkText);
    doc.text(rtl(value || '—'), x - 2, y + 4.5, { align: 'right' });
  };

  drawField('اسم الجهة:', data.entityName, W - 15, currentY + 6);
  drawField('النوع:', data.entityType, W - 80, currentY + 6);
  if (data.entityPhone) {
    drawField('الهاتف:', data.entityPhone, W / 2 - 20, currentY + 6);
  }
  if (data.entityCode) {
    drawField('كود الحساب:', data.entityCode, 60, currentY + 6);
  }

  currentY += 22;

  // ══════ SUMMARY CARDS ══════
  const cardW = (W - 30) / 4;
  const cards = [
    { label: 'رصيد افتتاحي', value: data.openingBalance, color: navy },
    { label: 'إجمالي مدين', value: data.totalDebit, color: redText },
    { label: 'إجمالي دائن', value: data.totalCredit, color: greenText },
    { label: 'الرصيد المستحق', value: data.closingBalance, color: navy },
  ];

  cards.forEach((card, i) => {
    const x = 10 + i * (cardW + 3.3);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(x, currentY, cardW, 16, 1.5, 1.5, 'F');
    doc.setDrawColor(220, 225, 230);
    doc.roundedRect(x, currentY, cardW, 16, 1.5, 1.5, 'S');

    doc.setFontSize(6.5);
    doc.setFont('Amiri', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(rtl(card.label), x + cardW / 2, currentY + 5.5, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('Amiri', 'bold');
    doc.setTextColor(...card.color);
    doc.text(`${sym}${fmt(Math.abs(card.value))}`, x + cardW / 2, currentY + 12.5, { align: 'center' });
  });

  currentY += 20;

  // ══════ TRANSACTIONS TABLE ══════
  const tableHead = [[
    rtl('الرصيد'), rtl('دائن'), rtl('مدين'),
    rtl('البيان'), rtl('المرجع'), rtl('التاريخ')
  ]];

  const openRow = [
    `${sym}${fmt(data.openingBalance)}`,
    '', '',
    rtl('رصيد أول المدة'),
    '—',
    fmtDate(data.dateFrom),
  ];

  const bodyRows = data.rows.map(r => [
    r.isLineItem ? '' : `${sym}${fmt(r.balance)}`,
    r.credit > 0 ? `${sym}${fmt(r.credit)}` : '',
    r.debit > 0 ? `${sym}${fmt(r.debit)}` : '',
    rtl(r.description),
    r.reference || '—',
    fmtDate(r.date),
  ]);

  const closeRow = [
    `${sym}${fmt(data.closingBalance)}`,
    `${sym}${fmt(data.totalCredit)}`,
    `${sym}${fmt(data.totalDebit)}`,
    rtl('الرصيد الختامي'),
    '', '—',
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
      cellPadding: 2,
      halign: 'center',
      lineColor: [220, 225, 230],
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
      fillColor: [250, 251, 253],
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
      if (rowIdx === 0 && hookData.section === 'body') {
        hookData.cell.styles.fillColor = [240, 248, 255];
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.textColor = navy;
      }
      if (rowIdx === lastIdx && hookData.section === 'body') {
        hookData.cell.styles.fillColor = navy;
        hookData.cell.styles.textColor = [255, 255, 255];
        hookData.cell.styles.fontStyle = 'bold';
      }
      if (hookData.section === 'body' && rowIdx > 0 && rowIdx < lastIdx) {
        const dataRowIdx = rowIdx - 1;
        if (data.rows[dataRowIdx]?.isLineItem) {
          hookData.cell.styles.fontSize = 6.5;
          hookData.cell.styles.textColor = [100, 100, 100];
          hookData.cell.styles.fillColor = [253, 253, 255];
        }
      }
    },
    margin: { left: 10, right: 10 },
  });

  currentY = (doc as any).lastAutoTable?.finalY || currentY + 30;

  // ══════ AGING ANALYSIS ══════
  if (data.agingData && currentY + 30 < H - 40) {
    currentY += 6;
    doc.setFontSize(9);
    doc.setFont('Amiri', 'bold');
    doc.setTextColor(...navy);
    doc.text(rtl('تحليل التقادم') + '  |  Aging Analysis', W - 15, currentY, { align: 'right' });
    currentY += 3;

    autoTable(doc, {
      startY: currentY,
      head: [[
        rtl('الإجمالي'), rtl('+60 يوم'), rtl('31-60 يوم'),
        rtl('1-30 يوم'), rtl('جاري')
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

  // ══════ BALANCE SUMMARY BAR ══════
  currentY += 5;
  if (currentY + 16 < H - 30) {
    doc.setFillColor(...navy);
    doc.roundedRect(10, currentY, W - 20, 14, 2, 2, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('Amiri', 'bold');

    const balLabel = data.closingBalance >= 0
      ? rtl('رصيد مدين (عليه)')
      : rtl('رصيد دائن (له)');
    doc.text(`${balLabel}: ${sym}${fmt(Math.abs(data.closingBalance))}`, W / 2, currentY + 9, { align: 'center' });
  }

  // ══════ FOOTER ══════
  doc.setFillColor(...navy);
  doc.rect(0, H - 12, W, 12, 'F');
  doc.setFillColor(...gold);
  doc.rect(0, H - 14, W, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont('Amiri', 'normal');
  doc.text(rtl(company.name || 'QOYOD'), 15, H - 5);
  doc.text(`Printed: ${new Date().toLocaleDateString('en-GB')}`, W / 2, H - 5, { align: 'center' });

  doc.setTextColor(...gold);
  doc.text('Confidential', W - 15, H - 5, { align: 'right' });

  return doc;
};
