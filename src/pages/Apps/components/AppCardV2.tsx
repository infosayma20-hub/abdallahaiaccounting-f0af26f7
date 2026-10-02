import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Lock, Clock, ChevronDown } from "lucide-react";
import type { NavItem } from "@/config/navigationConfig";
import type { AppVisualMeta } from "../data/appsRegistry";
import FavoriteStar from "./FavoriteStar";
import AppMenuPopover from "./AppMenuPopover";
import { useTT } from "@/i18n/dict";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Props {
  app: NavItem;
  meta: AppVisualMeta;
  index: number;
  onNavigate: (path: string) => void;
  disabled?: boolean;       // hidden by super admin (legacy: hard-disable)
  isPremiumLocked?: boolean;
  /** التطبيق معطّل من الإدارة → يظهر في Premium بانتظار التفعيل */
  pendingActivation?: boolean;
  onPremiumClick?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  animateEntry?: boolean;
}

/**
 * AppCardV2 — Restored classic Unify ERP cards with subtle 3D effect.
 * - White card, blue tint border, layered 3D shadows.
 * - Apps with `groups` open a popover menu (sub-sections) instead of navigating.
 * - Apps without `groups` (or `isDirect`) navigate immediately.
 */
export default function AppCardV2({
  app, meta, index, onNavigate, disabled, isPremiumLocked, pendingActivation, onPremiumClick,
  isFavorite, onToggleFavorite, animateEntry = true,
}: Props) {
  const tt = useTT();
  const reduceMotion = useReducedMotion();
  const isInert = disabled;
  const cardRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const hasMenu = !!(app.groups && app.groups.length > 0 && !app.isDirect);

  const handleClick = () => {
    if (isInert) return;
    if (isPremiumLocked) { onPremiumClick?.(); return; }
    if (hasMenu) { setMenuOpen((v) => !v); return; }
    onNavigate(app.path);
  };

  return (
    <>
    <motion.div
      ref={cardRef as any}
      id={`app-${app.id}`}
      data-tour-id={`app-${app.id}`}
      className={cn(
        "group relative min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm",
        "transition-[transform,box-shadow,border-color] duration-500 ease-out",
        !isInert && "hover:-translate-y-2 hover:border-primary/20 hover:shadow-lg",
        isInert && "cursor-not-allowed opacity-45",
        isPremiumLocked && "bg-muted/50",
      )}
      initial={reduceMotion || !animateEntry ? false : { opacity: 0, x: 26, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      transition={{ delay: reduceMotion || !animateEntry ? 0 : 0.06 + index * 0.035, duration: 0.38, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <span aria-hidden="true" className="absolute inset-x-4 top-0 h-px origin-right scale-x-0 bg-gradient-to-l from-transparent via-accent/70 to-transparent transition-transform duration-500 ease-out group-hover:scale-x-100" />

      {/* ⭐ Favorite toggle */}
      {!isInert && onToggleFavorite && (
        <FavoriteStar active={!!isFavorite} onToggle={onToggleFavorite} />
      )}

      <Button
        type="button"
        variant="ghost"
        onClick={handleClick}
        disabled={isInert}
        className="relative z-10 flex h-auto min-h-[128px] w-full flex-col items-center justify-center gap-2.5 whitespace-normal rounded-2xl px-2 py-4 text-center hover:bg-transparent"
      >
        {/* Icon container — uses original app.color/bgColor classes */}
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-[transform,box-shadow] duration-500 ease-out group-hover:-translate-y-1 group-hover:scale-105 group-hover:shadow-md ${
            isInert
              ? "grayscale"
              : `${app.bgColor || "bg-primary/8"} group-hover:scale-110`
          }`}
        >
          {pendingActivation ? (
            <Clock className="h-5 w-5 text-primary" strokeWidth={2.2} />
          ) : isPremiumLocked ? (
            <Lock className="h-5 w-5 text-muted-foreground" />
          ) : app.iconImage ? (
            <img
              src={app.iconImage}
              alt={tt(app.label)}
              className="w-full h-full object-cover rounded-2xl transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <app.icon
              className={`h-5 w-5 ${app.color || "text-primary"} transition-transform duration-300 group-hover:scale-105`}
            />
          )}
        </div>

        {/* Name + description */}
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center justify-center gap-1">
            <p
              className={cn("text-sm font-medium leading-tight text-foreground transition-colors duration-300 group-hover:text-primary", isInert && "text-muted-foreground")}
            >
              {tt(app.label)}
            </p>
            {hasMenu && !isInert && !isPremiumLocked && (
              <ChevronDown
                size={13}
                strokeWidth={2.4}
                className={cn("text-muted-foreground transition-transform duration-200", menuOpen && "rotate-180")}
              />
            )}
            {!isInert && app.isNew && !pendingActivation && (
              <span className="amwali-app-badge-new text-[9px] font-medium px-2 py-0.5 rounded-full bg-info/10 text-info">
                جديد
              </span>
            )}
            {pendingActivation && (
              <span className="rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[8px] font-bold text-primary">
                {tt("بانتظار التفعيل")}
              </span>
            )}
            {!isInert && meta.isAIFeature && !pendingActivation && (
              <span className="text-[10px] font-medium text-muted-foreground">
                {tt("ذكاء اصطناعي")}
              </span>
            )}
            {!isInert && app.id === "crm" && !pendingActivation && (
              <span className="text-[10px] font-medium text-muted-foreground">
                {tt("إدارة علاقات العملاء")}
              </span>
            )}
          </div>
        </div>
      </Button>
    </motion.div>

    {hasMenu && (
      <AppMenuPopover
        anchorEl={cardRef.current}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={tt(app.label)}
        groups={app.groups || []}
        accentColor={meta.iconColor}
        onNavigate={onNavigate}
      />
    )}
    </>
  );
}
