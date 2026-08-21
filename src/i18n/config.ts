/**
 * Unify ERP — i18n infrastructure
 * Languages: ar (default, RTL) | en (LTR) | he (RTL)
 *
 * Arabic remains the source of truth; en/he fall back to ar when a key
 * is missing so no screen can ever render a raw key.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import ar from "./locales/ar";
import en from "./locales/en";
import he from "./locales/he";

export const SUPPORTED_LANGS = ["ar", "en", "he"] as const;
export type AppLang = (typeof SUPPORTED_LANGS)[number];

export const LANG_META: Record<AppLang, { label: string; nativeLabel: string; dir: "rtl" | "ltr"; flag: string }> = {
  ar: { label: "Arabic", nativeLabel: "العربية", dir: "rtl", flag: "🇵🇸" },
  en: { label: "English", nativeLabel: "English", dir: "ltr", flag: "🇬🇧" },
  he: { label: "Hebrew", nativeLabel: "עברית", dir: "rtl", flag: "🇮🇱" },
};

export const LANG_STORAGE_KEY = "unify:lang";

export function readStoredLang(): AppLang {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored && (SUPPORTED_LANGS as readonly string[]).includes(stored)) return stored as AppLang;
  } catch {
    /* storage blocked — fall through to default */
  }
  return "ar";
}

i18n.use(initReactI18next).init({
  resources: { ar, en, he },
  lng: readStoredLang(),
  fallbackLng: "ar",
  defaultNS: "common",
  ns: ["common"],
  interpolation: { escapeValue: false },
  returnEmptyString: false,
  react: { useSuspense: false },
});

export default i18n;
