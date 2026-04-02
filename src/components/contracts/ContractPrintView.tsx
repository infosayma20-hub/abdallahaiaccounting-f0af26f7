import React from "react";

export interface ContractData {
  contract_number?: string;
  project_name: string;
  client_name: string;
  client_phone?: string;
  client_address?: string;
  project_location?: string;
  contract_value: number;
  start_date?: string | null;
  end_date?: string | null;
  duration_text?: string;
  payment_terms?: string;
  scope_items: string[];
  advance_payment?: number;
  advance_payment_note?: string;
  total_expenses?: number;
  total_receipts?: number;
  logo_url?: string;
  terms_obligations?: string;
  terms_payment?: string;
  terms_disputes?: string;
  notes?: string;
  created_at?: string;
  // Company info
  company_name?: string;
  company_phone?: string;
  company_address?: string;
  company_email?: string;
}

interface Props {
  data: ContractData;
  className?: string;
}

const fmtNum = (n: number) => (n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtDate = (d?: string | null) => {
  if (!d) return "-";
  try { return new Date(d).toLocaleDateString("en-GB"); } catch { return d; }
};

const ContractPrintView = React.forwardRef<HTMLDivElement, Props>(({ data, className }, ref) => {
  const remaining = (data.contract_value || 0) - (data.total_expenses || 0);

  return (
    <div ref={ref} className={className} style={{ fontFamily: "'Cairo', sans-serif", direction: "rtl", color: "#1a1a1a", background: "white" }}>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "0 40px 40px" }}>
        {/* Top accent bar */}
        <div style={{ height: 6, background: "linear-gradient(90deg, #1B3A5C, #2d6a4f, #1B3A5C)", borderRadius: "0 0 3px 3px" }} />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px 0 18px", borderBottom: "3px solid #1B3A5C" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {data.logo_url ? (
              <img src={data.logo_url} alt="logo" style={{ maxHeight: 64, maxWidth: 64, borderRadius: 6, objectFit: "contain" }} />
            ) : (
              <div style={{ width: 64, height: 64, background: "#f0f4f8", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#999" }}>شعار</div>
            )}
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#1B3A5C" }}>{data.company_name || "الشركة"}</div>
              {data.company_address && <div style={{ fontSize: 11, color: "#888" }}>{data.company_address}</div>}
            </div>
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 13, color: "#1B3A5C", fontWeight: 600 }}>Contract Agreement</div>
            <div style={{ fontSize: 11, color: "#aaa", letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>PROJECT AGREEMENT</div>
            {data.contract_number && <div style={{ fontSize: 12, color: "#1B3A5C", fontWeight: 700, marginTop: 4, fontFamily: "monospace" }}>{data.contract_number}</div>}
          </div>
        </div>

        {/* Golden accent line */}
        <div style={{ height: 2, background: "linear-gradient(90deg, transparent, #c8a84e, transparent)", margin: "0" }} />

        {/* Title */}
        <div style={{ textAlign: "center", fontSize: 20, fontWeight: 700, margin: "28px 0 6px", padding: "14px 0", background: "linear-gradient(135deg, #f0f4f8, #e8eef5)", border: "1px solid #c8d6e5", borderRadius: 8, color: "#1B3A5C" }}>
          عقد اتفاق مشروع
        </div>
        <div style={{ textAlign: "center", fontSize: 13, color: "#888", letterSpacing: 1, marginBottom: 24 }}>Project Agreement</div>

        {/* Parties Info */}
        <SectionTitle title="بيانات الأطراف" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 30px", marginBottom: 20 }}>
          <InfoRow label="الطرف الأول (المقاول):" value={data.company_name || "-"} />
          <InfoRow label="الطرف الثاني (العميل):" value={data.client_name} />
          <InfoRow label="العنوان:" value={data.client_address || "-"} />
          <InfoRow label="رقم الجوال:" value={data.client_phone || "-"} />
        </div>

        {/* Project Details */}
        <SectionTitle title="بيانات المشروع" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 30px", marginBottom: 20 }}>
          <InfoRow label="اسم المشروع:" value={data.project_name} />
          <InfoRow label="اسم العميل:" value={data.client_name} />
          <InfoRow label="رقم الجوال:" value={data.client_phone || "-"} />
          <InfoRow label="العنوان:" value={data.client_address || data.project_location || "-"} />
          <InfoRow label="تاريخ البداية:" value={fmtDate(data.start_date)} />
          <InfoRow label="تاريخ النهاية:" value={fmtDate(data.end_date)} />
          <InfoRow label="مدة التنفيذ:" value={data.duration_text || "-"} />
          <InfoRow label="آلية الدفع:" value={data.payment_terms || "-"} />
        </div>

        {/* Scope of Work */}
        {data.scope_items && data.scope_items.length > 0 && (
          <>
            <SectionTitle title="المهام المطلوبة" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 30px", marginBottom: 20 }}>
              {data.scope_items.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "5px 0" }}>
                  <span style={{ color: "#1B3A5C", fontWeight: 700, fontSize: 15 }}>✓</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Financial Summary */}
        <SectionTitle title="الملخص المالي" />
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8, marginBottom: 20 }}>
          <thead>
            <tr>
              <th style={{ background: "#1B3A5C", color: "white", padding: "10px 14px", fontSize: 13, fontWeight: 600, textAlign: "right" }}>البند</th>
              <th style={{ background: "#1B3A5C", color: "white", padding: "10px 14px", fontSize: 13, fontWeight: 600, textAlign: "right" }}>المبلغ (₪)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={tdStyle}>الميزانية المتفق عليها</td><td style={{ ...tdStyle, color: "#1B3A5C", fontWeight: 600 }}>{fmtNum(data.contract_value)}</td></tr>
            <tr><td style={tdStyle}>إجمالي المصروفات</td><td style={{ ...tdStyle, color: "#c0392b", fontWeight: 600 }}>{fmtNum(data.total_expenses || 0)}</td></tr>
            <tr><td style={tdStyle}>إجمالي المقبوضات</td><td style={{ ...tdStyle, color: "#1B3A5C", fontWeight: 600 }}>{fmtNum(data.total_receipts || 0)}</td></tr>
            <tr>
              <td style={{ ...tdStyle, borderBottom: "2px solid #1B3A5C", fontWeight: 700, background: "#f7f9fb" }}>المتبقي</td>
              <td style={{ ...tdStyle, borderBottom: "2px solid #1B3A5C", fontWeight: 700, background: "#f7f9fb", color: "#1B3A5C" }}>{fmtNum(remaining)}</td>
            </tr>
          </tbody>
        </table>

        {/* Terms & Conditions */}
        {(data.terms_obligations || data.terms_payment || data.terms_disputes) && (
          <>
            <SectionTitle title="الشروط والأحكام" />
            <div style={{ marginBottom: 20 }}>
              {data.terms_obligations && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1B3A5C", marginBottom: 4 }}>المادة الأولى — الالتزامات</div>
                  <div style={{ fontSize: 12, color: "#444", lineHeight: 1.8, paddingRight: 12 }}>{data.terms_obligations}</div>
                </div>
              )}
              {data.terms_payment && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1B3A5C", marginBottom: 4 }}>المادة الثانية — شروط الدفع</div>
                  <div style={{ fontSize: 12, color: "#444", lineHeight: 1.8, paddingRight: 12 }}>{data.terms_payment}</div>
                </div>
              )}
              {data.terms_disputes && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1B3A5C", marginBottom: 4 }}>المادة الثالثة — فض النزاعات</div>
                  <div style={{ fontSize: 12, color: "#444", lineHeight: 1.8, paddingRight: 12 }}>{data.terms_disputes}</div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Notes */}
        {data.notes && (
          <>
            <SectionTitle title="ملاحظات" />
            <div style={{ fontSize: 13, color: "#444", padding: "10px 14px", background: "#fafafa", border: "1px solid #eee", borderRadius: 4, lineHeight: 1.7, marginBottom: 20 }}>
              {data.notes}
            </div>
          </>
        )}

        {/* Separator */}
        <div style={{ border: "none", borderTop: "1px solid #e0e0e0", margin: "30px 0" }} />

        {/* Signatures */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, marginTop: 40 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#1B3A5C", marginBottom: 6 }}>الطرف الأول (المقاول)</div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 24 }}>الاسم: <span style={{ display: "inline-block", borderBottom: "1px solid #333", minWidth: 160, marginRight: 6 }}>&nbsp;</span></div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 14 }}>التوقيع: <span style={{ display: "inline-block", borderBottom: "1px solid #333", minWidth: 160, marginRight: 6 }}>&nbsp;</span></div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#1B3A5C", marginBottom: 6 }}>الطرف الثاني (العميل)</div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 24 }}>الاسم: <span style={{ display: "inline-block", borderBottom: "1px solid #333", minWidth: 160, marginRight: 6 }}>&nbsp;</span></div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 14 }}>التوقيع: <span style={{ display: "inline-block", borderBottom: "1px solid #333", minWidth: 160, marginRight: 6 }}>&nbsp;</span></div>
          </div>
        </div>

        {/* Date */}
        <div style={{ textAlign: "center", marginTop: 30, fontSize: 12, color: "#555" }}>
          التاريخ: <span style={{ display: "inline-block", borderBottom: "1px solid #333", minWidth: 160, marginRight: 6 }}>
            {fmtDate(data.created_at || new Date().toISOString())}
          </span>
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 40, paddingTop: 14, borderTop: "2px solid #1B3A5C" }}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>هذا العقد محرر من نسختين أصليتين تحتفظ كل جهة بنسخة للعمل بها</div>
          {data.logo_url && <img src={data.logo_url} alt="" style={{ maxHeight: 24, margin: "6px auto" }} />}
          <div style={{ fontSize: 10, color: "#aaa" }}>
            {data.company_name}
            {data.company_phone && ` • ${data.company_phone}`}
            {data.company_address && ` • ${data.company_address}`}
          </div>
        </div>
      </div>
    </div>
  );
});

ContractPrintView.displayName = "ContractPrintView";

const tdStyle: React.CSSProperties = { padding: "10px 14px", fontSize: 13, textAlign: "right", borderBottom: "1px solid #e5e5e5" };

function SectionTitle({ title }: { title: string }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 700, color: "#1B3A5C", paddingBottom: 6, marginBottom: 12, borderBottom: "1.5px solid #d4dce8" }}>
      {title}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 13, padding: "5px 0", borderBottom: "1px dotted #e8e8e8" }}>
      <span style={{ fontWeight: 600, minWidth: 130, color: "#333", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ color: "#1a1a1a" }}>{value}</span>
    </div>
  );
}

export default ContractPrintView;
