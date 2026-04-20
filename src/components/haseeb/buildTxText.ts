import type { ParsedTransaction } from "./MultiTransactionCards";

/**
 * يبني نصاً وصفياً موسعاً لإعادة إرساله إلى process-transaction.
 * يضمن وصول المبلغ والزبون وطريقة الدفع — بدلاً من الاعتماد على الوصف القصير
 * الذي قد لا يحوي مبلغاً (وبالتالي يُرفض من حماية المبالغ الصفرية).
 */
export function buildTxText(tx: ParsedTransaction): string {
  const parts: string[] = [];
  const amount = Number(tx._editAmount || tx.total || tx.amount || 0);

  if (tx.type === "invoice") {
    parts.push(tx.invoiceType === "purchase" ? "فاتورة مشتريات" : "فاتورة مبيعات");
    if (tx.contactName) parts.push(`من ${tx.contactName}`);
    if (tx.items && tx.items.length > 0) {
      const itemsText = tx.items
        .map((it) => `${it.name}${it.quantity ? ` ×${it.quantity}` : ""}${it.unitPrice ? ` بسعر ${it.unitPrice}` : ""}`)
        .join(", ");
      parts.push(itemsText);
    } else if (tx.productName) {
      parts.push(tx.productName);
    } else if (tx.description) {
      parts.push(tx.description);
    }
    if (amount > 0) parts.push(`بمبلغ ${amount} شيكل`);
    if (tx.paymentMethod) {
      const map: Record<string, string> = { "نقد": "نقداً", "آجل": "بالآجل", "شيك": "بشيك", "تحويل": "تحويل بنكي" };
      parts.push(map[tx.paymentMethod] || tx.paymentMethod);
    }
  } else if (tx.type === "transaction") {
    parts.push(tx.description || "سند مالي");
    if (amount > 0 && !/\d/.test(tx.description || "")) parts.push(`بمبلغ ${amount} شيكل`);
  } else if (tx.type === "cheque") {
    parts.push(`شيك ${tx.chequeType || ""}`);
    if (tx.partyName) parts.push(`من ${tx.partyName}`);
    if (amount > 0) parts.push(`بمبلغ ${amount} شيكل`);
  } else if (tx.type === "add_entity") {
    parts.push(tx.description || `إضافة ${tx.name || ""}`);
  } else if (tx.description) {
    parts.push(tx.description);
    if (amount > 0 && !/\d/.test(tx.description)) parts.push(`بمبلغ ${amount} شيكل`);
  }

  return parts.filter(Boolean).join(" ").trim();
}

/**
 * يفحص نتيجة process-transaction ويعيد success فعلي.
 * الدالة تعيد أحياناً HTTP 200 مع type:'chat_response' (مثلاً عند رفض المبلغ الصفري)
 * — في هذه الحالة لم تُسجَّل أي معاملة وبالتالي يجب اعتبارها فشل.
 */
export function isTxResultSuccess(result: any): { success: boolean; message: string } {
  if (!result) return { success: false, message: "❌ لا توجد استجابة" };
  if (result.type === "chat_response") {
    return { success: false, message: `⚠️ ${result.message || "لم يتم التسجيل"}` };
  }
  if (result.success === false) {
    return { success: false, message: `❌ ${result.message || result.edit_response?.message || "فشل التسجيل"}` };
  }
  return { success: true, message: "✅ تم التسجيل" };
}
