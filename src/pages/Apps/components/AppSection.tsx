import { useState, useEffect, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useTT } from "@/i18n/dict";
import { SECTION_LABELS, type AppSection as SectionKey } from "../data/appsRegistry";
import { Button } from "@/components/ui/button";

interface Props {
  section: SectionKey;
  isPremium?: boolean;
  children: ReactNode;
}

export default function AppSection({ section, isPremium, children }: Props) {
  const tt = useTT();
  const { title } = SECTION_LABELS[section];
  const storageKey = `amwali:apps:section:${section}:collapsed`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(storageKey) === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, collapsed ? "1" : "0"); } catch {}
  }, [collapsed, storageKey]);

  return (
    <section className="py-5">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="mb-3 flex h-9 w-full justify-start gap-2 px-1 text-foreground"
      >
        <span aria-hidden="true" className="h-4 w-1 rounded-full bg-primary" />
        <h3 className="text-sm font-semibold">{tt(isPremium ? "متقدمة" : title)}</h3>
        {isPremium && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {tt("مغلقة")}
          </span>
        )}
        <ChevronDown
          size={16}
          className={`ms-auto text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`}
        />
      </Button>

      {/* Apps grid */}
      {!collapsed && <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
        {children}
      </div>}
    </section>
  );
}
