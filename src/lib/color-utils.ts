// ─── Color Utility Library for Brand Theming ───

export interface AnalyzedColor {
  hex: string;
  r: number;
  g: number;
  b: number;
  h: number;
  s: number;
  l: number;
  luminance: number;
  saturation: number;
  hue: number;
}

export interface ThemeColors {
  sidebar: string;
  primary: string;
  accent: string;
  topbar: string;
  cardAccent: string;
  extractedFromLogo: boolean;
  presetName: string;
}

export const DEFAULT_THEME: ThemeColors = {
  sidebar: "#0D1B2A",
  primary: "#E8A020",
  accent: "#F45E0C",
  topbar: "#08111A",
  cardAccent: "#E8A020",
  extractedFromLogo: false,
  presetName: "classic",
};

export const THEME_PRESETS: Record<string, ThemeColors> = {
  classic: { sidebar: "#0D1B2A", primary: "#E8A020", accent: "#F45E0C", topbar: "#08111A", cardAccent: "#E8A020", extractedFromLogo: false, presetName: "classic" },
  fresh: { sidebar: "#064E3B", primary: "#10B981", accent: "#34D399", topbar: "#022C22", cardAccent: "#10B981", extractedFromLogo: false, presetName: "fresh" },
  warm: { sidebar: "#451A03", primary: "#D97706", accent: "#F59E0B", topbar: "#2D1600", cardAccent: "#D97706", extractedFromLogo: false, presetName: "warm" },
  creative: { sidebar: "#3B0764", primary: "#9333EA", accent: "#A855F7", topbar: "#1E043A", cardAccent: "#9333EA", extractedFromLogo: false, presetName: "creative" },
  professional: { sidebar: "#111827", primary: "#6B7280", accent: "#9CA3AF", topbar: "#030712", cardAccent: "#6B7280", extractedFromLogo: false, presetName: "professional" },
  bold: { sidebar: "#450A0A", primary: "#DC2626", accent: "#EF4444", topbar: "#2A0505", cardAccent: "#DC2626", extractedFromLogo: false, presetName: "bold" },
  ocean: { sidebar: "#0C4A6E", primary: "#0284C7", accent: "#38BDF8", topbar: "#082F49", cardAccent: "#0284C7", extractedFromLogo: false, presetName: "ocean" },
};

// ─── Hex ↔ RGB ↔ HSL conversions ───

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360; s /= 100; l /= 100;
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

export function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

// ─── Luminance & Contrast ───

export function getLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getTextColorForBg(bgHex: string): string {
  return getContrastRatio("#FFFFFF", bgHex) >= 4.5 ? "#FFFFFF" : "#0A0A0A";
}

// ─── Color manipulation ───

export function darkenColor(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, Math.max(0, l - l * amount));
}

export function lightenColor(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.max(0, s - s * amount * 0.5), Math.min(100, l + (100 - l) * amount));
}

export function boostSaturation(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.min(100, s + (100 - s) * amount), l);
}

// ─── Analyze a hex color ───

export function analyzeColor(hex: string): AnalyzedColor {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  return { hex, r, g, b, h, s, l, luminance: getLuminance(hex), saturation: s / 100, hue: h };
}

// ─── Extract colors from an image URL ───

export async function extractColorsFromLogo(imageUrl: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve([]); return; }

        const maxDim = 100;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);

        const imageData = ctx.getImageData(0, 0, w, h).data;
        const colorMap: Record<string, number> = {};

        for (let i = 0; i < imageData.length; i += 16) {
          const r = imageData[i], g = imageData[i + 1], b = imageData[i + 2], a = imageData[i + 3];
          if (a < 128) continue;
          if (r > 240 && g > 240 && b > 240) continue;
          if (r < 15 && g < 15 && b < 15) continue;

          const key = `${Math.round(r / 20) * 20},${Math.round(g / 20) * 20},${Math.round(b / 20) * 20}`;
          colorMap[key] = (colorMap[key] || 0) + 1;
        }

        const sorted = Object.entries(colorMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([key]) => {
            const [r, g, b] = key.split(",").map(Number);
            return rgbToHex(r, g, b);
          });

        resolve(sorted);
      } catch {
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = imageUrl;
  });
}

// ─── Assign color roles from extracted palette ───

export function assignColorRoles(extractedColors: string[]): ThemeColors {
  if (!extractedColors.length) return DEFAULT_THEME;

  const analyzed = extractedColors.map(analyzeColor);

  // Primary: medium saturation, medium luminance
  const primary = analyzed.find((c) => c.saturation > 0.3 && c.luminance > 0.05 && c.luminance < 0.65) || analyzed[0];

  // Sidebar: darkened version of primary
  const sidebarHex = darkenColor(primary.hex, 0.6);

  // Topbar: even darker
  const topbarHex = darkenColor(primary.hex, 0.75);

  // Accent: different hue or most saturated
  const accent = analyzed.find((c) => c.hex !== primary.hex && Math.abs(c.hue - primary.hue) > 30)
    || (analyzed.length > 1 ? analyzed[1] : null);
  const accentHex = accent ? accent.hex : lightenColor(primary.hex, 0.3);

  // Card accent
  const cardAccentHex = primary.hex;

  return {
    sidebar: sidebarHex,
    primary: primary.hex,
    accent: accentHex,
    topbar: topbarHex,
    cardAccent: cardAccentHex,
    extractedFromLogo: true,
    presetName: "custom",
  };
}

// ─── Ensure accessibility ───

export function ensureAccessibility(colors: ThemeColors): ThemeColors {
  const result = { ...colors };
  const primaryLum = getLuminance(result.primary);

  if (primaryLum > 0.7) {
    result.primary = darkenColor(result.primary, 0.5);
  }

  const [h, s] = hexToHsl(result.primary);
  if (s < 15) {
    result.primary = boostSaturation(result.primary, 0.4);
  }

  return result;
}

// ─── Convert hex to HSL CSS string ───

export function hexToHslString(hex: string): string {
  const [h, s, l] = hexToHsl(hex);
  return `${h} ${s}% ${l}%`;
}

// ─── Apply theme to CSS variables ───

export function applyThemeToDOM(colors: ThemeColors) {
  const root = document.documentElement;

  // Brand variables
  root.style.setProperty("--brand-sidebar", colors.sidebar);
  root.style.setProperty("--brand-primary", colors.primary);
  root.style.setProperty("--brand-accent", colors.accent);
  root.style.setProperty("--brand-topbar", colors.topbar);
  root.style.setProperty("--brand-card-accent", colors.cardAccent);

  // Auto-derived
  root.style.setProperty("--brand-sidebar-text", getTextColorForBg(colors.sidebar));
  root.style.setProperty("--brand-primary-hover", darkenColor(colors.primary, 0.15));
  root.style.setProperty("--brand-primary-light", colors.primary + "1A"); // 10% opacity
  root.style.setProperty("--brand-accent-light", colors.accent + "1A");
  root.style.setProperty("--brand-topbar-text", getTextColorForBg(colors.topbar));

  // Update existing CSS vars to match brand
  const sidebarHsl = hexToHslString(colors.sidebar);
  const primaryHsl = hexToHslString(colors.primary);
  const accentHsl = hexToHslString(colors.accent);
  
  root.style.setProperty("--sidebar-background", sidebarHsl);
  root.style.setProperty("--sidebar-primary", accentHsl);
  root.style.setProperty("--accent", primaryHsl);
  root.style.setProperty("--finix-gold", primaryHsl);
  root.style.setProperty("--ring", primaryHsl);
}

export function clearThemeFromDOM() {
  const root = document.documentElement;
  const vars = [
    "--brand-sidebar", "--brand-primary", "--brand-accent", "--brand-topbar",
    "--brand-card-accent", "--brand-sidebar-text", "--brand-primary-hover",
    "--brand-primary-light", "--brand-accent-light", "--brand-topbar-text",
  ];
  vars.forEach((v) => root.style.removeProperty(v));
  // Reset overridden vars
  ["--sidebar-background", "--sidebar-primary", "--accent", "--finix-gold", "--ring"].forEach((v) =>
    root.style.removeProperty(v)
  );
}
