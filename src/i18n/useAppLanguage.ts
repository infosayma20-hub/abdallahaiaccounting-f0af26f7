import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import i18n, { type AppLang, LANG_META, LANG_STORAGE_KEY, SUPPORTED_LANGS } from "./config";

/**
 * Language management hook.
 * - Persists the choice to localStorage (and, when available, to user profile).
 * - Sets `document.documentElement.lang` + `dir` so RTL/LTR flip automatically.
 */
export function useAppLanguage() {
  const { i18n: i18nInstance } = useTranslation();

  const lang = i18nInstance.language as AppLang;

  const setLang = useCallback((next: string) => {
    const lng = (SUPPORTED_LANGS as readonly string[]).includes(next) ? next : "ar";
    i18n.changeLanguage(lng);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lng);
    } catch {
      /* ignore */
    }
    const meta = LANG_META[lng as AppLang];
    document.documentElement.setAttribute("lang", lng);
    document.documentElement.setAttribute("dir", meta.dir);
  }, []);

  const currentMeta = LANG_META[lang] ?? LANG_META.ar;

  // Single entry point used by the App root to apply direction on boot.
  const applyDirection = useCallback((lng: string) => {
    const meta = LANG_META[(SUPPORTED_LANGS as readonly string[]).includes(lng) ? lng as AppLang : "ar"] ?? LANG_META.ar;
    document.documentElement.setAttribute("lang", lng);
    document.documentElement.setAttribute("dir", meta.dir);
  }, []);

  return useMemo(
    () => ({ lang, setLang, applyDirection, meta: currentMeta, languages: SUPPORTED_LANGS }),
    [lang, setLang, applyDirection, currentMeta],
  );
}

export default useAppLanguage;
