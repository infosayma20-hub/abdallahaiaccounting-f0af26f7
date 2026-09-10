import { Languages, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import useAppLanguage from "./useAppLanguage";
import { LANG_META, type AppLang } from "./config";
import { useState, useRef, useEffect } from "react";

/**
 * Language switcher dropdown (AR / EN / HE).
 * Dark-friendly: white icon + translucent hover like the rest of TopBar.
 */
export default function LanguageSwitcher({
  variant = "icon",
}: {
  variant?: "icon" | "menu" | "labeled";
}) {
  const { t } = useTranslation();
  const { lang, setLang } = useAppLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const pick = (lng: string) => {
    setLang(lng);
    setOpen(false);
  };

  if (variant === "menu") {
    return (
      <div className="space-y-0.5">
        {(["ar", "en", "he"] as AppLang[]).map((lng) => (
          <button
            key={lng}
            onClick={() => pick(lng)}
            className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-muted"
            style={{ fontWeight: lang === lng ? 700 : 500 }}
          >
            <span>{LANG_META[lng].flag}</span>
            <span>{LANG_META[lng].nativeLabel}</span>
            {lang === lng && <span className="mr-auto text-accent">✓</span>}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      {variant === "labeled" ? (
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm transition-all hover:bg-white/[0.12] cursor-pointer"
          style={{ color: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.30)" }}
          title={t("common:lang.change")}
          aria-label={t("common:lang.change")}
        >
          <Languages className="h-4 w-4" />
          <span style={{ fontWeight: 400 }}>{LANG_META[lang].nativeLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </button>
      ) : (
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-lg transition-all hover:bg-white/[0.08] cursor-pointer"
        title={t("common:lang.change")}
        aria-label={t("common:lang.change")}
      >
        <Languages className="h-5 w-5" style={{ color: "rgba(255,255,255,0.7)" }} />
      </button>
      )}
      {open && (
        <div
          dir="rtl"
          className="absolute top-full right-0 mt-1.5 w-44 overflow-hidden rounded-xl border bg-background/95 p-1 shadow-xl backdrop-blur"
          style={{ zIndex: 1000 }}
        >
          {(["ar", "en", "he"] as AppLang[]).map((lng) => (
            <button
              key={lng}
              onClick={() => pick(lng)}
              className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-muted"
              style={{ fontWeight: lang === lng ? 700 : 500 }}
            >
              <span>{LANG_META[lng].flag}</span>
              <span>{LANG_META[lng].nativeLabel}</span>
              <span className="text-[10px] text-muted-foreground ml-auto" dir="ltr">{lng.toUpperCase()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
