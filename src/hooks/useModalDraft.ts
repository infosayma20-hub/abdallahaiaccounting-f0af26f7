/**
 * useModalDraft — مسودة تلقائية للنوافذ المنبثقة (Quick Add Modals)
 * ───────────────────────────────────────────────────────────────────
 * مخصص لـ modals تعريف العميل/المورد/المنتج (Quick Add) وغيرها:
 *   • يحفظ تلقائياً أثناء الإدخال (debounce)
 *   • يستعيد المسودة تلقائياً وبصمت عند إعادة فتح نفس الـ modal لنفس السياق
 *   • يُنظّف عند الحفظ الناجح أو "إلغاء"/"إغلاق مقصود"
 *   • معزول حسب المستخدم/الشركة/نوع الـ modal/instance scope
 *
 * يختلف عن useFormDraft:
 *   • لا يُسجَّل في draftRegistry (لا علاقة له بإغلاق التبويبات)
 *   • لا يعرض banner — الاسترجاع تلقائي وصامت (UX أنسب للـ modals الخفيفة)
 *
 * مثال:
 *   useModalDraft("quick_add_contact", form, setForm, {
 *     enabled: open,
 *     scope: [user.id, company.id, contactType, "quick-add"].join(":"),
 *     isEmpty: d => !d.name && !d.phone,
 *   });
 */
import { useEffect, useRef } from "react";

const MODAL_DRAFT_PREFIX = "amwali_modal_draft_";
const DEFAULT_DEBOUNCE = 600;

interface ModalEnvelope<T> {
  data: T;
  savedAt: number;
  version: number;
}

interface UseModalDraftOptions<T> {
  /** فعّل الحفظ — عادةً = (open && !!user) */
  enabled: boolean;
  /** زمن debounce قبل الحفظ */
  debounceMs?: number;
  /** نسخة الهيكل — يبطل المسودات القديمة عند تغيّر الشكل */
  version?: number;
  /** اعتبار النموذج فارغاً (لا يستحق الحفظ) */
  isEmpty?: (data: T) => boolean;
  /** عزل: user.id + company.id + نوع الـ modal + سياق إضافي */
  scope: string;
}

function buildKey(modalId: string, scope: string) {
  return `${MODAL_DRAFT_PREFIX}${scope}_${modalId}`;
}

function loadModalDraft<T>(modalId: string, scope: string, version: number): T | null {
  try {
    const raw = localStorage.getItem(buildKey(modalId, scope));
    if (!raw) return null;
    const env = JSON.parse(raw) as ModalEnvelope<T>;
    if (!env || env.version !== version) {
      localStorage.removeItem(buildKey(modalId, scope));
      return null;
    }
    return env.data;
  } catch {
    return null;
  }
}

function saveModalDraft<T>(modalId: string, scope: string, data: T, version: number) {
  try {
    const env: ModalEnvelope<T> = { data, savedAt: Date.now(), version };
    localStorage.setItem(buildKey(modalId, scope), JSON.stringify(env));
  } catch {
    // quota — تجاهل بصمت
  }
}

function clearModalDraftStorage(modalId: string, scope: string) {
  try {
    localStorage.removeItem(buildKey(modalId, scope));
  } catch {
    /* noop */
  }
}

export function useModalDraft<T>(
  modalId: string,
  currentValue: T,
  applyDraft: (draft: T) => void,
  options: UseModalDraftOptions<T>
) {
  const { enabled, debounceMs = DEFAULT_DEBOUNCE, version = 1, isEmpty, scope } = options;

  const restoredOnceRef = useRef(false);
  const lastOpenStateRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // عند الفتح: استرجع تلقائياً (مرة واحدة لكل دورة فتح)
  useEffect(() => {
    if (!enabled) {
      // عند الإغلاق — أعد التهيئة للسماح بالاسترجاع عند الفتح التالي
      lastOpenStateRef.current = false;
      restoredOnceRef.current = false;
      return;
    }
    // فقط عند الانتقال من مغلق -> مفتوح
    if (!lastOpenStateRef.current) {
      lastOpenStateRef.current = true;
      if (!restoredOnceRef.current) {
        const draft = loadModalDraft<T>(modalId, scope, version);
        if (draft) {
          applyDraft(draft);
        }
        restoredOnceRef.current = true;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, modalId, scope, version]);

  // حفظ تلقائي مع debounce
  useEffect(() => {
    if (!enabled) return;
    const empty = isEmpty ? isEmpty(currentValue) : false;
    if (empty) {
      clearModalDraftStorage(modalId, scope);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveModalDraft(modalId, scope, currentValue, version);
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, modalId, scope, version, currentValue, isEmpty, debounceMs]);

  /** نظّف يدوياً — استدعِها عند الحفظ الناجح أو الإلغاء المقصود */
  const clearModalDraft = () => {
    clearModalDraftStorage(modalId, scope);
    restoredOnceRef.current = false;
  };

  return { clearModalDraft };
}

export default useModalDraft;