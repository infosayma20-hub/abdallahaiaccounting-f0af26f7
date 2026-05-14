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
import { registerActiveDraft, unregisterActiveDraft } from "@/lib/draftRegistry";

const DRAFT_PREFIX = "amwali_draft_";
const DEBOUNCE_MS = 800;
/** افتراضياً: استرجاع تلقائي صامت للمسودات الأحدث من 30 دقيقة (تنقل بين التبويبات) */
const DEFAULT_AUTO_RESTORE_MS = 30 * 60 * 1000;

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
  /** المسار الحالي — لربط المسودة بالتبويب (يُستخدم لـ confirm عند الإغلاق) */
  routePath?: string;
  /** عزل المسودة حسب المستخدم/الشركة/التبويب/الوضع */
  scope?: string;
  /** لا تبدأ الحفظ أو عرض الاسترجاع قبل اكتمال التحميل الأساسي */
  ready?: boolean;
  /**
   * استرجاع تلقائي صامت إذا كانت المسودة أحدث من هذا العمر (بالميلي ثانية).
   * يتم تطبيقه مرة واحدة عند التحميل الأولي فقط، ولا يعرض شريط الاسترجاع.
   * مرر 0 أو undefined لتعطيله.
   */
  autoRestoreWithinMs?: number;
}

function getKey(formId: string, scope?: string) {
  return `${DRAFT_PREFIX}${scope ? `${scope}_` : ""}${formId}`;
}

function loadDraft<T>(formId: string, version: number, scope?: string): DraftEnvelope<T> | null {
  try {
    const storageKey = getKey(formId, scope);
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftEnvelope<T>;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.version !== version) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveDraft<T>(formId: string, data: T, version: number, scope?: string) {
  try {
    const envelope: DraftEnvelope<T> = { data, savedAt: Date.now(), version };
    localStorage.setItem(getKey(formId, scope), JSON.stringify(envelope));
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
  const {
    enabled = true,
    debounceMs = DEBOUNCE_MS,
    version = 1,
    isEmpty,
    routePath,
    scope,
    ready = true,
    autoRestoreWithinMs = DEFAULT_AUTO_RESTORE_MS,
  } = options;

  const [hasDraft, setHasDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const draftRef = useRef<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialCheckDoneRef = useRef(false);
  const loadedDraftOnMountRef = useRef(false);
  const skipNextUnmountSaveRef = useRef(false);
  const storageKey = getKey(formId, scope);

  // عند التحميل الأولي: تحقق من وجود مسودة
  useEffect(() => {
    if (!enabled || !ready) return;
    const existing = loadDraft<T>(formId, version, scope);
    initialCheckDoneRef.current = true;
    loadedDraftOnMountRef.current = !!existing;
    if (existing) {
      draftRef.current = existing.data;
      setDraftSavedAt(existing.savedAt);
      // Auto-restore silently for fresh drafts (e.g. tab switching).
      const age = Date.now() - existing.savedAt;
      if (autoRestoreWithinMs && age <= autoRestoreWithinMs) {
        try {
          applyDraft(existing.data);
        } catch { /* noop */ }
        loadedDraftOnMountRef.current = false;
        setHasDraft(false);
      } else {
        setHasDraft(true);
      }
    } else {
      draftRef.current = null;
      setDraftSavedAt(null);
      setHasDraft(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId, enabled, version, scope, ready]);

  // حفظ تلقائي عند تغيّر القيمة (مع debounce)
  useEffect(() => {
    if (!enabled || !ready || !initialCheckDoneRef.current) return;
    const empty = isEmpty ? isEmpty(currentValue) : false;
    if (empty) {
      if (loadedDraftOnMountRef.current && draftRef.current) {
        return;
      }
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // noop
      }
      loadedDraftOnMountRef.current = false;
      draftRef.current = null;
      setHasDraft(false);
      setDraftSavedAt(null);
      if (routePath) unregisterActiveDraft(routePath);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveDraft(formId, currentValue, version, scope);
      loadedDraftOnMountRef.current = false;
      draftRef.current = currentValue;
      setDraftSavedAt(Date.now());
      if (routePath) registerActiveDraft(routePath, formId, storageKey);
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [formId, currentValue, enabled, debounceMs, version, isEmpty, routePath, scope, ready, storageKey]);

  // ⚠️ حفظ فوري عند unmount (التنقل بين تبويبات SPA)
  // beforeunload لا يُطلَق عند تنقل React Router، لذلك نستخدم cleanup منفصل
  // يحفظ آخر قيمة معروفة قبل اختفاء الصفحة.
  // نستخدم ref لتتبع آخر قيمة لتجنب dependency على currentValue.
  const latestValueRef = useRef<T>(currentValue);
  useEffect(() => {
    latestValueRef.current = currentValue;
    if (skipNextUnmountSaveRef.current) {
      skipNextUnmountSaveRef.current = false;
    }
  }, [currentValue]);

  useEffect(() => {
    return () => {
      if (!enabled) return;
      if (skipNextUnmountSaveRef.current) return;
      const value = latestValueRef.current;
      if (isEmpty && isEmpty(value)) return;
      // اكتب فوراً بدون debounce — نحن نُغادر الصفحة الآن
      saveDraft(formId, value, version, scope);
      if (routePath) registerActiveDraft(routePath, formId, getKey(formId, scope));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, formId, version, scope, routePath]);

  // حفظ فوري قبل إغلاق الصفحة
  useEffect(() => {
    if (!enabled || !ready) return;
    const handler = () => {
      if (skipNextUnmountSaveRef.current) return;
      if (isEmpty && isEmpty(currentValue)) return;
      saveDraft(formId, currentValue, version, scope);
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [formId, currentValue, enabled, version, isEmpty, scope, ready]);

  const restoreDraft = useCallback(() => {
    if (draftRef.current) {
      loadedDraftOnMountRef.current = false;
      applyDraft(draftRef.current);
      setHasDraft(false);
    }
  }, [applyDraft]);

  const clearDraft = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    skipNextUnmountSaveRef.current = true;
    try {
      localStorage.removeItem(storageKey);
    } catch { /* noop */ }
    loadedDraftOnMountRef.current = false;
    draftRef.current = null;
    setHasDraft(false);
    setDraftSavedAt(null);
    if (routePath) unregisterActiveDraft(routePath);
  }, [routePath, storageKey]);

  return { hasDraft, restoreDraft, clearDraft, draftSavedAt };
}

export default useFormDraft;