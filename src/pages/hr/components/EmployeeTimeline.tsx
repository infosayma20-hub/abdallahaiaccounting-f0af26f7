import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Wallet,
  Plane,
  HandCoins,
  Receipt,
  FileText,
  Clock,
  ArrowRightLeft,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimelineEvent } from "@/hooks/hr/useEmployee360";

const TYPE_META: Record<TimelineEvent["type"], { Icon: LucideIcon; cls: string; label: string }> = {
  payroll: { Icon: Wallet, cls: "bg-primary/10 text-primary", label: "راتب" },
  leave: { Icon: Plane, cls: "bg-sky-500/10 text-sky-600", label: "إجازة" },
  loan: { Icon: HandCoins, cls: "bg-amber-500/10 text-amber-600", label: "قرض" },
  deduction: { Icon: Receipt, cls: "bg-rose-500/10 text-rose-600", label: "خصم" },
  form: { Icon: FileText, cls: "bg-violet-500/10 text-violet-600", label: "نموذج" },
  attendance: { Icon: Clock, cls: "bg-orange-500/10 text-orange-600", label: "حضور" },
  transaction: { Icon: ArrowRightLeft, cls: "bg-emerald-500/10 text-emerald-600", label: "سند" },
  activity: { Icon: Activity, cls: "bg-muted text-muted-foreground", label: "نشاط" },
};

const fmt = (v: number) =>
  new Intl.NumberFormat("ar", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);

interface Props {
  events: TimelineEvent[];
  limit?: number;
}

export function EmployeeTimeline({ events, limit = 50 }: Props) {
  const list = events.slice(0, limit);

  if (list.length === 0) {
    return (
      <Card className="p-10 text-center text-muted-foreground">
        <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">لا توجد أحداث في السجل بعد.</p>
      </Card>
    );
  }

  return (
    <Card className="p-4 md:p-5">
      <div className="relative">
        <div className="absolute right-[19px] top-2 bottom-2 w-px bg-border" aria-hidden />
        <ul className="space-y-4">
          {list.map((ev) => {
            const meta = TYPE_META[ev.type] || TYPE_META.activity;
            const { Icon } = meta;
            const date = new Date(ev.date);
            const dateStr = isNaN(date.getTime())
              ? "—"
              : date.toLocaleDateString("ar", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                });
            const amountColor =
              typeof ev.amount === "number"
                ? ev.amount < 0
                  ? "text-rose-600"
                  : "text-emerald-600"
                : "";
            return (
              <li key={ev.id} className="relative flex gap-3 items-start">
                <div
                  className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center shrink-0 ring-4 ring-background z-10",
                    meta.cls,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-right flex-1 min-w-0">
                      <div className="flex items-center gap-2 justify-end flex-wrap">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {meta.label}
                        </Badge>
                        <p className="font-medium text-sm truncate">{ev.title}</p>
                      </div>
                      {ev.description && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {ev.description}
                        </p>
                      )}
                    </div>
                    <div className="text-left shrink-0">
                      {typeof ev.amount === "number" && ev.amount !== 0 && (
                        <p className={cn("text-sm font-semibold tabular-nums", amountColor)}>
                          {ev.amount < 0 ? "-" : "+"}₪{fmt(Math.abs(ev.amount))}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-0.5">{dateStr}</p>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
