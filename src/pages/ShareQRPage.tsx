import { QRCodeSVG } from "qrcode.react";
import amwaliLogo from "@/assets/amwali-logo-full.png";

const REGISTER_URL = "https://abdallahaiaccounting.lovable.app/auth";

export default function ShareQRPage() {
  const handlePrint = () => window.print();

  return (
    <div
      dir="rtl"
      style={{
        minHeight: "100vh", background: "#F5F7FA",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, fontFamily: "'Cairo', sans-serif",
      }}
    >
      <div
        style={{
          background: "white", borderRadius: 24, padding: "40px 32px",
          boxShadow: "0 4px 30px rgba(0,0,0,0.08)",
          maxWidth: 380, width: "100%", textAlign: "center",
        }}
      >
        {/* Logo */}
        <img src={amwaliLogo} alt="AMWALI" style={{ height: 40, margin: "0 auto 20px" }} />

        {/* Title */}
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0D1B2E", marginBottom: 6 }}>
          سجّل الآن في أموالي
        </h1>
        <p style={{ fontSize: 13.5, color: "#6B7280", marginBottom: 24 }}>
          امسح الكود من جوالك وابدأ تجربتك المجانية
        </p>

        {/* QR Code */}
        <div style={{
          background: "white", border: "2px solid #0D1B2E", borderRadius: 20,
          padding: 20, display: "inline-block", marginBottom: 20,
        }}>
          <QRCodeSVG
            value={REGISTER_URL}
            size={200}
            level="M"
            bgColor="white"
            fgColor="#0D1B2E"
          />
        </div>

        {/* Features */}
        <div style={{
          background: "#F0F4FF", borderRadius: 14, padding: "14px 16px",
          textAlign: "right", marginBottom: 20,
        }}>
          <div style={{ fontSize: 12.5, color: "#374151", lineHeight: 2 }}>
            ✅ تجربة مجانية 14 يوم<br />
            ✅ بدون بطاقة ائتمان<br />
            ✅ محاسب ذكي بالعربي<br />
            ✅ يشتغل من الجوال
          </div>
        </div>

        {/* URL */}
        <div style={{
          background: "#0D1B2E", color: "white", borderRadius: 12,
          padding: "10px 16px", fontSize: 14, fontWeight: 600, letterSpacing: 0.5,
        }}>
          amwali.app
        </div>

        {/* Print button - hidden in print */}
        <button
          onClick={handlePrint}
          className="print-hide"
          style={{
            marginTop: 16, background: "transparent", border: "1px solid #D1D5DB",
            borderRadius: 10, padding: "8px 20px", fontSize: 12.5, color: "#6B7280",
            cursor: "pointer", fontFamily: "'Cairo', sans-serif",
          }}
        >
          🖨️ طباعة الكود
        </button>
      </div>

      <style>{`
        @media print {
          .print-hide { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
