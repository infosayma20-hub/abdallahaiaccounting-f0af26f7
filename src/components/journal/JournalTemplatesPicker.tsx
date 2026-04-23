import { useMemo, useState } from "react";
import { Bookmark, Pin, Trash2, Search, Plus, Save, X, Loader2, BookOpen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { multiWordMatchAny } from "@/lib/utils";
import useJournalTemplates, {
  JournalTemplate,
  JournalTemplateLine,
  SaveTemplateInput,
} from "@/hooks/useJournalTemplates";

interface JournalTemplatesPickerProps {
  open: boolean;
  onClose: () => void;
  /** Called when user picks a template to apply to the form. */
  onApply: (tpl: JournalTemplate) => void;
  /** Optional: snapshot of current entry to enable "Save current as template" */
  currentSnapshot?: SaveTemplateInput | null;
}

/**
 * Unified picker dialog for Journal Templates.
 * - Search + filter
 * - Pin / unpin (pinned first)
 * - Apply (increments usage_count)
 * - Save current entry as a new template
 * - Delete
 */
export default function JournalTemplatesPicker({
  open,
  onClose,
  onApply,
  currentSnapshot,
}: JournalTemplatesPickerProps) {
  const { templates, loading, saveTemplate, deleteTemplate, togglePin, markUsed } =
    useJournalTemplates();

  const [search, setSearch] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("📋");
  const [newDesc, setNewDesc] = useState("");
  const [savingNew, setSavingNew] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return templates;
    return templates.filter((t) =>
      multiWordMatchAny(search, t.name, t.description || "", t.icon || "")
    );
  }, [search, templates]);

  const handleApply = async (tpl: JournalTemplate) => {
    onApply(tpl);
    markUsed(tpl.id);
    onClose();
  };

  const handleSaveNew = async () => {
    if (!currentSnapshot) return;
    setSavingNew(true);
    const saved = await saveTemplate({
      ...currentSnapshot,
      name: newName.trim() || currentSnapshot.name,
      icon: newIcon || "📋",
      description: newDesc.trim() || currentSnapshot.description,
    });
    setSavingNew(false);
    if (saved) {
      setShowSaveForm(false);
      setNewName("");
      setNewIcon("📋");
      setNewDesc("");
    }
  };

  const totalDebit = (lines: JournalTemplateLine[]) =>
    lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl rounded-2xl p-0 overflow-hidden" dir="rtl">
        <DialogHeader className="p-4 pb-3 border-b border-border bg-primary/5">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-primary" />
            مكتبة قوالب القيود
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            اختر قالباً جاهزاً لتطبيقه فوراً، أو احفظ القيد الحالي كقالب جديد لاستخدامه لاحقاً.
          </DialogDescription>
        </DialogHeader>

        {/* Search + Save current */}
        <div className="p-3 border-b border-border bg-background flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث في القوالب..."
              className="pr-9 h-9 text-sm"
            />
          </div>
          {currentSnapshot && (
            <Button
              size="sm"
              variant={showSaveForm ? "secondary" : "default"}
              onClick={() => setShowSaveForm((s) => !s)}
              className="h-9 gap-1.5 text-xs shrink-0"
            >
              {showSaveForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {showSaveForm ? "إلغاء" : "حفظ القيد كقالب"}
            </Button>
          )}
        </div>

        {/* Save new template form */}
        {showSaveForm && currentSnapshot && (
          <div className="p-3 border-b border-border bg-primary/5 space-y-2">
            <div className="grid grid-cols-[60px_1fr] gap-2">
              <Input
                value={newIcon}
                onChange={(e) => setNewIcon(e.target.value.slice(0, 2))}
                placeholder="📋"
                className="h-9 text-base text-center"
              />
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="اسم القالب (مثال: راتب شهري، إيجار محل)"
                className="h-9 text-sm"
                autoFocus
              />
            </div>
            <Input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="وصف اختياري للقالب"
              className="h-9 text-sm"
            />
            <div className="text-[11px] text-muted-foreground bg-background/60 rounded-lg p-2 border border-border/40">
              📝 سيتم حفظ {currentSnapshot.lines.length} سطر من القيد الحالي + النوع ({currentSnapshot.default_subtype || "normal"}).
            </div>
            <Button
              onClick={handleSaveNew}
              disabled={savingNew || !newName.trim()}
              className="w-full h-9 text-xs gap-1.5"
            >
              {savingNew ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              حفظ القالب
            </Button>
          </div>
        )}

        {/* Templates list */}
        <div className="max-h-[55vh] overflow-y-auto p-3 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-xs gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              جارٍ التحميل...
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-10 px-4 text-muted-foreground space-y-2">
              <BookOpen className="h-10 w-10 mx-auto opacity-30" />
              <p className="text-sm font-medium">
                {search ? "لا توجد قوالب مطابقة" : "لا توجد قوالب محفوظة بعد"}
              </p>
              <p className="text-xs">
                {currentSnapshot
                  ? "اضغط «حفظ القيد كقالب» لإنشاء أول قالب لك."
                  : "افتح سند قيد جديد ثم احفظه كقالب."}
              </p>
            </div>
          )}

          {!loading &&
            filtered.map((tpl) => {
              const debitTotal = totalDebit(tpl.lines);
              return (
                <div
                  key={tpl.id}
                  className={`group rounded-xl border ${
                    tpl.is_pinned ? "border-primary/40 bg-primary/5" : "border-border bg-background"
                  } p-3 hover:border-primary/60 transition-colors`}
                >
                  <div className="flex items-start gap-3">
                    {/* Apply (icon + name area, big tap target) */}
                    <button
                      onClick={() => handleApply(tpl)}
                      className="flex-1 text-right space-y-1 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xl leading-none">{tpl.icon || "📋"}</span>
                        <span className="font-bold text-sm text-foreground">{tpl.name}</span>
                        {tpl.is_pinned && (
                          <span className="text-[10px] bg-primary/15 text-primary rounded-full px-2 py-0.5 font-semibold">
                            مثبّت
                          </span>
                        )}
                        {tpl.usage_count > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            استُخدم {tpl.usage_count}×
                          </span>
                        )}
                      </div>
                      {tpl.description && (
                        <p className="text-[11px] text-muted-foreground line-clamp-1">{tpl.description}</p>
                      )}
                      <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                        {tpl.lines.slice(0, 4).map((l, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-mono"
                          >
                            {l.account_code || "—"} {l.account_name || ""}
                          </span>
                        ))}
                        {tpl.lines.length > 4 && (
                          <span className="text-muted-foreground">+{tpl.lines.length - 4}</span>
                        )}
                        {debitTotal > 0 && (
                          <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                            ₪{debitTotal.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Actions */}
                    <div className="flex flex-col gap-1 opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => togglePin(tpl.id, !tpl.is_pinned)}
                        className={`h-7 w-7 rounded-lg flex items-center justify-center hover:bg-primary/15 ${
                          tpl.is_pinned ? "text-primary" : "text-muted-foreground"
                        }`}
                        title={tpl.is_pinned ? "إلغاء التثبيت" : "تثبيت"}
                      >
                        <Pin className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`حذف القالب "${tpl.name}"؟`)) deleteTemplate(tpl.id);
                        }}
                        className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-destructive/15 text-muted-foreground hover:text-destructive"
                        title="حذف"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
