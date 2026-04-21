import { useState } from "react";
import { Check, X, Edit3, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

export interface ParsedTransaction {
  type: string;
  invoiceType?: string;
  status?: string;
  contactName?: string;
  productName?: string;
  items?: { name: string; quantity?: number; unitPrice?: number; total?: number }[];
  quantity?: number;
  unitPrice?: number;
  total?: number;
  paymentMethod?: string;
  description?: string;
  confirmationMessage?: string;
  missingFields?: string[];
  amount?: number | string;
  debit?: string;
  credit?: string;
  chequeType?: string;
  partyName?: string;
  // entity fields
  entityType?: string;
  name?: string;
  // state
  _status?: "pending" | "confirmed" | "skipped" | "processing";
  _editAmount?: string;
}

interface Props {
  transactions: ParsedTransaction[];
  onConfirm: (tx: ParsedTransaction, index: number) => Promise<{ success: boolean; message: string }>;
  onConfirmAll: (txs: ParsedTransaction[]) => Promise<void>;
  onSkip: (index: number) => void;
  onDone: () => void;
}

const getTypeLabel = (tx: ParsedTransaction) => {
  if (tx.type === "invoice") return tx.invoiceType === "sales" ? "فاتورة مبيعات" : "فاتورة مشتريات";
  if (tx.type === "transaction") return "سند مالي";
  if (tx.type === "cheque") return `شيك ${tx.chequeType || ""}`;
  if (tx.type === "add_entity") return `إضافة ${tx.entityType === "contact" ? "جهة" : tx.entityType === "employee" ? "موظف" : tx.entityType === "product" ? "منتج" : "حساب"}`;
  return "معاملة";
};

const getTypeIcon = (tx: ParsedTransaction) => {
  if (tx.type === "invoice") return tx.invoiceType === "sales" ? "💰" : "🛒";
  if (tx.type === "transaction") return "📋";
  if (tx.type === "cheque") return "🧾";
  if (tx.type === "add_entity") return "➕";
  return "📄";
};

const getPartyName = (tx: ParsedTransaction) => tx.contactName || tx.partyName || tx.name || "";
const getAmount = (tx: ParsedTransaction) => tx.total || tx.amount || 0;

const getPaymentLabel = (method?: string) => {
  if (!method) return "غير محدد";
  const map: Record<string, string> = { "نقد": "نقداً", "آجل": "بالآجل (ذمم)", "شيك": "بشيك", "تحويل": "تحويل بنكي" };
  return map[method] || method;
};

export default function MultiTransactionCards({ transactions: initial, onConfirm, onConfirmAll, onSkip, onDone }: Props) {
  const [txList, setTxList] = useState<ParsedTransaction[]>(
    initial.map(tx => ({ ...tx, _status: "pending" as const, _editAmount: "" }))
  );
  const [editing, setEditing] = useState<number | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [results, setResults] = useState<{ index: number; success: boolean; message: string }[]>([]);

  const pendingCount = txList.filter(t => t._status === "pending").length;
  const confirmedCount = txList.filter(t => t._status === "confirmed").length;
  const allDone = pendingCount === 0;

  const handleConfirm = async (index: number) => {
    const tx = txList[index];
    if (!getAmount(tx) && tx.type === "invoice" && !tx._editAmount) {
      // Shake animation handled via CSS
      return;
    }

    setTxList(prev => prev.map((t, i) => i === index ? { ...t, _status: "processing" } : t));
    const finalTx = tx._editAmount ? { ...tx, total: Number(tx._editAmount), amount: Number(tx._editAmount) } : tx;
    let result: { success: boolean; message: string };
    try {
      result = await onConfirm(finalTx, index);
    } catch (err: any) {
      // ⚠️ منع تعطّل تأكيد الكل: نلتقط أي استثناء ونعيد عنصراً فاشلاً بدلاً من رميه
      result = { success: false, message: `❌ ${err?.message || "خطأ غير متوقع"}` };
    }
    setResults(prev => [...prev, { index, ...result }]);
    setTxList(prev => prev.map((t, i) => i === index ? { ...t, _status: result.success ? "confirmed" : "pending" } : t));
  };

  const handleSkip = (index: number) => {
    setTxList(prev => prev.map((t, i) => i === index ? { ...t, _status: "skipped" } : t));
    onSkip(index);
  };

  /**
   * تأكيد الكل (Confirm All) — معالجة ذرية لكل بند:
   * - نلتقط snapshot للبنود المعلقة فقط
   * - كل بند يُعالج باستقلال داخل try/catch منفصل (لا يُسقط الباقي عند فشل)
   * - نتائج لكل بند تُجمع محلياً ثم تُحفظ دفعة واحدة لتجنب stale state
   * - بعد الانتهاء نُمرّر للـ parent فقط البنود التي نجحت فعلاً
   */
  const handleConfirmAll = async () => {
    if (bulkProcessing) return; // حماية من النقر المزدوج (Idempotency)
    setBulkProcessing(true);

    // snapshot ثابت من البنود المعلقة (لا يتأثر بتغير txList خلال اللوب)
    const pending = txList
      .map((t, i) => ({ tx: t, index: i }))
      .filter(({ tx }) => tx._status === "pending");

    const localResults: { index: number; success: boolean; message: string }[] = [];
    const confirmedTxs: ParsedTransaction[] = [];

    for (const { tx, index } of pending) {
      // علّم البند كـ "قيد المعالجة"
      setTxList(prev => prev.map((t, i) => i === index ? { ...t, _status: "processing" } : t));

      const finalTx = tx._editAmount
        ? { ...tx, total: Number(tx._editAmount), amount: Number(tx._editAmount) }
        : tx;

      let result: { success: boolean; message: string };
      try {
        result = await onConfirm(finalTx, index);
      } catch (err: any) {
        // 🔥 الإصلاح الحرج: لا نسمح للاستثناء بإيقاف اللوب
        // قبل هذا الإصلاح، كان throw من onConfirm يكسر الـ for-loop
        // وتبقى البنود التالية بدون معالجة
        result = { success: false, message: `❌ ${err?.message || "فشل غير متوقع"}` };
      }

      localResults.push({ index, ...result });
      if (result.success) confirmedTxs.push(finalTx);

      // تحديث حالة هذا البند فقط
      setTxList(prev => prev.map((t, i) =>
        i === index ? { ...t, _status: result.success ? "confirmed" : "pending" } : t
      ));
    }

    // دفع كل النتائج المتراكمة محلياً (تجنب stale closures)
    setResults(prev => [...prev, ...localResults]);
    setBulkProcessing(false);

    // تمرير البنود الناجحة فعلاً (محسوبة من localResults وليس من txList stale)
    try {
      await onConfirmAll(confirmedTxs);
    } catch {
      /* تجاهل أخطاء الـ callback النهائي — البنود نفسها مُعالجة بالفعل */
    }

    // ملخّص خفيف للمستخدم
    const okCount = localResults.filter(r => r.success).length;
    const failCount = localResults.length - okCount;
    if (failCount > 0 && typeof window !== "undefined") {
      console.warn(`[ConfirmAll] ${okCount}/${localResults.length} تم — ${failCount} فشل(ت)`);
    }
  };

  const updateAmount = (index: number, val: string) => {
    setTxList(prev => prev.map((t, i) => i === index ? { ...t, _editAmount: val } : t));
  };

  // Summary view after all done
  if (allDone) {
    return (
      <div className="space-y-2" dir="rtl">
        <div className="rounded-xl p-4" style={{ background: "hsl(var(--accent) / 0.08)", border: "1px solid hsl(var(--accent) / 0.2)" }}>
          <p className="text-sm font-semibold mb-3" style={{ color: "hsl(var(--foreground))" }}>
            ✓ تم تسجيل المعاملات بنجاح
          </p>
          <div className="space-y-1.5">
            {txList.map((tx, i) => (
              <div key={i} className="flex items-center gap-2 text-xs" style={{ color: tx._status === "skipped" ? "hsl(var(--muted-foreground))" : "hsl(var(--foreground))" }}>
                <span>{tx._status === "skipped" ? "─" : "✓"}</span>
                <span style={{ textDecoration: tx._status === "skipped" ? "line-through" : "none" }}>
                  {getTypeIcon(tx)} {getTypeLabel(tx)} — {getPartyName(tx)}
                  {results.find(r => r.index === i)?.message ? ` ${results.find(r => r.index === i)?.message}` : ""}
                </span>
              </div>
            ))}
          </div>
          {txList.some(t => t._status === "skipped") && (
            <p className="text-[11px] mt-2" style={{ color: "hsl(var(--muted-foreground))" }}>
              ─ تم تخطّي: {txList.filter(t => t._status === "skipped").length}
            </p>
          )}
        </div>
        <button
          onClick={onDone}
          className="w-full py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-[0.98]"
          style={{ background: "hsl(var(--primary))", color: "white" }}
        >
          تم ✓
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3" dir="rtl">
      {/* Header */}
      <div className="rounded-xl p-3" style={{ background: "hsl(var(--info) / 0.06)", border: "1px solid hsl(var(--info) / 0.15)" }}>
        <p className="text-xs font-semibold" style={{ color: "hsl(var(--foreground))" }}>
          🔍 وجدت {txList.length} معاملات في تسجيلك
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
          راجعها وأكد كل واحدة على حدة
          {confirmedCount > 0 && ` • تم تأكيد ${confirmedCount} من ${txList.length}`}
        </p>
      </div>

      {/* Transaction Cards */}
      {txList.map((tx, i) => {
        const isProcessing = tx._status === "processing";
        const isConfirmed = tx._status === "confirmed";
        const isSkipped = tx._status === "skipped";
        const isPending = tx._status === "pending";
        const isEditing = editing === i;
        const amount = getAmount(tx);
        const hasAmount = !!amount || !!tx._editAmount;

        return (
          <div
            key={i}
            className="rounded-xl overflow-hidden transition-all"
            style={{
              border: isConfirmed ? "1.5px solid hsl(var(--accent))" : isSkipped ? "1px solid hsl(var(--border))" : "1px solid hsl(var(--border))",
              opacity: isSkipped ? 0.5 : 1,
              background: isConfirmed ? "hsl(var(--accent) / 0.04)" : "hsl(var(--card))",
            }}
          >
            {/* Card header */}
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid hsl(var(--border) / 0.5)" }}>
              <span className="text-[11px] font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
                {i + 1} من {txList.length}
              </span>
              {isConfirmed && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "hsl(var(--accent) / 0.1)", color: "hsl(var(--accent))" }}>✓ تم التأكيد</span>}
              {isSkipped && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>تم تخطّيها</span>}
              {isProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "hsl(var(--accent))" }} />}
            </div>

            {/* Card body */}
            <div className="px-3 py-2.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-lg">{getTypeIcon(tx)}</span>
                <span className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))", textDecoration: isSkipped ? "line-through" : "none" }}>
                  {getTypeLabel(tx)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1 text-[12px]">
                {getPartyName(tx) && (
                  <div>
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>{tx.invoiceType === "purchase" ? "المورد" : "الزبون"}: </span>
                    <span style={{ color: "hsl(var(--foreground))", fontWeight: 500 }}>{getPartyName(tx)}</span>
                  </div>
                )}
                {tx.items ? (
                  <div className="col-span-2">
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>الأصناف: </span>
                    <span style={{ color: "hsl(var(--foreground))" }}>
                      {tx.items.map(it => `${it.name}${it.total ? ` ₪${it.total}` : ""}`).join(" + ")}
                    </span>
                  </div>
                ) : tx.productName ? (
                  <div>
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>البيان: </span>
                    <span style={{ color: "hsl(var(--foreground))" }}>{tx.quantity ? `${tx.quantity} ` : ""}{tx.productName}</span>
                  </div>
                ) : tx.description ? (
                  <div className="col-span-2">
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>البيان: </span>
                    <span style={{ color: "hsl(var(--foreground))" }}>{tx.description}</span>
                  </div>
                ) : null}

                {/* Amount - editable if missing */}
                <div>
                  <span style={{ color: "hsl(var(--muted-foreground))" }}>المبلغ: </span>
                  {hasAmount ? (
                    <span style={{ color: "hsl(var(--accent))", fontWeight: 600 }}>
                      ₪{tx._editAmount || amount}
                    </span>
                  ) : (
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="أدخل المبلغ"
                      value={tx._editAmount || ""}
                      onChange={e => updateAmount(i, e.target.value)}
                      className="inline-block w-20 px-1.5 py-0.5 rounded text-xs border outline-none"
                      style={{
                        borderColor: "hsl(var(--border))",
                        fontSize: "12px",
                        color: "hsl(var(--foreground))",
                        background: "hsl(var(--muted) / 0.3)",
                      }}
                    />
                  )}
                </div>

                {tx.paymentMethod && (
                  <div>
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>الدفع: </span>
                    <span style={{ color: "hsl(var(--foreground))" }}>{getPaymentLabel(tx.paymentMethod)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Card actions */}
            {isPending && (
              <div className="flex items-center border-t px-2 py-1.5 gap-1" style={{ borderColor: "hsl(var(--border) / 0.5)" }}>
                <button
                  onClick={() => handleConfirm(i)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-95"
                  style={{ background: "hsl(var(--accent) / 0.1)", color: "hsl(var(--accent))" }}
                >
                  <Check className="h-3.5 w-3.5" /> تأكيد
                </button>
                <button
                  onClick={() => setEditing(isEditing ? null : i)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] transition-all active:scale-95"
                  style={{ background: "hsl(var(--muted) / 0.5)", color: "hsl(var(--foreground))" }}
                >
                  <Edit3 className="h-3 w-3" /> تعديل
                </button>
                <button
                  onClick={() => handleSkip(i)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] transition-all active:scale-95 mr-auto"
                  style={{ color: "hsl(var(--destructive))" }}
                >
                  <X className="h-3.5 w-3.5" /> تخطّي
                </button>
              </div>
            )}

            {/* Inline edit */}
            {isEditing && isPending && (
              <div className="px-3 pb-2.5 space-y-2 border-t pt-2" style={{ borderColor: "hsl(var(--border) / 0.5)" }}>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] block mb-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>المبلغ</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={tx._editAmount || getAmount(tx) || ""}
                      onChange={e => updateAmount(i, e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg text-xs border outline-none"
                      style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))", background: "hsl(var(--background))", fontSize: "14px" }}
                    />
                  </div>
                </div>
                <button
                  onClick={() => setEditing(null)}
                  className="text-[11px] px-3 py-1 rounded-lg"
                  style={{ background: "hsl(var(--primary))", color: "white" }}
                >
                  حفظ التعديل
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Bulk confirm */}
      {pendingCount > 1 && (
        <button
          onClick={handleConfirmAll}
          disabled={bulkProcessing}
          className="w-full py-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
          style={{ background: "hsl(var(--primary))", color: "white" }}
        >
          {bulkProcessing ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> جاري الحفظ...</>
          ) : (
            <>✓ تأكيد الكل دفعة وحدة ({pendingCount})</>
          )}
        </button>
      )}
    </div>
  );
}
