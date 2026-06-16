import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Renders a `dynamic_template` submission against its form_template schema.
 * Schema shape:
 *   { sections: [{ key, title, type: "fields"|"repeater", item_label?, fields: [{ key, label, type, options? }] }] }
 * form_data shape:
 *   For "fields"  section: { [sectionKey]: { [fieldKey]: value } }   OR flat keys at root
 *   For "repeater"        : { [sectionKey]: [ { [fieldKey]: value }, ... ] }
 * The renderer is defensive — unknown shapes degrade gracefully.
 */
export interface TemplateSchemaField {
  key: string;
  label: string;
  type?: string;
  options?: string[];
}
export interface TemplateSchemaSection {
  key: string;
  title: string;
  type: "fields" | "repeater" | string;
  item_label?: string;
  fields: TemplateSchemaField[];
}
export interface TemplateSchema {
  sections?: TemplateSchemaSection[];
}

function isUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v);
}

function fmtValue(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (typeof v === "object") {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

function FieldCell({ value }: { value: unknown }) {
  if (isUrl(value)) {
    return (
      <a href={value} target="_blank" rel="noreferrer"
         className="text-primary hover:underline inline-flex items-center gap-1">
        <Download className="h-3.5 w-3.5" /> فتح المرفق
      </a>
    );
  }
  return <span className="whitespace-pre-wrap break-words">{fmtValue(value)}</span>;
}

export default function DynamicTemplateView({
  schema,
  data,
  title,
}: {
  schema: TemplateSchema | null | undefined;
  data: Record<string, any> | null | undefined;
  title?: string | null;
}) {
  const d = data || {};
  const sections = schema?.sections || [];

  // Fallback: no schema → render raw JSON nicely.
  if (!sections.length) {
    const entries = Object.entries(d).filter(([, v]) => v != null && v !== "");
    return (
      <div className="space-y-3" dir="rtl">
        {title && (
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-primary" /> {title}
          </div>
        )}
        {entries.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">لا توجد بيانات</div>
        ) : entries.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-muted/30 p-3">
            <div className="text-[11px] text-muted-foreground mb-1">{k}</div>
            <div className="text-sm"><FieldCell value={v} /></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {title && (
        <div className="flex items-center gap-2 text-sm font-semibold bg-primary/5 border border-primary/20 rounded-xl px-3 py-2">
          <FileText className="h-4 w-4 text-primary" /> {title}
        </div>
      )}
      {sections.map((sec) => {
        const raw = d[sec.key];
        // Hide empty sections
        if (raw == null || (Array.isArray(raw) && raw.length === 0)
            || (typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).length === 0)) {
          return null;
        }

        if (sec.type === "repeater") {
          const rows: any[] = Array.isArray(raw) ? raw : [];
          // Skip if all rows are empty
          const nonEmpty = rows.filter((r) => r && Object.values(r).some((v) => v != null && v !== ""));
          if (!nonEmpty.length) return null;
          return (
            <section key={sec.key} className="rounded-xl border border-border bg-card overflow-hidden">
              <header className="px-3 py-2 bg-muted/40 border-b border-border flex items-center justify-between">
                <h3 className="text-xs font-semibold">{sec.title}</h3>
                <span className="text-[10px] text-muted-foreground">{nonEmpty.length} {sec.item_label || "عنصر"}</span>
              </header>
              {/* Desktop: table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/20">
                    <tr>
                      <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-10">#</th>
                      {sec.fields.map((f) => (
                        <th key={f.key} className="px-2 py-1.5 text-right font-medium text-muted-foreground whitespace-nowrap">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {nonEmpty.map((row, idx) => (
                      <tr key={idx} className="border-t border-border/60">
                        <td className="px-2 py-1.5 text-muted-foreground">{idx + 1}</td>
                        {sec.fields.map((f) => (
                          <td key={f.key} className="px-2 py-1.5 align-top max-w-[260px]">
                            <FieldCell value={row?.[f.key]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile: cards */}
              <div className="sm:hidden divide-y divide-border">
                {nonEmpty.map((row, idx) => (
                  <div key={idx} className="p-3 space-y-1.5">
                    <div className="text-[10px] text-muted-foreground">{sec.item_label || "عنصر"} #{idx + 1}</div>
                    {sec.fields.map((f) => {
                      const v = row?.[f.key];
                      if (v == null || v === "") return null;
                      return (
                        <div key={f.key} className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-muted-foreground">{f.label}</span>
                          <span className="text-xs"><FieldCell value={v} /></span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          );
        }

        // type === "fields"
        const obj: Record<string, any> = (typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
        const filledFields = sec.fields.filter((f) => obj[f.key] != null && obj[f.key] !== "");
        if (!filledFields.length) return null;
        return (
          <section key={sec.key} className="rounded-xl border border-border bg-card overflow-hidden">
            <header className="px-3 py-2 bg-muted/40 border-b border-border">
              <h3 className="text-xs font-semibold">{sec.title}</h3>
            </header>
            <dl className="divide-y divide-border">
              {filledFields.map((f) => (
                <div key={f.key} className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-2 px-3 py-2 text-xs">
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className="sm:col-span-2 text-foreground"><FieldCell value={obj[f.key]} /></dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}