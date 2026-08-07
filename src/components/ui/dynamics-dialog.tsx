/**
 * DynamicsDialog — الشكل الموحّد لنوافذ النظام (Microsoft Dynamics Finance shell).
 * هيدر داكن + زر إغلاق أبيض على اليسار + شريط حقائق (Fact box) اختياري + محتوى RTL.
 */
import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface DynamicsFact {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "negative" | "positive";
}

interface DynamicsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  facts?: DynamicsFact[];
  children: React.ReactNode;
  className?: string;
  /** ارتفاع منطقة التمرير */
  maxBodyHeight?: string;
}

export function DynamicsDialog({
  open,
  onOpenChange,
  title,
  description,
  facts,
  children,
  className,
  maxBodyHeight = "62vh",
}: DynamicsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className={cn(
          "max-w-5xl gap-0 overflow-hidden p-0",
          // زر الإغلاق الافتراضي: على يمين الهيدر الداكن وبلون أبيض
          "[&>button]:left-auto [&>button]:right-4 [&>button]:top-3.5 [&>button]:z-10 [&>button]:rounded-md [&>button]:p-1 [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100",
          className,
        )}
      >
        <DialogHeader className="space-y-0.5 border-b border-border bg-[#0D1B2E] py-3 pl-5 pr-12 text-right">
          <DialogTitle className="text-sm font-semibold text-white">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-[11px] text-white/60">{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        {facts?.length ? (
          <div
            className="grid divide-x divide-x-reverse divide-border border-b border-border bg-muted/30"
            style={{ gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))` }}
          >
            {facts.map((f) => (
              <div key={f.label} className="px-5 py-2.5">
                <div className="text-[10px] tracking-wide text-muted-foreground">{f.label}</div>
                <div
                  className={cn(
                    "tabular-nums text-base font-semibold",
                    f.tone === "negative" ? "text-destructive" : f.tone === "positive" ? "text-emerald-600" : "text-foreground",
                  )}
                >
                  {f.value}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <ScrollArea style={{ maxHeight: maxBodyHeight }}>
          <div className="space-y-4 p-4">{children}</div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/** قسم داخل النافذة بعنوان علوي رمادي — مطابق لأسلوب Dynamics. */
export function DynamicsSection({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-md border border-border">
      <div className="border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold text-foreground">{title}</div>
      {children}
    </section>
  );
}

export default DynamicsDialog;
