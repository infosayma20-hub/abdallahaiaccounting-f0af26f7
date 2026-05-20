import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, RotateCcw, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getAppSections } from "@/config/navigationConfig";
import { APPS_VISUAL_META, SECTION_LABELS, type AppSection } from "@/pages/Apps/data/appsRegistry";

export type AccessState = "inherit" | "allow" | "deny";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targetUserId: string;
  targetName?: string;
}

interface AppRow {
  id: string;
  label: string;
  section: AppSection;
}

const STATE_LABEL: Record<AccessState, string> = {
  inherit: "حسب الدور",
  allow: "مسموح",
  deny: "ممنوع",
};

const STATE_CLASS: Record<AccessState, string> = {
  inherit: "bg-muted text-muted-foreground hover:bg-muted/80",
  allow: "bg-emerald-600 text-white hover:bg-emerald-700",
  deny: "bg-red-600 text-white hover:bg-red-700",
};

export default function UserAppAccessDialog({ open, onOpenChange, targetUserId, targetName }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [state, setState] = useState<Record<string, AccessState>>({});
  const [initial, setInitial] = useState<Record<string, AccessState>>({});

  // Build app rows from navigationConfig + appsRegistry (skip 'apps' launcher entry itself)
  const apps: AppRow[] = useMemo(() => {
    const sections = getAppSections();
    const navItems = sections.flatMap(s => s.items);
    const rows: AppRow[] = [];
    const seen = new Set<string>();
    for (const item of navItems) {
      if (item.id === "apps" || seen.has(item.id)) continue;
      const meta = APPS_VISUAL_META.find(m => m.id === item.id);
      rows.push({ id: item.id, label: item.label, section: meta?.section || "operations" });
      seen.add(item.id);
    }
    return rows;
  }, []);

  useEffect(() => {
    if (!open || !targetUserId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.functions.invoke("manage-user-app-access", {
        body: { action: "list", target_user_id: targetUserId },
      });
      if (cancelled) return;
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error || error?.message || "تعذر تحميل الصلاحيات");
        setLoading(false);
        return;
      }
      const map: Record<string, AccessState> = {};
      for (const app of apps) map[app.id] = "inherit";
      for (const row of (data as any).overrides as { app_key: string; access_state: AccessState }[]) {
        map[row.app_key] = row.access_state;
      }
      setState(map);
      setInitial(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, targetUserId, apps]);

  const counts = useMemo(() => {
    let allow = 0, deny = 0;
    for (const k of Object.keys(state)) {
      if (state[k] === "allow") allow++;
      else if (state[k] === "deny") deny++;
    }
    return { allow, deny };
  }, [state]);

  const filteredBySection = useMemo(() => {
    const q = search.trim().toLowerCase();
    const grouped: Record<AppSection, AppRow[]> = { core: [], operations: [], premium: [] };
    for (const app of apps) {
      if (q && !app.label.toLowerCase().includes(q) && !app.id.includes(q)) continue;
      grouped[app.section].push(app);
    }
    return grouped;
  }, [apps, search]);

  const resetAll = () => {
    const next: Record<string, AccessState> = {};
    for (const a of apps) next[a.id] = "inherit";
    setState(next);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const changes = Object.keys(state).filter(k => state[k] !== (initial[k] ?? "inherit"));
      if (changes.length === 0) {
        toast.info("لا توجد تغييرات");
        setSaving(false);
        return;
      }
      for (const appKey of changes) {
        const { data, error } = await supabase.functions.invoke("manage-user-app-access", {
          body: {
            action: "upsert",
            target_user_id: targetUserId,
            app_key: appKey,
            access_state: state[appKey],
          },
        });
        if (error || (data as any)?.error) {
          throw new Error((data as any)?.error || error?.message || "فشل الحفظ");
        }
      }
      toast.success(`تم حفظ ${changes.length} تطبيق`);
      setInitial({ ...state });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span>إدارة صلاحيات التطبيقات{targetName ? ` — ${targetName}` : ""}</span>
            <div className="flex gap-2 text-xs font-normal">
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">مسموح: {counts.allow}</Badge>
              <Badge className="bg-red-100 text-red-700 border-red-300">ممنوع: {counts.deny}</Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث عن تطبيق..."
              className="pr-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={resetAll} disabled={loading || saving}>
            <RotateCcw className="h-4 w-4 ms-1" />
            استعادة الكل حسب الدور
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            (Object.keys(filteredBySection) as AppSection[]).map(sec => {
              const rows = filteredBySection[sec];
              if (rows.length === 0) return null;
              return (
                <div key={sec}>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 px-1">
                    {SECTION_LABELS[sec]?.title || sec}
                  </h4>
                  <div className="space-y-1">
                    {rows.map(app => (
                      <div key={app.id} className="flex items-center justify-between gap-3 p-2 rounded border bg-card">
                        <span className="text-sm font-medium">{app.label}</span>
                        <div className="inline-flex gap-1">
                          {(["inherit", "allow", "deny"] as AccessState[]).map(s => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setState(p => ({ ...p, [app.id]: s }))}
                              className={`px-3 py-1 rounded text-xs font-medium transition ${
                                state[app.id] === s ? STATE_CLASS[s] : "bg-background border text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              {STATE_LABEL[s]}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : <Save className="h-4 w-4 ms-1" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}