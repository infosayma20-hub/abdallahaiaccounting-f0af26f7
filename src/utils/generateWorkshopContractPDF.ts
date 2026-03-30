import jsPDF from 'jspdf';
import { AmiriRegular, AmiriBold } from './amiri-font';
import { ar } from './arabic-pdf-utils';

// ─── Colors ───
const navy: [number, number, number] = [13, 27, 46];       // #0D1B2E
const darkText: [number, number, number] = [30, 41, 59];    // #1E293B
const bodyText: [number, number, number] = [55, 65, 81];    // #374151
const borderColor: [number, number, number] = [226, 232, 240]; // #E2E8F0
const lightBorder: [number, number, number] = [241, 245, 249]; // #F1F5F9
const bgZebra: [number, number, number] = [248, 250, 252];  // #F8FAFC
const mutedText: [number, number, number] = [148, 163, 184]; // #94A3B8
const labelText: [number, number, number] = [100, 116, 139]; // #64748B
const white: [number, number, number] = [255, 255, 255];

// ─── Types ───
export interface ContractPayment {
  description: string;
  amount: number;
  date?: string;
}

export interface ContractData {
  workshopName: string;
  workshopType: string;
  customerName: string;
  customerPhone: string;
  address: string;
  description: string;
  areaSqm: number;
  budget: number;
  startDate: string;
  endDate?: string;
  notes: string;
  payments?: ContractPayment[];
}

export interface ContractCompanyData {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  logo_url?: string;
  tax_number?: string;
  representative?: string;
}

// ─── Helpers ───
const registerFont = (doc: jsPDF) => {
  doc.addFileToVFS('Amiri-Regular.ttf', AmiriRegular);
  doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
  doc.addFileToVFS('Amiri-Bold.ttf', AmiriBold);
  doc.addFont('Amiri-Bold.ttf', 'Amiri', 'bold');
  doc.setFont('Amiri', 'normal');
};

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtDate = (d: string) => {
  if (!d) return '—';
  const parts = d.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
};

// ─── Section title: border-right style ───
const drawSectionTitle = (doc: jsPDF, title: string, y: number, W: number, margin: number): number => {
  // Right border accent (RTL)
  doc.setFillColor(...navy);
  doc.rect(W - margin, y - 4, 3, 10, 'F');
  doc.setFont('Amiri', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...navy);
  doc.text(ar(title), W - margin - 6, y + 3, { align: 'right' });
  return y + 14;
};

// ─── Draw paragraph (RTL) ───
const drawParagraph = (doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight: number = 6): number => {
  doc.setFont('Amiri', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...bodyText);
  const lines = doc.splitTextToSize(ar(text), maxWidth);
  lines.forEach((line: string, i: number) => {
    doc.text(line, x, y + i * lineHeight, { align: 'right' });
  });
  return y + lines.length * lineHeight;
};

// ─── Draw bullet point ───
const drawBullet = (doc: jsPDF, text: string, x: number, y: number, maxWidth: number): number => {
  doc.setFont('Amiri', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...navy);
  doc.text('●', x, y, { align: 'right' });
  doc.setTextColor(...bodyText);
  const lines = doc.splitTextToSize(ar(text), maxWidth - 8);
  lines.forEach((line: string, i: number) => {
    doc.text(line, x - 6, y + i * 5.5, { align: 'right' });
  });
  return y + lines.length * 5.5 + 2;
};

// ─── Check page break ───
const checkPage = (doc: jsPDF, y: number, needed: number, H: number, margin: number): number => {
  if (y + needed > H - 30) {
    doc.addPage();
    return margin + 10;
  }
  return y;
};

// ─── Side stripe ───
const drawSideStripe = (doc: jsPDF, W: number, H: number) => {
  doc.setFillColor(...navy);
  doc.rect(W - 4, 0, 4, H, 'F');
};

// ─── Draw info row inside a box ───
const drawInfoRow = (doc: jsPDF, label: string, value: string, x: number, y: number): number => {
  doc.setFont('Amiri', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...labelText);
  doc.text(ar(label), x, y, { align: 'right' });
  doc.setFont('Amiri', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...darkText);
  doc.text(ar(value || '—'), x - 50, y, { align: 'right' });
  return y + 8;
};

// ─── Main Generator ───
export const generateWorkshopContractPDF = async (
  data: ContractData,
  company: ContractCompanyData
): Promise<jsPDF> => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.width;
  const H = doc.internal.pageSize.height;
  const margin = 20;
  const contentRight = W - margin - 6; // account for side stripe
  const contentWidth = W - margin * 2 - 6;

  registerFont(doc);

  // ══════ HEADER — clean white ══════
  // Logo (right side)
  let logoXEnd = contentRight;
  if (company.logo_url) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve) => {
        img.onload = () => {
          doc.addImage(img, 'PNG', contentRight - 18, 14, 18, 18);
          logoXEnd = contentRight - 22;
          resolve();
        };
        img.onerror = () => resolve();
        img.src = company.logo_url!;
      });
    } catch { /* skip */ }
  }

  // Company info (right of logo)
  doc.setFont('Amiri', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...navy);
  doc.text(ar(company.name || 'الشركة'), logoXEnd, 22, { align: 'right' });

  doc.setFont('Amiri', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...labelText);
  const infoParts = [company.phone, company.email, company.address].filter(Boolean);
  if (infoParts.length) {
    doc.text(infoParts.join('  |  '), logoXEnd, 28, { align: 'right' });
  }

  // Title (left side)
  doc.setFont('Amiri', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...navy);
  doc.text(ar('عقد تنفيذ ورشة عمل'), margin, 22, { align: 'left' });

  doc.setFont('Amiri', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...labelText);
  doc.text('WORKSHOP AGREEMENT', margin, 29, { align: 'left' });

  // Contract number + date
  const contractNum = `WRK-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0')}`;
  doc.setFontSize(8);
  doc.setTextColor(...mutedText);
  doc.text(ar(`رقم العقد: ${contractNum}`), margin, 35, { align: 'left' });
  doc.text(fmtDate(data.startDate || new Date().toISOString().slice(0, 10)), margin, 40, { align: 'left' });

  // Header separator
  doc.setDrawColor(...navy);
  doc.setLineWidth(1.5);
  doc.line(margin, 44, W - margin - 6, 44);

  // ══════ BISMILLAH ══════
  let y = 56;
  doc.setFont('Amiri', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...navy);
  doc.text(ar('بسم الله الرحمن الرحيم'), W / 2, y, { align: 'center' });

  y += 10;
  doc.setFontSize(10);
  doc.setFont('Amiri', 'normal');
  doc.setTextColor(...bodyText);
  doc.text(ar(`بتاريخ: ${fmtDate(data.startDate)}`), contentRight, y, { align: 'right' });
  y += 6;
  y = drawParagraph(doc, 'تم الاتفاق بين كل من:', contentRight, y, contentWidth);
  y += 6;

  // ══════ FIRST PARTY — white card ══════
  y = drawSectionTitle(doc, 'أولاً: المنفذ / المقاول (الطرف الأول)', y, W, margin);
  y += 2;

  const cardH1 = 32;
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y - 2, contentWidth + 6, cardH1, 4, 4, 'S');

  const rx = contentRight - 4;
  let iy = y + 6;
  iy = drawInfoRow(doc, 'المؤسسة / اسم الشركة:', company.name || '—', rx, iy);
  iy = drawInfoRow(doc, 'الهاتف:', company.phone || '—', rx, iy);
  iy = drawInfoRow(doc, 'العنوان:', company.address || '—', rx, iy);

  y += cardH1 + 4;
  doc.setFontSize(8);
  doc.setTextColor(...mutedText);
  doc.text(ar('ويُشار إليه فيما بعد بـ "الطرف الأول"'), contentRight, y, { align: 'right' });
  y += 8;

  // ══════ SECOND PARTY — white card ══════
  y = drawSectionTitle(doc, 'ثانياً: صاحب العمل (الطرف الثاني)', y, W, margin);
  y += 2;

  const cardH2 = 32;
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y - 2, contentWidth + 6, cardH2, 4, 4, 'S');

  let iy2 = y + 6;
  iy2 = drawInfoRow(doc, 'اسم العميل:', data.customerName || '—', rx, iy2);
  iy2 = drawInfoRow(doc, 'الهاتف:', data.customerPhone || '—', rx, iy2);
  iy2 = drawInfoRow(doc, 'العنوان:', data.address || '—', rx, iy2);

  y += cardH2 + 4;
  doc.setFontSize(8);
  doc.setTextColor(...mutedText);
  doc.text(ar('ويُشار إليه فيما بعد بـ "الطرف الثاني"'), contentRight, y, { align: 'right' });
  y += 8;

  // ══════ SUBJECT — workshop details table ══════
  y = checkPage(doc, y, 60, H, margin);
  y = drawSectionTitle(doc, 'موضوع الاتفاقية', y, W, margin);
  y = drawParagraph(doc, 'اتفق الطرفان على تنفيذ ورشة عمل وفق التفاصيل التالية:', contentRight, y, contentWidth);
  y += 4;

  const details = [
    ['اسم الورشة', data.workshopName || '—'],
    ['نوع الورشة', data.workshopType || '—'],
    ['المساحة', data.areaSqm ? `${data.areaSqm} م²` : '—'],
    ['تاريخ البدء', fmtDate(data.startDate)],
    ['تاريخ الانتهاء المتوقع', data.endDate ? fmtDate(data.endDate) : 'يُحدد لاحقاً'],
  ];

  const tblX = margin;
  const tblW = contentWidth + 6;
  const rowH = 9;

  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.4);
  doc.roundedRect(tblX, y - 2, tblW, details.length * rowH + 4, 4, 4, 'S');

  details.forEach((item, i) => {
    const rowY = y + 4 + i * rowH;
    // Zebra
    if (i % 2 === 1) {
      doc.setFillColor(...bgZebra);
      doc.rect(tblX + 0.5, rowY - 4, tblW - 1, rowH, 'F');
    }
    doc.setFont('Amiri', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...navy);
    doc.text(ar(item[0] + ':'), contentRight - 4, rowY, { align: 'right' });
    doc.setFont('Amiri', 'normal');
    doc.setTextColor(...darkText);
    doc.text(ar(item[1]), contentRight - 55, rowY, { align: 'right' });
    if (i < details.length - 1) {
      doc.setDrawColor(...lightBorder);
      doc.setLineWidth(0.15);
      doc.line(tblX + 3, rowY + 4, tblX + tblW - 3, rowY + 4);
    }
  });

  y += details.length * rowH + 8;

  if (data.description) {
    y = checkPage(doc, y, 20, H, margin);
    doc.setFont('Amiri', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...navy);
    doc.text(ar('الوصف:'), contentRight, y, { align: 'right' });
    y += 5;
    y = drawParagraph(doc, data.description, contentRight, y, contentWidth);
    y += 4;
  }

  // ══════ FINANCIAL VALUE ══════
  y = checkPage(doc, y, 50, H, margin);
  y = drawSectionTitle(doc, 'القيمة المالية', y, W, margin);

  if (data.budget > 0) {
    // Clean budget display
    doc.setDrawColor(...navy);
    doc.setLineWidth(0.6);
    doc.roundedRect(margin + contentWidth / 4, y - 1, contentWidth / 2 + 6, 14, 3, 3, 'S');
    doc.setFont('Amiri', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...navy);
    doc.text(ar(`إجمالي قيمة المشروع: ${fmt(data.budget)} شيكل`), margin + (contentWidth + 6) / 2, y + 8, { align: 'center' });
  } else {
    doc.setFont('Amiri', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...darkText);
    doc.text(ar('إجمالي قيمة المشروع: يُحدد لاحقاً'), contentRight, y + 5, { align: 'right' });
  }
  y += 20;

  // Payment schedule
  if (data.payments && data.payments.length > 0 && data.budget > 0) {
    y = checkPage(doc, y, 15 + data.payments.length * 9, H, margin);
    doc.setFont('Amiri', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...darkText);
    doc.text(ar('جدول الدفعات:'), contentRight, y, { align: 'right' });
    y += 6;

    const ptblW = contentWidth + 6;
    const cols = [ptblW * 0.08, ptblW * 0.42, ptblW * 0.2, ptblW * 0.3];

    // Header row
    doc.setFillColor(...navy);
    doc.rect(tblX, y, ptblW, rowH, 'F');
    doc.setFont('Amiri', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...white);

    let cx = tblX + ptblW;
    ['#', 'وصف الدفعة', 'النسبة', 'المبلغ'].forEach((h, hi) => {
      cx -= cols[hi];
      doc.text(ar(h), cx + cols[hi] / 2, y + 6, { align: 'center' });
    });
    y += rowH;

    data.payments.forEach((p, pi) => {
      if (pi % 2 === 0) {
        doc.setFillColor(...bgZebra);
        doc.rect(tblX, y, ptblW, rowH, 'F');
      }
      doc.setDrawColor(...lightBorder);
      doc.setLineWidth(0.15);
      doc.line(tblX, y + rowH, tblX + ptblW, y + rowH);

      doc.setFont('Amiri', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...darkText);

      let rx2 = tblX + ptblW;
      const pct = data.budget > 0 ? `${Math.round((p.amount / data.budget) * 100)}%` : '—';
      [String(pi + 1), p.description, pct, `${fmt(p.amount)} ₪`].forEach((val, vi) => {
        rx2 -= cols[vi];
        doc.text(ar(val), rx2 + cols[vi] / 2, y + 6, { align: 'center' });
      });
      y += rowH;
    });
    y += 6;
  } else {
    y = drawBullet(doc, 'يتم الدفع وفق الآلية التالية:', contentRight, y, contentWidth);
    y = drawBullet(doc, 'دفعة أولى عند البدء بالعمل', contentRight, y, contentWidth);
    y = drawBullet(doc, 'دفعات لاحقة حسب التقدم في العمل', contentRight, y, contentWidth);
    y = drawBullet(doc, 'الدفعة النهائية عند التسليم والاستلام', contentRight, y, contentWidth);
    y += 4;
  }

  // ══════ Thin separator ══════
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.3);
  doc.line(margin, y, W - margin - 6, y);
  y += 8;

  // ══════ FIRST PARTY OBLIGATIONS ══════
  y = checkPage(doc, y, 40, H, margin);
  y = drawSectionTitle(doc, 'التزامات الطرف الأول', y, W, margin);
  y = drawParagraph(doc, 'يلتزم الطرف الأول بما يلي:', contentRight, y, contentWidth);
  y += 2;
  y = drawBullet(doc, 'تنفيذ الأعمال وفق المواصفات المتفق عليها', contentRight, y, contentWidth);
  y = drawBullet(doc, 'الالتزام بالجودة والمعايير المهنية', contentRight, y, contentWidth);
  y = drawBullet(doc, 'تسليم العمل خلال المدة المحددة', contentRight, y, contentWidth);
  y = drawBullet(doc, 'إبلاغ الطرف الثاني بأي تأخير أو عوائق', contentRight, y, contentWidth);
  y += 4;

  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.3);
  doc.line(margin, y, W - margin - 6, y);
  y += 8;

  // ══════ SECOND PARTY OBLIGATIONS ══════
  y = checkPage(doc, y, 40, H, margin);
  y = drawSectionTitle(doc, 'التزامات الطرف الثاني', y, W, margin);
  y = drawParagraph(doc, 'يلتزم الطرف الثاني بما يلي:', contentRight, y, contentWidth);
  y += 2;
  y = drawBullet(doc, 'دفع المستحقات المالية في مواعيدها', contentRight, y, contentWidth);
  y = drawBullet(doc, 'توفير الموقع جاهزاً للعمل', contentRight, y, contentWidth);
  y = drawBullet(doc, 'عدم طلب تعديلات جوهرية خارج الاتفاق إلا بموافقة الطرف الأول', contentRight, y, contentWidth);
  y = drawBullet(doc, 'التعاون الكامل لضمان سير العمل', contentRight, y, contentWidth);
  y += 4;

  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.3);
  doc.line(margin, y, W - margin - 6, y);
  y += 8;

  // ══════ GENERAL TERMS ══════
  y = checkPage(doc, y, 50, H, margin);
  y = drawSectionTitle(doc, 'شروط عامة', y, W, margin);
  y = drawBullet(doc, 'أي تعديل على الاتفاق يجب أن يكون مكتوباً وموقعاً من الطرفين', contentRight, y, contentWidth);
  y = drawBullet(doc, 'في حال التأخير بالدفع يحق للطرف الأول إيقاف العمل', contentRight, y, contentWidth);
  y = drawBullet(doc, 'لا يتحمل الطرف الأول أي تأخير ناتج عن ظروف خارجة عن إرادته', contentRight, y, contentWidth);
  y = drawBullet(doc, 'في حال الإلغاء من قبل الطرف الثاني، لا تُسترد الدفعات المدفوعة', contentRight, y, contentWidth);
  y = drawBullet(doc, 'يتم حل أي نزاع ودياً، وفي حال التعذر يتم اللجوء إلى الجهات المختصة', contentRight, y, contentWidth);
  y += 4;

  // ══════ NOTES ══════
  if (data.notes) {
    y = checkPage(doc, y, 25, H, margin);
    y = drawSectionTitle(doc, 'ملاحظات إضافية', y, W, margin);
    y = drawParagraph(doc, data.notes, contentRight, y, contentWidth);
    y += 4;
  }

  // ══════ SIGNATURES ══════
  y = checkPage(doc, y, 65, H, margin);
  y += 6;

  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.3);
  doc.line(margin, y, W - margin - 6, y);
  y += 12;

  const sigBoxW = (contentWidth - 8) / 2;

  // First party (right in RTL)
  const box1X = margin + sigBoxW + 12;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.roundedRect(box1X, y, sigBoxW, 50, 4, 4, 'S');

  doc.setFont('Amiri', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text(ar('الطرف الأول'), box1X + sigBoxW / 2, y + 8, { align: 'center' });
  doc.setFont('Amiri', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...darkText);
  doc.text(ar(company.name || ''), box1X + sigBoxW / 2, y + 16, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(...labelText);
  doc.text(ar('التوقيع: _______________'), box1X + sigBoxW / 2, y + 28, { align: 'center' });
  doc.text(ar('التاريخ: _______________'), box1X + sigBoxW / 2, y + 35, { align: 'center' });
  // Stamp area
  doc.setFontSize(7);
  doc.setTextColor(...mutedText);
  doc.text(ar('[ مساحة الختم ]'), box1X + sigBoxW / 2, y + 45, { align: 'center' });

  // Second party (left in RTL)
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, sigBoxW, 50, 4, 4, 'S');

  doc.setFont('Amiri', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text(ar('الطرف الثاني'), margin + sigBoxW / 2, y + 8, { align: 'center' });
  doc.setFont('Amiri', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...darkText);
  doc.text(ar(data.customerName || ''), margin + sigBoxW / 2, y + 16, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(...labelText);
  doc.text(ar('التوقيع: _______________'), margin + sigBoxW / 2, y + 28, { align: 'center' });
  doc.text(ar('التاريخ: _______________'), margin + sigBoxW / 2, y + 35, { align: 'center' });

  // ══════ FOOTER + SIDE STRIPE on all pages ══════
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    // Side stripe
    drawSideStripe(doc, W, H);

    // Footer separator
    doc.setDrawColor(...borderColor);
    doc.setLineWidth(0.3);
    doc.line(margin, H - 18, W - margin - 6, H - 18);

    // Footer text
    doc.setFont('Amiri', 'normal');
    doc.setFontSize(7);

    // Left: confidential
    doc.setTextColor(...mutedText);
    doc.text(ar('عقد اتفاقية تنفيذ ورشة عمل — سري وخاص'), margin, H - 10, { align: 'left' });

    // Center: page number
    doc.text(ar(`صفحة ${p} من ${totalPages}`), W / 2, H - 10, { align: 'center' });

    // Right: company name
    doc.text(ar(company.name || ''), W - margin - 8, H - 10, { align: 'right' });
  }

  return doc;
};
