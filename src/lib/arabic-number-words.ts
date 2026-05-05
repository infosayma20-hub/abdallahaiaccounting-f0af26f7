// Arabic number to words converter
const ones = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const teens = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const tens = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const hundreds = ["", "مائة", "مئتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

const CURRENCY_MAP: Record<string, { singular: string; fraction: string }> = {
  "شيكل": { singular: "شيكل",  fraction: "أغورة" },
  "ILS":   { singular: "شيكل",  fraction: "أغورة" },
  "دينار": { singular: "دينار", fraction: "قرش" },
  "JOD":   { singular: "دينار", fraction: "قرش" },
  "دولار": { singular: "دولار", fraction: "سنت" },
  "USD":   { singular: "دولار", fraction: "سنت" },
  "يورو":  { singular: "يورو",  fraction: "سنت" },
  "EUR":   { singular: "يورو",  fraction: "سنت" },
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
  const cur = CURRENCY_MAP[currency] || CURRENCY_MAP["شيكل"];
  const abs = Math.abs(amount);
  const intPart = Math.floor(abs);
  const fracPart = Math.round((abs - intPart) * 100);

  // Use construct state ("مئتا" instead of "مئتان") when number is followed by a noun
  const intWords = intPart === 0 ? "صفر" : applyConstructState(intToArabicWords(intPart));

  let result = `فقط: ${intWords} ${cur.singular}`;
  if (fracPart > 0) {
    result += ` و${applyConstructState(intToArabicWords(fracPart))} ${cur.fraction}`;
  }
  result += " لا غير";
  return result;
}

// Drop the final ن from "مئتان"/"ألفان"/"مليونان" when the number is followed directly by a noun (idafa).
function applyConstructState(words: string): string {
  return words
    .replace(/مئتان$/, "مئتا")
    .replace(/ألفان$/, "ألفا")
    .replace(/مليونان$/, "مليونا");
}

function intToArabicWords(intPart: number): string {
  if (intPart === 0) return "صفر";
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
  
  return parts.join(" و");
}
