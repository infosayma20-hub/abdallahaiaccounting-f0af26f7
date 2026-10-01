/**
 * POS-only language (independent of the back-office language).
 * Each cashier/device picks Arabic or English; stored per device.
 * Arabic stays the source of truth — unknown strings fall back to Arabic.
 */
import { useEffect, useState, useCallback } from "react";
import { POS_DICT } from "./pos-dict";

export type PosLang = "ar" | "en";
const KEY = "unify:pos-lang";
const EVT = "unify:pos-lang-change";

export function getPosLang(): PosLang {
  try { return localStorage.getItem(KEY) === "en" ? "en" : "ar"; } catch { return "ar"; }
}

export function setPosLang(l: PosLang) {
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVT, { detail: l }));
}

/** Translate an Arabic POS string to the active POS language. */
export function pt(text: string, lang: PosLang = getPosLang()): string {
  if (lang === "ar" || !text) return text;
  return POS_DICT[text.trim()] ?? text;
}

/** Pick the display name for a product/category in the active POS language. */
export function pname(row: { name?: string | null; name_en?: string | null } | null | undefined, lang: PosLang = getPosLang()): string {
  if (!row) return "";
  if (lang === "en" && row.name_en && row.name_en.trim()) return row.name_en;
  return row.name || "";
}

export function usePosLang() {
  const [lang, setLangState] = useState<PosLang>(getPosLang);
  useEffect(() => {
    const h = (e: Event) => setLangState(((e as CustomEvent).detail as PosLang) || getPosLang());
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);
  const setLang = useCallback((l: PosLang) => setPosLang(l), []);
  return {
    lang,
    setLang,
    dir: (lang === "en" ? "ltr" : "rtl") as "ltr" | "rtl",
    t: (s: string) => pt(s, lang),
    n: (row: { name?: string | null; name_en?: string | null } | null | undefined) => pname(row, lang),
  };
}
