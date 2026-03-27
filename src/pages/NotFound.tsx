import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { FinixLogo } from "@/components/ui/FinixLogo";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div
      className="flex min-h-screen items-center justify-center relative overflow-hidden"
      dir="rtl"
      style={{ background: "#0D1B2A" }}
    >
      {/* Watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
        <span
          style={{
            fontFamily: "Montserrat, sans-serif",
            fontWeight: 800,
            fontSize: "clamp(120px, 20vw, 240px)",
            color: "rgba(232,160,32,0.1)",
          }}
        >
          404
        </span>
      </div>

      {/* Content */}
      <div className="text-center relative z-10 space-y-4 px-6">
        <div className="mb-6 flex justify-center">
          <img src="/logo-white.png" alt="AMWALI أموالي" width={180} />
        </div>

        <h1 className="text-xl font-bold" style={{ color: "#F4F6F8", fontFamily: "Tajawal, sans-serif" }}>
          الصفحة غير موجودة
        </h1>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
          الصفحة التي تبحث عنها غير متوفرة
        </p>

        <a
          href="/"
          className="inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-bold transition-all hover:brightness-110 hover:-translate-y-0.5"
          style={{
            background: "#E8A020",
            color: "#0D1B2A",
          }}
        >
          العودة للرئيسية
        </a>
      </div>
    </div>
  );
};

export default NotFound;
