import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Calculator, Database, Filter, Check, X, Clock, Code2, CalendarRange } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { KPI_META, type KpiKey } from "@/lib/reports/kpi-metadata";

function fmt(n: number) {
  return `₪${n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  kpiKey: KpiKey | null;
  value: number;
  generatedAt?: string;
  dateRange?: { from?: string; to?: string };
}

export function KpiSourceDrawer({ open, onClose, kpiKey, value, generatedAt, dateRange }: Props) {
  const navigate = useNavigate();
  const meta = kpiKey ? KPI_META[kpiKey] : null;

  const isDev = import.meta.env.DEV;
  const today = new Date().toISOString().slice(0, 10);
  const asOf = dateRange?.to || today;
  const scopeLabel = meta
    ? meta.isLifetime
      ? `الأرصدة حتى ${asOf}`
      : `الفترة: من ${dateRange?.from || "البداية"} إلى ${dateRange?.to || today}`
    : "";

  const reconcileHref = meta
    ? meta.isLifetime
      ? `${meta.reconcilePath}${dateRange?.to ? `?asOf=${dateRange.to}` : ""}`
      : `${meta.reconcilePath}?from=${dateRange?.from || ""}&to=${dateRange?.to || ""}`
    : "";

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="left"
        dir="rtl"
        className="w-full sm:max-w-md overflow-y-auto"
      >
        {meta && (
          <>
            <SheetHeader className="text-right">
              <SheetTitle className="text-base">مصدر الرقم — {meta.label}</SheetTitle>
              <SheetDescription className="text-xs">
                شرح كامل لطريقة احتساب هذا المؤشر ومصادره.
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-5 text-sm">
              {/* Value */}
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-[11px] text-muted-foreground mb-1">القيمة الحالية</p>
                <p className="font-mono font-bold text-lg text-foreground">{fmt(value)}</p>
                <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                  <CalendarRange className="h-3 w-3" />
                  <span>{scopeLabel}</span>
                </p>
                {meta.isLifetime && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                    رصيد لحظي (Snapshot) — يعرض الرصيد التراكمي حتى التاريخ المحدد
                  </p>
                )}
              </div>

              {/* Formula */}
              <section>
                <div className="flex items-center gap-1.5 mb-1.5 text-muted-foreground">
                  <Calculator className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-semibold">المعادلة</span>
                </div>
                <p className="text-xs">{meta.shortFormula}</p>
                <pre className="mt-1 text-[10px] font-mono bg-muted/40 rounded p-2 whitespace-pre-wrap leading-relaxed text-foreground/80">
                  {meta.formula}
                </pre>
              </section>

              <Separator />

              {/* Sources */}
              <section>
                <div className="flex items-center gap-1.5 mb-1.5 text-muted-foreground">
                  <Database className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-semibold">مصادر البيانات</span>
                </div>
                <ul className="space-y-1">
                  {meta.sources.map((s) => (
                    <li key={s} className="text-xs">
                      <Badge variant="secondary" className="font-mono text-[10px]">{s}</Badge>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Filters */}
              <section>
                <div className="flex items-center gap-1.5 mb-1.5 text-muted-foreground">
                  <Filter className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-semibold">الفلاتر النشطة</span>
                </div>
                <ul className="space-y-1 text-xs">
                  <li>
                    نطاق الحساب:{" "}
                    <span className="font-mono">
                      {meta.isLifetime
                        ? `حتى ${asOf}`
                        : `${dateRange?.from || "البداية"} ← ${dateRange?.to || today}`}
                    </span>
                  </li>
                  {meta.filters.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </section>

              <Separator />

              {/* Included */}
              <section>
                <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">يشمل</p>
                <ul className="space-y-1">
                  {meta.included.map((i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs">
                      <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{i}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Excluded */}
              <section>
                <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">لا يشمل</p>
                <ul className="space-y-1">
                  {meta.excluded.map((i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs">
                      <X className="h-3.5 w-3.5 text-red-600 shrink-0 mt-0.5" />
                      <span>{i}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <Separator />

              {/* Generated */}
              {generatedAt && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>آخر تحديث: {new Date(generatedAt).toLocaleString("ar-EG")}</span>
                </div>
              )}

              {/* Reconcile */}
              <Button
                onClick={() => { navigate(reconcileHref); onClose(); }}
                className="w-full gap-2"
                size="sm"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                فتح التقرير المصدر — {meta.reconcileLabel}
              </Button>

              {/* Dev-only */}
              {isDev && (
                <section className="rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 p-2">
                  <div className="flex items-center gap-1.5 mb-1 text-amber-700 dark:text-amber-400">
                    <Code2 className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-semibold">تفاصيل المطورين (DEV فقط)</span>
                  </div>
                  <ul className="text-[10px] font-mono space-y-0.5 text-foreground/70">
                    <li>loader: src/lib/reports/executive-kpis.ts → loadExecutiveKPIs</li>
                    {meta.accountCodes && <li>accounts: {meta.accountCodes.join(", ")}</li>}
                    <li>key: {meta.key}</li>
                  </ul>
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default KpiSourceDrawer;