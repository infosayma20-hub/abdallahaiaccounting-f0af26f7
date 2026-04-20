import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, LayoutDashboard, Trash2, Edit3, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import PageHeader from "@/components/layout/PageHeader";
import { useCustomDashboards } from "@/hooks/useCustomDashboards";
import { format } from "date-fns";

const ICONS = ["📊", "📈", "💼", "🎯", "💰", "🛒", "📦", "⚡", "🔥", "✨"];

export default function DashboardsPage() {
  const navigate = useNavigate();
  const { dashboards, loading, createDashboard, deleteDashboard } = useCustomDashboards();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("📊");
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    const d = await createDashboard({ name: name.trim(), description: description.trim() || null, icon });
    setCreating(false);
    if (d) {
      setCreateOpen(false);
      setName(""); setDescription(""); setIcon("📊");
      navigate(`/dashboards/${d.id}?edit=1`);
    }
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <PageHeader
        title="لوحات المعلومات المخصصة"
        subtitle="ابنِ لوحتك الخاصة من KPIs وتقارير ورسومات"
        icon={<LayoutDashboard className="h-5 w-5" />}
        actions={
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> لوحة جديدة
          </Button>
        }
      />

      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : dashboards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-1">لم تنشئ أي لوحة بعد</h3>
            <p className="text-sm text-muted-foreground mb-5 max-w-sm">
              من البيانات الخام إلى قرار إداري في 30 ثانية — ابدأ ببناء لوحتك الأولى الآن.
            </p>
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> أنشئ لوحتك الأولى
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {dashboards.map(d => (
              <div
                key={d.id}
                className="group relative bg-card rounded-2xl border border-border/40 p-5 hover:border-primary/40 hover:shadow-lg transition-all cursor-pointer"
                onClick={() => navigate(`/dashboards/${d.id}`)}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center text-2xl">
                    {d.icon || "📊"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-foreground truncate">{d.name}</h3>
                    {d.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{d.description}</p>}
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">آخر تحديث: {format(new Date(d.updated_at), "yyyy/MM/dd")}</p>

                <div className="absolute top-3 left-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/dashboards/${d.id}?edit=1`); }}
                    className="w-7 h-7 rounded-lg bg-background border border-border flex items-center justify-center hover:bg-muted"
                    title="تعديل"
                  >
                    <Edit3 className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteId(d.id); }}
                    className="w-7 h-7 rounded-lg bg-background border border-destructive/40 text-destructive flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
                    title="حذف"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>إنشاء لوحة جديدة</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">اسم اللوحة *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: لوحة المبيعات الشهرية" />
            </div>
            <div>
              <Label className="text-xs">الوصف</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="وصف مختصر..." />
            </div>
            <div>
              <Label className="text-xs mb-2 block">الأيقونة</Label>
              <div className="flex flex-wrap gap-2">
                {ICONS.map(i => (
                  <button
                    key={i}
                    onClick={() => setIcon(i)}
                    className={`w-10 h-10 rounded-xl text-xl transition-all ${icon === i ? "bg-primary/15 border-2 border-primary" : "bg-muted border-2 border-transparent hover:bg-muted/80"}`}
                  >{i}</button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>إلغاء</Button>
            <Button onClick={handleCreate} disabled={!name.trim() || creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "إنشاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف اللوحة؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف اللوحة وجميع عناصرها بشكل نهائي. لا يمكن التراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId) deleteDashboard(deleteId); setDeleteId(null); }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
