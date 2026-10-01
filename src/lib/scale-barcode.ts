/**
 * قراءة باركود ملصق الميزان الإلكتروني (EAN-13 بوزن/سعر مدمج).
 * الشكل: [بادئة][رقم الصنف PLU][القيمة][خانة تحقق]
 * مثال (بادئة 20، PLU خمس خانات، وزن 3 عشري): 20 00170 01250 C → صنف 170، وزن 1.250 كغ
 */
export interface ScaleFormat {
  id?: string;
  barcode_prefix: string;
  plu_digits: number;
  value_mode: "weight" | "price" | string;
  value_decimals: number;
}

export interface ParsedScaleBarcode {
  scaleId?: string;
  plu: number;
  value: number;
  mode: "weight" | "price";
}

export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

export function parseScaleBarcode(raw: string, formats: ScaleFormat[]): ParsedScaleBarcode | null {
  const code = (raw || "").trim();
  if (!/^\d{13}$/.test(code)) return null;
  for (const f of formats) {
    const prefix = String(f.barcode_prefix || "");
    if (!prefix || !code.startsWith(prefix)) continue;
    const pluLen = Number(f.plu_digits) || 5;
    const valueLen = 12 - prefix.length - pluLen;
    if (valueLen < 3) continue;
    if (ean13CheckDigit(code.slice(0, 12)) !== Number(code[12])) continue;
    const plu = Number(code.slice(prefix.length, prefix.length + pluLen));
    const rawVal = Number(code.slice(prefix.length + pluLen, 12));
    const value = rawVal / Math.pow(10, Number(f.value_decimals) || 0);
    if (!plu || !(value > 0)) continue;
    return { scaleId: f.id, plu, value, mode: f.value_mode === "price" ? "price" : "weight" };
  }
  return null;
}

/** يبني باركود تجريبي للمعاينة. */
export function buildSampleScaleBarcode(f: ScaleFormat, plu: number, value: number): string | null {
  const prefix = String(f.barcode_prefix || "");
  const pluLen = Number(f.plu_digits) || 5;
  const valueLen = 12 - prefix.length - pluLen;
  if (!/^\d+$/.test(prefix) || valueLen < 3) return null;
  const v = Math.round(value * Math.pow(10, Number(f.value_decimals) || 0));
  const body = prefix + String(plu).padStart(pluLen, "0").slice(-pluLen) + String(v).padStart(valueLen, "0").slice(-valueLen);
  return body + ean13CheckDigit(body);
}
