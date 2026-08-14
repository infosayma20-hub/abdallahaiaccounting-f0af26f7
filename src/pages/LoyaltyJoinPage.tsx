import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Check, Sparkles, Wallet, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

type Program = {
  id: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  cover_url: string | null;
  brand_color: string;
  accent_color: string;
  currency_code: string;
  points_per_unit: number;
  welcome_message: string | null;
  default_country: string;
  default_phone_code: string;
  collect_birthdate: boolean;
};

const PHONE_CODES = [
  { code: "+970", label: "فلسطين +970" },
  { code: "+972", label: "إسرائيل +972" },
  { code: "+962", label: "الأردن +962" },
  { code: "+966", label: "السعودية +966" },
  { code: "+971", label: "الإمارات +971" },
  { code: "+20", label: "مصر +20" },
];

const COUNTRIES = ["فلسطين", "الأردن", "السعودية", "الإمارات", "مصر", "أخرى"];
const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export default function LoyaltyJoinPage() {
  const { slug } = useParams<{ slug: string }>();
  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ card_code: string; first_name: string } | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [phoneCode, setPhoneCode] = useState("+970");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("فلسطين");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!slug) return;
      const { data, error } = await supabase
        .from("loyalty_programs")
        .select(
          "id,name,tagline,logo_url,cover_url,brand_color,accent_color,currency_code,points_per_unit,welcome_message,default_country,default_phone_code,collect_birthdate",
        )
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (cancelled) return;
      if (error) console.error(error);
      if (data) {
        setProgram(data as Program);
        setPhoneCode(data.default_phone_code || "+970");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (program) document.title = `${program.name} — برنامج الولاء`;
  }, [program]);

  const brand = program?.brand_color || "#0D1B2E";
  const accent = program?.accent_color || "#0F6CBD";

  /** طبقة السطح بأسلوب Microsoft Dynamics 365 — أبيض ونيوترال فاتح */
  const surfaceStyle = useMemo(
    () => ({
      background: `radial-gradient(100% 60% at 50% 0%, ${accent}10 0%, transparent 60%), #FAF9F8`,
      fontFamily: `"Segoe UI", "Segoe UI Web (Arabic)", system-ui, -apple-system, sans-serif`,
    }),
    [accent],
  );

  const fieldCls =
    "h-11 rounded-[4px] border-[#d1d1d1] bg-white text-[#242424] placeholder:text-[#a6a6a6] focus-visible:ring-1 focus-visible:ring-offset-0 focus-visible:border-[#0F6CBD]";
  const labelCls = "text-[12px] font-semibold text-[#424242]";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (firstName.trim().length < 2) return toast.error("الرجاء إدخال الاسم الأول");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 6) return toast.error("رقم الجوال غير صحيح");

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("loyalty-signup", {
        body: {
          slug,
          first_name: firstName,
          last_name: lastName,
          birth_day: day || null,
          birth_month: month || null,
          birth_year: year || null,
          phone_code: phoneCode,
          phone: digits,
          country,
        },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      const member = (data as { member: { card_code: string; first_name: string } }).member;
      setDone(member);
    } catch (err) {
      console.error(err);
      toast.error("تعذّر إتمام التسجيل، حاول مرة أخرى");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] grid place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!program) {
    return (
      <div className="min-h-[100dvh] grid place-items-center bg-background px-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">البرنامج غير متاح</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            تأكد من مسح رمز الـ QR الصحيح من المطعم.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-[100dvh] w-full px-4 py-6 sm:py-10" style={surfaceStyle}>
      <main className="mx-auto w-full max-w-md">
        <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.06] shadow-2xl backdrop-blur-xl">
          {program.cover_url && (
            <div className="h-32 w-full overflow-hidden">
              <img
                src={program.cover_url}
                alt={`غلاف ${program.name}`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          )}

          <div className="px-6 pb-8 pt-6 text-center">
            {program.logo_url && (
              <img
                src={program.logo_url}
                alt={`شعار ${program.name}`}
                className={`mx-auto h-24 w-24 rounded-full object-cover ring-4 ring-white/15 ${
                  program.cover_url ? "-mt-16 mb-4 shadow-xl" : "mb-4"
                }`}
              />
            )}

            <h1 className="text-3xl font-bold tracking-tight text-white">{program.name}</h1>
            {program.tagline && (
              <p className="mt-1.5 text-sm text-white/60">{program.tagline}</p>
            )}

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <span className="rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white/85">
                {program.points_per_unit} نقطة / {program.currency_code}
              </span>
              <span className="rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white/85">
                {program.default_country === "PS" ? "فلسطين" : program.default_country}
              </span>
            </div>

            {done ? (
              <div className="mt-8 text-center">
                <div
                  className="mx-auto grid h-16 w-16 place-items-center rounded-full"
                  style={{ backgroundColor: `${accent}26` }}
                >
                  <Check className="h-8 w-8" style={{ color: accent }} />
                </div>
                <h2 className="mt-4 text-xl font-semibold text-white">
                  أهلاً {done.first_name}!
                </h2>
                <p className="mt-1.5 text-sm text-white/60">
                  صارت عضويتك فعّالة — اعرض هذا الرقم عند الكاشير لتجميع نقاطك.
                </p>
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.07] px-6 py-5">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">رقم البطاقة</p>
                  <p className="mt-1.5 font-mono text-2xl font-bold tracking-[0.2em] text-white">
                    {done.card_code}
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => window.location.assign(`/card/${done.card_code}`)}
                  className="mt-5 h-12 w-full rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: accent, color: "#0b1220" }}
                >
                  افتح بطاقتك الرقمية واحفظها على جوالك
                </Button>
                <p className="mt-2 text-[11.5px] text-white/45">
                  البطاقة تحتوي رمز QR ونقاطك ورصيد محفظتك — أضفها إلى الشاشة الرئيسية لتظهر مثل بطاقات المحفظة.
                </p>
              </div>
            ) : (
              <>
                <div className="my-6 h-px w-full bg-white/10" />

                <form onSubmit={submit} className="space-y-5 text-right">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-white/70">الاسم الأول</Label>
                      <Input
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        maxLength={60}
                        required
                        className="h-12 rounded-xl border-white/15 bg-white/[0.07] text-white placeholder:text-white/35 focus-visible:ring-white/30"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-white/70">اسم العائلة</Label>
                      <Input
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        maxLength={60}
                        className="h-12 rounded-xl border-white/15 bg-white/[0.07] text-white placeholder:text-white/35 focus-visible:ring-white/30"
                      />
                    </div>
                  </div>

                  {program.collect_birthdate && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-white/70">
                        تاريخ الميلاد <span className="text-white/40">(اختياري)</span>
                      </Label>
                      <div className="grid grid-cols-3 gap-3">
                        <Input
                          value={day}
                          onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))}
                          placeholder="يوم"
                          inputMode="numeric"
                          className="h-12 rounded-xl border-white/15 bg-white/[0.07] text-white placeholder:text-white/35 focus-visible:ring-white/30"
                        />
                        <Select value={month} onValueChange={setMonth}>
                          <SelectTrigger className="h-12 rounded-xl border-white/15 bg-white/[0.07] text-white focus:ring-white/30">
                            <SelectValue placeholder="شهر" />
                          </SelectTrigger>
                          <SelectContent>
                            {MONTHS.map((m, i) => (
                              <SelectItem key={m} value={String(i + 1)}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={year}
                          onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                          placeholder="سنة"
                          inputMode="numeric"
                          className="h-12 rounded-xl border-white/15 bg-white/[0.07] text-white placeholder:text-white/35 focus-visible:ring-white/30"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-xs text-white/70">رقم الجوال</Label>
                    <div className="flex gap-3">
                      <Select value={phoneCode} onValueChange={setPhoneCode}>
                        <SelectTrigger className="h-12 w-32 shrink-0 rounded-xl border-white/15 bg-white/[0.07] text-white focus:ring-white/30">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PHONE_CODES.map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 15))}
                        placeholder="59 000 0000"
                        inputMode="tel"
                        required
                        className="h-12 flex-1 rounded-xl border-white/15 bg-white/[0.07] text-white placeholder:text-white/35 focus-visible:ring-white/30"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-white/70">الدولة</Label>
                    <Select value={country} onValueChange={setCountry}>
                      <SelectTrigger className="h-12 rounded-xl border-white/15 bg-white/[0.07] text-white focus:ring-white/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="h-14 w-full rounded-2xl text-base font-semibold text-white shadow-lg transition-transform active:scale-[0.98]"
                    style={{ backgroundColor: accent }}
                  >
                    {submitting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="ml-2 h-5 w-5" />
                        انضم لبرنامج الولاء
                      </>
                    )}
                  </Button>

                  {program.welcome_message && (
                    <p className="pt-1 text-center text-[11px] leading-relaxed text-white/45">
                      {program.welcome_message}
                    </p>
                  )}
                </form>
              </>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-white/35">مدعوم من Unify ERP</p>
      </main>
    </div>
  );
}
