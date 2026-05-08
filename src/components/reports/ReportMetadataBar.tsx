import { CalendarDays, User2, Filter, Database } from "lucide-react";

/**
 * P5 — Report Metadata Bar.
 * Shows report generation context: timestamp, user, applied filters, data source notes.
 * Read-only. Designed for export headers and screen footer.
 */
export interface ReportMetadata {
  generatedAt?: string;
  user?: string | null;
  branch?: string | null;
  filters?: Record<string, string | undefined | null>;
  source?: string;
}

function fmtTime(iso?: string) {
  try {
    const d = iso ? new Date(iso) : new Date();
    return d.toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso || "";
  }
}

export function ReportMetadataBar({ generatedAt, user, branch, filters, source }: ReportMetadata) {
  const filterEntries = Object.entries(filters || {}).filter(([, v]) => v != null && v !== "");
  return (
    <div
      dir="rtl"
      className="text-[10px] text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-t border-border/40 bg-muted/20 print:bg-white print:border-t print:border-black/30"
    >
      <span className="flex items-center gap-1">
        <CalendarDays className="h-3 w-3" />
        أُنشئ في: <span className="font-mono text-foreground/80">{fmtTime(generatedAt)}</span>
      </span>
      {user && (
        <span className="flex items-center gap-1">
          <User2 className="h-3 w-3" />
          المستخدم: <span className="text-foreground/80">{user}</span>
        </span>
      )}
      {branch && (
        <span className="flex items-center gap-1">
          النطاق: <span className="text-foreground/80">{branch}</span>
        </span>
      )}
      {filterEntries.length > 0 && (
        <span className="flex items-center gap-1 flex-wrap">
          <Filter className="h-3 w-3" />
          الفلاتر:
          {filterEntries.map(([k, v]) => (
            <span key={k} className="px-1.5 py-0.5 rounded bg-background border border-border/50 text-foreground/80">
              {k}: {String(v)}
            </span>
          ))}
        </span>
      )}
      {source && (
        <span className="flex items-center gap-1 mr-auto">
          <Database className="h-3 w-3" />
          المصدر: <span className="text-foreground/70">{source}</span>
        </span>
      )}
    </div>
  );
}

export default ReportMetadataBar;