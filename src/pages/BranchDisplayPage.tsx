import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { QrCode, RefreshCw, Building2, Clock, Shield, WifiOff, Wifi } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

type QRData = {
  qr_payload: string;
  branch_name: string;
  expires_at: string | null;
  rotation_minutes: number;
  qr_mode?: string;
};

export default function BranchDisplayPage() {
  const { branchId } = useParams<{ branchId: string }>();
  const [qrData, setQrData] = useState<QRData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [countdown, setCountdown] = useState("");
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live clock — update every second
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Online/offline detection
  useEffect(() => {
    const goOnline = () => {
      setIsOffline(false);
      fetchQR(); // reconnect immediately
    };
    const goOffline = () => setIsOffline(true);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const fetchQR = useCallback(async () => {
    if (!branchId) return;
    setIsRefreshing(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/branch-qr?action=public&branch_id=${branchId}`,
        {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "حدث خطأ");
      } else {
        setQrData(data);
        setError("");
        setLastUpdated(new Date());
      }
    } catch (e: any) {
      // If offline, keep showing last QR
      if (!qrData) {
        setError("لا يمكن الاتصال بالخادم");
      }
      // Auto-retry in 10 seconds
      retryTimeoutRef.current = setTimeout(fetchQR, 10000);
    }
    setLoading(false);
    setIsRefreshing(false);
  }, [branchId, qrData]);

  // Initial fetch
  useEffect(() => {
    fetchQR();
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [fetchQR]);

  // Auto-refresh — only for rotating QR
  useEffect(() => {
    if (qrData?.qr_mode === 'static') return; // no refresh needed for static
    const interval = setInterval(fetchQR, 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchQR, qrData?.qr_mode]);

  // Auto-regenerate when time window changes — only for rotating
  useEffect(() => {
    if (!qrData || qrData.qr_mode === 'static' || !qrData.expires_at) return;
    const expiryTime = new Date(qrData.expires_at).getTime();
    const timeUntilExpiry = expiryTime - Date.now();

    if (timeUntilExpiry <= 0) {
      fetchQR();
      return;
    }

    const timeout = setTimeout(fetchQR, timeUntilExpiry + 500);
    return () => clearTimeout(timeout);
  }, [qrData, fetchQR]);

  // Countdown timer — only for rotating
  useEffect(() => {
    if (!qrData || qrData.qr_mode === 'static' || !qrData.expires_at) return;
    const update = () => {
      const remaining = new Date(qrData.expires_at!).getTime() - Date.now();
      if (remaining <= 0) {
        setCountdown("جاري التحديث...");
        return;
      }
      const hours = Math.floor(remaining / 3600000);
      const mins = Math.floor((remaining % 3600000) / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setCountdown(
        `${hours > 0 ? `${hours}:` : ""}${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      );
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [qrData]);

  // Fullscreen on double-click
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  // Prevent screen sleep via Wake Lock API
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await (navigator as any).wakeLock.request("screen");
        }
      } catch {}
    };
    requestWakeLock();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") requestWakeLock();
    });
    return () => { wakeLock?.release(); };
  }, []);

  const qrImageUrl = (text: string, size: number) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&format=svg&margin=2`;

  // --- LOADING STATE ---
  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#0a0e1a", fontFamily: "'Cairo', sans-serif" }}
      >
        <RefreshCw className="h-12 w-12 animate-spin text-emerald-400" />
      </div>
    );
  }

  // --- ERROR STATE ---
  if (error && !qrData) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: "#0a0e1a", fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
        dir="rtl"
      >
        <div className="text-center space-y-6">
          <div className="w-24 h-24 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
            <QrCode className="h-12 w-12 text-red-400" />
          </div>
          <h2 className="text-2xl font-semibold text-red-400">{error}</h2>
          <p className="text-white/40 text-lg">تحقق من معرّف الفرع وحاول مرة أخرى</p>
          <button
            onClick={fetchQR}
            className="px-8 py-3 rounded-2xl bg-white/10 text-white hover:bg-white/20 transition-colors text-lg font-medium"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  if (!qrData) return null;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden select-none cursor-default"
      style={{
        background: "radial-gradient(ellipse at 50% 0%, #0f1a2e 0%, #080d18 50%, #050810 100%)",
        fontFamily: "'IBM Plex Sans Arabic', sans-serif",
      }}
      dir="rtl"
      onDoubleClick={toggleFullscreen}
    >
      {/* Ambient glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)",
        }}
      />

      {/* Offline banner */}
      {isOffline && (
        <div className="absolute top-0 inset-x-0 py-3 px-4 flex items-center justify-center gap-3 bg-amber-500/90 text-black z-50">
          <WifiOff className="h-5 w-5" />
          <span className="font-medium text-sm">لا يوجد اتصال — يعرض آخر رمز متاح</span>
        </div>
      )}

      {/* Refresh indicator */}
      {isRefreshing && (
        <div className="absolute top-4 left-4">
          <RefreshCw className="h-5 w-5 animate-spin text-emerald-400/60" />
        </div>
      )}

      {/* Connection status */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {isOffline ? (
          <WifiOff className="h-4 w-4 text-amber-400" />
        ) : (
          <Wifi className="h-4 w-4 text-emerald-400/60" />
        )}
      </div>

      {/* Branch name */}
      <div className="flex items-center gap-4 mb-8 z-10">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
          <Building2 className="h-6 w-6 text-emerald-400" />
        </div>
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-white tracking-tight">
          {qrData.branch_name}
        </h1>
      </div>

      {/* QR Code container */}
      <div className="relative z-10 mb-8">
        {/* Glowing border effect */}
        <div
          className="absolute -inset-1 rounded-[2rem] opacity-40"
          style={{
            background: "linear-gradient(135deg, #10b981, #059669, #10b981)",
            filter: "blur(8px)",
          }}
        />
        <div className="relative bg-white rounded-[1.75rem] p-6 md:p-8 lg:p-10 shadow-2xl">
          <img
            src={qrImageUrl(qrData.qr_payload, 400)}
            alt="رمز QR للحضور"
            className="w-[260px] h-[260px] sm:w-[300px] sm:h-[300px] md:w-[360px] md:h-[360px] lg:w-[400px] lg:h-[400px]"
            draggable={false}
          />
        </div>
      </div>

      {/* Current time — large */}
      <div className="text-center z-10 mb-6">
        <div
          className="text-6xl md:text-7xl lg:text-8xl font-bold tabular-nums text-white tracking-tight"
          style={{ fontFeatureSettings: "'tnum' 1" }}
        >
          {format(currentTime, "HH:mm")}
          <span className="text-white/30 text-4xl md:text-5xl lg:text-6xl">
            :{format(currentTime, "ss")}
          </span>
        </div>
        <div className="text-lg md:text-xl text-white/40 mt-2 font-light">
          {format(currentTime, "EEEE، d MMMM yyyy", { locale: ar })}
        </div>
      </div>

      {/* Countdown & metadata */}
      <div className="text-center z-10 space-y-3">
        {qrData.qr_mode === 'static' ? (
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-white/5 border border-white/10">
            <Shield className="h-5 w-5 text-emerald-400" />
            <span className="text-white/50 text-sm">رمز ثابت — للطباعة والتعليق</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-white/5 border border-white/10">
            <Clock className="h-5 w-5 text-emerald-400" />
            <span className="text-white/50 text-sm">يتجدد خلال</span>
            <span
              className="font-bold text-emerald-400 tabular-nums text-xl"
              style={{ fontFeatureSettings: "'tnum' 1" }}
            >
              {countdown}
            </span>
          </div>
        )}

        {qrData.qr_mode !== 'static' && (
          <div className="flex items-center justify-center gap-2 text-white/25 text-xs">
            <Shield className="h-3.5 w-3.5" />
            <span>HMAC-SHA256 · يتجدد كل {qrData.rotation_minutes} دقيقة</span>
          </div>
        )}

        {lastUpdated && (
          <p className="text-white/15 text-[11px]">
            آخر تحديث: {format(lastUpdated, "HH:mm:ss")}
          </p>
        )}
      </div>

      {/* Instructions at bottom */}
      <div className="absolute bottom-6 inset-x-0 text-center z-10">
        <p className="text-white/20 text-xs md:text-sm max-w-lg mx-auto px-4">
          امسح هذا الرمز من تطبيق الموظف لتسجيل الحضور والانصراف
        </p>
      </div>
    </div>
  );
}
