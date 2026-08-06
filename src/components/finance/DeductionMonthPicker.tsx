import { CalendarClock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/**
 * شهر الخصم (Deduction Month)
 * ------------------------------------------------------------------
 * أيقونة صغيرة بجانب سطر الموظف / نوع العملية تحدد الشهر الذي ستُخصم
 * منه السلفة في الرواتب. القيمة تُكتب على
 * employee_financial_movements.salary_month / salary_year، وهي نفس
 * الحقول التي تقرأها شاشة الخصومات ومعاينة الرواتب ومحفظة الموظف.
 *
 * value = "YYYY-MM" أو "" (يعني: نفس شهر تاريخ السند).
 */

export const monthOf = (isoDate: string) => (isoDate || "").slice(0, 7);

export const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const formatMonthLabel = (ym: string) => {
  const [y, m] = (ym || "").split("-");
  return y && m ? `${m}/${y}` : "—";
};

/** يحوّل "YYYY-MM" إلى { salary_month, salary_year } */
export const toSalaryPeriod = (ym: string, fallbackDate: string) => {
  const src = /^\d{4}-\d{2}/.test(ym || "") ? ym : monthOf(fallbackDate);
  const [y, m] = src.split("-").map(Number);
  return { salary_month: m, salary_year: y };
};

interface Props {
  /** "YYYY-MM" أو "" للافتراضي */
  value: string;
  onChange: (v: string) => void;
  /** تاريخ السند — يُستخدم كشهر افتراضي */
  baseDate: string;
  disabled?: boolean;
  className?: string;
}

export default function DeductionMonthPicker({ value, onChange, baseDate, disabled, className }: Props) {
  const base = monthOf(baseDate);
  const effective = value || base;
  const isCustom = !!value && value !== base;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={`شهر الخصم من الراتب: ${formatMonthLabel(effective)}`}
          data-testid="deduction-month-picker"
          className={`relative h-9 w-9 shrink-0 flex items-center justify-center rounded-lg border transition-colors disabled:opacity-50 ${
            isCustom
              ? "bg-primary/10 border-primary/50 text-primary"
              : "bg-background border-border/60 text-muted-foreground hover:bg-primary/5 hover:border-primary/50"
          } ${className || ""}`}
        >
          <CalendarClock className="h-4 w-4" />
          {isCustom && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-3">
        <div>
          <Label className="text-xs mb-1.5 block">شهر الخصم من الراتب</Label>
          <Input
            type="month"
            value={effective}
            onChange={(e) => onChange(e.target.value)}
            className="h-9"
          />
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
            السلفة رح تظهر كخصم على راتب هذا الشهر في شاشة الخصومات ومحفظة الموظف.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]"
            onClick={() => onChange("")}>
            شهر السند ({formatMonthLabel(base)})
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]"
            onClick={() => onChange(addMonths(base, 1))}>
            الشهر القادم
          </Button>
        </div>
        <div className="text-[11px] rounded-md bg-muted/50 px-2 py-1.5">
          الشهر المعتمد: <span className="font-bold text-foreground">{formatMonthLabel(effective)}</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
