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
import unifyLogo from "@/assets/unify-logo.png.asset.json";

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

const isIOS =
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export default function LoyaltyJoinPage() {
  const { slug } = useParams<{ slug: string }>();
  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingPass, setSavingPass] = useState(false);
  const [saveUrl, setSaveUrl] = useState<string | null>(null);
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

  /** طبقة السطح بأسلوب Microsoft Dynamics 365 — أبيض مع لمسات زرقاء */
  const surfaceStyle = useMemo(
    () => ({
      background: `
        radial-gradient(120% 50% at 50% -10%, ${accent}18 0%, transparent 55%),
        radial-gradient(80% 40% at 10% 90%, #2563EB08 0%, transparent 50%),
        radial-gradient(80% 40% at 90% 80%, #0F6CBD08 0%, transparent 50%),
        #FAF9F8`,
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
      // إصدار بطاقة محفظة Google تلقائياً بعد التسجيل (تجهيز الرابط فوراً)
      supabase.functions
        .invoke("google-wallet-pass", { body: { code: member.card_code } })
        .then(({ data: pass }) => {
          const url = (pass as { saveUrl?: string } | null)?.saveUrl;
          if (url) setSaveUrl(url);
        })
        .catch(() => {});
    } catch (err) {
      console.error(err);
      toast.error("تعذّر إتمام التسجيل، حاول مرة أخرى");
    } finally {
      setSubmitting(false);
    }
  };

  /** إصدار بطاقة المحفظة الرقمية (Google Wallet) مباشرة بعد الانضمام */
  const saveToWallet = async () => {
    if (!done || savingPass) return;
    if (saveUrl) {
      window.location.href = saveUrl;
      return;
    }
    setSavingPass(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-wallet-pass", {
        body: { code: done.card_code },
      });
      const res = data as { saveUrl?: string; error?: string } | null;
      if (error || !res?.saveUrl) {
        toast.error("تعذّر إضافة البطاقة إلى المحفظة، افتح البطاقة الرقمية واحفظها على جوالك");
        return;
      }
      setSaveUrl(res.saveUrl);
window.location.href = res.saveUrl;
    } finally {
      setSavingPass(false);
    }
  };

  /** إصدار بطاقة Apple Wallet (.pkpass) مباشرة من شاشة النجاح */
  const saveToAppleWallet = async () => {
    if (!done || savingPass) return;
    setSavingPass(true);
    try {
      const base = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`${base}/functions/v1/apple-wallet-pass?code=${encodeURIComponent(done.card_code)}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        if (err.error === "wallet_not_configured") {
          toast.error("خدمة Apple Wallet غير مفعّلة بعد — لم تُضف شهادة البطاقة");
        } else {
          toast.error("تعذّر إضافة البطاقة إلى Apple Wallet");
        }
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${done.card_code}.pkpass`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      console.error(e);
      toast.error("تعذّر إضافة البطاقة إلى Apple Wallet");
    } finally {
      setSavingPass(false);
    }
  };

  if (loading) {
    // شاشة انتظار
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
    <div dir="rtl" className="min-h-[100dvh] w-full" style={surfaceStyle}>
      {/* شريط أوامر علوي بأسلوب Dynamics 365 */}
      <div className="h-1 w-full" style={{ backgroundColor: accent }} />
      <div className="border-b border-[#e5e5e5] bg-white">
        <div className="mx-auto flex h-12 w-full max-w-md items-center gap-2 px-4">
          {program.logo_url && (
            <img src={program.logo_url} alt={`شعار ${program.name}`} className="h-7 w-7 rounded-[3px] object-contain" />
          )}
          <span className="truncate text-[13px] font-semibold text-[#242424]">{program.name}</span>
          <span className="mr-auto text-[11px] text-[#616161]">برنامج الولاء</span>
        </div>
      </div>

      <main className="mx-auto w-full max-w-md px-4 py-5">
        {/* بطاقة الترويسة */}
        <section className="relative overflow-hidden rounded-[6px] border border-[#e1dfdd] bg-white p-5 text-center shadow-[0_1.6px_3.6px_rgba(0,0,0,0.08)]">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(90% 60% at 100% 0%, ${accent}1A 0%, transparent 60%), radial-gradient(80% 60% at 0% 20%, #2563EB12 0%, transparent 60%)`,
            }}
          />
          {program.logo_url && (
            <img
              src={program.logo_url}
              alt={`شعار ${program.name}`}
              className="relative mx-auto mb-3 h-20 w-20 rounded-full border border-[#edebe9] bg-white object-contain p-2"
            />
          )}
          <h1 className="relative text-[22px] font-semibold tracking-tight text-[#242424]">{program.name}</h1>
          {program.tagline && <p className="relative mt-1 text-[13px] text-[#616161]">{program.tagline}</p>}

          <div className="relative mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold" style={{ borderColor: `${accent}40`, color: accent, backgroundColor: `${accent}08` }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
            صفحة تسجيل في برنامج الولاء لمرة واحدة
          </div>

          <div className="relative mt-4 rounded-[4px] border border-[#edebe9] bg-[#faf9f8] px-4 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#616161]">الدولة</p>
            <p className="text-[15px] font-semibold text-[#242424]">
              {program.default_country === "PS" ? "فلسطين" : program.default_country}
            </p>
          </div>
        </section>

        {done ? (
          <section className="mt-4 space-y-4">
            <div className="flex items-start gap-2 rounded-[4px] border-r-4 border-[#107C10] bg-[#f1faf1] px-4 py-3">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#107C10]" />
              <div>
                <p className="text-[13px] font-semibold text-[#0b5a0b]">أهلاً {done.first_name} — تم تفعيل عضويتك</p>
                <p className="text-[12px] text-[#3b6b3b]">أضف البطاقة إلى محفظة جوالك واعرضها عند الكاشير.</p>
              </div>
            </div>

            {/* معاينة بطاقة المحفظة — تصميم أبيض */}
            <div className="overflow-hidden rounded-[10px] border border-[#e1dfdd] bg-white shadow-[0_3.2px_7.2px_rgba(0,0,0,0.10)]">
              <div className="h-1.5 w-full" style={{ backgroundColor: accent }} />
              <div className="flex items-center gap-3 px-4 pt-4">
                {program.logo_url && (
                  <img src={program.logo_url} alt="" className="h-11 w-11 rounded-full border border-[#edebe9] object-contain p-1" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-[#242424]">{program.name}</p>
                  <p className="text-[11px] text-[#616161]">بطاقة الولاء</p>
                </div>
                <CreditCard className="h-4 w-4 text-[#a6a6a6]" />
              </div>

              <div className="grid grid-cols-2 gap-px bg-[#edebe9] mx-4 my-4 rounded-[4px] overflow-hidden border border-[#edebe9]">
                <div className="bg-white px-3 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-[#616161]">العضو</p>
                  <p className="mt-0.5 truncate text-[14px] font-semibold text-[#242424]">{done.first_name}</p>
                </div>
                <div className="bg-white px-3 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-[#616161]">النقاط</p>
                  <p className="mt-0.5 text-[14px] font-semibold tabular-nums" style={{ color: accent }}>0</p>
                </div>
              </div>

              <div className="px-4 pb-4 text-center">
                <div className="mx-auto w-fit rounded-[6px] border border-[#edebe9] bg-white p-3">
                  <QRCodeSVG value={done.card_code} size={148} level="M" fgColor="#242424" bgColor="#FFFFFF" />
                </div>
                <p className="mt-2 font-mono text-[13px] font-semibold tracking-[0.2em] text-[#242424]">{done.card_code}</p>
              </div>

              <div className="border-t border-[#f3f2f1] px-4 py-2 text-center text-[10px] text-[#a6a6a6]">
                Powered by Unify ERP
              </div>
            </div>

{isIOS && (
              <Button
                type="button"
                onClick={saveToAppleWallet}
                disabled={savingPass}
                className="h-11 w-full gap-2 rounded-[4px] text-[14px] font-semibold text-white hover:opacity-90"
                style={{ backgroundColor: "#0A0A0A" }}
              >
                {savingPass ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                إضافة إلى Apple Wallet
              </Button>
            )}

            <Button
              type="button"
              onClick={saveToWallet}
              disabled={savingPass}
              className={`h-11 w-full gap-2 rounded-[4px] text-[14px] font-semibold ${
                isIOS ? "border-[#d1d1d1] text-[#242424]" : "text-white hover:opacity-90"
              }`}
              variant={isIOS ? "outline" : "default"}
              style={isIOS ? undefined : { backgroundColor: accent }}
            >
              {savingPass ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              إضافة إلى محفظة Google
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => window.location.assign(`/card/${done.card_code}`)}
              className="h-11 w-full rounded-[4px] border-[#d1d1d1] text-[14px] font-semibold text-[#242424]"
            >
              فتح البطاقة الرقمية
            </Button>

<p className="text-center text-[11px] leading-5 text-[#8a8886]">
              آيفون: «إضافة إلى Apple Wallet» ثم «إضافة». أندرويد: «إضافة إلى محفظة Google».
              أو افتح البطاقة الرقمية واحفظها عبر «مشاركة ← إضافة إلى الشاشة الرئيسية».
            </p>

          </section>
        ) : (
          <section className="mt-4 rounded-[6px] border border-[#e1dfdd] bg-white p-5 shadow-[0_1.6px_3.6px_rgba(0,0,0,0.08)]">
            <h2 className="mb-4 border-b border-[#f3f2f1] pb-2 text-[14px] font-semibold text-[#242424]">
              بيانات العضوية
            </h2>
            <form onSubmit={submit} className="space-y-4 text-right">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className={labelCls}>الاسم الأول</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={60} required className={fieldCls} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>اسم العائلة</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={60} className={fieldCls} />
                </div>
              </div>

              {program.collect_birthdate && (
                <div className="space-y-1.5">
                  <Label className={labelCls}>
                    تاريخ الميلاد <span className="font-normal text-[#a6a6a6]">(اختياري)</span>
                  </Label>
                  <div className="grid grid-cols-3 gap-3">
                    <Input value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="يوم" inputMode="numeric" className={fieldCls} />
                    <Select value={month} onValueChange={setMonth}>
                      <SelectTrigger className={fieldCls}><SelectValue placeholder="شهر" /></SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m, i) => (
                          <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="سنة" inputMode="numeric" className={fieldCls} />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className={labelCls}>رقم الجوال</Label>
                <div className="flex gap-3">
                  <Select value={phoneCode} onValueChange={setPhoneCode}>
                    <SelectTrigger className={`${fieldCls} w-32 shrink-0`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PHONE_CODES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 15))}
                    placeholder="59 000 0000"
                    inputMode="tel"
                    required
                    className={`${fieldCls} flex-1`}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className={labelCls}>الدولة</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger className={fieldCls}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="h-11 w-full rounded-[4px] text-[14px] font-semibold text-white hover:opacity-90"
                style={{ backgroundColor: accent }}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="ml-2 h-4 w-4" />
                    انضم لبرنامج الولاء
                  </>
                )}
              </Button>

              {program.welcome_message && (
                <p className="pt-1 text-center text-[11px] leading-relaxed text-[#616161]">{program.welcome_message}</p>
              )}
            </form>
          </section>
        )}

        {/* تذييل Unify ERP */}
        <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-[6px] border border-[#e1dfdd] bg-white px-5 py-5 shadow-[0_1.6px_3.6px_rgba(0,0,0,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#616161]">Powered by</p>
          <img
            src={unifyLogo.url}
            alt="يونيفاي Unify ERP"
            className="h-24 w-auto object-contain"
          />
        </div>
      </main>
    </div>
  );
}
