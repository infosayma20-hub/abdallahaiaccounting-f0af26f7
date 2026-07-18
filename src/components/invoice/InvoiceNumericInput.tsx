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

/**
 * تطبيع المُدخل الرقمي: يقبل الأرقام العربية (٠-٩ و ٠-٩ الفارسية)،
 * والفاصلة العربية (٫) والفاصلة اللاتينية (,) كفاصل عشري،
 * ويحوّلها إلى نقطة (.) الإنجليزية.
 * يحل مشكلة `<input type=number>` الذي يرفض هذه الرموز على اللابتوبات
 * التي لغة نظامها ليست إنجليزية-US.
 */
function normalizeNumericString(raw: string): string {
  if (!raw) return "";
  let s = raw
    // أرقام عربية-هندية
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    // أرقام فارسية
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    // فاصلة عشرية عربية أو لاتينية → نقطة
    .replace(/[\u066B,]/g, ".")
    // فاصلة آلاف عربية → إزالة
    .replace(/[\u066C]/g, "");
  // إزالة أي رمز غير مسموح (نُبقي أرقام، نقطة، و- في البداية فقط)
  s = s.replace(/[^\d.\-]/g, "");
  // ضمان نقطة عشرية واحدة فقط
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }
  // "-" مسموح فقط كأول محرف
  if (s.indexOf("-") > 0) s = s.replace(/-/g, (m, i) => (i === 0 ? m : ""));
  return s;
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
  ({ className, value, unitLabel, title, minWidthPx = 72, maxWidthPx = 140, focusMaxWidthPx, style, step, onChange, onFocus, onBlur, inputMode, type, ...rest }, ref) => {
    // ── Internal string buffer ────────────────────────────────────────────
    // نحتفظ بنسخة نصية داخلية للقيمة لكي نحافظ على الحالات المؤقتة أثناء
    // الكتابة مثل: "5." أو "0." أو "6.0" أو "" — التي يفقدها React لو
    // اعتمدنا فقط على القيمة الرقمية القادمة من الأب (Number("5.") = 5
    // فتتحوّل مرة أخرى إلى "5" ويختفي ما كتبه المستخدم).
    const propStr = value === undefined || value === null ? "" : String(value);
    const [inner, setInner] = React.useState<string>(propStr);
    const [focused, setFocused] = React.useState(false);

    // مزامنة مع الأب: فقط عندما لا يكون الحقل قيد التحرير، أو عندما
    // تختلف القيمة الرقمية فعلياً (لتفادي مسح "5." أثناء الكتابة).
    React.useEffect(() => {
      if (focused) {
        const innerNum = inner === "" || inner === "-" || inner === "." ? NaN : Number(inner);
        const propNum = propStr === "" ? NaN : Number(propStr);
        // إذا كانت القيمة النصية الداخلية تعكس نفس الرقم الذي وصلنا من الأب،
        // لا نلمس الـ inner (يحفظ "5." كما هي). خلاف ذلك نُحدّث.
        const sameNumber =
          (Number.isNaN(innerNum) && Number.isNaN(propNum)) || innerNum === propNum;
        if (!sameNumber) setInner(propStr);
      } else {
        setInner(propStr);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [propStr]);

    const raw = inner;
    const formatted = formatFullValue(inner === "" || inner === "-" || inner === "." ? "" : inner);
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

    // نستخدم type="text" + inputMode="decimal" لتفادي حساسية `type=number`
    // للغة/الكيبورد (رفض النقطة على أنظمة عربية/أوروبية أو رفض الفاصلة العربية ٫).
    // نُطبِّع القيمة داخلياً قبل تمريرها للـ onChange الخارجي، فيبقى
    // `Number(e.target.value)` عند المستدعي يعمل تماماً كما كان.
    const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
      const normalized = normalizeNumericString(e.target.value);
      // نحدّث المخزن الداخلي بالنص كما كتبه المستخدم (يحفظ "5." و "0.")
      setInner(normalized);
      // ونمرّر للأب قيمة قابلة للتحويل عبر Number(): "5." تصبح "5"
      // فقط عند التمرير (لا نغيّر ما يراه المستخدم).
      let forParent = normalized;
      if (forParent.endsWith(".")) forParent = forParent.slice(0, -1);
      if (forParent === "-" || forParent === "") {
        // لا يوجد رقم صالح بعد — مرّر "" حتى يعرف الأب أنه فارغ
        forParent = "";
      }
      if (forParent !== e.target.value) e.target.value = forParent;
      onChange?.(e);
    };

    const handleFocus: React.FocusEventHandler<HTMLInputElement> = (e) => {
      setFocused(true);
      onFocus?.(e);
    };
    const handleBlur: React.FocusEventHandler<HTMLInputElement> = (e) => {
      setFocused(false);
      // عند فقدان التركيز: طبّع النص الداخلي ليطابق قيمة الأب النهائية
      setInner(propStr);
      onBlur?.(e);
    };

    return (
      <Input
        ref={ref}
        type={type ?? "text"}
        inputMode={inputMode ?? "decimal"}
        dir="ltr"
        step={step}
        value={raw}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
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