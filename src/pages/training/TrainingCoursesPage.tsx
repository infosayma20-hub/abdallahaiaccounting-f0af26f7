import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Eye, Pencil, Trash2, Send, Archive, GraduationCap } from "lucide-react";
import { FinanceShell } from "@/components/finance/shell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { COURSE_STATUS_LABELS, useTrainingCourses } from "@/hooks/training/useTraining";

export default function TrainingCoursesPage() {
  const navigate = useNavigate();
  const { courses, loading, refetch } = useTrainingCourses();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return courses;
    return courses.filter((c) =>
      [c.title, c.description, c.category].some((v) => (v || "").toLowerCase().includes(s)));
  }, [courses, q]);

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("training_courses").update({ status }).eq("id", id);
    if (error) return toast.error("تعذّر تحديث الحالة");
    toast.success(status === "published" ? "تم نشر الدورة للموظفين" : "تم تحديث الحالة");
    refetch();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("training_courses").delete().eq("id", id);
    if (error) return toast.error("تعذّر الحذف");
    toast.success("تم حذف الدورة");
    setSelected(null);
    refetch();
  };

  return (
    <FinanceShell
      title="الورشات والدورات"
      subtitle="دورات تدريبية للموظفين — إنشاء، نشر، ومتابعة الإنجاز"
      breadcrumb={[{ label: "التطبيقات", href: "/apps" }, { label: "الورشات والدورات" }]}
      storageKey="training-courses"
      actionTabs={[
        {
          key: "general",
          label: "عام",
          groups: [
            {
              key: "new",
              label: "جديد",
              items: [
                { key: "new", label: "دورة جديدة", icon: Plus, variant: "primary", onClick: () => navigate("/training/courses/new") },
              ],
            },
            {
              key: "actions",
              label: "إجراءات",
              items: [
                { key: "open", label: "فتح", icon: Pencil, disabled: !selected, onClick: () => selected && navigate(`/training/courses/${selected}`) },
                { key: "play", label: "عرض تقديمي", icon: Eye, disabled: !selected, onClick: () => selected && navigate(`/training/courses/${selected}/play`) },
                { key: "publish", label: "نشر", icon: Send, disabled: !selected, onClick: () => selected && setStatus(selected, "published") },
                { key: "archive", label: "أرشفة", icon: Archive, disabled: !selected, onClick: () => selected && setStatus(selected, "archived") },
                { key: "delete", label: "حذف", icon: Trash2, variant: "danger", disabled: !selected, onClick: () => selected && remove(selected) },
              ],
            },
          ],
        },
      ]}
    >
      <div className="p-3" dir="rtl">
        <div className="mb-2 flex items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث في الدورات…" className="h-8 max-w-xs text-[13px]" />
          <span className="text-[12px] text-muted-foreground">{rows.length} دورة</span>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/60 border-b border-border">
              <tr className="text-right">
                <th className="px-3 py-2 font-semibold">الدورة</th>
                <th className="px-3 py-2 font-semibold">التصنيف</th>
                <th className="px-3 py-2 font-semibold">الحالة</th>
                <th className="px-3 py-2 font-semibold">إلزامية</th>
                <th className="px-3 py-2 font-semibold">المدة</th>
                <th className="px-3 py-2 font-semibold">أنشئت</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">جاري التحميل…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                  <GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  لا توجد دورات بعد — ابدأ بإنشاء دورة جديدة.
                </td></tr>
              )}
              {rows.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  onDoubleClick={() => navigate(`/training/courses/${c.id}`)}
                  className={`border-b border-border/60 cursor-pointer hover:bg-muted/40 ${selected === c.id ? "bg-primary/5" : ""}`}
                >
                  <td className="px-3 py-2">
                    <div className="font-semibold">{c.title}</div>
                    {c.description && <div className="text-[12px] text-muted-foreground line-clamp-1">{c.description}</div>}
                  </td>
                  <td className="px-3 py-2">{c.category || "—"}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={c.status === "published" ? "border-emerald-500/40 text-emerald-600" : ""}>
                      {COURSE_STATUS_LABELS[c.status] || c.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{c.is_mandatory ? "نعم" : "لا"}</td>
                  <td className="px-3 py-2">{c.duration_minutes ? `${c.duration_minutes} د` : "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{new Date(c.created_at).toLocaleDateString("ar")}</td>
                  <td className="px-3 py-2 text-left">
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/training/courses/${c.id}`); }}
                      className="text-primary hover:underline text-[12.5px]"
                    >فتح</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </FinanceShell>
  );
}