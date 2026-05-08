import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * ReportPageShell — canonical RTL report page layout.
 *
 * Mirrors the HR Attendance reference and matches what GenericReportPage
 * already renders (header → filters → optional KPIs → content card →
 * metadata footer). This component is **opt-in**: existing report pages
 * keep working unchanged. Migrate page-by-page in P1.
 *
 * Spec: docs/report-table-ui-spec.md
 *
 * Print awareness:
 *   - Filter toolbar and actions are hidden in print via `print:hidden`.
 *   - The actual print path should call `printGenericReport()` from
 *     src/lib/reports/report-print.ts (opens a clean new window).
 */

interface ReportPageShellProps {
  /** Required Arabic title shown on the right. */
  title: string;
  /** Optional subtitle / description under the title. */
  subtitle?: string;
  /** Action cluster on the left (e.g. Excel / Print buttons). */
  actions?: ReactNode;
  /** Filter toolbar (date range, source, refresh, etc.). */
  filters?: ReactNode;
  /** Optional KPI strip rendered between filters and content. */
  kpis?: ReactNode;
  /** Main content — usually <SortableReportTable />. */
  children: ReactNode;
  /** Footer slot — usually <ReportMetadataBar />. */
  footer?: ReactNode;
  /** Override back navigation (defaults to history.back → /reports). */
  onBack?: () => void;
}

const ReportPageShell = ({
  title,
  subtitle,
  actions,
  filters,
  kpis,
  children,
  footer,
  onBack,
}: ReportPageShellProps) => {
  const navigate = useNavigate();
  const handleBack = onBack
    ? onBack
    : () => (window.history.length > 2 ? navigate(-1) : navigate("/reports"));

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto pb-10" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="p-2 rounded-xl hover:bg-muted transition-colors"
            aria-label="رجوع"
          >
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">{title}</h1>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {/* Filters toolbar */}
      {filters && (
        <Card className="p-3 flex flex-wrap items-center gap-3 border-border/50 print:hidden">
          {filters}
        </Card>
      )}

      {/* Optional KPI strip */}
      {kpis && <div>{kpis}</div>}

      {/* Content + footer */}
      <Card className="overflow-hidden border-border/50">
        {children}
        {footer}
      </Card>
    </div>
  );
};

export default ReportPageShell;