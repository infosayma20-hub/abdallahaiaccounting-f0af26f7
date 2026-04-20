/**
 * useFormDraft — حفظ تلقائي لمسودة النموذج في localStorage
 * ────────────────────────────────────────────────────────────
 * يحمي من فقدان البيانات عند:
 *   • التنقل لتبويب آخر ثم العودة (unmount/remount)
 *   • إغلاق المتصفح بالخطأ
 *   • انقطاع الإنترنت قبل الحفظ
 *
 * الاستخدام:
 *   const { hasDraft, restoreDraft, clearDraft, draftSavedAt } =
 *     useFormDraft("invoice_new", form, setForm, { enabled: !isEditMode });
 *
 *   // عند نجاح الحفظ في DB:
 *   clearDraft();
 *
 *   // عند فتح الصفحة، اعرض شريط استرجاع:
 *   {hasDraft && <DraftRestoreBanner onRestore={restoreDraft} onDismiss={clearDraft} savedAt={draftSavedAt} />}
 */
import { useEffect, useRef, useState, useCallback } from "react";

const DRAFT_PREFIX = "amwali_draft_";
const DEBOUNCE_MS = 800;

interface DraftEnvelope<T> {
  data: T;
  savedAt: number;
  version: number;
}

interface UseFormDraftOptions {
  /** عطّل الحفظ التلقائي (مثلاً في وضع التعديل) */
  enabled?: boolean;
  /** زمن debounce قبل الحفظ (ms) */
  debounceMs?: number;
  /** رقم نسخة هيكل البيانات — يبطل المسودات القديمة عند تغيّر الشكل */
  version?: number;
  /** هل يجب اعتبار هذا الـ form فارغاً (لا يستحق الحفظ)؟ */
  isEmpty?: (data: any) => boolean;
}

function getKey(formId: string) {
  return `${DRAFT_PREFIX}${formId}`;
}

function loadDraft<T>(formId: string, version: number): DraftEnvelope<T> | null {
  try {
    const raw = localStorage.getItem(getKey(formId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftEnvelope<T>;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.version !== version) {
      // هيكل قديم — احذفه
      localStorage.removeItem(getKey(formId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveDraft<T>(formId: string, data: T, version: number) {
  try {
    const envelope: DraftEnvelope<T> = { data, savedAt: Date.now(), version };
    localStorage.setItem(getKey(formId), JSON.stringify(envelope));
  } catch {
    // QuotaExceeded أو أي خطأ — تجاهل بصمت
  }
}

export function useFormDraft<T>(
  formId: string,
  currentValue: T,
  applyDraft: (draft: T) => void,
  options: UseFormDraftOptions = {}
) {
  const { enabled = true, debounceMs = DEBOUNCE_MS, version = 1, isEmpty } = options;

  const [hasDraft, setHasDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const draftRef = useRef<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissedRef = useRef(false);

  // عند التحميل الأولي: تحقق من وجود مسودة
  useEffect(() => {
    if (!enabled) return;
    const existing = loadDraft<T>(formId, version);
    if (existing) {
      draftRef.current = existing.data;
      setDraftSavedAt(existing.savedAt);
      setHasDraft(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId, enabled, version]);

  // حفظ تلقائي عند تغيّر القيمة (مع debounce)
  useEffect(() => {
    if (!enabled) return;
    if (isEmpty && isEmpty(currentValue)) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveDraft(formId, currentValue, version);
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [formId, currentValue, enabled, debounceMs, version, isEmpty]);

  // حفظ فوري قبل إغلاق الصفحة
  useEffect(() => {
    if (!enabled) return;
    const handler = () => {
      if (isEmpty && isEmpty(currentValue)) return;
      saveDraft(formId, currentValue, version);
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [formId, currentValue, enabled, version, isEmpty]);

  const restoreDraft = useCallback(() => {
    if (draftRef.current) {
      applyDraft(draftRef.current);
      setHasDraft(false);
    }
  }, [applyDraft]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(getKey(formId));
    } catch { /* noop */ }
    draftRef.current = null;
    dismissedRef.current = true;
    setHasDraft(false);
    setDraftSavedAt(null);
  }, [formId]);

  return { hasDraft, restoreDraft, clearDraft, draftSavedAt };
}

export default useFormDraft;