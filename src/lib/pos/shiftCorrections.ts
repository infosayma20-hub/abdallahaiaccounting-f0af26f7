export type SplitLine = { option: string; amount: string };

/** Client-side check before sending a split; the server re-validates the same rule. */
export function validateSplit(lines: SplitLine[], orderTotal: number): string | null {
  if (lines.length < 2) return "التقسيم يحتاج طريقتين على الأقل";
  for (const l of lines) {
    if (!l.option || l.option === "card:") return "اختر طريقة الدفع لكل سطر";
    if (!(Number(l.amount) > 0)) return "كل مبلغ لازم يكون أكبر من صفر";
  }
  const sum = lines.reduce((s, l) => s + Number(l.amount), 0);
  if (Math.abs(sum - orderTotal) > 0.01) return `مجموع الدفعات (${sum}) لازم يساوي قيمة الفاتورة (${orderTotal})`;
  return null;
}
