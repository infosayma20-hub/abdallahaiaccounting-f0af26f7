/**
 * db-error-toast — مُنسّق رسائل أخطاء PostgreSQL لعرضها بالواجهة.
 *
 * الهدف: تحويل استثناءات Supabase الخام (مع prefixات تقنية وأسماء دوال)
 * إلى رسائل عربية نظيفة جاهزة للعرض في toast، مع تمييز خاص لأخطاء
 * الحماية المحاسبية (قفل الفترات) لأنها سلوك متوقّع لا "كراش".
 *
 * نقطة الاستخدام الرئيسية: catch blocks في كل مسارات الكتابة على
 * transactions / vouchers / invoices / pos_orders.
 */

const FISCAL_LOCK_MARKER = "الفترة المحاسبية";

export function isFiscalPeriodLockError(err: unknown): boolean {
  const msg = extractRawMessage(err);
  return !!msg && msg.includes(FISCAL_LOCK_MARKER);
}

/**
 * يستخرج رسالة قابلة للعرض من أي شكل خطأ Supabase / Postgres / Error.
 * يقصّ الـ prefix التقني (e.g. "PostgrestError: ", "Error: ") ويزيل
 * أسطر CONTEXT/HINT اللي بتجي مع pgRST.
 */
export function formatDbError(err: unknown, fallback = "حدث خطأ غير متوقع"): string {
  const raw = extractRawMessage(err);
  const constraint = extractConstraint(err);
  if (!raw) return fallback;

  // أخطاء حماية الفترة المحاسبية — نظّفها واعرضها كما هي (هي بالعربية أصلاً).
  if (raw.includes(FISCAL_LOCK_MARKER)) {
    // اقتطع أي سطور CONTEXT/QUERY يضيفها Postgres بعد الرسالة.
    return raw.split("\n")[0].replace(/^[A-Z]+:\s*/, "").trim();
  }

  // أخطاء RLS الشائعة
  if (raw.includes("row-level security") || raw.includes("RLS")) {
    return "لا تملك صلاحية تنفيذ هذه العملية";
  }

  // اشرح الحقل المتعارض بدل رسالة تكرار عامة ومضللة.
  if (raw.includes("duplicate key") || raw.includes("23505")) {
    if (constraint.includes("idempotency") || raw.includes("idempotency")) {
      return "تم إرسال طلب الحفظ نفسه مسبقاً؛ لم يتم إنشاء قيد مالي آخر";
    }
    if (constraint.includes("voucher") || constraint.includes("receipt") || raw.includes("ref_number") || raw.includes("receipt_number")) {
      return "رقم السند مستخدم مسبقاً؛ حدّث الصفحة ليتم تخصيص رقم جديد تلقائياً";
    }
    if (constraint.includes("cheque") || raw.includes("cheque_number")) {
      return "رقم الشيك مسجل مسبقاً لنفس البنك والاتجاه";
    }
    if (constraint.includes("payment_invoice") || raw.includes("invoice_id")) {
      return "هذه الفاتورة مخصصة مسبقاً على السند نفسه";
    }
    return "تعذر الحفظ لأن إحدى البيانات الفريدة مستخدمة مسبقاً؛ لم يتم إنشاء أي قيد مكرر";
  }

  // نظّف رسائل عامة من الـ prefix الإنجليزي
  return raw.split("\n")[0].replace(/^[A-Za-z]+Error:\s*/, "").trim() || fallback;
}

function extractConstraint(err: unknown): string {
  if (!err || typeof err === "string") return "";
  const any = err as any;
  const combined = [any?.constraint, any?.details, any?.hint, any?.message]
    .filter(Boolean)
    .join(" ");
  const match = combined.match(/constraint\s+["']?([^"'\s]+)["']?/i);
  return String(any?.constraint || match?.[1] || "").toLowerCase();
}

function extractRawMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  const any = err as any;
  return (
    any?.message ||
    any?.error_description ||
    any?.error?.message ||
    any?.details ||
    ""
  );
}