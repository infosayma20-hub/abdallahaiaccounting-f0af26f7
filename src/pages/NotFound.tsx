import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div
      className="flex min-h-screen items-center justify-center relative overflow-hidden"
      dir="rtl"
      style={{ background: "linear-gradient(180deg, #050F1E, #0A2342)" }}
    >
      {/* Watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
        <span
          className="font-mono font-bold"
          style={{ fontSize: "clamp(120px, 20vw, 240px)", color: "#00B4D8", opacity: 0.08 }}
        >
          404
        </span>
      </div>

      {/* Content */}
      <div className="text-center relative z-10 space-y-4 px-6">
        <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-6"
          style={{ background: "linear-gradient(135deg, #0A2342, #006D8F)" }}>
          <span className="text-white font-bold text-2xl" style={{ fontFamily: "Barlow, sans-serif" }}>Z</span>
        </div>

        <h1 className="text-xl font-bold" style={{ color: "#F4F7FA", fontFamily: "Tajawal, sans-serif" }}>
          الصفحة غير موجودة
        </h1>
        <p className="text-sm" style={{ color: "#8B9BB4" }}>
          عذراً، الصفحة التي تبحث عنها غير متوفرة أو تم نقلها.
        </p>

        <a
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: "linear-gradient(135deg, #C9A84C, #9A7B2E)",
            color: "#0A2342",
            boxShadow: "0 4px 20px rgba(201,168,76,0.25)",
          }}
        >
          العودة للرئيسية
        </a>
      </div>
    </div>
  );
};

export default NotFound;
