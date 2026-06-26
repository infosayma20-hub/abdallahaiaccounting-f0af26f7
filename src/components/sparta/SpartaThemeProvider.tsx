import { useEffect, type ReactNode } from "react";
import "@/styles/sparta-theme.css";

/**
 * Applies Sparta white-label theme + swaps PWA manifest while children are mounted.
 * Restores Amwali defaults on unmount.
 */
export function SpartaThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("sparta-theme");

    // Swap manifest
    const existing = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    const previousHref = existing?.href || null;
    if (existing) existing.href = "/sparta-manifest.webmanifest";
    else {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = "/sparta-manifest.webmanifest";
      link.dataset.spartaInjected = "true";
      document.head.appendChild(link);
    }

    // Theme color meta
    let themeMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    const previousTheme = themeMeta?.content || null;
    if (!themeMeta) {
      themeMeta = document.createElement("meta");
      themeMeta.name = "theme-color";
      themeMeta.dataset.spartaInjected = "true";
      document.head.appendChild(themeMeta);
    }
    themeMeta.content = "#8B1E3F";

    const previousTitle = document.title;
    document.title = "Sparta Trade";

    return () => {
      html.classList.remove("sparta-theme");
      if (existing && previousHref) existing.href = previousHref;
      else if (existing?.dataset.spartaInjected) existing.remove();
      if (themeMeta?.dataset.spartaInjected) themeMeta.remove();
      else if (themeMeta && previousTheme) themeMeta.content = previousTheme;
      document.title = previousTitle;
    };
  }, []);

  return <div dir="rtl" lang="ar">{children}</div>;
}