import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import LoadingScreen from "@/components/LoadingScreen";

const LoadingDemoPage = () => {
  const [showLoading, setShowLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => setShowLoading(false), 3500);
    return () => clearTimeout(timer);
  }, []);

  if (showLoading) return <LoadingScreen demo />;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 40%, #0D3158 0%, #0D1B2A 60%, #08111A 100%)",
      }}
    >
      <p
        style={{
          color: "rgba(255,255,255,0.7)",
          fontFamily: "Tajawal, sans-serif",
          fontSize: 16,
        }}
      >
        انتهى العرض التجريبي
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => {
            setShowLoading(true);
            setTimeout(() => setShowLoading(false), 3500);
          }}
          className="px-6 py-2 rounded-lg text-sm font-medium"
          style={{
            background: "linear-gradient(135deg, #E8A020, #F45E0C)",
            color: "#08111A",
            fontFamily: "Tajawal, sans-serif",
          }}
        >
          إعادة التشغيل
        </button>
        <button
          onClick={() => navigate("/apps")}
          className="px-6 py-2 rounded-lg text-sm font-medium"
          style={{
            background: "rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(255,255,255,0.15)",
            fontFamily: "Tajawal, sans-serif",
          }}
        >
          العودة
        </button>
      </div>
    </div>
  );
};

export default LoadingDemoPage;
