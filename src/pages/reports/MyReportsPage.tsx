import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Plus,
  Star,
  Trash2,
  Play,
  Edit3,
  Loader2,
  FolderOpen,
  Sparkles,
  Copy,
  Archive,
  ArchiveRestore,
  History,
  Folder as FolderIcon,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getDataSource } from "@/lib/report-builder/data-sources";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import FoldersSidebar, { FolderFilter } from "@/components/report-builder/FoldersSidebar";
import VersionHistoryDialog from "@/components/report-builder/VersionHistoryDialog";
import { useReportFolders } from "@/hooks/useReportFolders";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

interface SavedReport {
  id: string;
  name: string;
  description: string | null;
  data_source: string;
  is_favorite: boolean;
  is_archived: boolean;
  archived_at: string | null;
  folder_id: string | null;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
}

export default function MyReportsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { folders } = useReportFolders();

  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FolderFilter>({ kind: "all" });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [versionsForId, setVersionsForId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("custom_reports")
      .select(
        "id, name, description, data_source, is_favorite, is_archived, archived_at, folder_id, use_count, last_used_at, created_at",
      )
      .eq("user_id", dataOwnerId!)
      .order("is_favorite", { ascending: false })
      .order("last_used_at", { ascending: false, nullsFirst: false });
    setReports((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user]);

  // ----- Counts for sidebar -----
  const counts = useMemo(() => {
    const byFolder: Record<string, number> = {};
    let all = 0,
      favorites = 0,
      archived = 0,
      uncategorized = 0;
    for (const r of reports) {
      if (r.is_archived) {
        archived++;
        continue;
      }
      all++;
      if (r.is_favorite) favorites++;
      if (!r.folder_id) uncategorized++;
      else byFolder[r.folder_id] = (byFolder[r.folder_id] || 0) + 1;
    }
    return { all, favorites, archived, uncategorized, byFolder };
  }, [reports]);

  // ----- Filtered list -----
  const filtered = useMemo(() => {
    let list = reports;
    if (filter.kind === "archived") list = list.filter(r => r.is_archived);
    else {
      list = list.filter(r => !r.is_archived);
      if (filter.kind === "favorites") list = list.filter(r => r.is_favorite);
      else if (filter.kind === "uncategorized") list = list.filter(r => !r.folder_id);
      else if (filter.kind === "folder") list = list.filter(r => r.folder_id === filter.id);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r => r.name.toLowerCase().includes(q));
    }
    return list;
  }, [reports, filter, search]);

  // ----- Actions -----
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

  const handleDuplicate = async (r: SavedReport) => {
    if (!user) return;
    // Fetch full record (config columns)
    const { data: full } = await supabase
      .from("custom_reports")
      .select("*")
      .eq("id", r.id)
      .maybeSingle();
    if (!full) return;
    const { error } = await supabase.from("custom_reports").insert({
      user_id: dataOwnerId!,
      name: `${full.name} - نسخة`,
      description: full.description,
      data_source: full.data_source,
      columns: full.columns,
      filters: full.filters,
      group_by: full.group_by,
      sort_by: full.sort_by,
      chart_type: full.chart_type,
      folder_id: full.folder_id,
      icon: full.icon,
      color: full.color,
    });
    if (error) {
      toast({ title: "تعذّر النسخ", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "تم إنشاء نسخة ✅" });
    load();
  };

  const handleArchive = async (r: SavedReport) => {
    await supabase
      .from("custom_reports")
      .update({
        is_archived: !r.is_archived,
        archived_at: !r.is_archived ? new Date().toISOString() : null,
      })
      .eq("id", r.id);
    toast({ title: r.is_archived ? "تمت الاستعادة" : "تم الأرشفة" });
    load();
  };

  const handleMoveToFolder = async (id: string, folderId: string | null) => {
    await supabase.from("custom_reports").update({ folder_id: folderId }).eq("id", id);
    toast({ title: folderId ? "تم نقل التقرير" : "تم إخراج من المجلد" });
    load();
  };

  // ----- Header label for current view -----
  const headerLabel = useMemo(() => {
    if (filter.kind === "all") return "جميع التقارير";
    if (filter.kind === "favorites") return "المفضّلة";
    if (filter.kind === "archived") return "الأرشيف";
    if (filter.kind === "uncategorized") return "بدون تصنيف";
    return folders.find(f => f.id === filter.id)?.name || "مجلد";
  }, [filter, folders]);

  return (
    <div className="px-4 pt-6 pb-24" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted"
          >
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold text-foreground">تقاريري المخصصة</h1>
            </div>
            <p className="text-xs text-muted-foreground">
              {headerLabel} • {filtered.length} تقرير
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => navigate("/reports/builder")} className="gap-1.5 rounded-xl">
          <Plus className="h-4 w-4" /> تقرير جديد
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5">
        {/* Sidebar */}
        <Card className="p-3 h-fit lg:sticky lg:top-4">
          <FoldersSidebar selected={filter} onSelect={setFilter} counts={counts} />
        </Card>

        {/* Main */}
        <div className="space-y-4">
          {(reports.length > 0 || search) && (
            <Input
              placeholder="ابحث في التقارير..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="max-w-md"
            />
          )}

          {loading ? (
            <Card className="p-12 flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>
            </Card>
          ) : filtered.length === 0 ? (
            <Card className="p-12 text-center">
              <Sparkles className="h-12 w-12 text-primary/20 mx-auto mb-3" />
              <p className="text-sm font-medium mb-1">
                {search
                  ? "لا توجد تقارير مطابقة"
                  : filter.kind === "archived"
                    ? "لا توجد تقارير مؤرشفة"
                    : "لا توجد تقارير في هذا العرض"}
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                {filter.kind === "all" ? "ابدأ بإنشاء تقرير مخصص" : "جرّب فلتر آخر أو أنشئ تقريراً جديداً"}
              </p>
              {!search && filter.kind !== "archived" && (
                <Button size="sm" onClick={() => navigate("/reports/builder")} className="gap-1.5">
                  <Plus className="h-4 w-4" /> أنشئ تقريرك
                </Button>
              )}
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map(r => {
                const src = getDataSource(r.data_source);
                const Icon = src?.icon;
                const folder = folders.find(f => f.id === r.folder_id);
                return (
                  <Card
                    key={r.id}
                    className={`p-4 hover:shadow-md transition-all relative group ${r.is_archived ? "opacity-70" : ""}`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      {Icon && (
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: `${src!.color}15`, color: src!.color }}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-sm font-semibold truncate">{r.name}</h3>
                          <button onClick={() => toggleFav(r.id, r.is_favorite)} className="shrink-0">
                            <Star
                              className={`h-3.5 w-3.5 ${r.is_favorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
                            />
                          </button>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                          <span>
                            {src?.label} • استُخدم {r.use_count} مرة
                          </span>
                          {folder && (
                            <span
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-muted"
                              style={{ color: folder.color || undefined }}
                            >
                              <FolderIcon className="h-2.5 w-2.5" />
                              {folder.name}
                            </span>
                          )}
                          {r.is_archived && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700">
                              <Archive className="h-2.5 w-2.5" /> مؤرشف
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Per-card menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100">
                            <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => handleDuplicate(r)}>
                            <Copy className="h-3.5 w-3.5 me-2" /> إنشاء نسخة
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setVersionsForId(r.id)}>
                            <History className="h-3.5 w-3.5 me-2" /> سجل النسخ
                          </DropdownMenuItem>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <FolderIcon className="h-3.5 w-3.5 me-2" /> نقل إلى مجلد
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              <DropdownMenuLabel className="text-[10px]">المجلدات</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => handleMoveToFolder(r.id, null)}>
                                بدون تصنيف
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {folders.length === 0 ? (
                                <DropdownMenuItem disabled>لا توجد مجلدات بعد</DropdownMenuItem>
                              ) : (
                                folders.map(f => (
                                  <DropdownMenuItem
                                    key={f.id}
                                    onClick={() => handleMoveToFolder(r.id, f.id)}
                                  >
                                    <FolderIcon
                                      className="h-3 w-3 me-2"
                                      style={{ color: f.color || undefined }}
                                    />
                                    {f.name}
                                  </DropdownMenuItem>
                                ))
                              )}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleArchive(r)}>
                            {r.is_archived ? (
                              <>
                                <ArchiveRestore className="h-3.5 w-3.5 me-2" /> استعادة من الأرشيف
                              </>
                            ) : (
                              <>
                                <Archive className="h-3.5 w-3.5 me-2" /> أرشفة
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteId(r.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 me-2" /> حذف نهائي
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {r.description && (
                      <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                        {r.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
                      <p className="text-[10px] text-muted-foreground">
                        {r.last_used_at
                          ? `آخر استخدام: ${format(new Date(r.last_used_at), "yyyy-MM-dd")}`
                          : `أُنشئ: ${format(new Date(r.created_at), "yyyy-MM-dd")}`}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => navigate(`/reports/builder?load=${r.id}`)}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 gap-1 px-2.5 text-xs"
                          onClick={() => navigate(`/reports/builder?load=${r.id}`)}
                        >
                          <Play className="h-3 w-3" /> تشغيل
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف التقرير نهائياً</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد؟ سيُحذف التقرير وكافة نسخه المحفوظة. لا يمكن التراجع.
              <br />
              <span className="text-xs">يمكنك بدلاً من ذلك أرشفته للحفاظ عليه.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <VersionHistoryDialog
        open={!!versionsForId}
        reportId={versionsForId}
        onClose={() => setVersionsForId(null)}
        onRestored={load}
      />
    </div>
  );
}
