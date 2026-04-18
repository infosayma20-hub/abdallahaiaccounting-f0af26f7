import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft } from "lucide-react";

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

const SIZES = [25, 50, 100, 200];

export default function ReportPagination({ page, pageSize, total, onPageChange, onPageSizeChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div
      dir="rtl"
      className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-border/40 bg-muted/20 flex-wrap"
    >
      <p className="text-[11px] text-muted-foreground tabular-nums">
        عرض <span className="font-semibold text-foreground">{from.toLocaleString()}</span>
        {" – "}
        <span className="font-semibold text-foreground">{to.toLocaleString()}</span>
        {" من "}
        <span className="font-semibold text-foreground">{total.toLocaleString()}</span>
      </p>

      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="text-[11px] h-7 px-2 rounded-md border border-border bg-background text-foreground"
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s} / صفحة
              </option>
            ))}
          </select>
        )}

        <div className="inline-flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={!canPrev}
            onClick={() => onPageChange(1)}
            title="الأولى"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={!canPrev}
            onClick={() => onPageChange(page - 1)}
            title="السابقة"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>

          <span className="text-[11px] tabular-nums text-foreground px-2">
            {page} / {totalPages}
          </span>

          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={!canNext}
            onClick={() => onPageChange(page + 1)}
            title="التالية"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={!canNext}
            onClick={() => onPageChange(totalPages)}
            title="الأخيرة"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
