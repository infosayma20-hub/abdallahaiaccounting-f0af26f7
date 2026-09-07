import { Tags, Check, RotateCcw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import {
  DEDUCTION_BUCKET_LABELS,
  DEDUCTION_BUCKET_ORDER,
  type DeductionBucketKey,
} from "@/lib/hr/deductionBuckets";

/**
 * بند الخصم (Deduction Bucket)
 * ------------------------------------------------------------------
 * أيقونة بجانب أيقونة "شهر الخصم" تحدد على أي عمود ينزل المبلغ في شاشة
 * الخصومات (سلف / أكل / مخالفات / توصيل …). إذا تُرك فارغاً يبقى التصنيف
 * التلقائي القديم كما هو.
 */

interface Props {
  /** DeductionBucketKey أو "" (تلقائي) */
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}

export default function DeductionBucketPicker({ value, onChange, disabled, className }: Props) {
  const isSet = !!value;
  const label = isSet ? DEDUCTION_BUCKET_LABELS[value as DeductionBucketKey] : "تلقائي";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={`بند الخصم: ${label}`}
          data-testid="deduction-bucket-picker"
          className={`relative h-9 w-9 shrink-0 flex items-center justify-center rounded-lg border transition-colors disabled:opacity-50 ${
            isSet
              ? "bg-sky-500/10 border-sky-500/50 text-sky-600"
              : "bg-background border-border/60 text-muted-foreground hover:bg-sky-500/5 hover:border-sky-500/50"
          } ${className || ""}`}
        >
          <Tags className="h-4 w-4" />
          {isSet && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-sky-500" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <Label className="text-xs px-1 mb-1.5 block">بند الخصم في شاشة الخصومات</Label>
        <div className="max-h-64 overflow-y-auto">
          {DEDUCTION_BUCKET_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onChange(k)}
              className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors text-right"
            >
              <span>{DEDUCTION_BUCKET_LABELS[k]}</span>
              {value === k && <Check className="h-3.5 w-3.5 text-sky-600" />}
            </button>
          ))}
        </div>
        <div className="border-t mt-1.5 pt-1.5">
          <button
            type="button"
            onClick={() => onChange("")}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-muted transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            التصنيف التلقائي (السياسة القديمة)
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5 px-1 leading-relaxed">
          إذا لم تحدد بنداً، يبقى التصنيف التلقائي حسب البيان كما هو.
        </p>
      </PopoverContent>
    </Popover>
  );
}
