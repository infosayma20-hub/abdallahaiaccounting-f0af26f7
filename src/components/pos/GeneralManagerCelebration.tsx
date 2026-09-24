import { useEffect, useMemo, useState } from "react";
import { Cake, Gift, PartyPopper, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { MALAKY_OWNER_ID } from "@/lib/malakyAccess";

const CAMPAIGN_ID = "unify-mosab-general-manager-birthday-2026-09-24";

type Eligibility = "checking" | "eligible" | "excluded";

export default function GeneralManagerCelebration({
  authUserId,
  dataOwnerId,
  verifyPosAccount = true,
}: {
  authUserId?: string | null;
  dataOwnerId?: string | null;
  verifyPosAccount?: boolean;
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

    if (!verifyPosAccount) {
      setEligibility("eligible");
      setOpen(true);
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
  }, [acknowledgementKey, authUserId, dataOwnerId, verifyPosAccount]);

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
        @keyframes unify-birthday-float {
          0%,100% { transform: translateY(0) rotate(-2deg); }
          50% { transform: translateY(-7px) rotate(2deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .unify-confetti { display: none; }
          .unify-celebration-card, .unify-birthday-cake { animation: none !important; }
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
            <span className="text-xs font-bold">مناسبة مميزة لعائلة الملكي</span>
            <Sparkles className="h-4 w-4" />
          </div>
          <h2 id="general-manager-celebration-title" className="text-2xl font-extrabold leading-relaxed sm:text-3xl">
            عيد ميلاد سعيد
          </h2>
          <p className="mt-1 text-xl font-bold text-primary-foreground/90">مصعب القتلوني</p>
          <p className="mt-1 text-sm font-semibold text-primary-foreground/75">المدير العام لشركة مطاعم الدجاج الملكي</p>
        </div>

        <div className="unify-birthday-cake relative mx-auto -mt-10 flex h-20 w-20 items-center justify-center rounded-full border-4 border-card bg-accent text-accent-foreground shadow-lg" style={{ animation: "unify-birthday-float 2.8s ease-in-out infinite" }}>
          <Cake className="h-9 w-9" />
        </div>

        <div className="px-6 pb-7 pt-4 text-center sm:px-10">
          <p className="flex items-center justify-center gap-2 text-base font-bold text-foreground">
            <Gift className="h-4 w-4 text-accent" /> كل عام وأنتم بألف خير
          </p>
          <p className="mt-3 text-sm leading-7 text-foreground/85 sm:text-base sm:leading-8">
            بمناسبة عيد ميلادكم، يسعدنا أن نتقدم إليكم بأصدق التهاني وأطيب الأمنيات، راجين لكم عاماً جديداً حافلاً بالصحة والسعادة والنجاح.
          </p>
          <p className="mt-3 text-sm leading-7 text-foreground/85 sm:text-base">
            دمتم قائداً ملهماً، وعاماً بعد عام من الإنجاز والتميّز والعطاء.
          </p>
          <div className="my-5 h-px bg-border" />
          <p className="text-sm font-extrabold text-primary">مع خالص المحبة وأطيب التمنيات — عائلة Unify</p>
          <Button type="button" onClick={acknowledge} className="mt-6 h-11 w-full text-base">
            <PartyPopper className="h-4 w-4" /> كل عام وأنتم بخير
          </Button>
        </div>
      </section>
    </div>
  );
}