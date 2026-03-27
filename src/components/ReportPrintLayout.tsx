import { ReactNode, useMemo, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface CompanyInfo {
  name: string;
  logo_url: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  tax_number: string;
}

interface SummaryCard {
  label: string;
  value: number;
  color: "gray" | "red" | "green" | "blue" | "navy";
  suffix?: string;
  highlight?: boolean;
}

interface ReportPrintLayoutProps {
  /** Report title in Arabic */
  reportTitle: string;
  /** Report title in English */
  reportTitleEn?: string;
  /** Report number e.g. SOA-2026-0042 */
  reportNumber?: string;
  /** Period label */
  periodLabel?: string;
  /** Date from */
  dateFrom?: string;
  /** Date to */
  dateTo?: string;
  /** Currency label */
  currencyLabel?: string;
  /** Addressed to (contact name) */
  addressedTo?: string;
  /** Addressed to subtitle / badge */
  addressedToSubtitle?: string;
  /** Addressed to extra lines */
  addressedToExtra?: string[];
  /** Summary cards (max 4) */
  summaryCards?: SummaryCard[];
  /** Table content */
  children: ReactNode;
  /** Show signature section */
  showSignature?: boolean;
  /** Show overdue alert */
  overdueAlert?: ReactNode;
  /** Additional info rows in meta section */
  metaRows?: { label: string; value: string }[];
  /** Override company info */
  company?: CompanyInfo;
}

const fmtDateSlash = (d: Date) => {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const fmtAmount = (n: number) =>
  `₪${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CARD_STYLES: Record<string, { bg: string; border: string; color: string }> = {
  gray: { bg: "#F8FAFC", border: "#E2E8F0", color: "#334155" },
  red: { bg: "#FEF2F2", border: "#FECACA", color: "#DC2626" },
  green: { bg: "#F0FDF4", border: "#BBF7D0", color: "#16A34A" },
  blue: { bg: "#EFF6FF", border: "#BFDBFE", color: "#2563EB" },
  navy: { bg: "#F0F4F8", border: "#CBD5E1", color: "#1B3A5C" },
};

export function useCompanyInfo(): CompanyInfo {
  const { user } = useAuth();
  const [info, setInfo] = useState<CompanyInfo>({
    name: "", logo_url: "", address: "", phone: "", email: "", website: "", tax_number: "",
  });

  useEffect(() => {
    if (!user) return;

    const loadInfo = async () => {
      // Fetch from company_settings
      const { data: settingsData } = await supabase.from("company_settings" as any)
        .select("company_name, logo_url, address, phone, email, website, tax_number")
        .eq("user_id", user.id)
        .maybeSingle() as any;

      // Fetch from companies table for logo
      const { data: companyData } = await supabase.from("companies")
        .select("name, logo_url, address, phone, email, tax_number")
        .eq("owner_id", user.id)
        .maybeSingle();

      const s = settingsData as any;
      const c = companyData as any;

      setInfo({
        name: s?.company_name || c?.name || "",
        logo_url: c?.logo_url || s?.logo_url || "",
        address: s?.address || c?.address || "",
        phone: s?.phone || c?.phone || "",
        email: s?.email || c?.email || "",
        website: s?.website || "",
        tax_number: s?.tax_number || c?.tax_number || "",
      });
    };

    loadInfo();
  }, [user]);

  return info;
}

const ReportPrintLayout = ({
  reportTitle,
  reportTitleEn,
  reportNumber,
  periodLabel,
  dateFrom,
  dateTo,
  currencyLabel = "شيكل إسرائيلي (₪ ILS)",
  addressedTo,
  addressedToSubtitle,
  addressedToExtra,
  summaryCards,
  children,
  showSignature = true,
  overdueAlert,
  metaRows,
  company: companyOverride,
}: ReportPrintLayoutProps) => {
  const companyFromDB = useCompanyInfo();
  const company = companyOverride || companyFromDB;
  const today = new Date();

  const baseStyle: React.CSSProperties = {
    width: "210mm",
    minHeight: "297mm",
    margin: "0 auto",
    padding: "0",
    fontFamily: "'Cairo', 'Segoe UI', sans-serif",
    direction: "rtl",
    fontSize: "11px",
    lineHeight: 1.5,
    position: "relative",
    background: "white",
    color: "black",
  };

  return (
    <div className="report-print-page" style={baseStyle}>
      {/* ━━━ HEADER BAR ━━━ */}
      <div style={{
        background: "linear-gradient(135deg, #1B3A5C 0%, #0F2640 100%)",
        color: "white",
        padding: "16px 28px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {company.logo_url ? (
            <img src={company.logo_url} alt="Logo" style={{
              width: "52px", height: "52px", borderRadius: "8px", objectFit: "contain",
              background: "white", padding: "3px",
            }} />
          ) : (
            <div style={{
              width: "52px", height: "52px", borderRadius: "8px",
              background: "rgba(255,255,255,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "20px", fontWeight: 800, color: "#4A9EE8",
            }}>
              {company.name?.charAt(0) || "C"}
            </div>
          )}
          <div>
            <div style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "0.3px" }}>{company.name}</div>
            <div style={{ fontSize: "10px", opacity: 0.85, marginTop: "2px" }}>
              {company.address && <span>{company.address}</span>}
              {company.phone && <span style={{ marginRight: "12px" }}>📞 {company.phone}</span>}
            </div>
            <div style={{ fontSize: "10px", opacity: 0.75, marginTop: "1px" }}>
              {company.email && <span>✉️ {company.email}</span>}
              {company.tax_number && <span style={{ marginRight: "12px" }}>رقم ضريبي: {company.tax_number}</span>}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: "18px", fontWeight: 700 }}>{reportTitle}</div>
          {reportTitleEn && (
            <div style={{ fontSize: "10px", opacity: 0.8, fontFamily: "'Segoe UI', sans-serif" }}>{reportTitleEn}</div>
          )}
        </div>
      </div>

      {/* ━━━ GOLD ACCENT LINE ━━━ */}
      <div style={{ height: "3px", background: "linear-gradient(90deg, #4A9EE8, #E8D48B, #4A9EE8)" }} />

      {/* ━━━ INFO SECTION ━━━ */}
      <div style={{ padding: "14px 28px", display: "flex", justifyContent: "space-between", borderBottom: "1px solid #E5E7EB" }}>
        {addressedTo ? (
          <div>
            <div style={{ fontSize: "9px", color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
              صادر إلى
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#1B3A5C" }}>{addressedTo}</div>
            {addressedToSubtitle && (
              <span style={{
                fontSize: "9px", padding: "2px 8px", borderRadius: "4px",
                background: "#EBF5FF", color: "#1B3A5C", fontWeight: 600,
                display: "inline-block", marginTop: "4px",
              }}>
                {addressedToSubtitle}
              </span>
            )}
            {addressedToExtra?.map((line, i) => (
              <div key={i} style={{ fontSize: "10px", color: "#4B5563", marginTop: "3px" }}>{line}</div>
            ))}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#1B3A5C" }}>{reportTitle}</div>
            {periodLabel && <div style={{ fontSize: "11px", color: "#6B7280", marginTop: "4px" }}>{periodLabel}</div>}
          </div>
        )}

        <div style={{ textAlign: "left", fontSize: "10px" }}>
          {reportNumber && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginBottom: "3px" }}>
              <span style={{ color: "#6B7280" }}>رقم التقرير:</span>
              <span style={{ fontWeight: 700, color: "#1B3A5C", fontFamily: "monospace" }}>{reportNumber}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginBottom: "3px" }}>
            <span style={{ color: "#6B7280" }}>تاريخ الإصدار:</span>
            <span style={{ fontWeight: 600 }}>{fmtDateSlash(today)}</span>
          </div>
          {dateFrom && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginBottom: "3px" }}>
              <span style={{ color: "#6B7280" }}>من:</span>
              <span style={{ fontWeight: 600 }}>{dateFrom}</span>
            </div>
          )}
          {dateTo && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginBottom: "3px" }}>
              <span style={{ color: "#6B7280" }}>إلى:</span>
              <span style={{ fontWeight: 600 }}>{dateTo}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", gap: "20px" }}>
            <span style={{ color: "#6B7280" }}>العملة:</span>
            <span style={{ fontWeight: 600 }}>{currencyLabel}</span>
          </div>
          {metaRows?.map((row, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginTop: "3px" }}>
              <span style={{ color: "#6B7280" }}>{row.label}:</span>
              <span style={{ fontWeight: 600 }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ━━━ SUMMARY CARDS ━━━ */}
      {summaryCards && summaryCards.length > 0 && (
        <div style={{ padding: "12px 28px", display: "grid", gridTemplateColumns: `repeat(${summaryCards.length}, 1fr)`, gap: "10px" }}>
          {summaryCards.map((card, i) => {
            const style = CARD_STYLES[card.color] || CARD_STYLES.gray;
            return (
              <div key={i} style={{
                background: style.bg, border: `1px solid ${style.border}`,
                borderRadius: "8px", padding: "10px 12px", textAlign: "center",
                ...(card.highlight ? { boxShadow: `0 2px 8px ${style.border}` } : {}),
              }}>
                <div style={{ fontSize: "9px", color: "#6B7280", fontWeight: 600, marginBottom: "4px" }}>{card.label}</div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: style.color, fontFeatureSettings: "'tnum'" }}>
                  {fmtAmount(card.value)}
                </div>
                {card.suffix && (
                  <div style={{ fontSize: "9px", color: style.color, marginTop: "2px", fontWeight: 600 }}>({card.suffix})</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ━━━ TABLE / CONTENT ━━━ */}
      <div style={{ padding: "0 28px 8px" }}>
        {children}
      </div>

      {/* ━━━ OVERDUE ALERT ━━━ */}
      {overdueAlert && (
        <div style={{ margin: "0 28px 12px" }}>
          {overdueAlert}
        </div>
      )}

      {/* ━━━ FOOTER - CONTACT & SIGNATURE ━━━ */}
      {showSignature && (
        <div style={{
          margin: "0 28px", padding: "14px 0", borderTop: "1px solid #E5E7EB",
          display: "flex", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#1B3A5C", marginBottom: "6px" }}>للمطابقة والاستفسار:</div>
            <div style={{ fontSize: "10px", color: "#4B5563", lineHeight: 1.8 }}>
              {company.phone && <div>📞 {company.phone}</div>}
              {company.email && <div>✉️ {company.email}</div>}
              {company.website && <div>🌐 {company.website}</div>}
              {company.address && <div>📍 {company.address}</div>}
            </div>
          </div>
          <div style={{ textAlign: "center", minWidth: "180px" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#1B3A5C", marginBottom: "8px" }}>
              ختم الشركة وتوقيع المحاسب:
            </div>
            <div style={{
              width: "160px", height: "60px", border: "1px dashed #D1D5DB",
              borderRadius: "6px", margin: "0 auto 6px",
            }} />
            <div style={{ fontSize: "8px", color: "#9CA3AF" }}>اسم المحاسب وتوقيعه</div>
          </div>
        </div>
      )}

      {/* ━━━ BOTTOM BAR ━━━ */}
      <div style={{
        background: "#1B3A5C", color: "rgba(255,255,255,0.7)", padding: "8px 28px",
        display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "9px",
        position: "absolute", bottom: 0, left: 0, right: 0,
      }}>
        <span>طُبع بتاريخ: {fmtDateSlash(today)}</span>
        <span style={{ color: "#4A9EE8", fontWeight: 600 }}>نظام عبدالله AI للمحاسبة</span>
        <span>صفحة 1 من 1</span>
      </div>
    </div>
  );
};

export default ReportPrintLayout;

/**
 * Generate professional HTML for PDF export with navy header, gold accent, and company branding.
 * Opens in new window and triggers print.
 */
export function generateProfessionalPDFHtml({
  company,
  reportTitle,
  reportTitleEn,
  periodLabel,
  summaryItems,
  tableHeaders,
  tableRows,
  notes,
}: {
  company: CompanyInfo;
  reportTitle: string;
  reportTitleEn?: string;
  periodLabel?: string;
  summaryItems?: { label: string; value: string; color?: string }[];
  tableHeaders: string[];
  tableRows: string[][];
  notes?: string[];
}) {
  const today = fmtDateSlash(new Date());

  const summaryHtml = summaryItems?.length ? `
    <div class="summary">${summaryItems.map(s => `
      <div class="sbox"><div class="lbl">${s.label}</div><div class="val" style="color:${s.color || '#1B3A5C'}">${s.value}</div></div>
    `).join("")}</div>` : "";

  const rowsHtml = tableRows.map((row, i) => `
    <tr class="${i % 2 === 1 ? 'zebra' : ''}">
      ${row.map(cell => `<td>${cell}</td>`).join("")}
    </tr>
  `).join("");

  const notesHtml = notes?.length ? `
    <div class="notes">${notes.map(n => `<p>${n}</p>`).join("")}</div>` : "";

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box;font-family:'Cairo',sans-serif}
body{background:#fff;color:#1f2937;font-size:11px;line-height:1.5}
@page{size:A4 portrait;margin:0}
.page{width:210mm;min-height:297mm;margin:0 auto;position:relative}
.header-bar{background:linear-gradient(135deg,#1B3A5C 0%,#0F2640 100%);color:#fff;padding:16px 28px;display:flex;justify-content:space-between;align-items:center}
.header-bar .company{display:flex;align-items:center;gap:14px}
.header-bar .logo{width:52px;height:52px;border-radius:8px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#4A9EE8}
.header-bar .logo img{width:52px;height:52px;border-radius:8px;object-fit:contain;background:#fff;padding:3px}
.header-bar h2{font-size:16px;font-weight:700}.header-bar .sub{font-size:10px;opacity:0.8;margin-top:2px}
.header-bar .title{text-align:left}.header-bar .title h1{font-size:18px;font-weight:700}
.header-bar .title p{font-size:10px;opacity:0.8;font-family:'Segoe UI',sans-serif}
.gold-line{height:3px;background:linear-gradient(90deg,#4A9EE8,#E8D48B,#4A9EE8)}
.info{padding:14px 28px;display:flex;justify-content:space-between;border-bottom:1px solid #E5E7EB;font-size:10px}
.info .report-title{font-size:16px;font-weight:700;color:#1B3A5C}
.info .period{font-size:11px;color:#6B7280;margin-top:4px}
.info .meta span{color:#6B7280}.info .meta strong{font-weight:600;color:#1B3A5C}
.summary{padding:12px 28px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.sbox{border:1px solid #E2E8F0;border-radius:8px;padding:10px 12px;text-align:center;background:#F8FAFC}
.sbox .lbl{font-size:9px;color:#6B7280;font-weight:600;margin-bottom:4px}
.sbox .val{font-size:14px;font-weight:700;font-feature-settings:'tnum'}
table{width:100%;border-collapse:collapse;font-size:10px;margin:0 28px;width:calc(100% - 56px)}
thead tr{background:#1B3A5C;color:#fff}
thead th{padding:8px;font-weight:700;border-bottom:2px solid #4A9EE8;text-align:right}
tbody td{padding:6px 8px;border-bottom:1px solid #F3F4F6}
.zebra{background:#FAFBFC}
.totals-row{background:#1B3A5C;color:#fff;font-weight:700}
.totals-row td{padding:8px}
.notes{margin:12px 28px;font-size:9px;color:#6B7280;border-top:1px solid #E5E7EB;padding-top:8px}
.footer-section{margin:0 28px;padding:14px 0;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between}
.footer-section .contact{font-size:10px;color:#4B5563;line-height:1.8}
.footer-section .contact h4{font-weight:700;color:#1B3A5C;margin-bottom:6px}
.sig-box{text-align:center;min-width:180px}
.sig-box h4{font-size:10px;font-weight:700;color:#1B3A5C;margin-bottom:8px}
.sig-box .line{width:160px;height:60px;border:1px dashed #D1D5DB;border-radius:6px;margin:0 auto 6px}
.sig-box .lbl{font-size:8px;color:#9CA3AF}
.bottom-bar{background:#1B3A5C;color:rgba(255,255,255,0.7);padding:8px 28px;display:flex;justify-content:space-between;font-size:9px;position:absolute;bottom:0;left:0;right:0}
.bottom-bar .brand{color:#4A9EE8;font-weight:600}
@media print{body{margin:0;padding:0}.page{width:100%!important}}
</style></head><body>
<div class="page">
  <div class="header-bar">
    <div class="company">
      <div class="logo">${company.logo_url ? `<img src="${company.logo_url}" alt="Logo">` : (company.name?.charAt(0) || 'C')}</div>
      <div>
        <h2>${company.name}</h2>
        <div class="sub">${company.address || ''} ${company.phone ? '📞 ' + company.phone : ''}</div>
        <div class="sub">${company.email ? '✉️ ' + company.email : ''} ${company.tax_number ? 'رقم ضريبي: ' + company.tax_number : ''}</div>
      </div>
    </div>
    <div class="title">
      <h1>${reportTitle}</h1>
      ${reportTitleEn ? `<p>${reportTitleEn}</p>` : ''}
    </div>
  </div>
  <div class="gold-line"></div>
  <div class="info">
    <div>
      <div class="report-title">${reportTitle}</div>
      ${periodLabel ? `<div class="period">${periodLabel}</div>` : ''}
    </div>
    <div class="meta">
      <div>تاريخ الإصدار: <strong>${today}</strong></div>
    </div>
  </div>
  ${summaryHtml}
  <table>
    <thead><tr>${tableHeaders.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  ${notesHtml}
  <div class="footer-section">
    <div class="contact">
      <h4>للمطابقة والاستفسار:</h4>
      ${company.phone ? '<div>📞 ' + company.phone + '</div>' : ''}
      ${company.email ? '<div>✉️ ' + company.email + '</div>' : ''}
      ${company.website ? '<div>🌐 ' + company.website + '</div>' : ''}
    </div>
    <div class="sig-box">
      <h4>ختم الشركة وتوقيع المحاسب:</h4>
      <div class="line"></div>
      <div class="lbl">اسم المحاسب وتوقيعه</div>
    </div>
  </div>
  <div class="bottom-bar">
    <span>طُبع بتاريخ: ${today}</span>
    <span class="brand">نظام عبدالله AI للمحاسبة</span>
    <span>صفحة 1 من 1</span>
  </div>
</div>
</body></html>`;
}

export function openPrintWindow(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) win.onload = () => setTimeout(() => win.print(), 500);
}
