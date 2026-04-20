import { useState } from "react";
import { Folder, FolderPlus, Inbox, Star, Archive, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useReportFolders, ReportFolder } from "@/hooks/useReportFolders";
import { cn } from "@/lib/utils";

export type FolderFilter =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "archived" }
  | { kind: "uncategorized" }
  | { kind: "folder"; id: string };

interface Props {
  selected: FolderFilter;
  onSelect: (f: FolderFilter) => void;
  counts: {
    all: number;
    favorites: number;
    archived: number;
    uncategorized: number;
    byFolder: Record<string, number>;
  };
}

export default function FoldersSidebar({ selected, onSelect, counts }: Props) {
  const { folders, createFolder, renameFolder, deleteFolder } = useReportFolders();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<ReportFolder | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<ReportFolder | null>(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createFolder(newName);
    setNewName("");
    setCreating(false);
  };

  const handleRename = async () => {
    if (!renaming || !renameValue.trim()) return;
    await renameFolder(renaming.id, renameValue);
    setRenaming(null);
  };

  const isActive = (f: FolderFilter) => {
    if (selected.kind !== f.kind) return false;
    if (selected.kind === "folder" && f.kind === "folder") return selected.id === f.id;
    return true;
  };

  const Item = ({
    icon: Icon,
    label,
    count,
    filter,
    color,
  }: {
    icon: any;
    label: string;
    count: number;
    filter: FolderFilter;
    color?: string;
  }) => (
    <button
      onClick={() => onSelect(filter)}
      className={cn(
        "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors",
        isActive(filter)
          ? "bg-primary/10 text-primary font-semibold"
          : "hover:bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="flex items-center gap-2 min-w-0">
        <Icon className="h-3.5 w-3.5 shrink-0" style={color ? { color } : undefined} />
        <span className="truncate">{label}</span>
      </span>
      <span className="text-[10px] tabular-nums opacity-70">{count}</span>
    </button>
  );

  return (
    <div className="space-y-1">
      <Item icon={Inbox} label="جميع التقارير" count={counts.all} filter={{ kind: "all" }} />
      <Item icon={Star} label="المفضّلة" count={counts.favorites} filter={{ kind: "favorites" }} />
      <Item
        icon={Folder}
        label="بدون تصنيف"
        count={counts.uncategorized}
        filter={{ kind: "uncategorized" }}
      />

      <div className="flex items-center justify-between pt-2 px-2">
        <span className="text-[10px] font-semibold text-muted-foreground">المجلدات</span>
        <button
          onClick={() => setCreating(v => !v)}
          className="text-muted-foreground hover:text-primary"
          title="مجلد جديد"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>

      {creating && (
        <div className="flex items-center gap-1 px-1">
          <Input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="اسم المجلد"
            className="h-7 text-xs"
            onKeyDown={e => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setCreating(false); setNewName(""); }
            }}
          />
          <Button size="sm" className="h-7 px-2 text-xs" onClick={handleCreate}>إضافة</Button>
        </div>
      )}

      {folders.map(f => (
        <div key={f.id} className="flex items-center group">
          <button
            onClick={() => onSelect({ kind: "folder", id: f.id })}
            className={cn(
              "flex-1 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors",
              isActive({ kind: "folder", id: f.id })
                ? "bg-primary/10 text-primary font-semibold"
                : "hover:bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Folder className="h-3.5 w-3.5 shrink-0" style={{ color: f.color || undefined }} />
              <span className="truncate">{f.name}</span>
            </span>
            <span className="text-[10px] tabular-nums opacity-70">
              {counts.byFolder[f.id] || 0}
            </span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground">
                <MoreVertical className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem onClick={() => { setRenaming(f); setRenameValue(f.name); }}>
                <Pencil className="h-3 w-3 me-1.5" /> إعادة تسمية
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setDeleting(f)}
              >
                <Trash2 className="h-3 w-3 me-1.5" /> حذف
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}

      <div className="pt-2 mt-2 border-t border-border/40">
        <Item icon={Archive} label="الأرشيف" count={counts.archived} filter={{ kind: "archived" }} />
      </div>

      {/* Rename dialog */}
      <AlertDialog open={!!renaming} onOpenChange={o => !o && setRenaming(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إعادة تسمية المجلد</AlertDialogTitle>
          </AlertDialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleRename}>حفظ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={o => !o && setDeleting(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المجلد</AlertDialogTitle>
            <AlertDialogDescription>
              التقارير داخل هذا المجلد ستنتقل إلى "بدون تصنيف". لا يتم حذف التقارير.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleting) await deleteFolder(deleting.id);
                setDeleting(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
