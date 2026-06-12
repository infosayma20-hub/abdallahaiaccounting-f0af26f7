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

  // duplicate key
  if (raw.includes("duplicate key") || raw.includes("23505")) {
    return "هذا السجل موجود مسبقاً (تكرار غير مسموح)";
  }

  // نظّف رسائل عامة من الـ prefix الإنجليزي
  return raw.split("\n")[0].replace(/^[A-Za-z]+Error:\s*/, "").trim() || fallback;
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