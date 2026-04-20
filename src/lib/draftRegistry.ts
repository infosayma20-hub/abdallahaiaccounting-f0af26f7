/**
 * draftRegistry — سجل عالمي للمسودات النشطة
 * ─────────────────────────────────────────────
 * يتتبع أي صفحة فيها مسودة محفوظة تلقائياً (لم تُحفظ في DB بعد).
 * يستخدمه TabBar لعرض confirm() عند محاولة إغلاق تبويب فيه عمل غير محفوظ.
 *
 * يُسجَّل تلقائياً من داخل useFormDraft عند بدء الكتابة،
 * ويُلغى تلقائياً عند clearDraft() أو unmount.
 */
const activeDrafts = new Map<string, { formId: string; savedAt: number }>();

export function registerActiveDraft(path: string, formId: string) {
  activeDrafts.set(path, { formId, savedAt: Date.now() });
}

export function unregisterActiveDraft(path: string) {
  activeDrafts.delete(path);
}

export function hasActiveDraft(path: string): boolean {
  return activeDrafts.has(path);
}

export function getActiveDraft(path: string) {
  return activeDrafts.get(path) || null;
}

/** يُستخدم من قبل TabBar/TabsContext للسؤال قبل الإغلاق */
export function confirmCloseIfDraft(path: string, message?: string): boolean {
  if (!hasActiveDraft(path)) return true;
  const msg = message || "يوجد بيانات غير محفوظة في هذه الصفحة.\nهل تريد إغلاقها وفقدان التغييرات؟";
  // eslint-disable-next-line no-alert
  return window.confirm(msg);
}
