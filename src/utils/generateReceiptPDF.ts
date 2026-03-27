import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ReceiptPDFData {
  receipt_number: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  check_number?: string;
  check_date?: string;
  bank_name?: string;
  cash_box_name?: string;
  bank_account_name?: string;
  notes?: string;
  contact_name: string;
  contact_phone?: string;
  linked_invoices?: Array<{
    invoice_number: string;
    invoice_date: string;
    total_amount: number;
    allocated_amount: number;
    remaining_after: number;
  }>;
}

export interface CompanyPDFData {
  company_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  tax_number?: string;
  logo_url?: string;
}

const navy: [number, number, number] = [27, 58, 92];
const gold: [number, number, number] = [201, 168, 76];
const lightGray: [number, number, number] = [248, 249, 250];
const darkText: [number, number, number] = [30, 30, 30];

const getPaymentLabel = (method: string): string => {
  const labels: Record<string, string> = {
    'نقدي': 'نقدي / Cash',
    'شيك': 'شيك / Cheque',
    'تحويل': 'تحويل بنكي / Bank Transfer',
    'بطاقة': 'بطاقة / Card',
  };
  return labels[method] || method;
};

const numberToArabicWords = (n: number): string => {
  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة'];
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];

  if (n < 11) return ones[Math.floor(n)] || String(Math.floor(n));
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = Math.floor(n % 10);
    return o > 0 ? `${ones[o]} و${tens[t]}` : tens[t];
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    const prefix = h === 1 ? 'مائة' : h === 2 ? 'مئتان' : `${ones[h]} مائة`;
    return rest > 0 ? `${prefix} و${numberToArabicWords(rest)}` : prefix;
  }
  if (n < 1000000) {
    const t = Math.floor(n / 1000);
    const rest = n % 1000;
    let prefix: string;
    if (t === 1) prefix = 'ألف';
    else if (t === 2) prefix = 'ألفان';
    else if (t <= 10) prefix = `${ones[t]} آلاف`;
    else prefix = `${numberToArabicWords(t)} ألف`;
    return rest > 0 ? `${prefix} و${numberToArabicWords(rest)}` : prefix;
  }
  return n.toLocaleString('ar');
};

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const generateReceiptPDF = (receipt: ReceiptPDFData, company: CompanyPDFData): jsPDF => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.width;
  const H = doc.internal.pageSize.height;

  // ── Header ──
  doc.setFillColor(...navy);
  doc.rect(0, 0, W, 42, 'F');
  doc.setFillColor(...gold);
  doc.rect(0, 42, W, 2, 'F');

  // Company name center
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(company.company_name || 'AMWALI أموالي', W / 2, 15, { align: 'center' });

  // Company info
  doc.setTextColor(200, 210, 220);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  const companyInfo = [company.phone, company.email, company.address].filter(Boolean).join('  |  ');
  if (companyInfo) doc.text(companyInfo, W / 2, 22, { align: 'center' });
  if (company.tax_number) doc.text(`Tax No: ${company.tax_number}`, W / 2, 27, { align: 'center' });

  // Title right
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('RECEIPT VOUCHER', W - 15, 14, { align: 'right' });

  doc.setFontSize(9);
  doc.setTextColor(...gold);
  doc.text(receipt.receipt_number, W - 15, 21, { align: 'right' });

  // Title left
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('سند قبض', 15, 14);

  doc.setFontSize(9);
  doc.setTextColor(...gold);
  doc.text(receipt.payment_date, 15, 21);

  // ── Main Info Section ──
  const infoY = 50;
  doc.setFillColor(...lightGray);
  doc.roundedRect(10, infoY, W - 20, 34, 2, 2, 'F');

  const drawField = (label: string, value: string, x: number, y: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...navy);
    doc.setFontSize(8);
    doc.text(label, x, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkText);
    doc.text(value || '—', x - 2, y + 5, { align: 'right' });
  };

  // Row 1
  drawField('رقم السند:', receipt.receipt_number, W - 15, infoY + 8);
  drawField('التاريخ:', receipt.payment_date, W - 70, infoY + 8);
  drawField('طريقة الدفع:', getPaymentLabel(receipt.payment_method), W / 2 - 20, infoY + 8);

  // Row 2
  drawField('استُلم من:', receipt.contact_name, W - 15, infoY + 22);
  const depositName = receipt.cash_box_name || receipt.bank_account_name || '—';
  drawField('إيداع في:', depositName, W - 70, infoY + 22);
  if (receipt.contact_phone) {
    drawField('الهاتف:', receipt.contact_phone, W / 2 - 20, infoY + 22);
  }

  // Cheque info
  let currentY = infoY + 38;
  if (receipt.payment_method === 'شيك' && receipt.check_number) {
    doc.setFillColor(240, 248, 255);
    doc.roundedRect(10, currentY, W - 20, 14, 2, 2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...navy);
    doc.setFontSize(8);

    doc.text('رقم الشيك:', W - 15, currentY + 9, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkText);
    doc.text(receipt.check_number, W - 42, currentY + 9, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...navy);
    doc.text('تاريخ الشيك:', W - 80, currentY + 9, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkText);
    doc.text(receipt.check_date || '—', W - 110, currentY + 9, { align: 'right' });

    if (receipt.bank_name) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...navy);
      doc.text('البنك:', W / 2 - 25, currentY + 9, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...darkText);
      doc.text(receipt.bank_name, W / 2 - 40, currentY + 9, { align: 'right' });
    }

    currentY += 18;
  } else {
    currentY += 4;
  }

  // ── Amount Card ──
  doc.setFillColor(...navy);
  doc.roundedRect(10, currentY, W - 20, 26, 3, 3, 'F');
  doc.setFillColor(...gold);
  doc.roundedRect(12, currentY + 2, W - 24, 22, 2, 2, 'F');

  doc.setTextColor(...navy);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('المبلغ المستلم  |  AMOUNT RECEIVED', W / 2, currentY + 9, { align: 'center' });

  doc.setFontSize(18);
  doc.text(`ILS ${fmt(receipt.amount)}`, W / 2, currentY + 19, { align: 'center' });

  currentY += 30;

  // Amount in words
  doc.setFillColor(240, 245, 250);
  doc.rect(10, currentY, W - 20, 9, 'F');
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(80, 80, 80);
  const amountWords = numberToArabicWords(receipt.amount);
  doc.text(`فقط: ${amountWords} شيكل لا غير`, W - 15, currentY + 6, { align: 'right' });

  currentY += 13;

  // ── Linked Invoices Table ──
  if (receipt.linked_invoices?.length) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...navy);
    doc.text('الفواتير المسددة  |  Settled Invoices', W - 15, currentY, { align: 'right' });
    currentY += 4;

    const invoiceRows = receipt.linked_invoices.map(inv => [
      inv.invoice_number,
      inv.invoice_date,
      `ILS ${fmt(inv.total_amount)}`,
      `ILS ${fmt(inv.allocated_amount)}`,
      `ILS ${fmt(inv.remaining_after)}`,
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['رقم الفاتورة', 'التاريخ', 'إجمالي الفاتورة', 'المبلغ المخصص', 'الباقي']],
      body: invoiceRows,
      theme: 'grid',
      headStyles: {
        fillColor: navy,
        textColor: [255, 255, 255],
        fontSize: 8.5,
        fontStyle: 'bold',
        halign: 'center',
        cellPadding: 3,
      },
      bodyStyles: {
        fontSize: 8.5,
        halign: 'center',
        cellPadding: 3,
      },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 30 },
        2: { cellWidth: 38 },
        3: { cellWidth: 38, textColor: [34, 139, 34], fontStyle: 'bold' },
        4: { cellWidth: 38 },
      },
      alternateRowStyles: { fillColor: [248, 249, 252] },
      foot: [[
        'الإجمالي', '',
        `ILS ${fmt(receipt.linked_invoices.reduce((s, i) => s + i.total_amount, 0))}`,
        `ILS ${fmt(receipt.amount)}`,
        ''
      ]],
      footStyles: {
        fillColor: navy,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
      margin: { left: 10, right: 10 },
    });

    currentY = (doc as any).lastAutoTable?.finalY || currentY + 30;
  }

  // ── Notes ──
  if (receipt.notes) {
    currentY += 5;
    doc.setFillColor(...lightGray);
    doc.rect(10, currentY, W - 20, 14, 'F');
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...navy);
    doc.text('ملاحظات:', W - 15, currentY + 6, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkText);
    doc.text(receipt.notes, W - 40, currentY + 6, { align: 'right' });
    doc.text(receipt.notes, W - 40, currentY + 11, { align: 'right', maxWidth: W - 55 });
    currentY += 18;
  }

  // ── Signatures ──
  const sigY = Math.max(currentY + 15, H - 55);
  doc.setDrawColor(...navy);
  doc.setLineWidth(0.3);

  // Receiver
  doc.line(15, sigY + 15, 75, sigY + 15);
  doc.setFontSize(8);
  doc.setTextColor(...navy);
  doc.setFont('helvetica', 'bold');
  doc.text('توقيع المستلم', 45, sigY + 21, { align: 'center' });

  // Company stamp
  doc.line(85, sigY + 15, 125, sigY + 15);
  doc.text('ختم الشركة', 105, sigY + 21, { align: 'center' });

  // Accountant
  doc.line(135, sigY + 15, 200, sigY + 15);
  doc.text('توقيع المحاسب', 167, sigY + 21, { align: 'center' });

  // ── Footer ──
  doc.setFillColor(...navy);
  doc.rect(0, H - 12, W, 12, 'F');
  doc.setFillColor(...gold);
  doc.rect(0, H - 14, W, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(company.company_name || 'AMWALI أموالي', 15, H - 5);

  doc.text(`Printed: ${new Date().toLocaleDateString('en-GB')}`, W / 2, H - 5, { align: 'center' });

  doc.setTextColor(...gold);
  doc.text('Confidential', W - 15, H - 5, { align: 'right' });

  return doc;
};
