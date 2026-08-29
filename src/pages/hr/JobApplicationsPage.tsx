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
import { toast } from "sonner";
import { BRAND } from "@/constants/brand";
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
  notes: string | null; attachment_path: string | null; custom_answers: any;
  status: string; review_notes: string | null; created_at: string;
};


const STATUSES = [
  { key: "new", label: "جديد", cls: "bg-sky-600 hover:bg-sky-600" },
  { key: "shortlisted", label: "قيد الدراسة", cls: "bg-amber-500 hover:bg-amber-500" },
  { key: "hired", label: "تم التوظيف", cls: "bg-emerald-600 hover:bg-emerald-600" },
  { key: "rejected", label: "مرفوض", cls: "bg-rose-600 hover:bg-rose-600" },
] as const;

const statusMeta = (s: string) => STATUSES.find((x) => x.key === s) || STATUSES[0];

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

  const openAttachment = async (path: string) => {
    const { data, error } = await supabase.storage.from("job-applications").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) return toast.error("تعذّر فتح المرفق");
    window.open(data.signedUrl, "_blank");
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(publicUrl);
    toast.success("تم نسخ الرابط");
  };

  /** تصدير ملصق QR فاخر بدقة عالية (1000×1400) جاهز للطباعة. */
  const downloadQr = async () => {
    const src = qrWrapRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!src) return;
    const W = 1000, H = 1400;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    if (!g) return;

    const NAVY = "#0D1B2E", GOLD = "#C9A227", INK = "#0D1B2E";
    const rr = (x: number, y: number, w: number, h: number, r: number) => {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    };

    // خلفية كحلية متدرّجة
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#0B1626");
    bg.addColorStop(0.55, NAVY);
    bg.addColorStop(1, "#132741");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    // شبكة نقاط خفيفة
    g.fillStyle = "rgba(255,255,255,0.045)";
    for (let y = 60; y < H; y += 28) for (let x = 60; x < W; x += 28) g.fillRect(x, y, 2, 2);

    // إطار ذهبي مزدوج
    g.strokeStyle = "rgba(201,162,39,0.85)"; g.lineWidth = 3;
    rr(46, 46, W - 92, H - 92, 28); g.stroke();
    g.strokeStyle = "rgba(201,162,39,0.28)"; g.lineWidth = 1;
    rr(60, 60, W - 120, H - 120, 20); g.stroke();

    g.textAlign = "center";

    // العنوان
    g.fillStyle = "#FFFFFF";
    g.font = "700 58px Cairo, system-ui, sans-serif";
    g.fillText(link?.title || "طلب توظيف", W / 2, 190);

    // خط ذهبي فاصل
    g.fillStyle = GOLD; g.fillRect(W / 2 - 70, 226, 140, 3);

    g.fillStyle = "rgba(255,255,255,0.72)";
    g.font = "400 30px Cairo, system-ui, sans-serif";
    g.fillText("امسح الكود وقدّم طلبك", W / 2, 288);

    // بطاقة QR بيضاء
    const cardW = 660, cardX = (W - cardW) / 2, cardY = 350;
    g.save();
    g.shadowColor = "rgba(0,0,0,0.45)"; g.shadowBlur = 40; g.shadowOffsetY = 16;
    g.fillStyle = "#FFFFFF"; rr(cardX, cardY, cardW, cardW, 34); g.fill();
    g.restore();

    const qrSize = cardW - 90;
    g.imageSmoothingEnabled = false;
    g.drawImage(src, cardX + 45, cardY + 45, qrSize, qrSize);
    g.imageSmoothingEnabled = true;

    // زوايا ذهبية حول البطاقة
    g.strokeStyle = GOLD; g.lineWidth = 5; g.lineCap = "round";
    const L = 46, off = 22;
    const corners: [number, number, number, number][] = [
      [cardX - off, cardY - off, 1, 1], [cardX + cardW + off, cardY - off, -1, 1],
      [cardX - off, cardY + cardW + off, 1, -1], [cardX + cardW + off, cardY + cardW + off, -1, -1],
    ];
    for (const [x, y, dx, dy] of corners) {
      g.beginPath(); g.moveTo(x + dx * L, y); g.lineTo(x, y); g.lineTo(x, y + dy * L); g.stroke();
    }

    // الرابط
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.font = "500 26px 'JetBrains Mono', ui-monospace, monospace";
    g.fillText(publicUrl, W / 2, cardY + cardW + 100);

    // التذييل
    g.fillStyle = "rgba(201,162,39,0.55)"; g.fillRect(W / 2 - 120, H - 190, 240, 1);
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.font = "600 22px Cairo, system-ui, sans-serif";
    g.fillText("POWERED BY UNIFY", W / 2, H - 140);
    g.fillStyle = "rgba(255,255,255,0.32)";
    g.font = "400 19px Cairo, system-ui, sans-serif";
    g.fillText("unifyerp.app", W / 2, H - 106);

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
            <div className="relative w-[200px]">
              <Search className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم، الهاتف، الوظيفة..." className="pr-7 h-8 text-[12.5px]" />
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
                className="relative overflow-hidden rounded-3xl p-6 text-center"
                style={{
                  background: "linear-gradient(145deg,#0B1626 0%,#0D1B2E 55%,#132741 100%)",
                  boxShadow: "0 18px 45px -18px rgba(13,27,46,0.75)",
                }}
              >
                {/* شبكة نقاط خفيفة */}
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.06]"
                  style={{
                    backgroundImage: "radial-gradient(#fff 1px, transparent 1px)",
                    backgroundSize: "14px 14px",
                  }}
                />
                {/* إطار ذهبي مزدوج */}
                <div className="pointer-events-none absolute inset-2 rounded-[22px] border border-[#C9A227]/70" />
                <div className="pointer-events-none absolute inset-4 rounded-[18px] border border-[#C9A227]/25" />

                <div className="relative">
                  <div className="text-white font-bold text-lg tracking-tight">{link.title}</div>
                  <div className="mx-auto my-2 h-[2px] w-14 rounded-full bg-[#C9A227]" />
                  <div className="text-[12px] text-white/70 mb-4">امسح الكود وقدّم طلبك</div>

                  <div className="relative inline-block">
                    <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)]">
                      <QRCodeCanvas
                        value={publicUrl}
                        size={220}
                        level="H"
                        bgColor="#FFFFFF"
                        fgColor="#0D1B2E"
                        includeMargin
                        imageSettings={{
                          src: BRAND.logos.icon,
                          height: 46,
                          width: 46,
                          excavate: true,
                        }}
                      />
                    </div>
                    {/* زوايا ذهبية */}
                    {[
                      "-top-2 -start-2 border-t-2 border-s-2 rounded-ts-lg",
                      "-top-2 -end-2 border-t-2 border-e-2 rounded-te-lg",
                      "-bottom-2 -start-2 border-b-2 border-s-2 rounded-bs-lg",
                      "-bottom-2 -end-2 border-b-2 border-e-2 rounded-be-lg",
                    ].map((cls) => (
                      <span key={cls} className={`pointer-events-none absolute h-6 w-6 border-[#C9A227] ${cls}`} />
                    ))}
                  </div>

                  <div className="mt-4 text-[11px] text-white/80 break-all font-mono">{publicUrl}</div>

                  <div className="mx-auto mt-4 h-px w-24 bg-[#C9A227]/50" />
                  <div className="mt-2 text-[10px] tracking-[0.25em] text-white/50 font-semibold">
                    POWERED BY UNIFY
                  </div>
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

              <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 rounded-lg p-3">
                {([
                  ["الوظيفة المطلوبة", detail.desired_position],
                  ["الهاتف", detail.phone],
                  ["البريد", detail.email],
                  ["رقم الهوية", detail.national_id],
                  ["الجنس", detail.gender],
                  ["الحالة الاجتماعية", detail.marital_status],
                  ["تاريخ الولادة", detail.birth_date],
                  ["مكان الولادة", detail.birth_place],
                  ["عدد الأولاد", detail.children_count],
                  ["العنوان", detail.address],
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
                cols={[["name", "الدورة"], ["org", "المؤسسة"], ["hours", "ساعات"], ["from", "من"], ["to", "إلى"]]} />
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
