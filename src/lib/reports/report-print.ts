import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { ColumnDef, TotalsConfig } from "@/components/reports/SortableReportTable";

interface CompanyInfo {
  name: string;
  logo_url: string;
  address: string;
  phone: string;
  email: string;
  tax_number: string;
}

async function loadCompany(uid: string): Promise<CompanyInfo> {
  const empty: CompanyInfo = { name: "", logo_url: "", address: "", phone: "", email: "", tax_number: "" };
  if (!uid) return empty;
  try {
    const [{ data: s }, { data: c }] = await Promise.all([
      (supabase.from("company_settings" as any) as any)
        .select("company_name, logo_url, address, phone, email, tax_number")
        .eq("user_id", uid).maybeSingle(),
      supabase.from("companies")
        .select("name, logo_url, address, phone, email, tax_number")
        .eq("owner_id", uid).maybeSingle(),
    ]);
    const ss: any = s || {}; const cc: any = c || {};
    return {
      name: ss.company_name || cc.name || "",
      logo_url: cc.logo_url || ss.logo_url || "",
      address: ss.address || cc.address || "",
      phone: ss.phone || cc.phone || "",
      email: ss.email || cc.email || "",
      tax_number: ss.tax_number || cc.tax_number || "",
    };
  } catch { return empty; }
}

const escapeHtml = (s: any): string => {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
};

const fmtNum = (n: number) =>
  Number(n).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatCellValue(row: any, col: ColumnDef): string {
  const raw = row[col.key];
  if (raw === null || raw === undefined || raw === "") return "—";
  switch (col.type) {
    case "currency": {
      const n = Number(raw) || 0;
      return `₪${fmtNum(Math.abs(n))}`;
    }
    case "number": {
      const n = Number(raw);
      if (Number.isNaN(n)) return escapeHtml(raw);
      return Number.isInteger(n) ? n.toLocaleString("en") : fmtNum(n);
    }
    case "percent": {
      const n = Number(raw) || 0;
      return `${n.toFixed(1)}%`;
    }
    case "date": {
      try {
        const d = typeof raw === "string" ? raw.split("T")[0] : raw;
        return escapeHtml(d);
      } catch { return escapeHtml(raw); }
    }
    default:
      return escapeHtml(raw);
  }
}

function computeTotalCell(data: any[], col: ColumnDef, totals?: TotalsConfig, isFirst?: boolean): string {
  if (!totals) return isFirst ? "الإجمالي" : "";
  const rule = totals[col.key];
  if (rule === undefined && isFirst) return "الإجمالي";
  if (rule === undefined) return "";
  if (rule === "sum") {
    const sum = data.reduce((s, r) => s + (Number(r[col.key]) || 0), 0);
    return col.type === "currency" ? `₪${fmtNum(Math.abs(sum))}` : fmtNum(sum);
  }
  if (rule === "count") return String(data.length);
  if (rule === "avg") {
    const sum = data.reduce((s, r) => s + (Number(r[col.key]) || 0), 0);
    const a = data.length ? sum / data.length : 0;
    return col.type === "currency" ? `₪${fmtNum(Math.abs(a))}` : fmtNum(a);
  }
  if (typeof rule === "number") return col.type === "currency" ? `₪${fmtNum(Math.abs(rule))}` : fmtNum(rule);
  if (typeof rule === "string") return rule;
  return "";
}

export interface PrintReportOptions {
  uid: string;
  reportTitle: string;
  reportSubtitle?: string;
  dateFrom?: string;
  dateTo?: string;
  userEmail?: string | null;
  source?: string;
  extraFilters?: Record<string, string | undefined | null>;
  columns: ColumnDef[];
  data: any[];
  totals?: TotalsConfig;
  /** When provided, only print these column keys (respect column visibility). */
  visibleColumnKeys?: string[];
}

/**
 * Open a new window with a clean printable report (no app chrome).
 * Uses RTL, A4-friendly styling, repeating header on page breaks, and
 * triggers print automatically.
 */
export async function printGenericReport(opts: PrintReportOptions): Promise<void> {
  const company = await loadCompany(opts.uid);

  // Filter columns: respect visibility + drop helper columns that don't print well
  const NON_PRINT_KEYS = new Set(["actions"]);
  const cols = opts.columns.filter(c => {
    if (NON_PRINT_KEYS.has(c.key)) return false;
    if (opts.visibleColumnKeys && !opts.visibleColumnKeys.includes(c.key)) return false;
    return true;
  });

  const today = format(new Date(), "dd/MM/yyyy HH:mm");

  const headerCells = cols.map(c => {
    const align = c.align === "left" ? "left" : c.align === "center" ? "center" : "right";
    return `<th style="text-align:${align}">${escapeHtml(c.label)}</th>`;
  }).join("");

  const bodyRows = opts.data.map((row, i) => {
    const cells = cols.map(c => {
      const align = c.align === "left" ? "left"
        : c.align === "center" ? "center"
        : (c.type === "currency" || c.type === "number" || c.type === "percent") ? "left"
        : "right";
      const val = formatCellValue(row, c);
      return `<td style="text-align:${align}" class="${c.type === "currency" || c.type === "number" || c.type === "percent" ? "num" : ""}">${val}</td>`;
    }).join("");
    return `<tr class="${i % 2 ? "zebra" : ""}">${cells}</tr>`;
  }).join("");

  let totalsRowHtml = "";
  if (opts.totals && opts.data.length) {
    const cells = cols.map((c, i) => {
      const v = computeTotalCell(opts.data, c, opts.totals, i === 0);
      const align = c.align === "left" ? "left" : c.align === "center" ? "center"
        : (c.type === "currency" || c.type === "number" || c.type === "percent") ? "left" : "right";
      return `<td style="text-align:${align}">${escapeHtml(v)}</td>`;
    }).join("");
    totalsRowHtml = `<tr class="totals-row">${cells}</tr>`;
  }

  const filterChips: string[] = [];
  if (opts.dateFrom || opts.dateTo) {
    filterChips.push(`الفترة: من <b>${escapeHtml(opts.dateFrom || "—")}</b> إلى <b>${escapeHtml(opts.dateTo || "—")}</b>`);
  }
  if (opts.userEmail) filterChips.push(`المستخدم: <b>${escapeHtml(opts.userEmail)}</b>`);
  filterChips.push(`عدد النتائج: <b>${opts.data.length.toLocaleString("en")}</b>`);
  if (opts.source) filterChips.push(`المصدر: ${escapeHtml(opts.source)}`);
  if (opts.extraFilters) {
    for (const [k, v] of Object.entries(opts.extraFilters)) {
      if (v) filterChips.push(`${escapeHtml(k)}: <b>${escapeHtml(v)}</b>`);
    }
  }
  filterChips.push(`أُنشئ في: <b>${escapeHtml(today)}</b>`);

  const filtersHtml = `<div class="filters">${filterChips.map(c => `<span>${c}</span>`).join("")}</div>`;

  const title = `${opts.reportTitle}${company.name ? " — " + company.name : ""}`;

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:'Cairo',Arial,sans-serif;direction:rtl;color:#0F172A;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:A4;margin:12mm 10mm}
@media print{body{margin:0}.no-print{display:none!important}}
body{padding:14px 18px;font-size:11px;line-height:1.45}
.print-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0D1B2E;padding-bottom:10px;margin-bottom:10px}
.brand{display:flex;align-items:center;gap:10px}
.brand img,.brand .logo-fallback{width:46px;height:46px;border-radius:8px;object-fit:contain;background:#F1F5F9;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#0D1B2E}
.company-name{font-size:15px;font-weight:700;color:#0D1B2E}
.company-meta{font-size:9.5px;color:#64748B;margin-top:2px;line-height:1.5}
.title-block{text-align:left}
.report-title{font-size:16px;font-weight:700;color:#0D1B2E}
.report-subtitle{font-size:10px;color:#64748B;margin-top:2px}
.filters{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:10px;color:#475569;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:6px 10px;margin-bottom:10px}
.filters b{color:#0D1B2E;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:10.5px;table-layout:auto}
thead{display:table-header-group}
tfoot{display:table-footer-group}
thead th{background:#0A2342;color:#fff;padding:7px 8px;font-weight:700;font-size:10px;border-bottom:2px solid #4A9EE8;white-space:nowrap}
tbody td{padding:6px 8px;border-bottom:1px solid #E2E8F0;font-variant-numeric:tabular-nums}
tbody td.num{font-family:'Cairo',monospace;font-feature-settings:'tnum'}
tr.zebra{background:#FAFBFC}
tr.totals-row td{background:#0A2342;color:#fff;font-weight:700;border-top:2px solid #4A9EE8;padding:8px}
tr{page-break-inside:avoid;break-inside:avoid}
.empty{padding:40px;text-align:center;color:#94A3B8;font-size:13px}
.print-footer{margin-top:14px;padding-top:8px;border-top:1px solid #E2E8F0;display:flex;justify-content:space-between;font-size:9px;color:#94A3B8}
.print-footer .brand-name{color:#0D1B2E;font-weight:700}
</style></head>
<body>
  <div class="print-header">
    <div class="brand">
      ${company.logo_url
        ? `<img src="${escapeHtml(company.logo_url)}" alt="logo" />`
        : `<div class="logo-fallback">${escapeHtml((company.name || "C").charAt(0))}</div>`}
      <div>
        <div class="company-name">${escapeHtml(company.name || "—")}</div>
        <div class="company-meta">
          ${company.address ? escapeHtml(company.address) + " · " : ""}
          ${company.phone ? "📞 " + escapeHtml(company.phone) + " · " : ""}
          ${company.email ? "✉ " + escapeHtml(company.email) : ""}
          ${company.tax_number ? " · رقم ضريبي: " + escapeHtml(company.tax_number) : ""}
        </div>
      </div>
    </div>
    <div class="title-block">
      <div class="report-title">${escapeHtml(opts.reportTitle)}</div>
      ${opts.reportSubtitle ? `<div class="report-subtitle">${escapeHtml(opts.reportSubtitle)}</div>` : ""}
    </div>
  </div>
  ${filtersHtml}
  ${opts.data.length === 0
    ? `<div class="empty">لا توجد بيانات للفترة المحددة</div>`
    : `<table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
        ${totalsRowHtml ? `<tfoot>${totalsRowHtml}</tfoot>` : ""}
      </table>`}
  <div class="print-footer">
    <span>طُبع بتاريخ: ${escapeHtml(today)}</span>
    <span class="brand-name">نظام أموالي للمحاسبة</span>
    <span class="page-num"></span>
  </div>
  <script>
    window.addEventListener('load', function(){
      setTimeout(function(){ window.focus(); window.print(); }, 350);
    });
    window.addEventListener('afterprint', function(){ window.close(); });
  </script>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) {
    // Popup blocked
    // eslint-disable-next-line no-alert
    alert("الرجاء السماح بالنوافذ المنبثقة لطباعة التقرير.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}