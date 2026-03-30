import jsPDF from 'jspdf';
import { AmiriRegular, AmiriBold } from './amiri-font';
import { ar } from './arabic-pdf-utils';

// ─── AMWALI Colors ───
const navy: [number, number, number] = [13, 27, 46];       // #0D1B2E
const navyLight: [number, number, number] = [27, 58, 92];   // #1B3A5C
const darkText: [number, number, number] = [30, 41, 59];    // #1E293B
const borderColor: [number, number, number] = [226, 232, 240]; // #E2E8F0
const bgLight: [number, number, number] = [248, 250, 252];  // #F8FAFC
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

// ─── Draw section title with navy background ───
const drawSectionTitle = (doc: jsPDF, title: string, y: number, W: number, margin: number): number => {
  doc.setFillColor(...navy);
  doc.roundedRect(margin, y - 4, W - margin * 2, 10, 2, 2, 'F');
  doc.setFont('Amiri', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...white);
  doc.text(ar(title), W - margin - 8, y + 3, { align: 'right' });
  return y + 14;
};

// ─── Draw paragraph (RTL) ───
const drawParagraph = (doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight: number = 6): number => {
  doc.setFont('Amiri', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...darkText);
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
  doc.setTextColor(...navyLight);
  doc.text('●', x, y, { align: 'right' });
  doc.setTextColor(...darkText);
  const lines = doc.splitTextToSize(ar(text), maxWidth - 8);
  lines.forEach((line: string, i: number) => {
    doc.text(line, x - 6, y + i * 5.5, { align: 'right' });
  });
  return y + lines.length * 5.5 + 1;
};

// ─── Check page break ───
const checkPage = (doc: jsPDF, y: number, needed: number, H: number, margin: number): number => {
  if (y + needed > H - 30) {
    doc.addPage();
    return margin + 10;
  }
  return y;
};

// ─── Draw side stripe on current page ───
const drawSideStripe = (doc: jsPDF, W: number, H: number) => {
  // Right side vertical stripe gradient effect
  const stripeX = W - 3;
  const stripeW = 3;
  const steps = 20;
  const stepH = H / steps;
  for (let i = 0; i < steps; i++) {
    const ratio = i / steps;
    const r = Math.round(13 + ratio * (74 - 13));
    const g = Math.round(27 + ratio * (144 - 27));
    const b = Math.round(46 + ratio * (217 - 46));
    doc.setFillColor(r, g, b);
    doc.rect(stripeX, i * stepH, stripeW, stepH + 0.5, 'F');
  }
};

// ─── Main Generator ───
export const generateWorkshopContractPDF = async (
  data: ContractData,
  company: ContractCompanyData
): Promise<jsPDF> => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.width;
  const H = doc.internal.pageSize.height;
  const margin = 18;
  const contentWidth = W - margin * 2 - 4; // account for side stripe

  registerFont(doc);

  // ══════ HEADER — gradient bar ══════
  // Simulate gradient with steps
  const headerH = 42;
  const gradSteps = 30;
  for (let i = 0; i < gradSteps; i++) {
    const ratio = i / gradSteps;
    const r = Math.round(13 + ratio * (27 - 13));
    const g = Math.round(27 + ratio * (58 - 27));
    const b = Math.round(46 + ratio * (92 - 46));
    doc.setFillColor(r, g, b);
    doc.rect(0, (headerH / gradSteps) * i, W, headerH / gradSteps + 0.5, 'F');
  }

  // Logo (right side)
  let logoOffset = 0;
  if (company.logo_url) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve) => {
        img.onload = () => {
          doc.addImage(img, 'PNG', W - margin - 24, 6, 20, 20);
          logoOffset = 26;
          resolve();
        };
        img.onerror = () => resolve();
        img.src = company.logo_url!;
      });
    } catch { /* skip logo on error */ }
  }

  // Company name + details (right)
  doc.setTextColor(...white);
  doc.setFontSize(14);
  doc.setFont('Amiri', 'bold');
  doc.text(ar(company.name || ''), W - margin - logoOffset, 16, { align: 'right' });

  doc.setTextColor(200, 210, 220);
  doc.setFontSize(7.5);
  doc.setFont('Amiri', 'normal');
  const compInfoParts = [company.phone, company.email, company.address].filter(Boolean);
  if (compInfoParts.length) {
    doc.text(compInfoParts.join('  |  '), W - margin - logoOffset, 22, { align: 'right' });
  }
  if (company.tax_number) {
    doc.text(ar(`الرقم الضريبي: ${company.tax_number}`), W - margin - logoOffset, 27, { align: 'right' });
  }

  // Title (left/center)
  doc.setTextColor(...white);
  doc.setFontSize(16);
  doc.setFont('Amiri', 'bold');
  doc.text(ar('عقد تنفيذ ورشة عمل'), margin + 5, 16, { align: 'left' });
  doc.setTextColor(200, 215, 230);
  doc.setFontSize(8);
  doc.text('WORKSHOP AGREEMENT', margin + 5, 22, { align: 'left' });

  // Contract number + date
  const contractNum = `WRK-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0')}`;
  doc.setTextColor(200, 215, 230);
  doc.setFontSize(7.5);
  doc.text(ar(`رقم العقد: ${contractNum}`), margin + 5, 32, { align: 'left' });
  doc.text(fmtDate(data.startDate || new Date().toISOString().slice(0, 10)), margin + 5, 37, { align: 'left' });

  // Separator line
  doc.setFillColor(...borderColor);
  doc.rect(0, headerH, W, 0.5, 'F');

  // ══════ BISMILLAH ══════
  let y = headerH + 10;
  doc.setFont('Amiri', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...navy);
  doc.text(ar('بسم الله الرحمن الرحيم'), W / 2, y, { align: 'center' });

  y += 10;
  doc.setFontSize(10);
  doc.setFont('Amiri', 'normal');
  doc.setTextColor(...darkText);
  doc.text(ar(`بتاريخ: ${fmtDate(data.startDate)}`), W - margin, y, { align: 'right' });
  y += 6;
  y = drawParagraph(doc, 'تم الاتفاق بين كل من:', W - margin, y, contentWidth);
  y += 4;

  // ══════ FIRST PARTY ══════
  y = drawSectionTitle(doc, 'أولاً: الطرف الأول (المقاول / المنفذ)', y, W, margin);

  doc.setFillColor(...bgLight);
  doc.roundedRect(margin, y - 2, contentWidth + 4, 30, 2, 2, 'F');
  doc.setDrawColor(...borderColor);
  doc.roundedRect(margin, y - 2, contentWidth + 4, 30, 2, 2, 'S');

  const labelCol1 = W - margin - 5;
  const labelCol2 = W - margin - 95;

  doc.setFont('Amiri', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(ar('اسم الشركة / المؤسسة:'), labelCol1, y + 5, { align: 'right' });
  doc.setTextColor(...darkText);
  doc.setFontSize(11);
  doc.text(ar(company.name || '—'), labelCol1, y + 12, { align: 'right' });

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(ar('الهاتف:'), labelCol2, y + 5, { align: 'right' });
  doc.setTextColor(...darkText);
  doc.text(company.phone || '—', labelCol2, y + 12, { align: 'right' });

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(ar('العنوان:'), labelCol1, y + 19, { align: 'right' });
  doc.setTextColor(...darkText);
  doc.text(ar(company.address || '—'), labelCol1, y + 25, { align: 'right' });

  if (company.tax_number) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(ar('الرقم الضريبي:'), labelCol2, y + 19, { align: 'right' });
    doc.setTextColor(...darkText);
    doc.text(company.tax_number, labelCol2, y + 25, { align: 'right' });
  }

  y += 34;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(ar('ويُشار إليه فيما بعد بـ "الطرف الأول"'), W - margin - 5, y, { align: 'right' });
  y += 8;

  // ══════ SECOND PARTY ══════
  y = drawSectionTitle(doc, 'ثانياً: الطرف الثاني (صاحب العمل)', y, W, margin);

  doc.setFillColor(...bgLight);
  doc.roundedRect(margin, y - 2, contentWidth + 4, 24, 2, 2, 'F');
  doc.setDrawColor(...borderColor);
  doc.roundedRect(margin, y - 2, contentWidth + 4, 24, 2, 2, 'S');

  const col3 = W - margin - 130;

  doc.setFont('Amiri', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(ar('اسم العميل:'), labelCol1, y + 5, { align: 'right' });
  doc.setTextColor(...darkText);
  doc.setFontSize(11);
  doc.text(ar(data.customerName || '—'), labelCol1, y + 12, { align: 'right' });

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(ar('الهاتف:'), labelCol2, y + 5, { align: 'right' });
  doc.setTextColor(...darkText);
  doc.text(data.customerPhone || '—', labelCol2, y + 12, { align: 'right' });

  doc.setTextColor(100, 116, 139);
  doc.text(ar('العنوان:'), col3, y + 5, { align: 'right' });
  doc.setTextColor(...darkText);
  doc.text(ar(data.address || '—'), col3, y + 12, { align: 'right' });

  y += 28;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(ar('ويُشار إليه فيما بعد بـ "الطرف الثاني"'), W - margin - 5, y, { align: 'right' });
  y += 8;

  // ══════ SUBJECT ══════
  y = checkPage(doc, y, 55, H, margin);
  y = drawSectionTitle(doc, 'موضوع الاتفاقية', y, W, margin);
  y = drawParagraph(doc, 'اتفق الطرفان على تنفيذ ورشة عمل وفق التفاصيل التالية:', W - margin, y, contentWidth);
  y += 3;

  // Workshop details table
  const details = [
    ['اسم الورشة', data.workshopName || '—'],
    ['نوع الورشة', data.workshopType || '—'],
    ['المساحة', data.areaSqm ? `${data.areaSqm} م²` : '—'],
    ['تاريخ البدء', fmtDate(data.startDate)],
    ['تاريخ الانتهاء المتوقع', data.endDate ? fmtDate(data.endDate) : 'يُحدد لاحقاً'],
  ];

  // Draw details as mini-table
  doc.setFillColor(240, 245, 255);
  doc.roundedRect(margin, y - 2, contentWidth + 4, details.length * 9 + 4, 2, 2, 'F');
  doc.setDrawColor(...navyLight);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y - 2, contentWidth + 4, details.length * 9 + 4, 2, 2, 'S');

  details.forEach((item, i) => {
    const rowY = y + 4 + i * 9;
    doc.setFont('Amiri', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...navyLight);
    doc.text(ar(item[0] + ':'), W - margin - 5, rowY, { align: 'right' });
    doc.setFont('Amiri', 'normal');
    doc.setTextColor(...darkText);
    doc.text(ar(item[1]), W - margin - 55, rowY, { align: 'right' });
    if (i < details.length - 1) {
      doc.setDrawColor(...borderColor);
      doc.setLineWidth(0.15);
      doc.line(margin + 5, rowY + 4, margin + contentWidth - 1, rowY + 4);
    }
  });

  y += details.length * 9 + 8;

  if (data.description) {
    y = checkPage(doc, y, 20, H, margin);
    doc.setFont('Amiri', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...navyLight);
    doc.text(ar('الوصف:'), W - margin, y, { align: 'right' });
    y += 5;
    y = drawParagraph(doc, data.description, W - margin, y, contentWidth);
    y += 3;
  }

  // ══════ FINANCIAL VALUE ══════
  y = checkPage(doc, y, 50, H, margin);
  y = drawSectionTitle(doc, 'القيمة المالية', y, W, margin);

  // Budget highlight
  if (data.budget > 0) {
    doc.setFillColor(...navy);
    doc.roundedRect(margin + contentWidth / 4, y - 1, contentWidth / 2 + 4, 14, 3, 3, 'F');
    doc.setFont('Amiri', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...white);
    doc.text(ar(`إجمالي قيمة المشروع: ${fmt(data.budget)} شيكل`), margin + (contentWidth + 4) / 2, y + 8, { align: 'center' });
  } else {
    doc.setFont('Amiri', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...darkText);
    doc.text(ar('إجمالي قيمة المشروع: يُحدد لاحقاً'), W - margin, y + 5, { align: 'right' });
  }
  y += 20;

  // Payment schedule table
  if (data.payments && data.payments.length > 0 && data.budget > 0) {
    y = checkPage(doc, y, 15 + data.payments.length * 9, H, margin);
    doc.setFont('Amiri', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...darkText);
    doc.text(ar('جدول الدفعات:'), W - margin, y, { align: 'right' });
    y += 6;

    const tblX = margin;
    const tblW = contentWidth + 4;
    const cols = [tblW * 0.08, tblW * 0.42, tblW * 0.2, tblW * 0.3]; // #, desc, %, amount
    const rowH = 9;

    // Table header
    doc.setFillColor(...navy);
    doc.rect(tblX, y, tblW, rowH, 'F');
    doc.setFont('Amiri', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...white);

    let cx = tblX + tblW;
    const headers = ['#', 'وصف الدفعة', 'النسبة', 'المبلغ'];
    headers.forEach((h, hi) => {
      cx -= cols[hi];
      doc.text(ar(h), cx + cols[hi] / 2, y + 6, { align: 'center' });
    });
    y += rowH;

    // Table rows
    data.payments.forEach((p, pi) => {
      const isEven = pi % 2 === 0;
      if (isEven) {
        doc.setFillColor(...bgLight);
        doc.rect(tblX, y, tblW, rowH, 'F');
      }
      doc.setDrawColor(...borderColor);
      doc.setLineWidth(0.15);
      doc.line(tblX, y + rowH, tblX + tblW, y + rowH);

      doc.setFont('Amiri', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...darkText);

      let rx = tblX + tblW;
      const pct = data.budget > 0 ? `${Math.round((p.amount / data.budget) * 100)}%` : '—';
      const rowData = [String(pi + 1), p.description, pct, `${fmt(p.amount)} ₪`];
      rowData.forEach((val, vi) => {
        rx -= cols[vi];
        doc.text(ar(val), rx + cols[vi] / 2, y + 6, { align: 'center' });
      });
      y += rowH;
    });
    y += 4;
  } else {
    // Default generic text
    y = drawBullet(doc, 'يتم الدفع وفق الآلية التالية:', W - margin, y, contentWidth);
    y = drawBullet(doc, 'دفعة أولى عند البدء بالعمل', W - margin, y, contentWidth);
    y = drawBullet(doc, 'دفعات لاحقة حسب التقدم في العمل', W - margin, y, contentWidth);
    y = drawBullet(doc, 'الدفعة النهائية عند التسليم والاستلام', W - margin, y, contentWidth);
    y += 4;
  }

  // ══════ SEPARATOR ══════
  doc.setDrawColor(...navyLight);
  doc.setLineWidth(0.7);
  doc.line(margin, y, W - margin, y);
  y += 8;

  // ══════ FIRST PARTY OBLIGATIONS ══════
  y = checkPage(doc, y, 40, H, margin);
  y = drawSectionTitle(doc, 'التزامات الطرف الأول', y, W, margin);
  y = drawParagraph(doc, 'يلتزم الطرف الأول بما يلي:', W - margin, y, contentWidth);
  y += 2;
  y = drawBullet(doc, 'تنفيذ الأعمال وفق المواصفات المتفق عليها', W - margin, y, contentWidth);
  y = drawBullet(doc, 'الالتزام بالجودة والمعايير المهنية', W - margin, y, contentWidth);
  y = drawBullet(doc, 'تسليم العمل خلال المدة المحددة', W - margin, y, contentWidth);
  y = drawBullet(doc, 'إبلاغ الطرف الثاني بأي تأخير أو عوائق', W - margin, y, contentWidth);
  y += 4;

  // ══════ SEPARATOR ══════
  doc.setDrawColor(...navyLight);
  doc.setLineWidth(0.7);
  doc.line(margin, y, W - margin, y);
  y += 8;

  // ══════ SECOND PARTY OBLIGATIONS ══════
  y = checkPage(doc, y, 40, H, margin);
  y = drawSectionTitle(doc, 'التزامات الطرف الثاني', y, W, margin);
  y = drawParagraph(doc, 'يلتزم الطرف الثاني بما يلي:', W - margin, y, contentWidth);
  y += 2;
  y = drawBullet(doc, 'دفع المستحقات المالية في مواعيدها', W - margin, y, contentWidth);
  y = drawBullet(doc, 'توفير الموقع جاهزاً للعمل', W - margin, y, contentWidth);
  y = drawBullet(doc, 'عدم طلب تعديلات جوهرية خارج الاتفاق إلا بموافقة الطرف الأول', W - margin, y, contentWidth);
  y = drawBullet(doc, 'التعاون الكامل لضمان سير العمل', W - margin, y, contentWidth);
  y += 4;

  // ══════ SEPARATOR ══════
  doc.setDrawColor(...navyLight);
  doc.setLineWidth(0.7);
  doc.line(margin, y, W - margin, y);
  y += 8;

  // ══════ GENERAL TERMS ══════
  y = checkPage(doc, y, 50, H, margin);
  y = drawSectionTitle(doc, 'شروط عامة', y, W, margin);
  y = drawBullet(doc, 'أي تعديل على الاتفاق يجب أن يكون مكتوباً وموقعاً من الطرفين', W - margin, y, contentWidth);
  y = drawBullet(doc, 'في حال التأخير بالدفع يحق للطرف الأول إيقاف العمل', W - margin, y, contentWidth);
  y = drawBullet(doc, 'لا يتحمل الطرف الأول أي تأخير ناتج عن ظروف خارجة عن إرادته', W - margin, y, contentWidth);
  y = drawBullet(doc, 'في حال الإلغاء من قبل الطرف الثاني، لا تُسترد الدفعات المدفوعة', W - margin, y, contentWidth);
  y = drawBullet(doc, 'يتم حل أي نزاع ودياً، وفي حال التعذر يتم اللجوء إلى الجهات المختصة', W - margin, y, contentWidth);
  y += 4;

  // ══════ NOTES ══════
  if (data.notes) {
    y = checkPage(doc, y, 25, H, margin);
    y = drawSectionTitle(doc, 'ملاحظات إضافية', y, W, margin);
    y = drawParagraph(doc, data.notes, W - margin, y, contentWidth);
    y += 4;
  }

  // ══════ SIGNATURES ══════
  y = checkPage(doc, y, 60, H, margin);
  y += 6;

  // Separator
  doc.setDrawColor(...navyLight);
  doc.setLineWidth(0.7);
  doc.line(margin, y, W - margin, y);
  y += 10;

  const sigBoxW = (contentWidth - 6) / 2;

  // First party signature box (right side in RTL)
  const box1X = margin + sigBoxW + 10;
  doc.setFillColor(...bgLight);
  doc.roundedRect(box1X, y, sigBoxW, 45, 4, 4, 'F');
  doc.setDrawColor(203, 213, 225); // #CBD5E1
  doc.roundedRect(box1X, y, sigBoxW, 45, 4, 4, 'S');

  doc.setFont('Amiri', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text(ar('الطرف الأول'), box1X + sigBoxW / 2, y + 8, { align: 'center' });
  doc.setFont('Amiri', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...darkText);
  doc.text(ar(company.name || ''), box1X + sigBoxW / 2, y + 16, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(ar('التوقيع: _______________'), box1X + sigBoxW / 2, y + 30, { align: 'center' });
  doc.text(ar('التاريخ: _______________'), box1X + sigBoxW / 2, y + 37, { align: 'center' });

  // Second party signature box (left side in RTL)
  doc.setFillColor(...bgLight);
  doc.roundedRect(margin, y, sigBoxW, 45, 4, 4, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, sigBoxW, 45, 4, 4, 'S');

  doc.setFont('Amiri', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text(ar('الطرف الثاني'), margin + sigBoxW / 2, y + 8, { align: 'center' });
  doc.setFont('Amiri', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...darkText);
  doc.text(ar(data.customerName || ''), margin + sigBoxW / 2, y + 16, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(ar('التوقيع: _______________'), margin + sigBoxW / 2, y + 30, { align: 'center' });
  doc.text(ar('التاريخ: _______________'), margin + sigBoxW / 2, y + 37, { align: 'center' });

  // ══════ FOOTER + SIDE STRIPE on all pages ══════
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    // Side stripe
    drawSideStripe(doc, W, H);

    // Footer bar
    doc.setFillColor(...navy);
    doc.rect(0, H - 14, W, 14, 'F');

    doc.setFont('Amiri', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255, 0.7);
    doc.text(ar('سري وخاص — عقد اتفاقية تنفيذ ورشة عمل'), W / 2, H - 7, { align: 'center' });
    doc.text(ar(`صفحة ${p} من ${totalPages}`), margin + 5, H - 7, { align: 'left' });
  }

  return doc;
};
