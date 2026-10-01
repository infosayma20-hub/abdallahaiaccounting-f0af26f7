
// ════════════════════════════════════════════════════════════════════════
// v6.4.0-bilingual — English layer (appended to v6.3.7-clean at build time)
// ------------------------------------------------------------------------
// • Arabic path is the ORIGINAL clean renderer, untouched (renamed *_ar).
// • English is used ONLY when the request carries lang:"en"
//   (order.lang / session.lang). Anything else → Arabic exactly as before.
// • English = same layout mirrored left-to-right + translated labels.
// ════════════════════════════════════════════════════════════════════════
const EN_LABELS = [
  ['شكراً لتعاملكم معنا', 'Thank you for your visit!'],
  ['مشغّل بواسطة نظام يونيفاي Unify ERP', ''],
  ['مشغّل بواسطة نظام يونيفاي', ''],
  ['إجمالي المبيعات', 'Total sales'],
  ['إجمالي المصروفات', 'Total expenses'],
  ['الرصيد الافتتاحي', 'Opening balance'],
  ['أرصدة الصندوق', 'Cash balances'],
  ['توزيع المبيعات', 'Sales breakdown'],
  ['توقيع الكاشير:', 'Cashier signature:'],
  ['تسليم العهدة', 'Cash handover'],
  ['إغلاق الوردية', 'Shift closed'],
  ['فتح الوردية', 'Shift opened'],
  ['المبلغ المستلم', 'Received'],
  ['عدد الطلبات', 'Orders'],
  ['طريقة الدفع', 'Payment'],
  ['رقم الطلب', 'Order No.'],
  ['نوع الطلب', 'Order type'],
  ['الإجمالي', 'TOTAL'],
  ['المجموع', 'Total'],
  ['الكميات', 'Items'],
  ['الكمية', 'Qty'],
  ['الكاشير', 'Cashier'],
  ['الطاولة', 'Table'],
  ['طاولة:', 'Table:'],
  ['الصنف', 'Item'],
  ['السعر', 'Price'],
  ['الخصم', 'Discount'],
  ['الباقي', 'Change'],
  ['الزبون', 'Customer'],
  ['الوقت', 'Time'],
  ['استلام', 'Pickup'],
  ['المتوقع', 'Expected'],
  ['الفعلي', 'Actual'],
  ['الفرق', 'Difference'],
  ['مطابق', 'Balanced'],
  ['زيادة', 'Over'],
  ['عجز', 'Short'],
  ['ملاحظة:', 'Note:'],
  ['توصيل:', 'Delivery:'],
  ['تنبيه:', 'Notice:'],
  ['توصيل', 'Delivery'],
  ['سفري', 'Takeaway'],
  ['محلي', 'Dine-in'],
  ['وردية', 'Shift'],
  ['بطاقة', 'Card'],
  ['فيزا', 'Card'],
  ['نقد', 'Cash'],
  ['شكراً', 'Thank you'],
  ['شيكل', 'ILS'],
  ['دينار', 'JOD'],
  ['دولار', 'USD'],
  ['د.أ', 'JOD'],
  ['د.ا', 'JOD'],
];

function enTranslateText(raw) {
  // Only static labels are translated: exact match, or a label used as a
  // prefix ("طاولة: 5", "عجز - ₪3", "ملاحظة: ..."). Free text such as item
  // or customer names is never partially rewritten.
  const s = String(raw);
  const t = s.trim();
  if (!/[\u0600-\u06FF]/.test(t)) return s;
  for (const [ar, en] of EN_LABELS) {
    if (t === ar) return en;
  }
  for (const [ar, en] of EN_LABELS) {
    if (t.startsWith(ar + ' ') || (ar.endsWith(':') && t.startsWith(ar))) {
      return (en + ' ' + t.slice(ar.length).trim()).trim();
    }
  }
  // "₪5 وردية 2" style suffixes (cashier · shift N)
  return t.replace(/(^|\s)وردية(\s+\d+)/g, '$1Shift$2');
}

/** Mirror a finished SVG left↔right and translate the Arabic labels. */
function localizeSvgEn(svg) {
  const m = /<svg[^>]*\swidth="(\d+(?:\.\d+)?)"/.exec(svg);
  const W = m ? Number(m[1]) : 576;
  const flipX = (v) => String(+(W - Number(v)).toFixed(2));

  // <text ...>content</text>
  svg = svg.replace(/<text\b([^>]*)>([\s\S]*?)<\/text>/g, (all, attrs, content) => {
    let a = attrs.replace(/\sx="([\d.\-]+)"/, (_, x) => ` x="${flipX(x)}"`);
    if (/text-anchor="end"/.test(a)) a = a.replace('text-anchor="end"', 'text-anchor="start"');
    else if (/text-anchor="start"/.test(a)) a = a.replace('text-anchor="start"', 'text-anchor="end"');
    else if (!/text-anchor=/.test(a)) a += ' text-anchor="end"'; // default start → after flip becomes end
    a = a.replace(/\sdirection="rtl"/g, '');
    const txt = enTranslateText(content);
    if (!txt) return '';
    return `<text${a}>${txt}</text>`;
  });
  // <line x1 x2>
  svg = svg.replace(/<line\b([^>]*)\/?>/g, (all, attrs) =>
    all.replace(/\sx1="([\d.\-]+)"/, (_, x) => ` x1="${flipX(x)}"`).replace(/\sx2="([\d.\-]+)"/, (_, x) => ` x2="${flipX(x)}"`));
  // <rect x width> / <image x width>  (rects without x = full background → unchanged)
  svg = svg.replace(/<(rect|image)\b([^>]*)\/?>/g, (all, tag, attrs) => {
    const xm = /\sx="([\d.\-]+)"/.exec(attrs);
    const wm = /\swidth="([\d.\-]+)"/.exec(attrs);
    if (!xm || !wm) return all;
    const nx = +(W - Number(xm[1]) - Number(wm[1])).toFixed(2);
    return all.replace(/\sx="([\d.\-]+)"/, ` x="${nx}"`);
  });
  return svg;
}

const isEn = (o) => !!o && String(o.lang || '').toLowerCase() === 'en';

function renderReceiptSVG(order, logoTopMargin) {
  const r = renderReceiptSVG_ar(order, logoTopMargin);
  return isEn(order) ? { ...r, svg: localizeSvgEn(r.svg) } : r;
}
function renderKitchenSVG(order, stationLabel) {
  const svg = renderKitchenSVG_ar(order, stationLabel);
  return isEn(order) ? localizeSvgEn(svg) : svg;
}
function renderShiftSVG(session, logoTopMargin) {
  const r = renderShiftSVG_ar(session, logoTopMargin);
  return isEn(session) ? { ...r, svg: localizeSvgEn(r.svg) } : r;
}
