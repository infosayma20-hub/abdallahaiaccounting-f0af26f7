import { Download, FileText } from "lucide-react";
import { sanitizeHumanText } from "@/lib/employeeRequestDisplay";

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
    try {
      const vals = Object.values(v as Record<string, unknown>)
        .filter((x) => x != null && x !== "" && typeof x !== "object")
        .map((x) => String(x));
      return vals.length ? vals.join(" • ") : "—";
    } catch { return "—"; }
  }
  return sanitizeHumanText(String(v)) || "—";
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

/** Arabic labels for well-known generic keys (used by the schema-less fallback). */
const GENERIC_LABELS: Record<string, string> = {
  item: "الصنف", qty: "الكمية", quantity: "الكمية", unit: "الوحدة",
  category: "التصنيف", notes: "ملاحظات", note: "ملاحظة", month: "الشهر",
  branch: "الفرع", date: "التاريخ", price: "السعر", total: "الإجمالي",
  name: "الاسم", employee: "الموظف", reason: "السبب", amount: "المبلغ",
  lines: "البنود", items: "البنود", rows: "البنود",
};
const HIDDEN_KEYS = new Set(["kind", "template_kind", "schema_version"]);
const labelFor = (k: string) => GENERIC_LABELS[k] || k;

/** Renders an array of plain objects as a compact table (desktop) / cards (mobile). */
function GenericTable({ rows, title }: { rows: Record<string, any>[]; title: string }) {
  const cols = Array.from(
    rows.reduce<Set<string>>((set, r) => {
      Object.keys(r || {}).forEach((k) => set.add(k));
      return set;
    }, new Set())
  );
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <header className="px-3 py-2 bg-muted/40 border-b border-border flex items-center justify-between">
        <h3 className="text-xs font-semibold">{title}</h3>
        <span className="text-[10px] text-muted-foreground">{rows.length} بند</span>
      </header>
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/20">
            <tr>
              <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-10">#</th>
              {cols.map((c) => (
                <th key={c} className="px-2 py-1.5 text-right font-medium text-muted-foreground whitespace-nowrap">{labelFor(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border/60">
                <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                {cols.map((c) => (
                  <td key={c} className="px-2 py-1.5 align-top max-w-[260px]"><FieldCell value={r?.[c]} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sm:hidden divide-y divide-border">
        {rows.map((r, i) => (
          <div key={i} className="p-3 space-y-1">
            <div className="text-[10px] text-muted-foreground">بند #{i + 1}</div>
            {cols.map((c) => {
              const v = r?.[c];
              if (v == null || v === "") return null;
              return (
                <div key={c} className="flex items-start justify-between gap-3">
                  <span className="text-[10px] text-muted-foreground shrink-0">{labelFor(c)}</span>
                  <span className="text-xs text-left"><FieldCell value={v} /></span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
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
    const entries = Object.entries(d).filter(
      ([k, v]) => !HIDDEN_KEYS.has(k) && v != null && v !== "" && !(Array.isArray(v) && v.length === 0)
    );
    return (
      <div className="space-y-3" dir="rtl">
        {title && (
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-primary" /> {title}
          </div>
        )}
        {entries.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">لا توجد بيانات</div>
        ) : entries.map(([k, v]) => {
          // Array of objects → table
          if (Array.isArray(v) && v.every((r) => r && typeof r === "object" && !Array.isArray(r))) {
            return <GenericTable key={k} rows={v as Record<string, any>[]} title={labelFor(k)} />;
          }
          // Array of scalars → list
          if (Array.isArray(v)) {
            return (
              <div key={k} className="rounded-lg bg-muted/30 p-3">
                <div className="text-[11px] text-muted-foreground mb-1">{labelFor(k)}</div>
                <ul className="text-sm list-disc pr-4 space-y-0.5">
                  {v.map((x, i) => <li key={i}><FieldCell value={x} /></li>)}
                </ul>
              </div>
            );
          }
          // Nested object → key/value rows
          if (v && typeof v === "object") {
            const inner = Object.entries(v as Record<string, any>).filter(([, x]) => x != null && x !== "");
            if (!inner.length) return null;
            return (
              <section key={k} className="rounded-xl border border-border bg-card overflow-hidden">
                <header className="px-3 py-2 bg-muted/40 border-b border-border">
                  <h3 className="text-xs font-semibold">{labelFor(k)}</h3>
                </header>
                <dl className="divide-y divide-border">
                  {inner.map(([ik, iv]) => (
                    <div key={ik} className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-2 px-3 py-2 text-xs">
                      <dt className="text-muted-foreground">{labelFor(ik)}</dt>
                      <dd className="sm:col-span-2 text-foreground"><FieldCell value={iv} /></dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          }
          return (
            <div key={k} className="rounded-lg bg-muted/30 p-3">
              <div className="text-[11px] text-muted-foreground mb-1">{labelFor(k)}</div>
              <div className="text-sm"><FieldCell value={v} /></div>
            </div>
          );
        })}
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