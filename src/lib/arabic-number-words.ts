// Arabic number to words converter
const ones = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const teens = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const tens = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

const CURRENCY_MAP: Record<string, { singular: string; dual: string; plural: string }> = {
  "شيكل": { singular: "شيكلاً", dual: "شيكلاً", plural: "شيكلات" },
  "ILS": { singular: "شيكلاً", dual: "شيكلاً", plural: "شيكلات" },
  "دينار": { singular: "ديناراً", dual: "ديناراً", plural: "دنانير" },
  "JOD": { singular: "ديناراً", dual: "ديناراً", plural: "دنانير" },
  "دولار": { singular: "دولاراً", dual: "دولاراً", plural: "دولارات" },
  "USD": { singular: "دولاراً", dual: "دولاراً", plural: "دولارات" },
};

function convertGroup(n: number): string {
  if (n === 0) return "";
  if (n < 10) return ones[n];
  if (n < 20) return teens[n - 10];
  if (n < 100) {
    const o = n % 10;
    const t = Math.floor(n / 10);
    return o > 0 ? `${ones[o]} و${tens[t]}` : tens[t];
  }
  const h = Math.floor(n / 100);
  const rem = n % 100;
  if (rem === 0) return hundreds[h];
  return `${hundreds[h]} و${convertGroup(rem)}`;
}

export function amountToArabicWords(amount: number, currency: string = "شيكل"): string {
  if (amount === 0) return "صفر";
  
  const intPart = Math.floor(Math.abs(amount));
  const cur = CURRENCY_MAP[currency] || CURRENCY_MAP["شيكل"];
  
  if (intPart === 0) return `صفر ${cur.singular} لا غير`;
  
  const parts: string[] = [];
  
  if (intPart >= 1000000) {
    const millions = Math.floor(intPart / 1000000);
    if (millions === 1) parts.push("مليون");
    else if (millions === 2) parts.push("مليونان");
    else if (millions <= 10) parts.push(`${convertGroup(millions)} ملايين`);
    else parts.push(`${convertGroup(millions)} مليون`);
  }
  
  const afterMillions = intPart % 1000000;
  if (afterMillions >= 1000) {
    const thousands = Math.floor(afterMillions / 1000);
    if (thousands === 1) parts.push("ألف");
    else if (thousands === 2) parts.push("ألفان");
    else if (thousands <= 10) parts.push(`${convertGroup(thousands)} آلاف`);
    else parts.push(`${convertGroup(thousands)} ألفاً`);
  }
  
  const remainder = afterMillions % 1000;
  if (remainder > 0) {
    parts.push(convertGroup(remainder));
  }
  
  const joined = parts.join(" و");
  return `${joined} ${cur.singular} لا غير`;
}
