import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, CheckCircle2, Plus, Trash2, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { BRAND } from "@/constants/brand";
import {
  parseJobFormConfig,
  type JobFormConfig,
} from "@/lib/hr/jobApplicationForm";

type LinkRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  is_active: boolean;
  form_config: unknown;
};


type Row = Record<string, string>;

const LANG_LEVELS = ["جيد", "متوسط", "ضعيف"];

const emptyEdu = (): Row => ({ degree: "", major: "", place: "", from: "", to: "" });
const emptyCourse = (): Row => ({ name: "", org: "", hours: "", from: "", to: "" });
const emptyExp = (): Row => ({ workplace: "", position: "", from: "", to: "" });
const emptyRef = (): Row => ({ name: "", phone: "", mobile: "", email: "" });
const emptyLang = (): Row => ({ language: "", speaking: "", reading: "", writing: "" });

function RepeaterHeader({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      <Button type="button" variant="outline" size="sm" onClick={onAdd} className="h-8 gap-1">
        <Plus className="h-3.5 w-3.5" /> إضافة
      </Button>
    </div>
  );
}

export default function JobApplicationPage() {
  const { slug } = useParams<{ slug: string }>();
  const [link, setLink] = useState<LinkRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Personal
  const [fullName, setFullName] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [gender, setGender] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [marital, setMarital] = useState("");
  const [children, setChildren] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("");

  // Repeaters
  const [education, setEducation] = useState<Row[]>([emptyEdu()]);
  const [courses, setCourses] = useState<Row[]>([emptyCourse()]);
  const [languages, setLanguages] = useState<Row[]>([emptyLang()]);
  const [experience, setExperience] = useState<Row[]>([emptyExp()]);
  const [referees, setReferees] = useState<Row[]>([emptyRef()]);

  // Preferences
  const [shift, setShift] = useState("");
  const [jobType, setJobType] = useState("");
  const [workLocation, setWorkLocation] = useState("");
  const [smoker, setSmoker] = useState("");
  const [worksFriday, setWorksFriday] = useState("");
  const [worksHolidays, setWorksHolidays] = useState("");
  const [license, setLicense] = useState("");
  const [licenseType, setLicenseType] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  // إجابات الأسئلة المخصّصة التي بناها صاحب الحساب
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("job_application_links")
        .select("id, slug, title, description, is_active, form_config")
        .eq("slug", slug || "")
        .maybeSingle();
      if (!alive) return;
      setLink((data as LinkRow) || null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [slug]);

  const cfg: JobFormConfig = useMemo(
    () => parseJobFormConfig((link as any)?.form_config),
    [link],
  );


  const clean = (rows: Row[]) =>
    rows.filter((r) => Object.values(r).some((v) => String(v || "").trim()));

  const readFile = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

  const submit = async () => {
    if (!fullName.trim()) return toast.error("الاسم مطلوب");
    if (!phone.trim()) return toast.error("رقم الهاتف مطلوب");
    if (!position.trim()) return toast.error("الوظيفة المطلوبة مطلوبة");

    // جميع حقول البيانات الشخصية المفعّلة إجبارية
    const personalChecks: [boolean, string, string][] = [
      [cfg.personal.national_id, nationalId, "رقم الهوية"],
      [cfg.personal.gender, gender, "الجنس"],
      [cfg.personal.birth_date, birthDate, "تاريخ الولادة"],
      [cfg.personal.birth_place, birthPlace, "مكان الولادة"],
      [cfg.personal.marital_status, marital, "الحالة الاجتماعية"],
      [cfg.personal.children_count, children, "عدد الأولاد"],
      [cfg.personal.email, email, "البريد الإلكتروني"],
      [cfg.personal.address, address, "العنوان"],
    ];
    const missingPersonal = personalChecks.find(([on, v]) => on && !String(v || "").trim());
    if (missingPersonal) return toast.error(`مطلوب: ${missingPersonal[2]}`);

    // جميع تفضيلات العمل إجبارية
    if (cfg.sections.preferences) {
      const prefChecks: [string, string][] = [
        [shift, "فترة الدوام المطلوبة"],
        [jobType, "نوع الوظيفة"],
        [workLocation, "موقع العمل"],
        [smoker, "التدخين"],
        [worksFriday, "العمل يوم الجمعة"],
        [worksHolidays, "العمل في أيام الأعياد والمناسبات"],
        [license, "رخصة القيادة"],
      ];
      const missingPref = prefChecks.find(([v]) => !String(v || "").trim());
      if (missingPref) return toast.error(`مطلوب: ${missingPref[1]}`);
      if (license === "yes" && !licenseType.trim()) return toast.error("مطلوب: نوع الرخصة");
    }

    if (file && file.size > 10 * 1024 * 1024) return toast.error("حجم المرفق أكبر من 10 ميجا");

    const missing = cfg.questions.find((q) => q.required && !String(answers[q.id] || "").trim());
    if (missing) return toast.error(`مطلوب: ${missing.label}`);

    const customAnswers = cfg.questions
      .map((q) => ({ id: q.id, label: q.label, value: String(answers[q.id] || "").trim() }))
      .filter((a) => a.value);

    setSubmitting(true);
    try {
      let attachment_base64: string | undefined;
      if (file && cfg.sections.attachment) attachment_base64 = await readFile(file);

      const { data, error } = await supabase.functions.invoke("submit-job-application", {
        body: {
          slug,
          full_name: fullName,
          national_id: cfg.personal.national_id ? nationalId : "",
          gender: cfg.personal.gender ? gender : "",
          birth_date: (cfg.personal.birth_date && birthDate) || null,
          birth_place: cfg.personal.birth_place ? birthPlace : "",
          marital_status: cfg.personal.marital_status ? marital : "",
          children_count: cfg.personal.children_count && children ? Number(children) : null,
          address: cfg.personal.address ? address : "",
          phone,
          email: cfg.personal.email ? email : "",
          desired_position: position,
          education: cfg.sections.education ? clean(education) : [],
          courses: cfg.sections.courses ? clean(courses) : [],
          languages: cfg.sections.languages ? clean(languages) : [],
          experience: cfg.sections.experience ? clean(experience) : [],
          referees: cfg.sections.referees ? clean(referees) : [],
          shift_preference: cfg.sections.preferences ? shift : "",
          job_type: cfg.sections.preferences ? jobType : "",
          work_location: cfg.sections.preferences ? workLocation : "",
          smoker: cfg.sections.preferences && smoker ? smoker === "yes" : null,
          works_friday: cfg.sections.preferences && worksFriday ? worksFriday === "yes" : null,
          has_driving_license: cfg.sections.preferences && license ? license === "yes" : null,
          driving_license_type: cfg.sections.preferences ? licenseType : "",
          notes,
          custom_answers: customAnswers,
          attachment_base64,
          attachment_name: attachment_base64 ? file?.name : undefined,
          attachment_type: attachment_base64 ? file?.type : undefined,
        },
      });

      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setDone(true);
    } catch (e) {
      toast.error((e as Error).message || "تعذر إرسال الطلب");
    } finally {
      setSubmitting(false);
    }
  };

  const shell = useMemo(
    // text-base on inputs on mobile prevents iOS auto-zoom when focusing fields
    () => "mx-auto w-full max-w-2xl px-3 sm:px-4 py-4 sm:py-6 [&_input]:text-base sm:[&_input]:text-sm",
    [],
  );

  // شارة «Powered by Unify» التسويقية — تظهر للجميع
  const PoweredBadge = (
    <a
      href={`https://${BRAND.domain}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-3 left-3 z-50 flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 py-1.5 shadow-md backdrop-blur-sm transition hover:shadow-lg"
      aria-label="Powered by Unify ERP"
    >
      <img src={BRAND.logos.icon} alt="Unify" className="h-4 w-4 object-contain" />
      <span className="text-[11px] font-medium text-muted-foreground" dir="ltr">
        Powered by <span className="font-bold text-foreground">Unify</span>
      </span>
    </a>
  );

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        {PoweredBadge}
      </div>
    );
  }

  if (!link || !link.is_active) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-muted/30 p-6 text-center">
        <div>
          <h1 className="text-lg font-bold mb-2">رابط التقديم غير متاح</h1>
          <p className="text-sm text-muted-foreground">تم إيقاف استقبال الطلبات على هذا الرابط حالياً.</p>
        </div>
        {PoweredBadge}
      </div>
    );
  }

  if (done) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <div className="bg-card rounded-2xl border border-border p-8 text-center max-w-sm w-full">
          <CheckCircle2 className="h-12 w-12 mx-auto text-primary mb-3" />
          <h1 className="text-lg font-bold mb-2">تم استلام طلبك بنجاح</h1>
          <p className="text-sm text-muted-foreground">
            شكراً لتقديمك. سيتم مراجعة الطلب من قِبل دائرة الموارد البشرية والتواصل معك عند الحاجة.
          </p>
        </div>
        {PoweredBadge}
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-muted/30">
      <header className="bg-[#0D1B2E] text-white">
        <div className={`${shell} flex items-center gap-3`}>
          <div className="h-11 w-11 rounded-xl bg-white/10 flex items-center justify-center">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">{link.title}</h1>
            <p className="text-xs text-white/70">{link.description || "املأ البيانات التالية بدقة"}</p>
          </div>
        </div>
      </header>

      <main className={shell}>
        <div className="space-y-5">
          {/* Personal */}
          <section className="bg-card rounded-2xl border border-border p-4">
            <h2 className="text-sm font-bold mb-3 pb-2 border-b border-border">البيانات الشخصية</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">الاسم الرباعي *</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              {cfg.personal.national_id && (
                <div>
                  <Label className="text-xs">رقم الهوية</Label>
                  <Input value={nationalId} onChange={(e) => setNationalId(e.target.value)} inputMode="numeric" />
                </div>
              )}
              <div>
                <Label className="text-xs">الوظيفة المطلوبة *</Label>
                <Input value={position} onChange={(e) => setPosition(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">رقم الهاتف *</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
              </div>
              {cfg.personal.gender && (
                <div>
                  <Label className="text-xs">الجنس</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ذكر">ذكر</SelectItem>
                      <SelectItem value="أنثى">أنثى</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {cfg.personal.marital_status && (
                <div>
                  <Label className="text-xs">الحالة الاجتماعية</Label>
                  <Select value={marital} onValueChange={setMarital}>
                    <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="أعزب">أعزب</SelectItem>
                      <SelectItem value="متزوج">متزوج</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {cfg.personal.birth_date && (
                <div>
                  <Label className="text-xs">تاريخ الولادة</Label>
                  <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                </div>
              )}
              {cfg.personal.birth_place && (
                <div>
                  <Label className="text-xs">مكان الولادة</Label>
                  <Input value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} />
                </div>
              )}
              {cfg.personal.children_count && (
                <div>
                  <Label className="text-xs">عدد الأولاد</Label>
                  <Input value={children} onChange={(e) => setChildren(e.target.value)} inputMode="numeric" />
                </div>
              )}
              {cfg.personal.email && (
                <div>
                  <Label className="text-xs">البريد الإلكتروني</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
                </div>
              )}
              {cfg.personal.address && (
                <div className="sm:col-span-2">
                  <Label className="text-xs">العنوان</Label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
              )}

            </div>
          </section>

          {/* Education */}
          {cfg.sections.education && (
          <section className="bg-card rounded-2xl border border-border p-4">
            <RepeaterHeader title="المؤهلات العلمية" onAdd={() => setEducation((r) => [...r, emptyEdu()])} />
            <div className="space-y-3">
              {education.map((row, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                  <Input placeholder="الدرجة العلمية" value={row.degree} onChange={(e) => setEducation((rows) => rows.map((r, x) => x === i ? { ...r, degree: e.target.value } : r))} />
                  <Input placeholder="التخصص" value={row.major} onChange={(e) => setEducation((rows) => rows.map((r, x) => x === i ? { ...r, major: e.target.value } : r))} />
                  <Input placeholder="مكان الدراسة" value={row.place} onChange={(e) => setEducation((rows) => rows.map((r, x) => x === i ? { ...r, place: e.target.value } : r))} />
                  <Input placeholder="من سنة" value={row.from} onChange={(e) => setEducation((rows) => rows.map((r, x) => x === i ? { ...r, from: e.target.value } : r))} />
                  <div className="flex gap-1">
                    <Input placeholder="إلى سنة" value={row.to} onChange={(e) => setEducation((rows) => rows.map((r, x) => x === i ? { ...r, to: e.target.value } : r))} />
                    <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="حذف السطر" onClick={() => setEducation((rows) => rows.filter((_, x) => x !== i))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          )}

          {/* Courses */}
          {cfg.sections.courses && (
          <section className="bg-card rounded-2xl border border-border p-4">
            <RepeaterHeader title="البرامج التدريبية" onAdd={() => setCourses((r) => [...r, emptyCourse()])} />
            <div className="space-y-3">
              {courses.map((row, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                  <Input placeholder="اسم الدورة" value={row.name} onChange={(e) => setCourses((rows) => rows.map((r, x) => x === i ? { ...r, name: e.target.value } : r))} />
                  <Input placeholder="المؤسسة" value={row.org} onChange={(e) => setCourses((rows) => rows.map((r, x) => x === i ? { ...r, org: e.target.value } : r))} />
                  <Input placeholder="# الساعات" value={row.hours} onChange={(e) => setCourses((rows) => rows.map((r, x) => x === i ? { ...r, hours: e.target.value } : r))} />
                  <Input placeholder="من" value={row.from} onChange={(e) => setCourses((rows) => rows.map((r, x) => x === i ? { ...r, from: e.target.value } : r))} />
                  <div className="flex gap-1">
                    <Input placeholder="إلى" value={row.to} onChange={(e) => setCourses((rows) => rows.map((r, x) => x === i ? { ...r, to: e.target.value } : r))} />
                    <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="حذف السطر" onClick={() => setCourses((rows) => rows.filter((_, x) => x !== i))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          )}

          {/* Languages */}
          {cfg.sections.languages && (
          <section className="bg-card rounded-2xl border border-border p-4">
            <RepeaterHeader title="اللغات" onAdd={() => setLanguages((r) => [...r, emptyLang()])} />
            <div className="space-y-3">
              {languages.map((row, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                  <Input placeholder="اللغة" value={row.language} onChange={(e) => setLanguages((rows) => rows.map((r, x) => x === i ? { ...r, language: e.target.value } : r))} />
                  {(["speaking", "reading", "writing"] as const).map((k) => (
                    <Select key={k} value={row[k]} onValueChange={(v) => setLanguages((rows) => rows.map((r, x) => x === i ? { ...r, [k]: v } : r))}>
                      <SelectTrigger>
                        <SelectValue placeholder={k === "speaking" ? "المحادثة" : k === "reading" ? "القراءة" : "الكتابة"} />
                      </SelectTrigger>
                      <SelectContent>
                        {LANG_LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ))}
                  <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="حذف السطر" onClick={() => setLanguages((rows) => rows.filter((_, x) => x !== i))}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </section>
          )}

          {/* Experience */}
          {cfg.sections.experience && (
          <section className="bg-card rounded-2xl border border-border p-4">
            <RepeaterHeader title="خبرات العمل السابقة" onAdd={() => setExperience((r) => [...r, emptyExp()])} />
            <div className="space-y-3">
              {experience.map((row, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                  <Input placeholder="مكان العمل" value={row.workplace} onChange={(e) => setExperience((rows) => rows.map((r, x) => x === i ? { ...r, workplace: e.target.value } : r))} />
                  <Input placeholder="الوظيفة" value={row.position} onChange={(e) => setExperience((rows) => rows.map((r, x) => x === i ? { ...r, position: e.target.value } : r))} />
                  <Input placeholder="من" value={row.from} onChange={(e) => setExperience((rows) => rows.map((r, x) => x === i ? { ...r, from: e.target.value } : r))} />
                  <div className="flex gap-1">
                    <Input placeholder="إلى" value={row.to} onChange={(e) => setExperience((rows) => rows.map((r, x) => x === i ? { ...r, to: e.target.value } : r))} />
                    <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="حذف السطر" onClick={() => setExperience((rows) => rows.filter((_, x) => x !== i))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          )}

          {/* Referees */}
          {cfg.sections.referees && (
          <section className="bg-card rounded-2xl border border-border p-4">
            <RepeaterHeader title="المعرفون" onAdd={() => setReferees((r) => [...r, emptyRef()])} />
            <div className="space-y-3">
              {referees.map((row, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                  <Input placeholder="الاسم" value={row.name} onChange={(e) => setReferees((rows) => rows.map((r, x) => x === i ? { ...r, name: e.target.value } : r))} />
                  <Input placeholder="هاتف" value={row.phone} onChange={(e) => setReferees((rows) => rows.map((r, x) => x === i ? { ...r, phone: e.target.value } : r))} />
                  <Input placeholder="محمول" value={row.mobile} onChange={(e) => setReferees((rows) => rows.map((r, x) => x === i ? { ...r, mobile: e.target.value } : r))} />
                  <div className="flex gap-1">
                    <Input placeholder="بريد إلكتروني" value={row.email} onChange={(e) => setReferees((rows) => rows.map((r, x) => x === i ? { ...r, email: e.target.value } : r))} />
                    <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="حذف السطر" onClick={() => setReferees((rows) => rows.filter((_, x) => x !== i))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          )}

          {/* Preferences */}
          {cfg.sections.preferences && (
          <section className="bg-card rounded-2xl border border-border p-4">
            <h2 className="text-sm font-bold mb-3 pb-2 border-b border-border">تفضيلات العمل</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">فترة الدوام المطلوبة</Label>
                <Select value={shift} onValueChange={setShift}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="صباحي">صباحي</SelectItem>
                    <SelectItem value="مسائي">مسائي</SelectItem>
                    <SelectItem value="مرن">مرن</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">نوع الوظيفة</Label>
                <Select value={jobType} onValueChange={setJobType}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="دائم">دائم</SelectItem>
                    <SelectItem value="مؤقت">مؤقت</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">موقع العمل</Label>
                <Select value={workLocation} onValueChange={setWorkLocation}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="مطبخ">مطبخ</SelectItem>
                    <SelectItem value="كاونتر">كاونتر</SelectItem>
                    <SelectItem value="تنظيف">تنظيف</SelectItem>
                    <SelectItem value="أخرى">أخرى</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">التدخين</Label>
                <Select value={smoker} onValueChange={setSmoker}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">مدخن</SelectItem>
                    <SelectItem value="no">غير مدخن</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">العمل يوم الجمعة</Label>
                <Select value={worksFriday} onValueChange={setWorksFriday}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">نعم</SelectItem>
                    <SelectItem value="no">لا</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">رخصة القيادة</Label>
                <Select value={license} onValueChange={setLicense}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">نعم</SelectItem>
                    <SelectItem value="no">لا</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {license === "yes" && (
                <div>
                  <Label className="text-xs">نوع الرخصة</Label>
                  <Input value={licenseType} onChange={(e) => setLicenseType(e.target.value)} />
                </div>
              )}
            </div>
          </section>
          )}

          {/* أسئلة مخصّصة أضافها صاحب الحساب */}
          {cfg.questions.length > 0 && (
            <section className="bg-card rounded-2xl border border-border p-4">
              <h2 className="text-sm font-bold mb-3 pb-2 border-b border-border">أسئلة إضافية</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {cfg.questions.map((q) => {
                  const val = answers[q.id] || "";
                  const set = (v: string) => setAnswers((a) => ({ ...a, [q.id]: v }));
                  return (
                    <div key={q.id} className={q.type === "textarea" ? "sm:col-span-2" : undefined}>
                      <Label className="text-xs">{q.label}{q.required ? " *" : ""}</Label>
                      {q.type === "textarea" ? (
                        <Textarea value={val} onChange={(e) => set(e.target.value)} rows={3} />
                      ) : q.type === "select" ? (
                        <Select value={val} onValueChange={set}>
                          <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                          <SelectContent>
                            {(q.options || []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : q.type === "yesno" ? (
                        <Select value={val} onValueChange={set}>
                          <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="نعم">نعم</SelectItem>
                            <SelectItem value="لا">لا</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={val}
                          onChange={(e) => set(e.target.value)}
                          type={q.type === "date" ? "date" : q.type === "number" ? "number" : "text"}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ملاحظات + مرفق */}
          <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
            <div>
              <Label className="text-xs">ملاحظات إضافية</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
            {cfg.sections.attachment && (
              <div>
                <Label className="text-xs">مرفق (سيرة ذاتية / فحص طبي) — اختياري</Label>
                <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </div>
            )}
          </section>


          <Button className="w-full h-12 text-base" onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "إرسال الطلب"}
          </Button>

          {/* مساحة سفلية حتى لا تغطي الشارة العائمة المحتوى */}
          <div className="h-14" />
        </div>
      </main>

      {/* تذييل تسويقي: Powered by Unify */}
      <footer className="bg-[#0D1B2E] text-white">
        <div className="mx-auto w-full max-w-2xl px-4 py-5 flex flex-col items-center gap-2 text-center">
          <a
            href={`https://${BRAND.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 opacity-90 hover:opacity-100 transition"
          >
            <img src={BRAND.logos.dark} alt={BRAND.nameEn} className="h-7 w-auto object-contain" />
          </a>
          <p className="text-[11px] text-white/60" dir="ltr">
            Powered by Unify ERP — {BRAND.messages.taglineEn}
          </p>
          <p className="text-[11px] text-white/50">{BRAND.messages.taglineAr}</p>
        </div>
      </footer>

      {PoweredBadge}
    </div>
  );
}
