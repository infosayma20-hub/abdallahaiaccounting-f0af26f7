import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import useDataOwnerId from "@/hooks/useDataOwnerId";
import { FinanceShell, type ActionTab } from "@/components/finance/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { QRCodeCanvas } from "qrcode.react";
import {
  ArrowRight, RefreshCw, Search, Loader2, QrCode, Copy, Download,
  Paperclip, CheckCircle2, XCircle, Clock3, Printer, SlidersHorizontal,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { setNextExportBranding } from "@/lib/excel-export";
import malakyLogo from "@/assets/malaky-logo.png.asset.json";
import JobFormBuilderDialog from "@/components/hr/JobFormBuilderDialog";
import { parseCustomAnswers } from "@/lib/hr/jobApplicationForm";

type LinkRow = {
  id: string; slug: string; title: string; description: string | null; is_active: boolean;
  form_config: unknown;
};

type AppRow = {
  id: string; full_name: string; phone: string | null; email: string | null;
  national_id: string | null; gender: string | null; birth_date: string | null;
  birth_place: string | null; marital_status: string | null; children_count: number | null;
  address: string | null; desired_position: string | null;
  education: any; courses: any; languages: any; experience: any; referees: any;
  shift_preference: string | null; job_type: string | null; work_location: string | null;
  smoker: boolean | null; works_friday: boolean | null; works_holidays: boolean | null;
  has_driving_license: boolean | null; driving_license_type: string | null;
  notes: string | null; attachment_path: string | null; photo_path: string | null; custom_answers: any;
  status: string; review_notes: string | null; created_at: string;
};


const STATUSES = [
  { key: "new", label: "جديد", cls: "bg-sky-600 hover:bg-sky-600" },
  { key: "shortlisted", label: "قيد الدراسة", cls: "bg-amber-500 hover:bg-amber-500" },
  { key: "hired", label: "تم التوظيف", cls: "bg-emerald-600 hover:bg-emerald-600" },
  { key: "rejected", label: "مرفوض", cls: "bg-rose-600 hover:bg-rose-600" },
] as const;

const statusMeta = (s: string) => STATUSES.find((x) => x.key === s) || STATUSES[0];

/** يسطّح صفوف jsonb (تعليم، دورات، لغات، خبرات، معرفون، إجابات مخصصة) لنص واحد للإكسل. */
const flattenRows = (rows: any): string => {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  return rows
    .map((r: any) => {
      if (r == null || typeof r !== "object") return String(r ?? "");
      if ("question" in r && "answer" in r) return `${r.question}: ${r.answer}`;
      return Object.entries(r)
        .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
        .map(([, v]) => String(v))
        .join(" — ");
    })
    .filter(Boolean)
    .join(" | ");
};

const boolAr = (v: boolean | null | undefined) => (v === null || v === undefined ? "" : v ? "نعم" : "لا");

/** تصدير كل طلبات المتقدّمين (بكل حقول الطلب) إلى ملف إكسل. */
function exportApplicationsToExcel(apps: AppRow[]) {
  if (!apps.length) return toast.error("لا توجد طلبات للتصدير");
  const data = apps.map((r) => ({
    "الاسم الكامل": r.full_name || "",
    "الهاتف": r.phone || "",
    "البريد الإلكتروني": r.email || "",
    "رقم الهوية": r.national_id || "",
    "الجنس": r.gender || "",
    "تاريخ الميلاد": r.birth_date || "",
    "مكان السكن": r.birth_place || "",
    "الحالة الاجتماعية": r.marital_status || "",
    "عدد الأولاد": r.children_count ?? "",
    "العنوان": r.address || "",
    "الوظيفة المطلوبة": r.desired_position || "",
    "المؤهلات العلمية": flattenRows(r.education),
    "البرامج التدريبية": flattenRows(r.courses),
    "اللغات": flattenRows(r.languages),
    "خبرات العمل السابقة": flattenRows(r.experience),
    "المعرفون": flattenRows(r.referees),
    "موقع العمل المفضل": r.work_location || "",
    "تفضيل الدوام": r.shift_preference || "",
    "نوع الوظيفة": r.job_type || "",
    "مدخن": boolAr(r.smoker),
    "يعمل يوم الجمعة": boolAr(r.works_friday),
    "يعمل في الأعياد": boolAr(r.works_holidays),
    "رخصة قيادة": boolAr(r.has_driving_license),
    "نوع الرخصة": r.driving_license_type || "",
    "ملاحظات المتقدم": r.notes || "",
    "إجابات الأسئلة المخصصة": flattenRows(r.custom_answers),
    "يوجد مرفق": r.attachment_path ? "نعم" : "لا",
    "يوجد صورة شخصية": r.photo_path ? "نعم" : "لا",
    "الحالة": statusMeta(r.status || "new").label,
    "ملاحظات المراجعة": r.review_notes || "",
    "تاريخ التقديم": AR_DT(r.created_at),
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  (ws as any)["!cols"] = Object.keys(data[0]).map(() => ({ wch: 20 }));
  (ws as any)["!views"] = [{ RTL: true }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "طلبات التوظيف");
  setNextExportBranding({ title: "طلبات التوظيف" });
  XLSX.writeFile(wb, `طلبات-التوظيف-${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast.success(`تم تصدير ${apps.length} طلب بنجاح`);
}

const AR_DT = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar", {
    timeZone: "Asia/Hebron", weekday: "short", year: "numeric",
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
};

function Rows({ title, rows, cols }: { title: string; rows: any; cols: [string, string][] }) {
  const list: any[] = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-bold text-muted-foreground mb-1">{title}</h4>
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/60">
            <tr className="[&>th]:p-1.5 [&>th]:text-right [&>th]:font-medium">
              {cols.map(([, l]) => <th key={l}>{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={i} className="border-t [&>td]:p-1.5">
                {cols.map(([k]) => <td key={k}>{r?.[k] || "—"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function JobApplicationsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { dataOwnerId } = useDataOwnerId();
  const [link, setLink] = useState<LinkRow | null>(null);
  const [rows, setRows] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [qrOpen, setQrOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);

  const [detail, setDetail] = useState<AppRow | null>(null);
  /** رابط مؤقّت لصورة المتقدّم داخل نافذة التفاصيل. */
  const [detailPhotoUrl, setDetailPhotoUrl] = useState<string>("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const qrWrapRef = useRef<HTMLDivElement>(null);

  const publicUrl = link ? `${window.location.origin}/jobs/${link.slug}` : "";

  const load = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    try {
      const [{ data: links }, { data: apps, error }] = await Promise.all([
        supabase.from("job_application_links")
          .select("id, slug, title, description, is_active, form_config")
          .eq("user_id", dataOwnerId).order("created_at").limit(1),
        supabase.from("job_applications")
          .select("*").eq("user_id", dataOwnerId)
          .order("created_at", { ascending: false }).limit(1000),
      ]);
      if (error) throw error;
      setLink(((links || [])[0] as LinkRow) || null);
      setRows((apps || []) as AppRow[]);
    } catch (e: any) {
      toast.error(e?.message || "تعذّر تحميل طلبات التوظيف");
    } finally {
      setLoading(false);
    }
  }, [dataOwnerId]);

  useEffect(() => { void load(); }, [load]);

  // فتح الطلب تلقائياً عند الوصول من الإشعار (?app=<id>)
  useEffect(() => {
    const appId = searchParams.get("app");
    if (!appId || !rows.length) return;
    const found = rows.find((r) => r.id === appId);
    if (found) {
      setDetail(found);
      const next = new URLSearchParams(searchParams);
      next.delete("app");
      setSearchParams(next, { replace: true });
    }
  }, [rows, searchParams, setSearchParams]);

  const createLink = async () => {
    if (!dataOwnerId) return;
    const slug = `jobs-${Math.random().toString(36).slice(2, 8)}`;
    const { data, error } = await supabase.from("job_application_links")
      .insert({ user_id: dataOwnerId, slug, title: "طلب توظيف", description: "املأ البيانات التالية بدقة" })
      .select("id, slug, title, description, is_active, form_config").single();
    if (error) return toast.error(error.message);
    setLink(data as LinkRow);
    toast.success("تم إنشاء رابط التقديم");
  };

  const toggleLink = async (active: boolean) => {
    if (!link) return;
    setLink({ ...link, is_active: active });
    const { error } = await supabase.from("job_application_links").update({ is_active: active }).eq("id", link.id);
    if (error) { setLink({ ...link, is_active: !active }); toast.error(error.message); }
  };

  const setStatus = async (r: AppRow, status: string) => {
    setSavingId(r.id);
    const { error } = await supabase.from("job_applications")
      .update({ status, reviewed_at: new Date().toISOString() }).eq("id", r.id);
    setSavingId(null);
    if (error) return toast.error(error.message);
    setRows((prev) => prev.map((x) => x.id === r.id ? { ...x, status } : x));
    setDetail((d) => d && d.id === r.id ? { ...d, status } : d);
  };

  const saveNotes = async (r: AppRow, review_notes: string) => {
    const { error } = await supabase.from("job_applications").update({ review_notes }).eq("id", r.id);
    if (error) return toast.error(error.message);
    setRows((prev) => prev.map((x) => x.id === r.id ? { ...x, review_notes } : x));
    toast.success("تم حفظ الملاحظات");
  };

  useEffect(() => {
    let alive = true;
    const path = detail?.photo_path;
    if (!path) { setDetailPhotoUrl(""); return; }
    (async () => {
      const { data } = await supabase.storage.from("job-applications").createSignedUrl(path, 600);
      if (alive) setDetailPhotoUrl(data?.signedUrl || "");
    })();
    return () => { alive = false; };
  }, [detail?.photo_path]);

  const openAttachment = async (path: string) => {
    const { data, error } = await supabase.storage.from("job-applications").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) return toast.error("تعذّر فتح المرفق");
    window.open(data.signedUrl, "_blank");
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(publicUrl);
    toast.success("تم نسخ الرابط");
  };

  /** تصدير ملصق QR نظيف بخلفية بيضاء بدقة عالية (1000×1400) جاهز للطباعة. */
  const downloadQr = async () => {
    const src = qrWrapRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!src) return;
    const W = 1000, H = 1400;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    if (!g) return;

    const NAVY = "#0D1B2E", GOLD = "#C9A227";

    // تحميل الشعارات (الملكي + يونيفاي الجديد)
    const loadImg = (src: string) =>
      new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    const [logo, unifyLogo] = await Promise.all([
      loadImg(malakyLogo.url),
      loadImg("/branding/unify/unify-logo-horizontal.png"),
    ]);

    // خلفية بيضاء نظيفة
    g.fillStyle = "#FFFFFF";
    g.fillRect(0, 0, W, H);

    // إطار ذهبي رفيع أنيق
    g.strokeStyle = "rgba(201,162,39,0.85)"; g.lineWidth = 3;
    g.strokeRect(40, 40, W - 80, H - 80);

    g.textAlign = "center";
    let y = 110;

    // شعار الملكي أعلى الصفحة
    if (logo) {
      const lh = 190;
      const lw = (logo.naturalWidth / logo.naturalHeight) * lh;
      g.drawImage(logo, (W - lw) / 2, y, lw, lh);
      y += lh + 50;
    }

    // العنوان — ينقسم لسطرين كحد أقصى ويظل داخل حدود الإطار
    const title = (link?.title || "طلب توظيف").replace(/\s+/g, " ").trim();
    const maxTitleW = W - 200;
    g.fillStyle = NAVY;
    const wrapTitle = (fontSize: number): string[] => {
      g.font = `700 ${fontSize}px Cairo, system-ui, sans-serif`;
      if (g.measureText(title).width <= maxTitleW) return [title];
      // قسّم حسب الكلمات إلى سطرين متوازنين
      const words = title.split(" ");
      let line1 = "";
      let i = 0;
      while (i < words.length) {
        const test = line1 ? `${line1} ${words[i]}` : words[i];
        if (g.measureText(test).width > maxTitleW && line1) break;
        line1 = test;
        i++;
      }
      const line2 = words.slice(i).join(" ");
      return line2 ? [line1, line2] : [line1];
    };
    let titleLines = wrapTitle(48);
    // إذا تجاوز السطر الثاني الحدود، صغّر الخط
    if (titleLines.length === 2 && g.measureText(titleLines[1]).width > maxTitleW) {
      titleLines = wrapTitle(40);
    }
    const lineH = 62;
    titleLines.forEach((ln, idx) => {
      g.fillText(ln, W / 2, y + 48 + idx * lineH);
    });
    y += 48 + titleLines.length * lineH + 12;

    // خط ذهبي فاصل
    g.fillStyle = GOLD; g.fillRect(W / 2 - 70, y, 140, 3);
    y += 60;

    g.fillStyle = "rgba(13,27,46,0.65)";
    g.font = "400 30px Cairo, system-ui, sans-serif";
    g.fillText("امسح الكود وقدّم طلبك", W / 2, y);
    y += 60;

    // كود QR مباشرة على الأبيض — يتقلّص تلقائياً حتى لا يلامس التذييل
    const qrSize = Math.min(560, H - 260 - y);
    g.imageSmoothingEnabled = false;
    g.drawImage(src, (W - qrSize) / 2, y, qrSize, qrSize);
    g.imageSmoothingEnabled = true;
    y += qrSize + 50;

    // الرابط
    g.fillStyle = "rgba(13,27,46,0.75)";
    g.font = "500 26px 'JetBrains Mono', ui-monospace, monospace";
    g.fillText(publicUrl, W / 2, y);

    // التذييل: Powered by + شعار يونيفاي الجديد
    g.fillStyle = "rgba(201,162,39,0.6)"; g.fillRect(W / 2 - 120, H - 200, 240, 1);
    g.fillStyle = "rgba(13,27,46,0.45)";
    g.font = "600 18px Cairo, system-ui, sans-serif";
    g.fillText("POWERED BY", W / 2, H - 168);
    if (unifyLogo) {
      const uh = 44;
      const uw = (unifyLogo.naturalWidth / unifyLogo.naturalHeight) * uh;
      g.drawImage(unifyLogo, (W - uw) / 2, H - 152, uw, uh);
    } else {
      g.fillStyle = "rgba(13,27,46,0.55)";
      g.font = "600 22px Cairo, system-ui, sans-serif";
      g.fillText("UNIFY", W / 2, H - 120);
    }

    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = "job-application-qr.png";
    a.click();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && (r.status || "new") !== statusFilter) return false;
      if (!q) return true;
      return [r.full_name, r.phone, r.email, r.desired_position, r.national_id]
        .some((v) => (v || "").toString().toLowerCase().includes(q));
    });
  }, [rows, search, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const s of STATUSES) c[s.key] = rows.filter((r) => (r.status || "new") === s.key).length;
    return c;
  }, [rows]);

  const actionTabs: ActionTab[] = useMemo(() => [
    {
      key: "general",
      label: "عام",
      groups: [
        {
          key: "link",
          label: "رابط التقديم",
          items: [
            { key: "qr", label: "الرابط و QR", icon: QrCode, variant: "primary", onClick: () => setQrOpen(true) },
            {
              key: "builder", label: "بناء النموذج", icon: SlidersHorizontal,
              onClick: () => (link ? setBuilderOpen(true) : toast.error("أنشئ رابط التقديم أولاً")),
            },
          ],
        },
        {
          key: "actions",
          label: "إجراءات",
          items: [
            { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: () => void load() },
            { key: "export-excel", label: "تصدير إكسل", icon: Download, onClick: () => exportApplicationsToExcel(filtered) },
            { key: "back", label: "رجوع", icon: ArrowRight, onClick: () => navigate("/hr") },
          ],
        },
      ],
    },
  ], [load, navigate]);

  return (
    <div dir="rtl" className="min-h-[100dvh] bg-background">
      <FinanceShell
        title="طلبات التوظيف"
        breadcrumb={[{ label: "الموارد البشرية", href: "/hr" }, { label: "طلبات التوظيف" }]}
        actionTabs={actionTabs}
        rightSlot={
          <div className="flex items-center gap-2">
            {/* Unified app-wide convention: search always first (rightmost in RTL) */}
            <div className="relative w-[220px]">
              <Search className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم، الهاتف، الوظيفة..." className="pr-7 h-8 text-[12.5px]" />
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant={statusFilter === "all" ? "default" : "outline"}
                className="h-8 text-[12px]" onClick={() => setStatusFilter("all")}>
                الكل ({counts.all})
              </Button>
              {STATUSES.map((s) => (
                <Button key={s.key} size="sm" variant={statusFilter === s.key ? "default" : "outline"}
                  className="h-8 text-[12px]" onClick={() => setStatusFilter(s.key)}>
                  {s.label} ({counts[s.key] || 0})
                </Button>
              ))}
            </div>
          </div>

        }
      >
        <main className="flex-1 p-3 space-y-3">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              لا توجد طلبات توظيف بعد.
              {!link && (
                <div className="mt-3"><Button size="sm" onClick={createLink}>إنشاء رابط التقديم</Button></div>
              )}
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="grid gap-2 md:hidden">
                {filtered.map((r) => (
                  <button key={r.id} onClick={() => setDetail(r)}
                    className="text-right bg-background border rounded-lg p-3 space-y-1 hover:border-primary transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm">{r.full_name}</span>
                      <Badge className={statusMeta(r.status).cls}>{statusMeta(r.status).label}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.desired_position || "—"} • {r.phone || "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{AR_DT(r.created_at)}</div>
                  </button>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block bg-background border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-xs">
                    <tr className="[&>th]:p-2 [&>th]:text-right [&>th]:font-medium">
                      <th>التاريخ والوقت</th><th>الاسم</th><th>الوظيفة المطلوبة</th><th>الهاتف</th>
                      <th>الهوية</th><th>الفترة</th><th>مرفق</th><th>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id} onClick={() => setDetail(r)}
                        className="border-t hover:bg-muted/30 cursor-pointer [&>td]:p-2">
                        <td className="whitespace-nowrap text-xs">{AR_DT(r.created_at)}</td>
                        <td className="font-medium whitespace-nowrap">{r.full_name}</td>
                        <td className="whitespace-nowrap">{r.desired_position || "—"}</td>
                        <td className="whitespace-nowrap">{r.phone || "—"}</td>
                        <td className="whitespace-nowrap">{r.national_id || "—"}</td>
                        <td className="whitespace-nowrap">{r.shift_preference || "—"}</td>
                        <td>{r.attachment_path ? <Paperclip className="w-4 h-4 text-primary" /> : "—"}</td>
                        <td><Badge className={statusMeta(r.status).cls}>{statusMeta(r.status).label}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </main>
      </FinanceShell>

      {/* Link + QR dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle className="text-right">رابط التقديم و QR</DialogTitle></DialogHeader>
          {!link ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-muted-foreground">لم يتم إنشاء رابط تقديم بعد.</p>
              <Button onClick={createLink}>إنشاء رابط التقديم</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                <Label className="text-xs">استقبال الطلبات</Label>
                <Switch checked={link.is_active} onCheckedChange={toggleLink} />
              </div>

              <div
                id="job-qr-print"
                ref={qrWrapRef}
                className="relative overflow-hidden rounded-3xl bg-white p-6 text-center border border-[#C9A227]/60 shadow-sm"
              >
                <img
                  src={malakyLogo.url}
                  alt="شعار شركة الدجاج الملكي"
                  className="mx-auto h-20 object-contain"
                />

                <div className="mt-3 text-[#0D1B2E] font-bold text-lg tracking-tight">{link.title}</div>
                <div className="mx-auto my-2 h-[2px] w-14 rounded-full bg-[#C9A227]" />
                <div className="text-[12px] text-[#0D1B2E]/60 mb-4">امسح الكود وقدّم طلبك</div>

                <QRCodeCanvas
                  value={publicUrl}
                  size={220}
                  level="H"
                  bgColor="#FFFFFF"
                  fgColor="#0D1B2E"
                  includeMargin
                />

                <div className="mt-4 text-[11px] text-[#0D1B2E]/70 break-all font-mono">{publicUrl}</div>

                <div className="mx-auto mt-4 h-px w-24 bg-[#C9A227]/50" />
                <div className="mt-2 text-[10px] tracking-[0.25em] text-[#0D1B2E]/50 font-semibold">
                  POWERED BY UNIFY
                </div>
              </div>


              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-1" onClick={copyLink}>
                  <Copy className="w-4 h-4" /> نسخ الرابط
                </Button>
                <Button variant="outline" className="flex-1 gap-1" onClick={downloadQr}>
                  <Download className="w-4 h-4" /> تنزيل QR
                </Button>
                <Button variant="outline" className="gap-1" onClick={() => window.print()}>
                  <Printer className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Application detail */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-right">{detail?.full_name}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((s) => (
                  <Button key={s.key} size="sm" disabled={savingId === detail.id}
                    variant={detail.status === s.key ? "default" : "outline"}
                    className="h-8 text-[12px] gap-1"
                    onClick={() => setStatus(detail, s.key)}>
                    {s.key === "hired" ? <CheckCircle2 className="w-3.5 h-3.5" />
                      : s.key === "rejected" ? <XCircle className="w-3.5 h-3.5" />
                      : <Clock3 className="w-3.5 h-3.5" />}
                    {s.label}
                  </Button>
                ))}
              </div>

              {detailPhotoUrl && (
                <a href={detailPhotoUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
                  <img
                    src={detailPhotoUrl}
                    alt={`صورة المتقدّم ${detail.full_name}`}
                    className="h-28 w-28 rounded-xl border border-border object-cover"
                  />
                </a>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 rounded-lg p-3">
                {([
                  ["الوظيفة المطلوبة", detail.desired_position],
                  ["الهاتف", detail.phone],
                  ["البريد", detail.email],
                  ["رقم الهوية", detail.national_id],
                  ["الجنس", detail.gender],
                  ["الحالة الاجتماعية", detail.marital_status],
                  ["تاريخ الميلاد", detail.birth_date],
                  ["مكان السكن", detail.birth_place],
                  ["عدد الأولاد", detail.children_count],

                  ["فترة الدوام", detail.shift_preference],
                  ["نوع الوظيفة", detail.job_type],
                  ["موقع العمل", detail.work_location],
                  ["التدخين", detail.smoker == null ? null : detail.smoker ? "مدخن" : "غير مدخن"],
                  ["العمل يوم الجمعة", detail.works_friday == null ? null : detail.works_friday ? "نعم" : "لا"],
                  ["العمل في أيام الأعياد والمناسبات", detail.works_holidays == null ? null : detail.works_holidays ? "نعم" : "لا"],
                  ["رخصة القيادة", detail.has_driving_license == null ? null : detail.has_driving_license ? `نعم ${detail.driving_license_type || ""}` : "لا"],
                  ["تاريخ التقديم", AR_DT(detail.created_at)],
                ] as [string, any][]).map(([l, v]) => (
                  <div key={l}><span className="text-muted-foreground">{l}: </span>{v || "—"}</div>
                ))}
              </div>

              <Rows title="المؤهلات العلمية" rows={detail.education}
                cols={[["degree", "الدرجة"], ["major", "التخصص"], ["place", "المكان"], ["from", "من"], ["to", "إلى"]]} />
              <Rows title="البرامج التدريبية" rows={detail.courses}
                cols={[["name", "الدورة"], ["org", "المؤسسة"], ["hours", "ساعات"], ["year", "السنة"], ["from", "من"], ["to", "إلى"]]} />
              <Rows title="اللغات" rows={detail.languages}
                cols={[["language", "اللغة"], ["speaking", "محادثة"], ["reading", "قراءة"], ["writing", "كتابة"]]} />
              <Rows title="الخبرات السابقة" rows={detail.experience}
                cols={[["workplace", "مكان العمل"], ["position", "الوظيفة"], ["from", "من"], ["to", "إلى"]]} />
              <Rows title="المعرفون" rows={detail.referees}
                cols={[["name", "الاسم"], ["phone", "هاتف"], ["mobile", "محمول"], ["email", "بريد"]]} />

              {parseCustomAnswers(detail.custom_answers).length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground mb-1">أسئلة إضافية</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                    {parseCustomAnswers(detail.custom_answers).map((a, i) => (
                      <div key={`${a.id}-${i}`} className="bg-muted/40 rounded-lg p-2">
                        <span className="text-muted-foreground">{a.label}: </span>{a.value}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.notes && (
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground mb-1">ملاحظات المتقدم</h4>
                  <p className="text-xs bg-muted/40 rounded-lg p-2">{detail.notes}</p>
                </div>
              )}

              {detail.attachment_path && (
                <Button variant="outline" size="sm" className="gap-1"
                  onClick={() => openAttachment(detail.attachment_path!)}>
                  <Paperclip className="w-4 h-4" /> فتح المرفق
                </Button>
              )}

              <div>
                <Label className="text-xs">ملاحظات الموارد البشرية</Label>
                <Textarea defaultValue={detail.review_notes || ""} rows={3}
                  onBlur={(e) => {
                    if (e.target.value !== (detail.review_notes || "")) saveNotes(detail, e.target.value);
                  }} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {link && (
        <JobFormBuilderDialog
          open={builderOpen}
          onOpenChange={setBuilderOpen}
          linkId={link.id}
          title={link.title}
          description={link.description}
          formConfig={link.form_config}
          onSaved={(patch) =>
            setLink((l) => (l ? { ...l, title: patch.title, description: patch.description || null, form_config: patch.form_config } : l))
          }
        />
      )}
    </div>
  );
}
