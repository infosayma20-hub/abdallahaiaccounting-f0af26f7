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

      <div className="relative w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center shadow-2xl">
        <button onClick={dismissTemporarily} className="absolute top-3 left-3 text-muted-foreground hover:text-foreground" aria-label="إغلاق">
          <X className="h-4 w-4" />
        </button>
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-pink-500/10">
          <Cake className="h-8 w-8 text-pink-500" />
        </div>
        <h2 className="text-xl font-bold">كل عام وأنت بخير 🎉</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          عيد ميلاد سعيد يا <span className="font-semibold text-foreground">{employeeName}</span>
          {age ? <> — تتم اليوم <span className="font-semibold text-foreground">{age}</span> عاماً</> : null}!
          <br />
          نتمنى لك سنة مليئة بالصحة والنجاح، مع تحيات {(companyName || "").trim() || "إدارة الشركة"}.
        </p>
        <Button onClick={acknowledge} className="mt-5 w-full rounded-xl">
          <PartyPopper className="ml-2 h-4 w-4" /> شكراً 🎂
        </Button>
      </div>
    </div>
  );
}
