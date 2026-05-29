import { useState, useRef, useEffect } from "react";

interface VoucherCancelModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string, details: string) => Promise<void>;
  voucherRef: string;
  voucherType: "receipt" | "payment";
  contactName: string;
  amount: number;
  date: string;
  paymentMethod: string;
  currencySymbol?: string;
}

const cancellationReasons = [
  { value: "", label: "اختر السبب" },
  { value: "خطأ في المبلغ", label: "خطأ في المبلغ" },
  { value: "خطأ في اسم الزبون/المورد", label: "خطأ في اسم الزبون/المورد" },
  { value: "شيك مرتجع", label: "شيك مرتجع" },
  { value: "تحويل ملغي", label: "تحويل ملغي" },
  { value: "تسجيل مكرر", label: "تسجيل مكرر" },
  { value: "خطأ في التاريخ", label: "خطأ في التاريخ" },
  { value: "خطأ في طريقة الدفع", label: "خطأ في طريقة الدفع" },
  { value: "بناءً على طلب الزبون", label: "بناءً على طلب الزبون" },
  { value: "سبب آخر", label: "سبب آخر" },
];

const VoucherCancelModal = ({
  open,
  onClose,
  onConfirm,
  voucherRef,
  voucherType,
  contactName,
  amount,
  date,
  paymentMethod,
  currencySymbol = "₪",
}: VoucherCancelModalProps) => {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(false);
      }
    };
    if (openDropdown) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openDropdown]);

  const typeLabel = voucherType === "receipt" ? "سند القبض" : "سند الصرف";
  const fmtAmount = `${currencySymbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (() => {
    try {
      const dt = new Date(date);
      const dd = String(dt.getDate()).padStart(2, "0");
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const yyyy = dt.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    } catch { return date; }
  })();

  const handleConfirm = async () => {
    if (!reason) return;
    setLoading(true);
    try {
      await onConfirm(reason, details);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        direction: "rtl",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Modal Card */}
      <div
        style={{
          position: "relative",
          background: "white",
          borderRadius: "20px",
          padding: "28px",
          maxWidth: "480px",
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 24px 60px rgba(0,0,0,0.2)",
          fontFamily: "Cairo, sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px" }}>⚠️</span>
            <span style={{ fontSize: "16px", fontWeight: 700, color: "#DC2626", fontFamily: "Cairo" }}>
              إلغاء {typeLabel} {voucherRef}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#94a3b8" }}
          >
            ✕
          </button>
        </div>

        {/* Description */}
        <p style={{ fontSize: "14px", color: "#475569", marginBottom: "16px", fontFamily: "Cairo", lineHeight: 1.8 }}>
          أنت على وشك إلغاء {typeLabel} التالي:
        </p>

        {/* Summary Box */}
        <div
          style={{
            background: "#F8FAFC",
            borderRadius: "12px",
            padding: "16px",
            border: "1px solid #E2E8F0",
            fontSize: "14px",
            fontFamily: "Cairo",
            lineHeight: "2",
            marginBottom: "20px",
          }}
        >
          <div>رقم السند: <strong>{voucherRef}</strong></div>
          <div>{voucherType === "receipt" ? "الزبون" : "المورد"}: <strong>{contactName || "—"}</strong></div>
          <div>المبلغ: <strong>{fmtAmount}</strong></div>
          <div>التاريخ: <strong>{fmtDate}</strong></div>
          <div>طريقة الدفع: <strong>{paymentMethod}</strong></div>
        </div>

        {/* What will happen */}
        <div style={{ fontSize: "13px", color: "#475569", marginBottom: "20px", fontFamily: "Cairo", lineHeight: 2 }}>
          <p style={{ fontWeight: 700, marginBottom: "4px" }}>سيتم تلقائياً:</p>
          <div style={{ paddingRight: "8px" }}>
            • عكس القيد المحاسبي المرتبط<br />
            • إعادة المبلغ {fmtAmount} إلى رصيد {voucherType === "receipt" ? "الزبون" : "المورد"}<br />
            • تعليم السند كملغي (لا يمكن التراجع)
          </div>
        </div>

        {/* Reason Select (custom dropdown) */}
        <div style={{ marginBottom: "12px" }} ref={dropdownRef}>
          <label style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b", fontFamily: "Cairo", display: "block", marginBottom: "6px" }}>
            سبب الإلغاء <span style={{ color: "#DC2626" }}>*</span>
          </label>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setOpenDropdown(o => !o)}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "12px",
                border: "1.5px solid #E2E8F0",
                fontSize: "14px",
                fontFamily: "Cairo",
                direction: "rtl",
                background: "white",
                cursor: "pointer",
                outline: "none",
                textAlign: "right",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                color: reason ? "#1e293b" : "#94a3b8",
              }}
            >
              <span>{reason || "اختر السبب"}</span>
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>{openDropdown ? "▲" : "▼"}</span>
            </button>
            {openDropdown && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  right: 0,
                  background: "white",
                  border: "1.5px solid #E2E8F0",
                  borderRadius: "12px",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  maxHeight: "240px",
                  overflowY: "auto",
                  zIndex: 10,
                }}
              >
                {cancellationReasons.filter(r => r.value !== "").map(r => (
                  <div
                    key={r.value}
                    onClick={() => { setReason(r.value); setOpenDropdown(false); }}
                    style={{
                      padding: "10px 16px",
                      fontSize: "14px",
                      fontFamily: "Cairo",
                      direction: "rtl",
                      textAlign: "right",
                      cursor: "pointer",
                      background: reason === r.value ? "#FEF2F2" : "white",
                      color: "#1e293b",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#F8FAFC")}
                    onMouseLeave={e => (e.currentTarget.style.background = reason === r.value ? "#FEF2F2" : "white")}
                  >
                    {r.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Additional Details */}
        <div style={{ marginBottom: "20px" }}>
          <textarea
            value={details}
            onChange={e => setDetails(e.target.value)}
            placeholder="تفاصيل إضافية (اختياري)..."
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: "12px",
              border: "1.5px solid #E2E8F0",
              fontSize: "13px",
              fontFamily: "Cairo",
              direction: "rtl",
              resize: "vertical",
              minHeight: "70px",
              outline: "none",
            }}
          />
        </div>

        {/* Warning */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "12px",
          color: "#DC2626",
          marginBottom: "20px",
          fontFamily: "Cairo",
        }}>
          <span>⚠️</span>
          <span>هذا الإجراء لا يمكن التراجع عنه</span>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={onClose}
            style={{
              padding: "14px 24px",
              borderRadius: "12px",
              border: "1.5px solid #E2E8F0",
              background: "white",
              color: "#64748B",
              fontSize: "15px",
              fontWeight: 600,
              fontFamily: "Cairo",
              cursor: "pointer",
              flex: 1,
            }}
          >
            إلغاء
          </button>
          <button
            onClick={handleConfirm}
            disabled={!reason || loading}
            style={{
              padding: "14px 24px",
              borderRadius: "12px",
              border: "none",
              background: !reason || loading ? "#fca5a5" : "#DC2626",
              color: "white",
              fontSize: "15px",
              fontWeight: 700,
              fontFamily: "Cairo",
              cursor: !reason || loading ? "not-allowed" : "pointer",
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              opacity: !reason || loading ? 0.7 : 1,
            }}
          >
            🚫 {loading ? "جارٍ الإلغاء..." : "تأكيد الإلغاء"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VoucherCancelModal;
