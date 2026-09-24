import { useEffect, useMemo, useState } from "react";
import { Cake, PartyPopper, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** تطبيع تاريخ الميلاد إلى {y,m,d} — يدعم YYYY-MM-DD و DD/MM/YYYY. */
function parseDob(dob?: string | null): { y: number; m: number; d: number } | null {
  if (!dob) return null;
  const s = String(dob).trim();
  let mt = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (mt) return { y: +mt[1], m: +mt[2], d: +mt[3] };
  mt = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (mt) return { y: +mt[3], m: +mt[2], d: +mt[1] };
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
  return null;
}

/** هل تاريخ الميلاد يوافق اليوم (شهر/يوم)؟ */
export function isBirthdayToday(dob?: string | null, today = new Date()): boolean {
  const p = parseDob(dob);
  if (!p) return false;
  return p.m === today.getMonth() + 1 && p.d === today.getDate();
}

export function ageOn(dob?: string | null, today = new Date()): number | null {
  const p = parseDob(dob);
  if (!p?.y) return null;
  const age = today.getFullYear() - p.y;
  return age > 0 && age < 120 ? age : null;
}

const COLORS = ["#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#ec4899"];

/** احتفال عيد ميلاد الموظف: قصاصات ملوّنة + بطاقة تهنئة، تظهر مرة واحدة في اليوم. */
export default function BirthdayCelebration({
  employeeId,
  employeeName,
  dateOfBirth,
  companyName,
}: {
  employeeId: string;
  employeeName: string;
  dateOfBirth?: string | null;
  companyName?: string | null;
}) {
  const today = new Date();
  const isToday = isBirthdayToday(dateOfBirth, today);
  const key = `birthday-celebrated:${employeeId}:${today.toISOString().slice(0, 10)}`;
  const [open, setOpen] = useState(false);
  const age = ageOn(dateOfBirth, today);

  useEffect(() => {
    if (!isToday) return;
    let seen = false;
    try { seen = localStorage.getItem(key) === "1"; } catch { /* ignore */ }
    if (!seen) setOpen(true);
  }, [isToday, key]);

  const pieces = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 2.5,
        duration: 3 + Math.random() * 2.5,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 8,
        rotate: Math.random() * 360,
      })),
    []
  );

  if (!isToday || !open) return null;

  /** إغلاق مؤقت: تظهر التهنئة مجدداً عند فتح الشاشة حتى يضغط زر الشكر. */
  const dismissTemporarily = () => setOpen(false);

  /** إغلاق نهائي لليوم: فقط عند الضغط على الزر. */
  const acknowledge = () => {
    try { localStorage.setItem(key, "1"); } catch { /* ignore */ }
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/80 backdrop-blur-sm px-4" dir="rtl">
      <style>{`
        @keyframes birthday-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0.9; }
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {pieces.map((p) => (
          <span
            key={p.id}
            className="absolute top-0 rounded-[2px]"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 1.6,
              backgroundColor: p.color,
              transform: `rotate(${p.rotate}deg)`,
              animation: `birthday-fall ${p.duration}s linear ${p.delay}s infinite`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes bday-pop { 0% { transform: scale(.85) translateY(20px); opacity: 0 } 100% { transform: scale(1) translateY(0); opacity: 1 } }
        @keyframes bday-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
      `}</style>
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-[28px] border border-border bg-card text-center shadow-2xl"
        style={{ animation: "bday-pop .6s cubic-bezier(.2,.9,.3,1.2) both" }}
      >
        <div className="relative bg-gradient-to-br from-primary via-primary to-accent px-6 pb-12 pt-8 text-primary-foreground">
          <button onClick={dismissTemporarily} className="absolute top-3 left-3 opacity-70 hover:opacity-100" aria-label="إغلاق">
            <X className="h-4 w-4" />
          </button>
          <p className="text-[11px] tracking-[0.3em] opacity-80">✦ مناسبة خاصة ✦</p>
          <h2 className="mt-2 text-2xl font-extrabold leading-tight">عيد ميلاد سعيد</h2>
          <p className="mt-1 text-lg font-semibold opacity-95">{employeeName}</p>
        </div>
        <div
          className="relative -mt-10 mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-card bg-background shadow-lg"
          style={{ animation: "bday-float 2.6s ease-in-out infinite" }}
        >
          <Cake className="h-9 w-9 text-accent" />
        </div>
        <div className="px-6 pb-6 pt-3">
          {age ? (
            <p className="text-xs text-muted-foreground">تتم اليوم <span className="font-bold text-foreground">{age}</span> عاماً 🎈</p>
          ) : null}
          <p className="mt-3 text-sm leading-7 text-foreground/90">
            كل عام وأنت بألف خير 🌹
            <br />
            في يومك المميز، نشكرك على كل جهد وعطاء، ونتمنى لك سنة مليئة بالصحة والسعادة والنجاح.
          </p>
          <p className="mt-3 text-xs font-semibold text-muted-foreground">
            مع خالص المحبة — عائلة {(companyName || "").trim() || "الشركة"} 💛
          </p>
          <Button onClick={acknowledge} className="mt-5 w-full rounded-2xl h-11 text-base">
            <PartyPopper className="ml-2 h-4 w-4" /> شكراً إلكم 🎂
          </Button>
        </div>
      </div>
    </div>
  );
}
