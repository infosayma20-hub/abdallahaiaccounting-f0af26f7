import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * InvoiceNumericInput
 * ─────────────────────────────────────────────────────────────
 * مدخل رقمي مخصّص لخلايا جدول الفاتورة (الكمية/البونص/السعر/الخصم/الضريبة).
 * - يصغّر الخط تلقائياً للأرقام الطويلة بدل قصّها.
 * - tabular-nums + dir="ltr" + محاذاة وسط لقراءة سهلة في RTL.
 * - title يعرض القيمة الكاملة المنسّقة عند hover.
 * - يحافظ على نفس واجهة <Input> ويمرّر كل الخصائص (data-*، onKeyDown، ref…).
 */

export interface InvoiceNumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** نص إضافي يُضاف داخل title بعد القيمة المنسّقة (مثلاً "%"). */
  unitLabel?: string;
  /** الحدّ الأدنى لعرض الحقل بالبكسل (افتراضي 72). */
  minWidthPx?: number;
  /** الحدّ الأقصى لعرض الحقل بالبكسل قبل التركيز (افتراضي 140). */
  maxWidthPx?: number;
  /** الحدّ الأقصى لعرض الحقل أثناء التركيز ليرى المستخدم القيمة كاملة (افتراضي maxWidthPx + 40). */
  focusMaxWidthPx?: number;
}

function formatFullValue(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

/** يُرجع class حجم خط مناسب حسب طول القيمة لتجنّب القصّ. */
function fitClass(len: number): string {
  if (len <= 6) return "text-[12px]";
  if (len <= 9) return "text-[11px]";
  if (len <= 12) return "text-[10px]";
  return "text-[9px]";
}

const InvoiceNumericInput = React.forwardRef<HTMLInputElement, InvoiceNumericInputProps>(
  ({ className, value, unitLabel, title, minWidthPx = 72, maxWidthPx = 140, focusMaxWidthPx, style, ...rest }, ref) => {
    const raw = value === undefined || value === null ? "" : String(value);
    const formatted = formatFullValue(value);
    // نستخدم طول القيمة المنسّقة (مع الفواصل) لحساب العرض الفعلي المرئي.
    const visibleLen = Math.max(raw.length, formatted.length);
    const len = visibleLen;
    // عرض ديناميكي: ~0.62ch لكل خانة + padding ~24px + سهمي number ~16px.
    // نحسبه بالبكسل لضمان عمل max-width بدقة.
    const charPx = 7.2; // ≈ عرض رقم tabular ~12px
    const desiredPx = Math.round(len * charPx + 28);
    const widthPx = Math.min(maxWidthPx, Math.max(minWidthPx, desiredPx));
    const focusMax = focusMaxWidthPx ?? maxWidthPx + 60;
    const computedTitle =
      title ?? (formatted ? `${formatted}${unitLabel ? ` ${unitLabel}` : ""}` : undefined);

    return (
      <Input
        ref={ref}
        type="number"
        dir="ltr"
        value={value as any}
        title={computedTitle}
        aria-label={computedTitle}
        style={{
          width: `${widthPx}px`,
          maxWidth: "100%",
          // CSS variable يستخدمه class focus-within أدناه لتمديد العرض عند التركيز.
          ["--focus-max" as any]: `${focusMax}px`,
          ...style,
        }}
        className={cn(
          "h-9 rounded-md border border-input bg-background text-center tabular-nums shadow-sm",
          "hover:border-foreground/30 focus:border-primary focus:ring-2 focus:ring-primary/15",
          "px-1.5 transition-[width] duration-100",
          // عند التركيز: وسّع العرض حتى focus-max ليرى المستخدم الرقم كاملًا.
          "focus:!w-[var(--focus-max)] focus:relative focus:z-10",
          fitClass(len),
          className,
        )}
        {...rest}
      />
    );
  },
);
InvoiceNumericInput.displayName = "InvoiceNumericInput";

export default InvoiceNumericInput;

/** Helper لعرض الإجمالي/أي رقم نصّي بنفس قواعد التصغير + tooltip. */
export function formatInvoiceNumberTitle(value: unknown): string {
  return formatFullValue(value);
}

export function numericFitClass(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  return fitClass(raw.length);
}