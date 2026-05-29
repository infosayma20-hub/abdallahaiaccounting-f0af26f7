import { BRAND } from "@/constants/brand";
import { cn } from "@/lib/utils";

export type BrandLogoVariant =
  | "primary"   // Default horizontal Ar+En+icon (light backgrounds)
  | "dark"      // Inverted — white on navy (use over dark hero/sidebar)
  | "light"     // Alias of primary
  | "vertical"  // Stacked
  | "tagline"   // With tagline "أعمالك في أبهى صورها"
  | "mono"      // Single-color full
  | "text"      // Text only (no icon)
  | "icon"      // A mark only — transparent
  | "iconSquare"// App icon — rounded square (navy)
  | "iconCircle";// App icon — circle (navy)

const SRC: Record<BrandLogoVariant, string> = {
  primary:    BRAND.logos.primary,
  light:      BRAND.logos.primary,
  dark:       BRAND.logos.dark,
  vertical:   BRAND.logos.vertical,
  tagline:    BRAND.logos.tagline,
  mono:       BRAND.logos.mono,
  text:       BRAND.logos.text,
  icon:       BRAND.logos.icon,
  iconSquare: BRAND.logos.iconSquare,
  iconCircle: BRAND.logos.iconCircle,
};

interface BrandLogoProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> {
  variant?: BrandLogoVariant;
  alt?: string;
}

/**
 * Single source of truth for the Amwali logo across the platform.
 * Always render the logo through this component — never hardcode logo paths.
 */
export function BrandLogo({
  variant = "primary",
  className,
  alt = BRAND.nameAr,
  ...rest
}: BrandLogoProps) {
  return (
    <img
      src={SRC[variant]}
      alt={alt}
      draggable={false}
      className={cn("select-none object-contain", className)}
      {...rest}
    />
  );
}

export default BrandLogo;