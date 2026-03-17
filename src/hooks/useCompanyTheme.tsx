import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ThemeColors, DEFAULT_THEME, applyThemeToDOM, clearThemeFromDOM } from "@/lib/color-utils";

interface CompanyThemeContextValue {
  theme: ThemeColors;
  logoPalette: string[];
  loading: boolean;
  updateTheme: (colors: ThemeColors) => Promise<void>;
  updatePalette: (palette: string[]) => Promise<void>;
  resetTheme: () => Promise<void>;
}

const CompanyThemeContext = createContext<CompanyThemeContextValue>({
  theme: DEFAULT_THEME,
  logoPalette: [],
  loading: true,
  updateTheme: async () => {},
  updatePalette: async () => {},
  resetTheme: async () => {},
});

export function CompanyThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [theme, setTheme] = useState<ThemeColors>(DEFAULT_THEME);
  const [logoPalette, setLogoPalette] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const userId = user?.id;

  // Load theme on mount
  useEffect(() => {
    if (!userId) {
      clearThemeFromDOM();
      setTheme(DEFAULT_THEME);
      setLoading(false);
      return;
    }

    const loadTheme = async () => {
      try {
        const { data } = await supabase
          .from("company_themes" as any)
          .select("theme_colors, logo_extracted_palette")
          .eq("user_id", userId)
          .maybeSingle();

        if (data) {
          const colors = (data as any).theme_colors as ThemeColors;
          const palette = ((data as any).logo_extracted_palette || []) as string[];
          setTheme(colors);
          setLogoPalette(palette);
          applyThemeToDOM(colors);
        }
      } catch {
        // No theme saved, use defaults
      } finally {
        setLoading(false);
      }
    };

    loadTheme();
  }, [userId]);

  const updateTheme = useCallback(async (colors: ThemeColors) => {
    if (!user) return;
    setTheme(colors);
    applyThemeToDOM(colors);

    await supabase
      .from("company_themes" as any)
      .upsert({
        user_id: user.id,
        theme_colors: colors,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "user_id" });
  }, [user]);

  const updatePalette = useCallback(async (palette: string[]) => {
    if (!user) return;
    setLogoPalette(palette);

    await supabase
      .from("company_themes" as any)
      .upsert({
        user_id: user.id,
        logo_extracted_palette: palette,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "user_id" });
  }, [user]);

  const resetTheme = useCallback(async () => {
    if (!user) return;
    setTheme(DEFAULT_THEME);
    clearThemeFromDOM();

    await supabase
      .from("company_themes" as any)
      .upsert({
        user_id: user.id,
        theme_colors: DEFAULT_THEME,
        logo_extracted_palette: [],
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "user_id" });
  }, [user]);

  return (
    <CompanyThemeContext.Provider value={{ theme, logoPalette, loading, updateTheme, updatePalette, resetTheme }}>
      {children}
    </CompanyThemeContext.Provider>
  );
}

export function useCompanyTheme() {
  return useContext(CompanyThemeContext);
}
