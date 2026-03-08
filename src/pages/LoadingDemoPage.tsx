import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import LoadingScreen from "@/components/LoadingScreen";

const LoadingDemoPage = () => {
  const [showLoading, setShowLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // After the full animation (~3.5s), show a replay button
    const timer = setTimeout(() => setShowLoading(false), 3500);
    return () => clearTimeout(timer);
  }, []);

  if (showLoading) return <LoadingScreen />;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 40%, #0D3158 0%, #050F1E 60%, #020810 100%)",
      }}
    >
      <p style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Tajawal, sans-serif", fontSize: 16 }}>
        انتهى العرض التجريبي
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => { setShowLoading(true); setTimeout(() => setShowLoading(false), 3500); }}
          className="px-6 py-2 rounded-lg text-sm font-medium"
          style={{
            background: "linear-gradient(90deg, #00B4D8, #C9A84C)",
            color: "#020810",
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
