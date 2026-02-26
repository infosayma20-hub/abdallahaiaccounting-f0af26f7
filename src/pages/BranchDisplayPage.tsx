import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { QrCode, RefreshCw, Building2, Clock, Shield } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

export default function BranchDisplayPage() {
  const { branchId } = useParams<{ branchId: string }>();
  const [qrData, setQrData] = useState<{
    qr_payload: string;
    branch_name: string;
    expires_at: string;
    rotation_minutes: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [countdown, setCountdown] = useState("");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchQR = useCallback(async () => {
    if (!branchId) return;
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) {
        setError("يجب تسجيل الدخول لعرض رمز QR");
        setLoading(false);
        return;
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/branch-qr?action=generate&branch_id=${branchId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
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
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [branchId]);

  // Initial fetch
  useEffect(() => {
    fetchQR();
  }, [fetchQR]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    intervalRef.current = setInterval(fetchQR, 5 * 60 * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchQR]);

  // Auto-regenerate when time window changes
  useEffect(() => {
    if (!qrData) return;
    const expiryTime = new Date(qrData.expires_at).getTime();
    const now = Date.now();
    const timeUntilExpiry = expiryTime - now;

    if (timeUntilExpiry <= 0) {
      fetchQR();
      return;
    }

    const timeout = setTimeout(fetchQR, timeUntilExpiry + 500);
    return () => clearTimeout(timeout);
  }, [qrData, fetchQR]);

  // Countdown timer
  useEffect(() => {
    if (!qrData) return;
    const update = () => {
      const remaining = new Date(qrData.expires_at).getTime() - Date.now();
      if (remaining <= 0) {
        setCountdown("منتهي - جاري التحديث...");
        fetchQR();
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
  }, [qrData, fetchQR]);

  // Generate QR code as SVG using a simple QR algorithm
  const generateQRSvg = (text: string, size: number = 300) => {
    // Use a simple URL to generate QR via an API endpoint rendered as an image
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&format=svg`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <RefreshCw className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <QrCode className="h-16 w-16 mx-auto text-destructive/50" />
          <h2 className="text-xl font-bold text-destructive">{error}</h2>
          <p className="text-muted-foreground">تأكد من تسجيل الدخول وصلاحية الوصول للفرع</p>
        </div>
      </div>
    );
  }

  if (!qrData) return null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-6" dir="rtl">
      {/* Branch name */}
      <div className="flex items-center gap-3 mb-6">
        <Building2 className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold">{qrData.branch_name}</h1>
      </div>

      {/* Current time */}
      <div className="text-center mb-6">
        <div className="text-5xl font-bold tabular-nums text-primary">
          {format(currentTime, "HH:mm:ss")}
        </div>
        <div className="text-lg text-muted-foreground mt-1">
          {format(currentTime, "EEEE، d MMMM yyyy", { locale: ar })}
        </div>
      </div>

      {/* QR Code */}
      <div className="bg-white rounded-3xl shadow-2xl p-8 mb-6">
        <img
          src={generateQRSvg(qrData.qr_payload, 350)}
          alt="رمز QR للحضور"
          className="w-[350px] h-[350px]"
        />
      </div>

      {/* Countdown & info */}
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center gap-2 text-lg">
          <Clock className="h-5 w-5 text-primary" />
          <span className="text-muted-foreground">يتجدد خلال:</span>
          <span className="font-bold text-primary tabular-nums text-2xl">{countdown}</span>
        </div>

        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Shield className="h-4 w-4" />
          <span>الرمز يتجدد تلقائياً كل {qrData.rotation_minutes} دقيقة</span>
        </div>

        <p className="text-xs text-muted-foreground max-w-md">
          امسح هذا الرمز من تطبيق الموظف لتسجيل الحضور والانصراف. 
          الرمز مشفر ويتحقق منه النظام تلقائياً.
        </p>
      </div>
    </div>
  );
}
