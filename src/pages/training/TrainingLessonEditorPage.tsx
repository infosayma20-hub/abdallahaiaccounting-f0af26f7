import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Save, ArrowRight, Eye } from "lucide-react";
import { FinanceShell, FastTabs } from "@/components/finance/shell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { LessonSlideView } from "@/components/training/LessonSlideView";
import { LESSON_TYPE_LABELS, type LessonContent, type TrainingLesson } from "@/hooks/training/useTraining";

const toLines = (arr?: string[]) => (arr || []).join("\n");
const fromLines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export default function TrainingLessonEditorPage() {
  const { id: courseId, lessonId } = useParams();
  const isNew = !lessonId || lessonId === "new";
  const navigate = useNavigate();
  const { dataOwnerId } = useDataOwnerId();
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    section: "", title: "", subtitle: "", lesson_type: "content", sort_order: 1,
  });
  const [bullets, setBullets] = useState("");
  const [note, setNote] = useState("");
  const [quoteText, setQuoteText] = useState("");
  const [quoteSource, setQuoteSource] = useState("");
  const [badgeTitle, setBadgeTitle] = useState("");
  const [badgeItems, setBadgeItems] = useState("");
  const [steps, setSteps] = useState<LessonContent["steps"]>([]);
  const [columns, setColumns] = useState<LessonContent["columns"]>([]);

  useEffect(() => {
    (async () => {
      if (isNew) {
        const { count } = await supabase.from("training_lessons")
          .select("id", { count: "exact", head: true }).eq("course_id", courseId!);
        setForm((f) => ({ ...f, sort_order: (count || 0) + 1 }));
        return;
      }
      const { data } = await supabase.from("training_lessons").select("*").eq("id", lessonId!).maybeSingle();
      if (data) {
        const l = data as any;
        setForm({ section: l.section || "", title: l.title, subtitle: l.subtitle || "", lesson_type: l.lesson_type, sort_order: l.sort_order });
        const c = (l.content || {}) as LessonContent;
        setBullets(toLines(c.bullets));
        setNote(c.note || "");
        setQuoteText(c.quote?.text || "");
        setQuoteSource(c.quote?.source || "");
        setBadgeTitle(c.badge?.title || "");
        setBadgeItems(toLines(c.badge?.items));
        setSteps(c.steps || []);
        setColumns(c.columns || []);
      }
      setLoading(false);
    })();
  }, [courseId, lessonId, isNew]);

  const buildContent = (): LessonContent => {
    const c: LessonContent = {};
    const b = fromLines(bullets); if (b.length) c.bullets = b;
    if (note.trim()) c.note = note.trim();
    if (quoteText.trim()) c.quote = { text: quoteText.trim(), source: quoteSource.trim() || undefined };
    const bi = fromLines(badgeItems);
    if (badgeTitle.trim() && bi.length) c.badge = { title: badgeTitle.trim(), items: bi };
    if (steps?.length) c.steps = steps.map((s, i) => ({ ...s, n: i + 1 }));
    if (columns?.length) c.columns = columns;
    return c;
  };

  const preview: TrainingLesson = {
    id: "preview", course_id: courseId || "", user_id: "", sort_order: form.sort_order,
    section: form.section || null, title: form.title || "عنوان الشريحة", subtitle: form.subtitle || null,
    lesson_type: form.lesson_type, content: buildContent(),
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error("العنوان مطلوب");
    setSaving(true);
    const payload = { ...form, content: buildContent() as any, course_id: courseId, user_id: dataOwnerId };
    const { error } = isNew
      ? await supabase.from("training_lessons").insert(payload as any)
      : await supabase.from("training_lessons").update(payload as any).eq("id", lessonId!);
    setSaving(false);
    if (error) return toast.error("تعذّر الحفظ");
    toast.success("تم الحفظ");
    navigate(`/training/courses/${courseId}`);
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground" dir="rtl">جاري التحميل…</div>;

  return (
    <FinanceShell
      title={isNew ? "شريحة جديدة" : "تعديل الشريحة"}
      breadcrumb={[
        { label: "الورشات والدورات", href: "/training" },
        { label: "الدورة", href: `/training/courses/${courseId}` },
        { label: isNew ? "شريحة جديدة" : form.title },
      ]}
      actionTabs={[{
        key: "general", label: "عام",
        groups: [{
          key: "a", label: "إجراءات",
          items: [
            { key: "save", label: saving ? "جاري الحفظ…" : "حفظ", icon: Save, variant: "primary", onClick: save, disabled: saving },
            { key: "back", label: "رجوع للدورة", icon: ArrowRight, onClick: () => navigate(`/training/courses/${courseId}`) },
            { key: "play", label: "عرض تقديمي", icon: Eye, onClick: () => navigate(`/training/courses/${courseId}/play`) },
          ],
        }],
      }]}
    >
      <div className="p-3 grid grid-cols-1 lg:grid-cols-2 gap-3" dir="rtl">
        <div>
          <FastTabs items={[
            {
              key: "basic", title: "بيانات الشريحة", defaultOpen: true,
              children: (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-[12px] text-muted-foreground">العنوان</label>
                    <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-9 text-[13px]" />
                  </div>
                  <div>
                    <label className="text-[12px] text-muted-foreground">المحور</label>
                    <Input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} className="h-9 text-[13px]" />
                  </div>
                  <div>
                    <label className="text-[12px] text-muted-foreground">العنوان الفرعي</label>
                    <Input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} className="h-9 text-[13px]" />
                  </div>
                  <div>
                    <label className="text-[12px] text-muted-foreground">النوع</label>
                    <select
                      value={form.lesson_type}
                      onChange={(e) => setForm({ ...form, lesson_type: e.target.value })}
                      className="w-full h-9 rounded-md border border-input bg-background px-2 text-[13px]"
                    >
                      {Object.entries(LESSON_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[12px] text-muted-foreground">الترتيب</label>
                    <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} className="h-9 text-[13px]" />
                  </div>
                </div>
              ),
            },
            {
              key: "content", title: "المحتوى", defaultOpen: true,
              children: (
                <div className="space-y-3">
                  <div>
                    <label className="text-[12px] text-muted-foreground">النقاط (سطر لكل نقطة)</label>
                    <Textarea value={bullets} onChange={(e) => setBullets(e.target.value)} rows={6} className="text-[13px]" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[12px] text-muted-foreground">اقتباس / آية</label>
                      <Input value={quoteText} onChange={(e) => setQuoteText(e.target.value)} className="h-9 text-[13px]" />
                    </div>
                    <div>
                      <label className="text-[12px] text-muted-foreground">مصدر الاقتباس</label>
                      <Input value={quoteSource} onChange={(e) => setQuoteSource(e.target.value)} className="h-9 text-[13px]" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[12px] text-muted-foreground">عنوان اللوحة الجانبية</label>
                      <Input value={badgeTitle} onChange={(e) => setBadgeTitle(e.target.value)} className="h-9 text-[13px]" />
                    </div>
                    <div>
                      <label className="text-[12px] text-muted-foreground">عناصر اللوحة (سطر لكل عنصر)</label>
                      <Textarea value={badgeItems} onChange={(e) => setBadgeItems(e.target.value)} rows={3} className="text-[13px]" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[12px] text-muted-foreground">ملاحظة ختامية</label>
                    <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="text-[13px]" />
                  </div>
                </div>
              ),
            },
            {
              key: "steps", title: "الخطوات", defaultOpen: false,
              summary: <span className="text-[12px] text-muted-foreground">{steps?.length || 0}</span>,
              children: (
                <div className="space-y-2">
                  {(steps || []).map((s, i) => (
                    <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 items-center">
                      <Input value={s.title} placeholder="عنوان الخطوة" className="h-8 text-[13px]"
                        onChange={(e) => setSteps((prev) => (prev || []).map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                      <Input value={s.desc || ""} placeholder="الوصف" className="h-8 text-[13px]"
                        onChange={(e) => setSteps((prev) => (prev || []).map((x, j) => j === i ? { ...x, desc: e.target.value } : x))} />
                      <button className="text-destructive text-[12px]" onClick={() => setSteps((prev) => (prev || []).filter((_, j) => j !== i))}>حذف</button>
                    </div>
                  ))}
                  <button className="text-primary text-[12.5px]" onClick={() => setSteps((prev) => [...(prev || []), { n: (prev?.length || 0) + 1, title: "", desc: "" }])}>+ إضافة خطوة</button>
                </div>
              ),
            },
            {
              key: "columns", title: "الأعمدة", defaultOpen: false,
              summary: <span className="text-[12px] text-muted-foreground">{columns?.length || 0}</span>,
              children: (
                <div className="space-y-3">
                  {(columns || []).map((col, i) => (
                    <div key={i} className="rounded-lg border border-border p-2 space-y-2">
                      <div className="flex gap-2 items-center">
                        <Input value={col.title} placeholder="عنوان العمود" className="h-8 text-[13px]"
                          onChange={(e) => setColumns((prev) => (prev || []).map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                        <button className="text-destructive text-[12px]" onClick={() => setColumns((prev) => (prev || []).filter((_, j) => j !== i))}>حذف</button>
                      </div>
                      <Textarea value={toLines(col.items)} rows={3} className="text-[13px]" placeholder="سطر لكل عنصر"
                        onChange={(e) => setColumns((prev) => (prev || []).map((x, j) => j === i ? { ...x, items: fromLines(e.target.value) } : x))} />
                    </div>
                  ))}
                  <button className="text-primary text-[12.5px]" onClick={() => setColumns((prev) => [...(prev || []), { title: "", items: [] }])}>+ إضافة عمود</button>
                </div>
              ),
            },
          ]} />
        </div>

        <div className="lg:sticky lg:top-2 h-fit">
          <div className="text-[12px] text-muted-foreground mb-1">معاينة مباشرة</div>
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <LessonSlideView lesson={preview} />
          </div>
        </div>
      </div>
    </FinanceShell>
  );
}