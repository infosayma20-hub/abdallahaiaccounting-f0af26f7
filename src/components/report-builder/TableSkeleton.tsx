import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  rows?: number;
  cols?: number;
}

export default function TableSkeleton({ rows = 8, cols = 5 }: Props) {
  return (
    <div className="p-4 space-y-3" dir="rtl">
      {/* Header */}
      <div className="flex gap-3 pb-2 border-b border-border/40">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 py-2">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={`h-4 flex-1 ${c === 0 ? "max-w-[140px]" : ""}`} />
          ))}
        </div>
      ))}
    </div>
  );
}
