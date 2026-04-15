/**
 * Delivery Note Print View — same visual identity as InvoicePrintView
 * but without prices, tax, discounts, payment info, and totals.
 */
import type { CompanySettings } from "@/hooks/useCompanySettings";

export interface DeliveryNoteData {
  deliveryNumber: string;
  date: string;
  contactName: string;
  contactPhone?: string;
  contactAddress?: string;
  items: { description: string; quantity: number; unit?: string }[];
  notes?: string;
  driverName?: string;
  vehicleNumber?: string;
  deliveryAddress?: string;
  status?: string;
}

interface Props {
  note: DeliveryNoteData;
  settings: CompanySettings;
  copyLabel?: string;
}

const fmtDate = (d: string) => {
  if (!d) return "—";
  const parts = d.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
};

const LARGE_WIDE_LOGO_OWNER_ID = "6e3d46e2-4b58-4e80-a71e-05661aa8adaf";

const DeliveryNotePrintView = ({ note, settings, copyLabel = "إرسالية مبيعات" }: Props) => {
  const today = new Date();
  const fmtToday = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;
  const hasExtraWideLogo = settings.user_id === LARGE_WIDE_LOGO_OWNER_ID;

  const centeredLogoWrapperStyle = hasExtraWideLogo
    ? { display: "inline-block", background: "white", borderRadius: "10px", padding: "6px 12px", boxShadow: "none", lineHeight: 0 }
    : { display: "inline-block", background: "white", borderRadius: "6px", padding: "2px 4px", boxShadow: "0 2px 12px rgba(0,0,0,0.15)" };
  const centeredLogoImageStyle = hasExtraWideLogo
    ? { width: "320px", height: "auto", objectFit: "contain" as const, display: "block" }
    : { height: "52px", objectFit: "contain" as const, display: "block" };
  const sideLogoImageStyle = hasExtraWideLogo
    ? { width: "320px", height: "auto", objectFit: "contain" as const, display: "block" }
    : { width: "56px", height: "56px", borderRadius: "8px", objectFit: "contain" as const, background: "white", padding: "3px" };

  const statusLabels: Record<string, string> = { draft: "مسودة", confirmed: "مؤكدة", delivered: "تم التسليم", converted: "محولة لفاتورة" };

  return (
    <div
      style={{
        width: "100%", maxWidth: "794px", margin: "0 auto", padding: "0",
        fontFamily: "'Cairo', sans-serif", direction: "rtl", fontSize: "11px",
        lineHeight: 1.5, color: "#1a1a2e", background: "white", position: "relative", overflow: "hidden",
      }}
    >
      {/* ━━━ DECORATIVE ORNAMENTS ━━━ */}
      {settings.print_decorative_ornaments && (
        <>
          <div style={{ position: "absolute", top: "-20px", right: "-20px", width: "120px", height: "120px", borderRadius: "50%", border: "1px solid rgba(74,158,232,0.08)", zIndex: 0, pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: "0px", right: "0px", width: "80px", height: "80px", borderRadius: "50%", border: "1px solid rgba(74,158,232,0.06)", zIndex: 0, pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: "-15px", left: "-15px", width: "100px", height: "100px", borderRadius: "50%", border: "1px solid rgba(27,58,92,0.06)", zIndex: 0, pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: "5px", left: "5px", width: "60px", height: "60px", borderRadius: "50%", border: "1px solid rgba(27,58,92,0.04)", zIndex: 0, pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: "68px", left: "0", right: "0", height: "1px", background: "repeating-linear-gradient(90deg, transparent, transparent 18px, rgba(74,158,232,0.08) 18px, rgba(74,158,232,0.08) 20px)", zIndex: 0, pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: "32px", left: "0", right: "0", height: "1px", background: "repeating-linear-gradient(90deg, transparent, transparent 18px, rgba(27,58,92,0.06) 18px, rgba(27,58,92,0.06) 20px)", zIndex: 0, pointerEvents: "none" }} />
        </>
      )}

      {/* ━━━ HEADER ━━━ */}
      {settings.invoice_header_layout === "logo_center" ? (
        <div style={{ background: "linear-gradient(135deg, #1B3A5C 0%, #0F2640 100%)", color: "white", padding: hasExtraWideLogo ? "8px 20px" : "10px 28px", position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ textAlign: "right", fontSize: "9px", flex: "0 0 auto" }}>
            <div style={{ fontSize: "11px", fontWeight: 700 }}>{settings.company_name || "اسم الشركة"}</div>
            {settings.email && <div style={{ opacity: 0.75 }}>✉️ {settings.email}</div>}
          </div>
          <div style={{ flex: hasExtraWideLogo ? "2 1 auto" : "1 1 auto", textAlign: "center", padding: hasExtraWideLogo ? "0 8px" : undefined }}>
            {settings.logo_url ? (
              <div style={centeredLogoWrapperStyle}>
                <img src={settings.logo_url} alt="Logo" style={centeredLogoImageStyle} />
              </div>
            ) : (
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#4A9EE8" }}>{(settings.company_name || "Q").charAt(0)}</div>
            )}
          </div>
          <div style={{ textAlign: "left", flex: "0 0 auto" }}>
            <div style={{ fontSize: "14px", fontWeight: 700 }}>إرسالية مبيعات</div>
            <div style={{ fontSize: "8px", opacity: 0.8, fontFamily: "'Segoe UI', sans-serif" }}>DELIVERY NOTE</div>
          </div>
        </div>
      ) : (
        <div style={{ background: "linear-gradient(135deg, #1B3A5C 0%, #0F2640 100%)", color: "white", padding: hasExtraWideLogo ? "12px 24px 10px" : "16px 28px 14px", display: "flex", justifyContent: "space-between", alignItems: hasExtraWideLogo ? "center" : "flex-start", position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: hasExtraWideLogo ? "center" : "flex-start", gap: hasExtraWideLogo ? "10px" : "14px", flex: 1 }}>
            {settings.logo_url ? (
              <img src={settings.logo_url} alt="Logo" style={sideLogoImageStyle} />
            ) : (
              <div style={{ width: "56px", height: "56px", borderRadius: "8px", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", fontWeight: 800, color: "#4A9EE8" }}>
                {(settings.company_name || "Q").charAt(0)}
              </div>
            )}
            <div>
              <div style={{ fontSize: "16px", fontWeight: 700 }}>{settings.company_name || "اسم الشركة"}</div>
              {settings.address && <div style={{ fontSize: "10px", opacity: 0.85, marginTop: "2px" }}>📍 {settings.address}{settings.city ? ` - ${settings.city}` : ""}</div>}
              {settings.phone && <div style={{ fontSize: "10px", opacity: 0.85 }}>📞 {settings.phone}</div>}
              {settings.email && <div style={{ fontSize: "10px", opacity: 0.75 }}>✉️ {settings.email}</div>}
            </div>
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: "20px", fontWeight: 700 }}>إرسالية مبيعات</div>
            <div style={{ fontSize: "10px", opacity: 0.8, fontFamily: "'Segoe UI', sans-serif" }}>DELIVERY NOTE</div>
          </div>
        </div>
      )}

      {/* ━━━ COPY LABEL ━━━ */}
      {copyLabel && (
        <div style={{ textAlign: "center", padding: "6px 0 2px", position: "relative", zIndex: 1 }}>
          <span style={{ display: "inline-block", background: "#EEF2FF", color: "#1B3A5C", padding: "3px 20px", borderRadius: "4px", fontSize: "10px", fontWeight: 700, letterSpacing: "1px", border: "1px solid #C7D2FE" }}>
            {copyLabel}
          </span>
        </div>
      )}

      {/* ━━━ GOLD ACCENT ━━━ */}
      <div style={{ height: "3px", background: "linear-gradient(90deg, #4A9EE8, #7BB8F0, #4A9EE8)" }} />

      {/* ━━━ REGISTRATION STRIP ━━━ */}
      <div style={{ padding: "6px 28px", background: "#F8FAFC", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "9px", color: "#4B5563" }}>
        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
          {settings.licensed_dealer_number && <span><strong style={{ color: "#1B3A5C" }}>مشتغل مرخص:</strong> {settings.licensed_dealer_number}</span>}
          {settings.commercial_register && <span><strong style={{ color: "#1B3A5C" }}>سجل تجاري:</strong> {settings.commercial_register}</span>}
        </div>
        <div style={{ fontWeight: 600, color: "#1B3A5C" }}>وثيقة تسليم بضاعة</div>
      </div>

      {/* ━━━ META & CUSTOMER ━━━ */}
      <div style={{ padding: "12px 28px", display: "flex", justifyContent: "space-between", borderBottom: "1px solid #E5E7EB" }}>
        <div>
          <div style={{ fontSize: "9px", color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>العميل</div>
          <div style={{ fontSize: "15px", fontWeight: 700, color: "#1B3A5C" }}>{note.contactName}</div>
          {note.contactPhone && <div style={{ fontSize: "10px", color: "#4B5563", marginTop: "1px" }}>📞 {note.contactPhone}</div>}
          {note.contactAddress && <div style={{ fontSize: "10px", color: "#4B5563", marginTop: "1px" }}>📍 {note.contactAddress}</div>}
        </div>
        <div style={{ textAlign: "left", fontSize: "10px" }}>
          {[
            { label: "رقم الإرسالية", value: note.deliveryNumber, mono: true },
            { label: "التاريخ", value: fmtDate(note.date) },
            ...(note.status ? [{ label: "الحالة", value: statusLabels[note.status] || note.status }] : []),
            ...(note.driverName ? [{ label: "السائق", value: note.driverName }] : []),
            ...(note.vehicleNumber ? [{ label: "رقم المركبة", value: note.vehicleNumber }] : []),
          ].map((row, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginBottom: "3px" }}>
              <span style={{ color: "#6B7280" }}>{row.label}:</span>
              <span style={{ fontWeight: 600, color: "#1B3A5C", ...((row as any).mono ? { fontFamily: "monospace" } : {}) }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ━━━ DELIVERY ADDRESS ━━━ */}
      {note.deliveryAddress && (
        <div style={{ margin: "8px 28px 0", padding: "6px 14px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "6px", fontSize: "10px" }}>
          <span style={{ fontWeight: 700, color: "#92400E" }}>عنوان التسليم: </span>
          <span style={{ color: "#78350F" }}>{note.deliveryAddress}</span>
        </div>
      )}

      {/* ━━━ ITEMS TABLE (no prices) ━━━ */}
      <div style={{ padding: "8px 28px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "8%" }} />
            <col style={{ width: "62%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "15%" }} />
          </colgroup>
          <thead>
            <tr style={{ background: "#1B3A5C", color: "white" }}>
              {["#", "الصنف / الوصف", "الوحدة", "الكمية"].map((h, i) => (
                <th key={i} style={{ padding: "6px 4px", textAlign: i >= 2 ? "center" : "right", fontWeight: 700, fontSize: "9px", borderBottom: "2px solid #4A9EE8", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {note.items.map((item, idx) => (
              <tr key={idx} style={{ background: idx % 2 === 0 ? "white" : "#FAFBFC", borderBottom: "1px solid #F3F4F6" }}>
                <td style={{ padding: "5px 4px", textAlign: "center", color: "#6B7280", fontWeight: 600 }}>{idx + 1}</td>
                <td style={{ padding: "5px 4px", fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</td>
                <td style={{ padding: "5px 4px", textAlign: "center", color: "#4B5563" }}>{item.unit || "—"}</td>
                <td style={{ padding: "5px 4px", textAlign: "center", fontWeight: 700, color: "#1B3A5C", fontFeatureSettings: "'tnum'" }}>{item.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ━━━ TOTAL ITEMS COUNT ━━━ */}
      <div style={{ padding: "0 28px 8px", display: "flex", justifyContent: "flex-start" }}>
        <div style={{ border: "1px solid #E5E7EB", borderRadius: "8px", overflow: "hidden", minWidth: "200px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 14px", background: "#1B3A5C", color: "white", fontSize: "11px", fontWeight: 700 }}>
            <span>إجمالي الأصناف</span>
            <span style={{ color: "#4A9EE8", fontFeatureSettings: "'tnum'" }}>{note.items.length} صنف</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 14px", fontSize: "10px" }}>
            <span style={{ color: "#6B7280" }}>إجمالي الكميات</span>
            <span style={{ fontWeight: 600, color: "#1B3A5C", fontFeatureSettings: "'tnum'" }}>{note.items.reduce((s, i) => s + i.quantity, 0)}</span>
          </div>
        </div>
      </div>

      {/* ━━━ NOTES ━━━ */}
      {note.notes && (
        <div style={{ margin: "0 28px 8px", padding: "8px 14px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "10px" }}>
          <span style={{ fontWeight: 700, color: "#1B3A5C" }}>ملاحظات: </span>
          <span style={{ color: "#4B5563" }}>{note.notes}</span>
        </div>
      )}

      {/* ━━━ LEGAL NOTE ━━━ */}
      <div style={{ margin: "0 28px 8px", padding: "6px 14px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: "6px", fontSize: "8px", color: "#1E40AF", textAlign: "center" }}>
        هذه الإرسالية وثيقة تسليم بضاعة وليست فاتورة ضريبية — لا تُعتبر مستنداً مالياً للأغراض الضريبية
      </div>

      {/* ━━━ SIGNATURES ━━━ */}
      <div style={{ margin: "0 28px", padding: "10px 0", borderTop: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between" }}>
        <div style={{ textAlign: "center", minWidth: "160px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#1B3A5C", marginBottom: "8px" }}>توقيع المُرسِل</div>
          <div style={{ width: "130px", height: "40px", border: "1px dashed #D1D5DB", borderRadius: "6px", margin: "0 auto 4px" }} />
          <div style={{ fontSize: "8px", color: "#9CA3AF" }}>الاسم والتوقيع</div>
        </div>
        <div style={{ textAlign: "center", minWidth: "160px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#1B3A5C", marginBottom: "8px" }}>توقيع المستلم</div>
          <div style={{ width: "130px", height: "40px", border: "1px dashed #D1D5DB", borderRadius: "6px", margin: "0 auto 4px" }} />
          <div style={{ fontSize: "8px", color: "#9CA3AF" }}>الاسم والتوقيع</div>
        </div>
        <div style={{ textAlign: "center", minWidth: "160px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#1B3A5C", marginBottom: "8px" }}>توقيع السائق</div>
          <div style={{ width: "130px", height: "40px", border: "1px dashed #D1D5DB", borderRadius: "6px", margin: "0 auto 4px" }} />
          <div style={{ fontSize: "8px", color: "#9CA3AF" }}>الاسم والتوقيع</div>
        </div>
        <div style={{ textAlign: "center", minWidth: "120px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#1B3A5C", marginBottom: "8px" }}>الختم</div>
          <div style={{ width: "60px", height: "60px", border: "1px dashed #D1D5DB", borderRadius: "50%", margin: "0 auto" }} />
        </div>
      </div>

      {/* ━━━ BOTTOM BAR ━━━ */}
      <div style={{ background: "#1B3A5C", color: "rgba(255,255,255,0.7)", padding: "6px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "9px" }}>
        <span>طُبع بتاريخ: {fmtToday}</span>
        <span style={{ color: "#4A9EE8", fontWeight: 600 }}>AMWALI أموالي</span>
        <span>صفحة 1 من 1</span>
      </div>
    </div>
  );
};

export default DeliveryNotePrintView;
