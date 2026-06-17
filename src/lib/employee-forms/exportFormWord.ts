import type { TemplateSchema } from "@/components/employee/DynamicTemplateView";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  PageOrientation,
} from "docx";

type ExportRow = { label: string; value: string };

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

/* RTL helpers for the docx library */
const FONT = "Arial";

function rtlPara(opts: {
  text?: string;
  bold?: boolean;
  size?: number;
  color?: string;
  heading?: typeof HeadingLevel[keyof typeof HeadingLevel];
  shading?: string;
  spacingBefore?: number;
  spacingAfter?: number;
}) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    heading: opts.heading,
    shading: opts.shading ? { type: ShadingType.CLEAR, fill: opts.shading, color: "auto" } : undefined,
    spacing: { before: opts.spacingBefore ?? 80, after: opts.spacingAfter ?? 80, line: 320 },
    children: opts.text
      ? [new TextRun({ text: opts.text, bold: !!opts.bold, size: opts.size ?? 22, color: opts.color, font: FONT, rightToLeft: true })]
      : [],
  });
}

function rtlMultilinePara(text: string, size = 22) {
  const lines = String(text ?? "").split(/\r?\n/);
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { before: 40, after: 40, line: 320 },
    children: lines.flatMap((line, i) =>
      i === 0
        ? [new TextRun({ text: line, size, font: FONT, rightToLeft: true })]
        : [new TextRun({ text: line, size, font: FONT, rightToLeft: true, break: 1 })]
    ),
  });
}

function rtlCell(opts: { children: Paragraph[]; width: number; shading?: string; isHeader?: boolean }) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" };
  return new TableCell({
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.shading ? { type: ShadingType.CLEAR, fill: opts.shading, color: "auto" } : undefined,
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    borders: { top: border, bottom: border, left: border, right: border },
    children: opts.children,
  });
}

function buildRowsTable(rows: ExportRow[]) {
  // RTL table: label on right, value on left. docx renders LTR by default,
  // so put label first cell + set bidiVisual on table for proper visual RTL.
  const TABLE_W = 9000;
  const LABEL_W = 2900;
  const VALUE_W = TABLE_W - LABEL_W;

  const tableRows = rows.map((row) =>
    new TableRow({
      children: [
        rtlCell({
          width: LABEL_W,
          shading: "F9FAFB",
          isHeader: true,
          children: [rtlPara({ text: row.label, bold: true, size: 20, color: "374151" })],
        }),
        rtlCell({
          width: VALUE_W,
          children: [rtlMultilinePara(row.value, 22)],
        }),
      ],
    })
  );

  return new Table({
    width: { size: TABLE_W, type: WidthType.DXA },
    columnWidths: [LABEL_W, VALUE_W],
    visuallyRightToLeft: true,
    rows: tableRows,
  });
}

function buildBody(opts: {
  title: string;
  employeeName?: string | null;
  createdAt?: string | null;
  schema?: TemplateSchema | null;
  data?: Record<string, any> | null;
}): (Paragraph | Table)[] {
  const sections = collectFields(opts.schema, opts.data);
  const createdAt = opts.createdAt
    ? new Date(opts.createdAt).toLocaleDateString("ar")
    : new Date().toLocaleDateString("ar");

  const out: (Paragraph | Table)[] = [];

  // Header
  out.push(rtlPara({ text: opts.title, bold: true, size: 36, color: "0D1B2E", spacingBefore: 0, spacingAfter: 120 }));
  if (opts.employeeName) {
    out.push(rtlPara({ text: `الموظف: ${opts.employeeName}`, size: 22, color: "374151", spacingAfter: 40 }));
  }
  out.push(rtlPara({ text: `التاريخ: ${createdAt}`, size: 22, color: "374151", spacingAfter: 240 }));

  if (!sections.length) {
    out.push(rtlPara({ text: "لا توجد بيانات", color: "6B7280" }));
    return out;
  }

  for (const section of sections as any[]) {
    out.push(rtlPara({
      text: section.title,
      bold: true,
      size: 28,
      color: "0D1B2E",
      shading: "F3F4F6",
      spacingBefore: 240,
      spacingAfter: 120,
    }));

    if (section.groups) {
      for (const group of section.groups) {
        out.push(rtlPara({ text: group.title, bold: true, size: 24, color: "374151", spacingBefore: 120, spacingAfter: 60 }));
        out.push(buildRowsTable(group.rows));
      }
    } else if (section.rows?.length) {
      out.push(buildRowsTable(section.rows));
    }
  }

  return out;
}

export function downloadEmployeeFormWord(opts: {
  title: string;
  employeeName?: string | null;
  createdAt?: string | null;
  schema?: TemplateSchema | null;
  data?: Record<string, any> | null;
}) {
  // Build a REAL OOXML .docx via the `docx` library. The previous
  // html-docx-js output produced loose XML that Android viewers (Google
  // Docs / WPS) rendered as a black screen. With native docx + proper RTL
  // flags (bidirectional, rightToLeft, visuallyRightToLeft) the file
  // opens identically on phones and desktops.
  const doc = new Document({
    creator: "Amwali",
    title: opts.title,
    styles: {
      default: {
        document: { run: { font: FONT, size: 22 } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT }, // A4
            margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
          },
        },
        children: buildBody(opts),
      },
    ],
  });

  Packer.toBlob(doc).then((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeExportFileName(opts.title)}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}