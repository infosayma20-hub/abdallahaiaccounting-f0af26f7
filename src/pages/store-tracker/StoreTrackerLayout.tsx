import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  children: React.ReactNode;
  activeTab: "orders" | "reports";
  onTabChange: (tab: "orders" | "reports") => void;
}

export default function StoreTrackerLayout({ children, activeTab, onTabChange }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", direction: "rtl", fontFamily: "Cairo" }}>
      {/* Top Nav */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          background: "#0D1B2E",
          color: "white",
          fontFamily: "Cairo",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontSize: "18px", fontWeight: "700" }}>🛒 متابعة الطلبيات</span>
          <div style={{ display: "flex", gap: "4px" }}>
            <button
              onClick={() => onTabChange("orders")}
              style={{
                padding: "6px 16px",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontFamily: "Cairo",
                fontWeight: activeTab === "orders" ? "700" : "400",
                background: activeTab === "orders" ? "rgba(255,255,255,0.2)" : "transparent",
                color: "white",
              }}
            >
              الطلبيات
            </button>
            <button
              onClick={() => onTabChange("reports")}
              style={{
                padding: "6px 16px",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontFamily: "Cairo",
                fontWeight: activeTab === "reports" ? "700" : "400",
                background: activeTab === "reports" ? "rgba(255,255,255,0.2)" : "transparent",
                color: "white",
              }}
            >
              📊 التقارير
            </button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "13px", opacity: 0.8 }}>👤 {user?.email}</span>
          <button
            onClick={handleLogout}
            style={{
              padding: "5px 12px",
              borderRadius: "6px",
              border: "1px solid rgba(255,255,255,0.3)",
              background: "transparent",
              color: "white",
              cursor: "pointer",
              fontSize: "12px",
              fontFamily: "Cairo",
            }}
          >
            خروج
          </button>
        </div>
      </div>

      {/* Content */}
      {children}
    </div>
  );
}
