import type { TemplateSchema } from "@/components/employee/DynamicTemplateView";

type ExportRow = { label: string; value: string };

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (Array.isArray(value)) return value.map(formatValue).join("، ");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function sanitizeExportFileName(name: string | null | undefined, fallback = "employee-form") {
  return (name || fallback)
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || fallback;
}

function collectFields(schema: TemplateSchema | null | undefined, data: Record<string, any> | null | undefined) {
  const sections = schema?.sections || [];
  const payload = data || {};

  if (!sections.length) {
    return Object.entries(payload)
      .filter(([, value]) => value != null && value !== "")
      .map(([key, value]) => ({ title: key, rows: [{ label: key, value: formatValue(value) }] }));
  }

  return sections.map((section) => {
    if (section.type === "repeater") {
      const rows = Array.isArray(payload[section.key]) ? payload[section.key] : [];
      const grouped = rows
        .map((row: any, index: number) => ({
          title: `${section.item_label || "عنصر"} ${index + 1}`,
          rows: section.fields
            .map((field) => ({ label: field.label, value: formatValue(row?.[field.key]) }))
            .filter((item) => item.value !== "—"),
        }))
        .filter((group) => group.rows.length > 0);
      return { title: section.title, groups: grouped };
    }

    const sectionData = typeof payload[section.key] === "object" && !Array.isArray(payload[section.key])
      ? payload[section.key]
      : payload;
    const rows: ExportRow[] = section.fields
      .map((field) => ({ label: field.label, value: formatValue(sectionData?.[field.key]) }))
      .filter((item) => item.value !== "—");
    return { title: section.title, rows };
  }).filter((section: any) => section.rows?.length || section.groups?.length);
}

export function buildEmployeeFormWordHtml(opts: {
  title: string;
  employeeName?: string | null;
  createdAt?: string | null;
  schema?: TemplateSchema | null;
  data?: Record<string, any> | null;
}) {
  const sections = collectFields(opts.schema, opts.data);
  const createdAt = opts.createdAt ? new Date(opts.createdAt).toLocaleDateString("ar") : new Date().toLocaleDateString("ar");
  const metaRows = [
    opts.employeeName ? `<span>الموظف: <b>${escapeHtml(opts.employeeName)}</b></span>` : "",
    `<span>التاريخ: <b>${escapeHtml(createdAt)}</b></span>`,
  ].filter(Boolean).join("");

  const body = sections.map((section: any) => {
    if (section.groups) {
      return `
        <h2>${escapeHtml(section.title)}</h2>
        ${section.groups.map((group: any) => `
          <h3>${escapeHtml(group.title)}</h3>
          <table>${group.rows.map((row: ExportRow) => `
            <tr><th>${escapeHtml(row.label)}</th><td>${escapeHtml(row.value).replace(/\n/g, "<br>")}</td></tr>
          `).join("")}</table>
        `).join("")}
      `;
    }
    return `
      <h2>${escapeHtml(section.title)}</h2>
      <table>${section.rows.map((row: ExportRow) => `
        <tr><th>${escapeHtml(row.label)}</th><td>${escapeHtml(row.value).replace(/\n/g, "<br>")}</td></tr>
      `).join("")}</table>
    `;
  }).join("") || `<p class="empty">لا توجد بيانات</p>`;

  return `<!doctype html>
  <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: A4; margin: 18mm 14mm; }
        body { direction: rtl; font-family: Tahoma, Arial, sans-serif; color: #111827; line-height: 1.8; }
        .header { border-bottom: 3px solid #0D1B2E; padding-bottom: 12px; margin-bottom: 18px; }
        h1 { font-size: 24px; margin: 0 0 8px; color: #0D1B2E; }
        .meta { display: flex; gap: 18px; color: #374151; font-size: 12px; }
        h2 { font-size: 17px; color: #0D1B2E; background: #F3F4F6; padding: 8px 10px; margin: 18px 0 8px; border-right: 4px solid #0D1B2E; }
        h3 { font-size: 14px; color: #374151; margin: 12px 0 6px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; table-layout: fixed; }
        th, td { border: 1px solid #D1D5DB; padding: 8px 10px; vertical-align: top; font-size: 12px; word-break: break-word; white-space: pre-wrap; }
        th { width: 32%; background: #F9FAFB; color: #374151; text-align: right; }
        td { color: #111827; }
        .empty { text-align: center; color: #6B7280; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${escapeHtml(opts.title)}</h1>
        <div class="meta">${metaRows}</div>
      </div>
      ${body}
    </body>
  </html>`;
}

export function downloadEmployeeFormWord(opts: {
  title: string;
  employeeName?: string | null;
  createdAt?: string | null;
  schema?: TemplateSchema | null;
  data?: Record<string, any> | null;
}) {
  const html = buildEmployeeFormWordHtml(opts);
  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeExportFileName(opts.title)}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}