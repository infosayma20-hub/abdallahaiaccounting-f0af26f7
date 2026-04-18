import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Plus, Star, Trash2, Play, Edit3, Loader2, FolderOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getDataSource } from "@/lib/report-builder/data-sources";
import { format } from "date-fns";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface SavedReport {
  id: string;
  name: string;
  description: string | null;
  data_source: string;
  is_favorite: boolean;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
}

export default function MyReportsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("custom_reports")
      .select("id, name, description, data_source, is_favorite, use_count, last_used_at, created_at")
      .eq("user_id", user.id)
      .order("is_favorite", { ascending: false })
      .order("last_used_at", { ascending: false, nullsFirst: false });
    setReports((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const toggleFav = async (id: string, current: boolean) => {
    await supabase.from("custom_reports").update({ is_favorite: !current }).eq("id", id);
    load();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("custom_reports").delete().eq("id", deleteId);
    toast({ title: "تم الحذف" });
    setDeleteId(null);
    load();
  };

  const filtered = reports.filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="px-4 pt-6 pb-24 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold text-foreground">تقاريري المخصصة</h1>
            </div>
            <p className="text-xs text-muted-foreground">{reports.length} تقرير محفوظ</p>
          </div>
        </div>
        <Button size="sm" onClick={() => navigate("/reports/builder")} className="gap-1.5 rounded-xl">
          <Plus className="h-4 w-4" /> تقرير جديد
        </Button>
      </div>

      {/* Search */}
      {reports.length > 0 && (
        <Input
          placeholder="ابحث في التقارير المحفوظة..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-md"
        />
      )}

      {/* List */}
      {loading ? (
        <Card className="p-12 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Sparkles className="h-12 w-12 text-primary/20 mx-auto mb-3" />
          <p className="text-sm font-medium mb-1">
            {search ? "لا توجد تقارير مطابقة" : "لا توجد تقارير محفوظة بعد"}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            ابدأ بإنشاء تقرير مخصص حسب احتياجك
          </p>
          {!search && (
            <Button size="sm" onClick={() => navigate("/reports/builder")} className="gap-1.5">
              <Plus className="h-4 w-4" /> أنشئ تقريرك الأول
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(r => {
            const src = getDataSource(r.data_source);
            const Icon = src?.icon;
            return (
              <Card key={r.id} className="p-4 hover:shadow-md transition-all relative group">
                <div className="flex items-start gap-3 mb-3">
                  {Icon && (
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${src!.color}15`, color: src!.color }}>
                      <Icon className="h-5 w-5" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-semibold truncate">{r.name}</h3>
                      <button onClick={() => toggleFav(r.id, r.is_favorite)} className="shrink-0">
                        <Star className={`h-3.5 w-3.5 ${r.is_favorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {src?.label} • استُخدم {r.use_count} مرة
                    </p>
                  </div>
                </div>

                {r.description && (
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{r.description}</p>
                )}

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
                  <p className="text-[10px] text-muted-foreground">
                    {r.last_used_at
                      ? `آخر استخدام: ${format(new Date(r.last_used_at), "yyyy-MM-dd")}`
                      : `أُنشئ: ${format(new Date(r.created_at), "yyyy-MM-dd")}`}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDeleteId(r.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => navigate(`/reports/builder?load=${r.id}`)}>
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={() => navigate(`/reports/builder?load=${r.id}`)}>
                      <Play className="h-3 w-3" /> تشغيل
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف التقرير</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذا التقرير المحفوظ؟ لا يمكن التراجع.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
