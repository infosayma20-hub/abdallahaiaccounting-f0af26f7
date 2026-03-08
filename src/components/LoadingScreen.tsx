import { useEffect, useState } from "react";
import { useCompany } from "@/hooks/useCompanyContext";

const LoadingScreen = () => {
  const [progress, setProgress] = useState(0);
  
  // Try to get company context, but gracefully handle when not available
  let logoUrl: string | null = null;
  let companyName = "";
  try {
    const { company } = useCompany();
    logoUrl = company.logo_url;
    companyName = company.name;
  } catch {
    // Context not available during initial load
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => (prev >= 100 ? 0 : prev + 2));
    }, 60);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center" dir="rtl"
      style={{ background: "linear-gradient(180deg, #050F1E, #0A2342)" }}>
      
      {/* Company Logo or ZIDNI cube */}
      <div className="relative flex items-center justify-center mb-6">
        {logoUrl ? (
          <div className="w-[120px] h-[120px] rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center p-3"
            style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
            <img src={logoUrl} alt={companyName} className="w-full h-full object-contain" />
          </div>
        ) : (
          <svg
            className="w-[80px] h-[80px]"
            viewBox="0 0 80 80"
            style={{ animation: "spin-cube 3s linear infinite" }}
          >
            <rect x="16" y="16" width="48" height="48" rx="8" fill="none"
              strokeWidth="2" strokeLinecap="round"
              style={{ animation: "pulse-gold 2s ease-in-out infinite" }} />
            <rect x="24" y="24" width="32" height="32" rx="4" fill="none"
              stroke="hsl(43, 55%, 54%)" strokeWidth="1.5" opacity="0.4" />
            <text x="40" y="48" textAnchor="middle" fill="hsl(40, 56%, 77%)"
              fontSize="22" fontWeight="700" fontFamily="Barlow, sans-serif"
              style={{ animation: "pulse-gold 2s ease-in-out infinite" }}>
              Z
            </text>
          </svg>
        )}
      </div>

      {/* Brand */}
      <div className="text-center space-y-1.5 mb-8">
        <h1 className="text-xl font-bold tracking-tight" style={{ color: "#F4F7FA", fontFamily: companyName ? "Tajawal, sans-serif" : "Barlow, sans-serif" }}>
          {companyName || "ZIDNI"}
        </h1>
        <p className="text-[11px] font-medium" style={{ color: "#8B9BB4" }}>
          {companyName ? "ZIDNI ERP" : "نظام إدارة الأعمال"}
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-40 h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${progress}%`,
            background: "linear-gradient(90deg, #C9A84C, #E8D5A3)",
            transition: "width 100ms linear",
          }}
        />
      </div>
    </div>
  );
};

export default LoadingScreen;
