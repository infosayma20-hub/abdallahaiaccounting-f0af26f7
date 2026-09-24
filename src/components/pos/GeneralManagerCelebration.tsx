import { useEffect, useMemo, useState } from "react";
import { Crown, PartyPopper, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const CAMPAIGN_ID = "unify-general-manager-malaky-2026-09";
const MALAKY_OWNER_ID = "0b08eba6-c81a-4f6c-b371-e6e324016e73";

type Eligibility = "checking" | "eligible" | "excluded";

export default function GeneralManagerCelebration({
  authUserId,
  dataOwnerId,
}: {
  authUserId?: string | null;
  dataOwnerId?: string | null;
}) {
  const [eligibility, setEligibility] = useState<Eligibility>("checking");
  const [open, setOpen] = useState(false);
  const acknowledgementKey = authUserId
    ? `celebration:${CAMPAIGN_ID}:${authUserId}`
    : null;

  useEffect(() => {
    let cancelled = false;

    if (!authUserId || !acknowledgementKey || !dataOwnerId) {
      setEligibility("checking");
      return () => { cancelled = true; };
    }

    if (dataOwnerId !== MALAKY_OWNER_ID) {
      setEligibility("excluded");
      return () => { cancelled = true; };
    }

    let acknowledged = false;
    try { acknowledged = localStorage.getItem(acknowledgementKey) === "1"; } catch { /* best effort */ }
    if (acknowledged) {
      setEligibility("excluded");
      return () => { cancelled = true; };
    }

    void (async () => {
      const { data, error } = await supabase
        .from("pos_users")
        .select("is_call_center, hide_employee_workspace")
        .eq("auth_user_id", authUserId)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        // Fail closed: never show a company-specific message when identity
        // could not be verified from the operating account record.
        setEligibility("excluded");
        return;
      }

      const isDialSharedAccount = Boolean(data.is_call_center && data.hide_employee_workspace);
      setEligibility(isDialSharedAccount ? "excluded" : "eligible");
      if (!isDialSharedAccount) setOpen(true);
    })();

    return () => { cancelled = true; };
  }, [acknowledgementKey, authUserId, dataOwnerId]);

  const confetti = useMemo(
    () => Array.from({ length: 44 }, (_, index) => ({
      id: index,
      left: (index * 37) % 100,
      delay: ((index * 13) % 19) / 10,
      duration: 3.2 + ((index * 7) % 18) / 10,
      size: 5 + (index % 5),
      tone: index % 4,
    })),
    [],
  );

  if (eligibility !== "eligible" || !open || !acknowledgementKey) return null;

  const acknowledge = () => {
    try { localStorage.setItem(acknowledgementKey, "1"); } catch { /* best effort */ }
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center overflow-hidden bg-background/90 px-4 backdrop-blur-md" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="general-manager-celebration-title">
      <style>{`
        @keyframes unify-confetti-fall {
          0% { transform: translate3d(0,-12vh,0) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translate3d(24px,112vh,0) rotate(680deg); opacity: .25; }
        }
        @keyframes unify-celebration-rise {
          0% { transform: translateY(22px) scale(.94); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes unify-crown-float {
          0%,100% { transform: translateY(0) rotate(-2deg); }
          50% { transform: translateY(-7px) rotate(2deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .unify-confetti { display: none; }
          .unify-celebration-card, .unify-celebration-crown { animation: none !important; }
        }
      `}</style>

      <div className="unify-confetti pointer-events-none absolute inset-0" aria-hidden="true">
        {confetti.map((piece) => (
          <span
            key={piece.id}
            className={`absolute top-0 rounded-sm ${
              piece.tone === 0 ? "bg-accent" : piece.tone === 1 ? "bg-primary" : piece.tone === 2 ? "bg-success" : "bg-info"
            }`}
            style={{
              left: `${piece.left}%`,
              width: piece.size,
              height: piece.size * 1.7,
              animation: `unify-confetti-fall ${piece.duration}s linear ${piece.delay}s infinite`,
            }}
          />
        ))}
      </div>

      <section className="unify-celebration-card relative w-full max-w-lg overflow-hidden rounded-lg border border-accent/40 bg-card shadow-2xl" style={{ animation: "unify-celebration-rise .55s cubic-bezier(.2,.9,.3,1.15) both" }}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setOpen(false)}
          className="absolute left-3 top-3 z-10 text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground"
          aria-label="إغلاق مؤقت"
          title="إغلاق مؤقت"
        >
          <X />
        </Button>

        <div className="bg-primary px-6 pb-14 pt-9 text-center text-primary-foreground">
          <div className="mb-3 flex items-center justify-center gap-2 text-accent">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-bold">رسالة تقدير واعتزاز</span>
            <Sparkles className="h-4 w-4" />
          </div>
          <h2 id="general-manager-celebration-title" className="text-2xl font-extrabold leading-relaxed sm:text-3xl">
            إلى المدير العام
          </h2>
          <p className="mt-1 text-base font-semibold text-primary-foreground/85">شركة مطاعم الدجاج الملكي</p>
        </div>

        <div className="unify-celebration-crown relative mx-auto -mt-10 flex h-20 w-20 items-center justify-center rounded-full border-4 border-card bg-accent text-accent-foreground shadow-lg" style={{ animation: "unify-crown-float 2.8s ease-in-out infinite" }}>
          <Crown className="h-9 w-9" />
        </div>

        <div className="px-6 pb-7 pt-4 text-center sm:px-10">
          <p className="text-base font-bold text-foreground">بكل فخر وتقدير</p>
          <p className="mt-3 text-sm leading-7 text-foreground/85 sm:text-base sm:leading-8">
            نتقدّم إليكم بخالص الشكر والامتنان على قيادتكم الملهمة، ورؤيتكم التي تصنع النجاح، وجهودكم التي تجمع الفريق على التميّز والعطاء.
          </p>
          <p className="mt-3 text-sm leading-7 text-foreground/85 sm:text-base">
            دمتم قائداً للإنجاز، ومصدر ثقة وفخر لكل أفراد عائلة الملكي.
          </p>
          <div className="my-5 h-px bg-border" />
          <p className="text-sm font-extrabold text-primary">مع خالص المحبة والتقدير — عائلة برنامج Unify</p>
          <Button type="button" onClick={acknowledge} className="mt-6 h-11 w-full text-base">
            <PartyPopper className="h-4 w-4" /> شكراً لكم
          </Button>
        </div>
      </section>
    </div>
  );
}