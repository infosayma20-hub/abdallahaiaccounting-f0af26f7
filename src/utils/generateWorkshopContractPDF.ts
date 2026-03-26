import jsPDF from 'jspdf';
import { AmiriRegular, AmiriBold } from './amiri-font';
import { ar } from './arabic-pdf-utils';

// ─── Colors ───
const navy: [number, number, number] = [27, 58, 92];
const gold: [number, number, number] = [201, 168, 76];
const darkText: [number, number, number] = [30, 30, 30];
const lightGray: [number, number, number] = [248, 249, 250];

// ─── Types ───
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
  notes: string;
}

export interface ContractCompanyData {
  name: string;
  phone?: string;
  address?: string;
  logo_url?: string;
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

// ─── Draw section title with gold underline ───
const drawSectionTitle = (doc: jsPDF, title: string, y: number, W: number, margin: number): number => {
  doc.setFont('Amiri', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...navy);
  doc.text(ar(title), W - margin, y, { align: 'right' });
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.8);
  doc.line(margin, y + 2, W - margin, y + 2);
  return y + 8;
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
  doc.setTextColor(...darkText);
  const bulletChar = '●';
  doc.setTextColor(...gold);
  doc.text(bulletChar, x, y, { align: 'right' });
  doc.setTextColor(...darkText);
  const lines = doc.splitTextToSize(ar(text), maxWidth - 8);
  lines.forEach((line: string, i: number) => {
    doc.text(line, x - 6, y + i * 5.5, { align: 'right' });
  });
  return y + lines.length * 5.5 + 1;
};

// ─── Check page break ───
const checkPage = (doc: jsPDF, y: number, needed: number, H: number, margin: number): number => {
  if (y + needed > H - 25) {
    doc.addPage();
    return margin + 10;
  }
  return y;
};

// ─── Main Generator ───
export const generateWorkshopContractPDF = async (
  data: ContractData,
  company: ContractCompanyData
): Promise<jsPDF> => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.width;
  const H = doc.internal.pageSize.height;
  const margin = 15;
  const contentWidth = W - margin * 2;

  registerFont(doc);

  // ══════ HEADER BAR ══════
  doc.setFillColor(...navy);
  doc.rect(0, 0, W, 40, 'F');
  doc.setFillColor(...gold);
  doc.rect(0, 40, W, 2, 'F');

  // Logo
  if (company.logo_url) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve) => {
        img.onload = () => {
          doc.addImage(img, 'PNG', W - margin - 25, 5, 22, 22);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = company.logo_url!;
      });
    } catch { /* skip logo on error */ }
  }

  // Company name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('Amiri', 'bold');
  doc.text(ar(company.name || ''), W - margin - (company.logo_url ? 30 : 0), 18, { align: 'right' });

  // Company details
  doc.setTextColor(200, 210, 220);
  doc.setFontSize(7.5);
  doc.setFont('Amiri', 'normal');
  const compInfo = [company.phone, company.address].filter(Boolean).join('  |  ');
  if (compInfo) doc.text(compInfo, W - margin - (company.logo_url ? 30 : 0), 25, { align: 'right' });

  // Title
  doc.setTextColor(...gold);
  doc.setFontSize(16);
  doc.setFont('Amiri', 'bold');
  doc.text(ar('عقد اتفاقية تنفيذ ورشة عمل'), margin + contentWidth / 2, 18, { align: 'center' });
  doc.setTextColor(200, 210, 220);
  doc.setFontSize(8);
  doc.text('WORKSHOP AGREEMENT', margin + contentWidth / 2, 25, { align: 'center' });

  // ══════ BISMILLAH ══════
  let y = 50;
  doc.setFont('Amiri', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...navy);
  doc.text(ar('بسم الله الرحمن الرحيم'), W / 2, y, { align: 'center' });

  // Date
  y += 10;
  doc.setFontSize(10);
  doc.setFont('Amiri', 'normal');
  doc.setTextColor(...darkText);
  doc.text(ar(`بتاريخ: ${fmtDate(data.startDate)}`), W - margin, y, { align: 'right' });

  y += 6;
  y = drawParagraph(doc, 'تم الاتفاق بين كل من:', W - margin, y, contentWidth);

  // ══════ FIRST PARTY ══════
  y += 4;
  y = drawSectionTitle(doc, 'أولاً: الطرف الأول', y, W, margin);
  
  doc.setFillColor(...lightGray);
  doc.roundedRect(margin, y - 2, contentWidth, 24, 2, 2, 'F');
  doc.setDrawColor(220, 220, 225);
  doc.roundedRect(margin, y - 2, contentWidth, 24, 2, 2, 'S');

  doc.setFont('Amiri', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 110);
  doc.text(ar('شركة / مؤسسة:'), W - margin - 5, y + 5, { align: 'right' });
  doc.setFont('Amiri', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...darkText);
  doc.text(ar(company.name || ''), W - margin - 5, y + 12, { align: 'right' });

  doc.setFont('Amiri', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 110);
  doc.text(ar('ويمثلها:'), W - margin - 100, y + 5, { align: 'right' });
  doc.setTextColor(...darkText);
  doc.text(ar(company.representative || company.name || ''), W - margin - 100, y + 12, { align: 'right' });

  doc.setFontSize(8);
  doc.setTextColor(100, 100, 110);
  doc.text(ar('ويشار إليه فيما بعد بـ (الطرف الأول)'), W - margin - 5, y + 19, { align: 'right' });

  y += 30;

  // ══════ SECOND PARTY ══════
  y = drawSectionTitle(doc, 'ثانياً: الطرف الثاني', y, W, margin);

  doc.setFillColor(...lightGray);
  doc.roundedRect(margin, y - 2, contentWidth, 28, 2, 2, 'F');
  doc.setDrawColor(220, 220, 225);
  doc.roundedRect(margin, y - 2, contentWidth, 28, 2, 2, 'S');

  // Customer info grid
  const col1 = W - margin - 5;
  const col2 = W - margin - 65;
  const col3 = W - margin - 125;

  doc.setFont('Amiri', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 110);
  doc.text(ar('اسم العميل:'), col1, y + 5, { align: 'right' });
  doc.setTextColor(...darkText);
  doc.setFontSize(11);
  doc.text(ar(data.customerName || '—'), col1, y + 12, { align: 'right' });

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 110);
  doc.text(ar('رقم الهاتف:'), col2, y + 5, { align: 'right' });
  doc.setTextColor(...darkText);
  doc.text(data.customerPhone || '—', col2, y + 12, { align: 'right' });

  doc.setTextColor(100, 100, 110);
  doc.text(ar('العنوان:'), col3, y + 5, { align: 'right' });
  doc.setTextColor(...darkText);
  doc.text(ar(data.address || '—'), col3, y + 12, { align: 'right' });

  doc.setFontSize(8);
  doc.setTextColor(100, 100, 110);
  doc.text(ar('ويشار إليه فيما بعد بـ (الطرف الثاني)'), col1, y + 22, { align: 'right' });

  y += 34;

  // ══════ SUBJECT ══════
  y = checkPage(doc, y, 50, H, margin);
  y = drawSectionTitle(doc, 'موضوع الاتفاقية', y, W, margin);
  y = drawParagraph(doc, 'اتفق الطرفان على تنفيذ ورشة عمل وفق التفاصيل التالية:', W - margin, y, contentWidth);
  y += 3;

  // Workshop details box
  doc.setFillColor(240, 245, 255);
  doc.roundedRect(margin, y - 2, contentWidth, 32, 2, 2, 'F');
  doc.setDrawColor(...navy);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y - 2, contentWidth, 32, 2, 2, 'S');

  const detailY = y + 5;
  const detailItems = [
    { label: 'اسم الورشة:', value: data.workshopName },
    { label: 'نوع الورشة:', value: data.workshopType },
    { label: 'المساحة:', value: data.areaSqm ? `${data.areaSqm} متر مربع` : '—' },
    { label: 'تاريخ البدء:', value: fmtDate(data.startDate) },
  ];

  detailItems.forEach((item, i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const xPos = col === 0 ? W - margin - 5 : W - margin - 95;
    const yPos = detailY + row * 12;
    
    doc.setFont('Amiri', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...navy);
    doc.text(ar(item.label), xPos, yPos, { align: 'right' });
    doc.setFont('Amiri', 'normal');
    doc.setTextColor(...darkText);
    doc.text(ar(item.value), xPos - 2, yPos + 5.5, { align: 'right' });
  });

  y += 38;

  if (data.description) {
    doc.setFont('Amiri', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...navy);
    doc.text(ar('الوصف:'), W - margin, y, { align: 'right' });
    y += 5;
    y = drawParagraph(doc, data.description, W - margin, y, contentWidth);
    y += 3;
  }

  // ══════ FINANCIAL VALUE ══════
  y = checkPage(doc, y, 40, H, margin);
  y = drawSectionTitle(doc, 'القيمة المالية', y, W, margin);

  // Budget highlight box
  doc.setFillColor(...gold);
  doc.roundedRect(margin + contentWidth / 4, y - 1, contentWidth / 2, 14, 3, 3, 'F');
  doc.setFont('Amiri', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(ar(`إجمالي قيمة المشروع: ${fmt(data.budget)} شيكل`), margin + contentWidth / 2, y + 8, { align: 'center' });
  y += 20;

  y = drawBullet(doc, 'يتم الدفع وفق الآلية التالية:', W - margin, y, contentWidth);
  y = drawBullet(doc, 'دفعة أولى عند البدء بالعمل', W - margin, y, contentWidth);
  y = drawBullet(doc, 'دفعات لاحقة حسب التقدم في العمل', W - margin, y, contentWidth);
  y = drawBullet(doc, 'الدفعة النهائية عند التسليم والاستلام', W - margin, y, contentWidth);
  y += 4;

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
  y = checkPage(doc, y, 50, H, margin);
  y += 6;
  y = drawSectionTitle(doc, 'التوقيع', y, W, margin);
  y += 4;

  const sigBoxW = (contentWidth - 10) / 2;

  // First party signature box
  doc.setFillColor(...lightGray);
  doc.roundedRect(margin + sigBoxW + 10, y, sigBoxW, 35, 2, 2, 'F');
  doc.setDrawColor(200, 200, 205);
  doc.roundedRect(margin + sigBoxW + 10, y, sigBoxW, 35, 2, 2, 'S');
  
  doc.setFont('Amiri', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text(ar('الطرف الأول'), margin + sigBoxW + 10 + sigBoxW / 2, y + 8, { align: 'center' });
  doc.setFont('Amiri', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...darkText);
  doc.text(ar(company.representative || company.name || ''), margin + sigBoxW + 10 + sigBoxW / 2, y + 15, { align: 'center' });
  
  // Signature line
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.5);
  doc.line(margin + sigBoxW + 20, y + 28, margin + sigBoxW + 10 + sigBoxW - 10, y + 28);

  // Second party signature box
  doc.setFillColor(...lightGray);
  doc.roundedRect(margin, y, sigBoxW, 35, 2, 2, 'F');
  doc.setDrawColor(200, 200, 205);
  doc.roundedRect(margin, y, sigBoxW, 35, 2, 2, 'S');
  
  doc.setFont('Amiri', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text(ar('الطرف الثاني'), margin + sigBoxW / 2, y + 8, { align: 'center' });
  doc.setFont('Amiri', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...darkText);
  doc.text(ar(data.customerName || ''), margin + sigBoxW / 2, y + 15, { align: 'center' });
  
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.5);
  doc.line(margin + 10, y + 28, margin + sigBoxW - 10, y + 28);

  // ══════ FOOTER ══════
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    // Gold line above footer
    doc.setFillColor(...gold);
    doc.rect(0, H - 12, W, 0.8, 'F');
    // Footer text
    doc.setFontSize(7);
    doc.setFont('Amiri', 'normal');
    doc.setTextColor(150, 150, 155);
    doc.text(ar(`صفحة ${p} من ${totalPages}`), W / 2, H - 6, { align: 'center' });
    doc.text(ar('عقد اتفاقية تنفيذ ورشة عمل — سري'), W - margin, H - 6, { align: 'right' });
  }

  return doc;
};
