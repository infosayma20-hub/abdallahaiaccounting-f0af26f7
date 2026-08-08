import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Keyboard, Loader2, CheckCircle2, XCircle, X } from "lucide-react";
// html5-qrcode (~100KB gzipped) is dynamically imported inside startScanner()
// to keep it out of the initial employee-app bundle.
import type { Html5Qrcode as Html5QrcodeType } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";

// face-api.js (~250KB) lives inside SelfieCapture — load it only when needed.
const SelfieCapture = lazy(() => import("./SelfieCapture"));

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: "checkin" | "checkout";
  onSuccess: () => void;
  /**
   * Employee's assigned branch id. When provided and the branch requires a
   * selfie, we prompt for the selfie BEFORE opening the QR scanner so the
   * camera permission is requested from a clean user gesture (iOS Safari).
   */
  employeeBranchId?: string | null;
}

export default function QRScannerDialog({ open, onOpenChange, action, onSuccess, employeeBranchId }: Props) {
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manualInput, setManualInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; authError?: boolean } | null>(null);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [pendingScan, setPendingScan] = useState<{ branchId: string; token: string; lat: number; lng: number } | null>(null);
  const [awaitingSelfieGesture, setAwaitingSelfieGesture] = useState(false);
  /** Selfie captured BEFORE QR scan (when employee's branch requires it). */
  const [prefetchedSelfie, setPrefetchedSelfie] = useState<{ branchId: string; base64: string } | null>(null);
  /** Did employee's branch require an up-front selfie? null = not yet checked. */
  const [upfrontSelfieRequired, setUpfrontSelfieRequired] = useState<boolean | null>(null);
  const [checkingBranch, setCheckingBranch] = useState(false);
  /**
   * Cached per-branch `require_gps` flag. When true we MUST send real
   * coordinates to the edge function or it will reject the punch with
   * "يرجى تفعيل خدمات الموقع". Keyed by branch id so cross-branch scans
   * pick up the right value.
   */
  const branchGpsRequirementCacheRef = useRef<Map<string, boolean>>(new Map());
  const [gpsAcquiring, setGpsAcquiring] = useState(false);
  const scannerRef = useRef<Html5QrcodeType | null>(null);
  const processingRef = useRef(false);
  const scannerDivId = "qr-reader-employee";

  /**
   * Cache the branch selfie-requirement lookup done at open-time so we don't
   * re-query `branches_safe` inside processQR when the scanned branch is the
   * employee's own branch (the common case). Falls back to a live query when
   * an employee scans a QR for a different branch.
   */
  const branchSelfieRequirementCacheRef = useRef<Map<string, boolean>>(new Map());

  /**
   * Acquire real GPS coordinates when the branch requires them. Returns
   * `{lat, lng}` on success. Returns null when GPS is required but the
   * browser can't/won't provide it — in that case we've already surfaced
   * a clear Arabic error to the user via `setResult` and the caller must
   * abort the punch cleanly.
   *
   * When the branch does NOT require GPS we short-circuit to (0,0) — the
   * server accepts that path silently and skips the geofence check.
   */
  const acquireGpsIfRequired = useCallback(
    async (branchId: string): Promise<{ lat: number; lng: number } | null> => {
      const required = branchGpsRequirementCacheRef.current.get(branchId);
      if (required === false) return { lat: 0, lng: 0 };
      // Unknown or true → assume required (safer; matches server default).
      if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
        setResult({
          success: false,
          message: "هذا الجهاز لا يدعم GPS — تعذّر تسجيل البصمة.",
        });
        return null;
      }
      setGpsAcquiring(true);
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 30000,
          });
        });
        return { lat: pos.coords.latitude, lng: pos.coords.longitude };
      } catch (e: any) {
        const code = e?.code;
        const message =
          code === 1
            ? "تم رفض إذن الموقع — فعّل GPS للتطبيق من إعدادات الجهاز ثم أعد المحاولة."
            : code === 3
            ? "تعذّر الحصول على الموقع خلال الوقت المحدد. تأكد أن GPS مفعّل وأنك خارج المبنى ثم أعد المحاولة."
            : "تعذّر الحصول على الموقع — تأكد من تفعيل GPS ثم أعد المحاولة.";
        setResult({ success: false, message });
        return null;
      } finally {
        setGpsAcquiring(false);
      }
    },
    [],
  );

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      const inst = scannerRef.current;
      // Null the ref FIRST so the html5-qrcode success callback (which may fire
      // one more time between decode and stop) sees no active scanner and bails.
      scannerRef.current = null;
      try {
        const state = inst.getState();
        if (state === 2) {
          await inst.stop();
        }
      } catch {}
      // Belt-and-braces: force-kill any lingering camera tracks the scanner
      // may not have released (observed on Android Chrome under load — the
      // stream keeps decoding the same QR every ~2s and triggers duplicate
      // punches). Safe even after stop() succeeded.
      try {
        const el = document.getElementById(scannerDivId);
        const video = el?.querySelector("video") as HTMLVideoElement | null;
        const stream = (video?.srcObject as MediaStream | null) || null;
        stream?.getTracks().forEach((t) => { try { t.stop(); } catch {} });
        if (video) video.srcObject = null;
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopScanner();
      setResult(null);
      setManualInput("");
      setMode("camera");
      setAwaitingSelfieGesture(false);
      setPendingScan(null);
      setPrefetchedSelfie(null);
      setUpfrontSelfieRequired(null);
      setCheckingBranch(false);
      setGpsAcquiring(false);
      processingRef.current = false;
    }
  }, [open, stopScanner]);

  // On open: check if employee's branch requires a selfie. If yes, defer the
  // QR scanner and show the "open front camera" gesture card first.
  useEffect(() => {
    if (!open) return;
    if (upfrontSelfieRequired !== null) return;
    let cancelled = false;
    (async () => {
      if (!employeeBranchId) {
        if (!cancelled) setUpfrontSelfieRequired(false);
        return;
      }
      setCheckingBranch(true);
      try {
        const { data } = await supabase
          .from("branches_safe")
          .select("require_attendance_selfie, require_gps")
          .eq("id", employeeBranchId)
          .maybeSingle();
        if (cancelled) return;
        // السلفي مطلوب فقط عند تسجيل الدخول. الخروج يكتفي بمسح QR.
        const req = !!data?.require_attendance_selfie && action === "checkin";
        // Cache the raw branch flag so processQR can reuse it without a
        // second round-trip when the scanned QR is for the same branch.
        branchSelfieRequirementCacheRef.current.set(
          employeeBranchId,
          !!data?.require_attendance_selfie,
        );
        // Same for GPS. Default TRUE (matches server-side default when the
        // column is null) so a missing value never silently sends 0,0.
        branchGpsRequirementCacheRef.current.set(
          employeeBranchId,
          data?.require_gps !== false,
        );
        setUpfrontSelfieRequired(req);
        if (req) setAwaitingSelfieGesture(true);
        // Warm-load the face-detection model in the background while the user
        // is still on the "open camera" gesture card. By the time they tap it,
        // the model is already cached and the selfie starts instantly.
        if (req) {
          import("./SelfieCapture")
            .then((m) => m.loadModels?.().catch(() => {}))
            .catch(() => {});
        }
      } catch {
        if (!cancelled) setUpfrontSelfieRequired(false);
      } finally {
        if (!cancelled) setCheckingBranch(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, employeeBranchId, upfrontSelfieRequired]);

  useEffect(() => {
    // Don't start QR scanner until: branch check done AND (no upfront selfie required OR selfie already captured).
    const selfieGate = upfrontSelfieRequired === false || !!prefetchedSelfie;
    if (open && mode === "camera" && !processing && !result && !awaitingSelfieGesture && !selfieOpen && !checkingBranch && selfieGate) {
      const timer = setTimeout(() => {
        startScanner();
      }, 300);
      return () => clearTimeout(timer);
    } else if (mode === "manual") {
      stopScanner();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, processing, result, awaitingSelfieGesture, selfieOpen, checkingBranch, upfrontSelfieRequired, prefetchedSelfie]);

  const startScanner = async () => {
    await stopScanner();
    try {
      // Dynamic import — pulls ~100KB only when the user actually opens the scanner.
      const { Html5Qrcode } = await import("html5-qrcode");
      const html5QrCode = new Html5Qrcode(scannerDivId);
      scannerRef.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          // Guard against html5-qrcode firing the success callback multiple
          // times (camera keeps decoding the same QR while stop() is in flight).
          // Null-check + processingRef ensures we handle exactly one scan.
          if (!scannerRef.current || processingRef.current) return;
          // Await the full stop BEFORE processing so no further decodes fire
          // during network/DB latency. processQR is fired-and-forgotten inside
          // an async IIFE to keep the html5-qrcode callback synchronous.
          (async () => {
            await stopScanner();
            await processQR(decodedText);
          })();
        },
        () => {}
      );
    } catch (err) {
      console.error("Camera error:", err);
      setMode("manual");
      toast({ title: "خطأ", description: "لا يمكن الوصول للكاميرا. استخدم الإدخال اليدوي.", variant: "destructive" });
    }
  };

  const processQR = async (qrPayload: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    setResult(null);

    try {
      const colonIdx = qrPayload.indexOf(":");
      if (colonIdx === -1) {
        setResult({ success: false, message: "صيغة QR غير صحيحة" });
        setProcessing(false);
        processingRef.current = false;
        return;
      }
      const branchId = qrPayload.substring(0, colonIdx);
      const token = qrPayload.substring(colonIdx + 1);

      // إذا التقطنا السلفي مسبقاً لنفس الفرع، استخدمها مباشرة.
      if (prefetchedSelfie && prefetchedSelfie.branchId === branchId) {
        await stopScanner();
        // اطلب GPS فقط لو الفرع مفعّل عنده require_gps.
        const coords = await acquireGpsIfRequired(branchId);
        if (!coords) {
          processingRef.current = false;
          setProcessing(false);
          return;
        }
        await submitAttendance(branchId, token, coords.lat, coords.lng, prefetchedSelfie.base64);
        return;
      }

      // افحص اشتراط السيلفي أولاً قبل أي عمليات طويلة (GPS) كي لا نكسر user-gesture على iOS.
      // Reuse the value cached at dialog-open time when the scanned QR is for
      // the employee's own branch (common case). Only hit the DB when scanning
      // a QR for a different branch (rare — cross-branch coverage).
      let requiresSelfie: boolean;
      const cached = branchSelfieRequirementCacheRef.current.get(branchId);
      const gpsCached = branchGpsRequirementCacheRef.current.get(branchId);
      if (cached !== undefined && gpsCached !== undefined) {
        requiresSelfie = cached;
      } else {
        const { data: branchRow } = await supabase
          .from("branches_safe")
          .select("require_attendance_selfie, require_gps")
          .eq("id", branchId)
          .maybeSingle();
        requiresSelfie = cached !== undefined ? cached : !!branchRow?.require_attendance_selfie;
        branchSelfieRequirementCacheRef.current.set(branchId, requiresSelfie);
        // Cache the branch GPS flag too — without this a cross-branch scan
        // falls back to "unknown = required" and blocks the punch even when
        // the branch has GPS disabled.
        branchGpsRequirementCacheRef.current.set(branchId, branchRow?.require_gps !== false);
      }

      if (requiresSelfie && action === "checkin") {
        // أوقف ماسح QR تماماً قبل أي محاولة لفتح الكاميرا الأمامية (iOS لا يسمح بـ stream مزدوج).
        await stopScanner();
        setPendingScan({ branchId, token, lat: 0, lng: 0 });
        setProcessing(false);
        processingRef.current = false;
        // اعرض شاشة وسيطة تتطلب نقرة مستخدم لفتح الكاميرا (gesture جديد لـ Safari).
        setAwaitingSelfieGesture(true);
        return;
      }

      const coords = await acquireGpsIfRequired(branchId);
      if (!coords) {
        processingRef.current = false;
        setProcessing(false);
        return;
      }
      await submitAttendance(branchId, token, coords.lat, coords.lng, null);
    } catch (e: any) {
      setResult({ success: false, message: e.message });
      setProcessing(false);
      processingRef.current = false;
    }
  };

  const submitAttendance = async (
    branchId: string,
    token: string,
    lat: number,
    lng: number,
    selfieBase64: string | null,
  ) => {
    setProcessing(true);
    try {
      // 🛡️ Guard: تأكّد أن جلسة الموظف صالحة قبل ما نبعث للـ edge function.
      // بدون هذا الفحص كان الكود يبعث `Authorization: Bearer undefined` عند
      // انتهاء/فقدان الجلسة، فيرد السيرفر "مستخدم غير صالح" — رسالة مبهمة
      // بتربك الموظف. هون بنحاول refresh قسري وبنطلب إعادة تسجيل الدخول
      // برسالة واضحة إذا فشل.
      // نقرأ التوكن من الجلسة الحالية، ولو فشل التجديد بنرجع نقرأ آخر جلسة
      // مخزّنة في localStorage (ممكن تبويب/دخول جديد يكون جدّدها) — ما بنطلع
      // الموظف إلا لما السيرفر نفسه يرفض التوكن (401/403).
      const readStoredToken = (): { token?: string; exp: number } => {
        try {
          const storageKey = (supabase.auth as any)?.storageKey as string | undefined;
          if (!storageKey) return { exp: 0 };
          const raw = localStorage.getItem(storageKey);
          if (!raw) return { exp: 0 };
          const parsed = JSON.parse(raw);
          const sess = parsed?.currentSession || parsed?.session || parsed;
          return { token: sess?.access_token, exp: sess?.expires_at ?? 0 };
        } catch {
          return { exp: 0 };
        }
      };

      let { data: sessionData } = await supabase.auth.getSession();
      let accessToken = sessionData.session?.access_token;
      let expiresAt = sessionData.session?.expires_at ?? 0;
      const nowSec = Math.floor(Date.now() / 1000);

      // لو الجلسة بالذاكرة قديمة، شوف إذا في جلسة أحدث بالتخزين المحلي.
      const stored = readStoredToken();
      if (stored.token && stored.exp > expiresAt) {
        accessToken = stored.token;
        expiresAt = stored.exp;
      }

      // جدّد فقط إذا التوكن فعلياً منتهي أو على وشك (أقل من 20 ثانية).
      if (!accessToken || expiresAt - nowSec < 20) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        const t = refreshed?.session?.access_token;
        if (t) {
          accessToken = t;
        } else {
          // فشل التجديد ≠ انتهاء الجلسة (ممكن انقطاع شبكة أو refresh token
          // مستهلك من تبويب ثاني). أعد القراءة من التخزين وجرّب أي توكن متاح.
          await new Promise((r) => setTimeout(r, 500));
          const { data: re } = await supabase.auth.getSession();
          const reToken = re.session?.access_token;
          const again = readStoredToken();
          accessToken = reToken || again.token || accessToken;
        }
      }

      if (!accessToken) {
        setResult({ success: false, message: "انتهت جلستك — سجّل دخول من جديد", authError: true });
        toast({
          title: "انتهت جلستك",
          description: "الرجاء تسجيل الدخول من جديد لإتمام البصمة.",
          variant: "destructive",
        });
        setProcessing(false);
        processingRef.current = false;
        if (selfieBase64 && upfrontSelfieRequired) {
          setPrefetchedSelfie(null);
          setAwaitingSelfieGesture(true);
        }
        return;
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

      const callAttendance = async (bearer: string) => fetch(
        `https://${projectId}.supabase.co/functions/v1/attendance`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bearer}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            action,
            branch_id: branchId,
            qr_token: token,
            latitude: lat,
            longitude: lng,
            device_info: navigator.userAgent.substring(0, 100),
            device_fingerprint: await getDeviceFingerprint().catch(() => null),
            selfie_base64: selfieBase64,
            // Audit only — server overrides; used to detect device clock tampering
            client_time: new Date().toISOString(),
          }),
        }
      );

      let response = await callAttendance(accessToken as string);
      // إعادة محاولة واحدة عند 401: جدّد التوكن وأعد الإرسال قبل ما نطلب
      // من الموظف تسجيل دخول جديد.
      if (response.status === 401) {
        try {
          const { data: r2 } = await supabase.auth.refreshSession();
          const t2 = r2?.session?.access_token;
          if (t2) response = await callAttendance(t2);
        } catch {
          /* ignore */
        }
        // محاولة أخيرة بآخر توكن مخزّن محلياً (تبويب ثاني ممكن يكون جدّده).
        if (response.status === 401) {
          const last = readStoredToken();
          if (last.token && last.token !== accessToken) {
            try {
              response = await callAttendance(last.token);
            } catch {
              /* ignore */
            }
          }
        }
      }
      const data = await response.json();
      if (!response.ok) {
        // 401 فقط = الجلسة رُفضت من طرف الخادم.
        // ⚠️ لا تعتبر 403 انتهاء جلسة: دالة البصمة بتستخدم 403 لأخطاء العمل
        // (خارج نطاق الفرع، QR منتهي، فرع غير مسموح، GPS مطفي...) وكان الموظف
        // بشوف "انتهت جلستك" بدل السبب الحقيقي فيفشل بصمة الخروج.
        const authMsgs = ["غير مصرح", "مستخدم غير صالح", "jwt", "token"];
        const rawErr = String(data?.error || "").toLowerCase();
        const isAuthErr =
          response.status === 401 ||
          (response.status === 403 && authMsgs.some((m) => rawErr.includes(m)));
        const message = isAuthErr
          ? "انتهت جلستك — سجّل دخول من جديد"
          : (data.error || "حدث خطأ");
        setResult({ success: false, message, authError: isAuthErr });
        if (isAuthErr) {
          toast({
            title: "انتهت جلستك",
            description: "الرجاء تسجيل الدخول من جديد لإتمام البصمة.",
            variant: "destructive",
          });
        }
        // إذا فشل الإرسال وكان الفرع يتطلب سيلفي، امسح السيلفي المؤقت
        // ولا تسمح بإعادة استخدامها — اطلب التقاطها من جديد قبل أي QR لاحق.
        if (selfieBase64 && upfrontSelfieRequired) {
          setPrefetchedSelfie(null);
          setAwaitingSelfieGesture(true);
        }
      } else {
        setResult({ success: true, message: data.message });
        // نجحت البصمة — امسح السيلفي المؤقت فوراً حتى لا تُستخدم لبصمة لاحقة بالخطأ.
        setPrefetchedSelfie(null);
        setPendingScan(null);
        setTimeout(() => {
          onSuccess();
          onOpenChange(false);
        }, 1500);
      }
    } catch (e: any) {
      setResult({ success: false, message: e.message });
      if (selfieBase64 && upfrontSelfieRequired) {
        setPrefetchedSelfie(null);
        setAwaitingSelfieGesture(true);
      }
    }
    setProcessing(false);
    processingRef.current = false;
  };

  const handleSelfieCapture = async (base64: string) => {
    setSelfieOpen(false);
    setAwaitingSelfieGesture(false);
    // الحالة الجديدة: التُقطت السلفي قبل QR — خزّنها وافتح ماسح QR الآن.
    if (!pendingScan && upfrontSelfieRequired && employeeBranchId) {
      setPrefetchedSelfie({ branchId: employeeBranchId, base64 });
      return;
    }
    if (!pendingScan) return;
    const scan = pendingScan;
    setPendingScan(null);
    const coords = await acquireGpsIfRequired(scan.branchId);
    if (!coords) return;
    await submitAttendance(scan.branchId, scan.token, coords.lat, coords.lng, base64);
  };

  const handleSelfieCancel = () => {
    setSelfieOpen(false);
    setAwaitingSelfieGesture(false);
    setPendingScan(null);
    if (upfrontSelfieRequired && !prefetchedSelfie) {
      // المستخدم ألغى السلفي قبل QR — أغلق النافذة كلياً.
      onOpenChange(false);
      return;
    }
    setResult({ success: false, message: "الكاميرا مطلوبة لتسجيل البصمة في هذا الفرع." });
  };

  const openSelfieFromGesture = () => {
    // يجب أن تُستدعى من onClick مباشرة — لا awaits قبلها — لتأمين user-gesture على iOS.
    setAwaitingSelfieGesture(false);
    setSelfieOpen(true);
  };

  if (!open) return null;

  return (
    <>
    <div className="fixed inset-0 z-[100] bg-background flex flex-col" dir="rtl"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-base font-bold text-foreground">
          {action === "checkin" ? "📥 تسجيل دخول" : "📤 تسجيل خروج"}
        </h2>
        <button
          onClick={() => onOpenChange(false)}
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center active:scale-90 transition-transform"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4 relative">
        {/* Awaiting user gesture to open front camera (iOS Safari requirement) */}
        {awaitingSelfieGesture && !result && !processing && (
          <div className="rounded-3xl p-6 text-center space-y-5 w-full max-w-xs bg-primary/5 border border-primary/20">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Camera className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <p className="font-bold text-base text-foreground">
                {upfrontSelfieRequired ? "التحقق بالصورة مطلوب أولاً" : "تم التعرف على الفرع"}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {upfrontSelfieRequired
                  ? "فرعك يتطلب التقاط صورة للتحقق قبل البصمة. اضغط لفتح الكاميرا الأمامية، ثم نمسح رمز QR."
                  : "هذا الفرع يتطلب التقاط صورة للتحقق. اضغط الزر لفتح الكاميرا الأمامية."}
              </p>
            </div>
            <Button
              size="lg"
              className="w-full h-14 rounded-xl text-base font-bold active:scale-[0.97] transition-transform"
              onClick={openSelfieFromGesture}
            >
              <Camera className="h-5 w-5 ml-2" />
              افتح الكاميرا الأمامية
            </Button>
            <Button
              variant="ghost"
              className="w-full rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              إلغاء
            </Button>
          </div>
        )}

        {checkingBranch && !awaitingSelfieGesture && !result && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">جاري التحقق من إعدادات الفرع...</p>
          </div>
        )}

        {/* Result */}
        {result && !awaitingSelfieGesture && (
          <div className={`rounded-3xl p-8 text-center space-y-4 w-full max-w-xs ${
            result.success ? "bg-emerald-500/10" : "bg-destructive/10"
          }`}>
            {result.success ? (
              <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto" />
            ) : (
              <XCircle className="h-16 w-16 text-destructive mx-auto" />
            )}
            <p className="font-bold text-lg text-foreground">{result.message}</p>
            {!result.success && result.authError && (
              <Button
                className="rounded-xl active:scale-95 transition-transform w-full"
                onClick={async () => {
                  try { await supabase.auth.signOut(); } catch { /* noop */ }
                  window.location.replace("/auth?reason=session_expired");
                }}
              >
                تسجيل الدخول من جديد
              </Button>
            )}
            {!result.success && (
              <Button
                variant="outline"
                className="rounded-xl active:scale-95 transition-transform"
                onClick={() => { setResult(null); if (mode === "camera") startScanner(); }}
              >
                إعادة المحاولة
              </Button>
            )}
          </div>
        )}

        {/* Camera/Manual toggle */}
        {!result && !processing && !awaitingSelfieGesture && !checkingBranch && (
          <>
            <div className="flex gap-2 w-full max-w-xs">
              <Button
                size="lg"
                variant={mode === "camera" ? "default" : "outline"}
                className="flex-1 gap-2 rounded-xl h-12 active:scale-95 transition-transform"
                onClick={() => setMode("camera")}
              >
                <Camera className="h-4 w-4" /> كاميرا
              </Button>
              <Button
                size="lg"
                variant={mode === "manual" ? "default" : "outline"}
                className="flex-1 gap-2 rounded-xl h-12 active:scale-95 transition-transform"
                onClick={() => setMode("manual")}
              >
                <Keyboard className="h-4 w-4" /> يدوي
              </Button>
            </div>

            {mode === "camera" && (
              <div className="rounded-3xl overflow-hidden bg-black w-full max-w-xs aspect-square">
                <div id={scannerDivId} className="w-full h-full" />
              </div>
            )}

            {mode === "manual" && (
              <div className="space-y-3 w-full max-w-xs">
                <Input
                  placeholder="أدخل رمز QR..."
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  dir="ltr"
                  className="text-center font-mono rounded-xl h-14 text-lg"
                />
                <Button
                  className="w-full h-14 rounded-xl text-base active:scale-[0.97] transition-transform"
                  disabled={!manualInput.trim()}
                  onClick={() => processQR(manualInput.trim())}
                >
                  تأكيد
                </Button>
              </div>
            )}
          </>
        )}

        {processing && (
          <div className="absolute inset-0 z-[120] bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground font-medium">جاري التحقق من البصمة...</p>
          </div>
        )}

        {gpsAcquiring && !processing && (
          <div className="absolute inset-0 z-[120] bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground font-medium">جاري تحديد الموقع...</p>
            <p className="text-[11px] text-muted-foreground">تأكّد أن GPS مفعّل على جهازك</p>
          </div>
        )}

        {/* Fallback: prevents a fully blank screen if upfront-selfie is required
            but the selfie wasn't captured yet (e.g. user dismissed iOS dialog). */}
        {!result && !processing && !awaitingSelfieGesture && !checkingBranch && !selfieOpen
          && upfrontSelfieRequired === true && !prefetchedSelfie && (
          <div className="rounded-3xl p-6 text-center space-y-5 w-full max-w-xs bg-primary/5 border border-primary/20">
            <Camera className="h-10 w-10 text-primary mx-auto" />
            <p className="font-bold text-base">يجب التقاط صورة التحقق أولاً</p>
            <Button size="lg" className="w-full h-14 rounded-xl text-base font-bold"
              onClick={openSelfieFromGesture}>
              افتح الكاميرا الأمامية
            </Button>
            <Button variant="ghost" className="w-full rounded-xl"
              onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground px-4 py-3">
        <Camera className="h-3 w-3 shrink-0" />
        <span>سيتم التحقق من فرعك تلقائياً</span>
      </div>
    </div>
    {selfieOpen && (
      <Suspense
        fallback={
          <div className="fixed inset-0 z-[110] bg-background/95 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">جاري تحميل الكاميرا الأمامية...</p>
          </div>
        }
      >
        <SelfieCapture
          open={selfieOpen}
          onCancel={handleSelfieCancel}
          onCapture={handleSelfieCapture}
          title={action === "checkin" ? "Face Recognition — تسجيل الدخول" : "Face Recognition — تسجيل الخروج"}
        />
      </Suspense>
    )}
    </>
  );
}
