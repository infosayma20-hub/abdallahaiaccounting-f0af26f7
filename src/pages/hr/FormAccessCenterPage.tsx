import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ClipboardList, Search, Loader2, Lock, UserCircle2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useFormAccessManager } from "@/hooks/hr/useFormAccessManager";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

type EmployeeOption = {
  id: string;
  full_name: string;
  job_title: string | null;
  branch_name: string | null;
};

const sourceLabel = (s: string | null) => {
  if (s === "job_title") return { text: "منصب", color: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" };
  if (s === "manual") return { text: "يدوي", color: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300" };
  if (s === "both") return { text: "كلاهما", color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" };
  return null;
};

export default function FormAccessCenterPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [results, setResults] = useState<EmployeeOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<EmployeeOption | null>(null);
  const { rows, loading, saving, setAccess } = useFormAccessManager(selected?.id ?? null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!debouncedSearch || debouncedSearch.trim().length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const q = `%${debouncedSearch.trim()}%`;
        const { data } = await (supabase as any)
          .from("employees")
          .select("id, full_name, job_title, branch_id")
          .or(`full_name.ilike.${q},job_title.ilike.${q}`)
          .eq("status", "active")
          .eq("is_deleted", false)
          .limit(20);
        if (cancelled) return;
        const list = (data || []) as any[];
        const branchIds = Array.from(new Set(list.map((e) => e.branch_id).filter(Boolean)));
        let branchMap = new Map<string, string>();
        if (branchIds.length) {
          const { data: brs } = await (supabase as any)
            .from("branches_safe")
            .select("id, name")
            .in("id", branchIds);
          (brs || []).forEach((b: any) => branchMap.set(b.id, b.name));
        }
        setResults(
          list.map((e) => ({
            id: e.id,
            full_name: e.full_name,
            job_title: e.job_title,
            branch_name: e.branch_id ? branchMap.get(e.branch_id) ?? null : null,
          })),
        );
      } finally {
        if (!cancelled) setSearching(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [debouncedSearch]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof rows>();
    rows.forEach((r) => {
      const key = r.template_category || "general";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries());
  }, [rows]);

  return (
    <TooltipProvider delayDuration={150}>
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <ClipboardList className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">إسناد النماذج والصلاحيات</h1>
          <p className="text-sm text-muted-foreground">حدّد لكل موظف ما يستطيع تعبئته وما يستطيع الاطلاع عليه فقط.</p>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <label className="text-xs text-muted-foreground mb-2 block">ابحث عن موظف بالاسم أو المسمى الوظيفي</label>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="مثال: علاء، مدير الفرع، كاشير..."
              className="pr-10"
              autoFocus
            />
          </div>
          {searching && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
              <Loader2 className="h-3 w-3 animate-spin" /> جاري البحث...
            </div>
          )}
          {!searching && results.length > 0 && (
            <div className="mt-3 border rounded-lg divide-y max-h-72 overflow-y-auto">
              {results.map((e) => (
                <button
                  key={e.id}
                  onClick={() => {
                    setSelected(e);
                    setSearch("");
                    setResults([]);
                  }}
                  className="w-full text-right p-3 hover:bg-muted/50 transition flex items-center gap-3"
                >
                  <UserCircle2 className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{e.full_name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {e.job_title || "—"}{e.branch_name ? ` • ${e.branch_name}` : ""}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected employee header */}
      {selected && (
        <Card className="border-primary/40">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <UserCircle2 className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <div className="font-bold">{selected.full_name}</div>
              <div className="text-xs text-muted-foreground">
                {selected.job_title || "بلا منصب"}
                {selected.branch_name ? ` • ${selected.branch_name}` : ""}
              </div>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {rows.length} قالب
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Access table */}
      {selected && (
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin ml-2" /> جاري التحميل...
              </div>
            ) : rows.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
                لا توجد قوالب نماذج متاحة بعد.
              </div>
            ) : (
              <div className="divide-y">
                {grouped.map(([cat, list]) => (
                  <div key={cat}>
                    <div className="bg-muted/30 px-4 py-2 text-xs font-semibold text-muted-foreground sticky top-0">
                      {categoryLabel(cat)}
                    </div>
                    <div className="divide-y">
                      {list.map((r) => {
                        const fillFromTitle = r.fill_source === "job_title" || r.fill_source === "both";
                        const viewFromTitle = r.view_source === "job_title" || r.view_source === "both";
                        return (
                          <div key={r.template_id} className="grid grid-cols-[1fr,90px,90px,80px] gap-2 items-center px-4 py-3 hover:bg-muted/20">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate flex items-center gap-2">
                                {r.template_name}
                                {r.is_system && (
                                  <Badge variant="secondary" className="text-[9px] h-4 px-1">نظام</Badge>
                                )}
                              </div>
                              {r.template_description && (
                                <div className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                                  {r.template_description}
                                </div>
                              )}
                            </div>
                            <AccessCell
                              checked={r.can_fill}
                              locked={fillFromTitle}
                              disabled={saving}
                              label="يعبّي"
                              onChange={(v) => setAccess(r.template_id, "fill", v)}
                            />
                            <AccessCell
                              checked={r.can_view}
                              locked={viewFromTitle || r.can_fill}
                              disabled={saving}
                              label="يطّلع"
                              onChange={(v) => setAccess(r.template_id, "view", v)}
                            />
                            <div className="text-[10px] text-center">
                              {(() => {
                                const s = sourceLabel(r.fill_source) || sourceLabel(r.view_source);
                                return s ? (
                                  <span className={`rounded-full px-1.5 py-0.5 ${s.color}`}>{s.text}</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!selected && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          ابحث عن موظف لتبدأ تحديد صلاحياته على النماذج.
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}

function AccessCell({
  checked, locked, disabled, label, onChange,
}: { checked: boolean; locked: boolean; disabled: boolean; label: string; onChange: (v: boolean) => void }) {
  const cell = (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative">
        <Checkbox
          checked={checked}
          disabled={locked || disabled}
          onCheckedChange={(v) => onChange(!!v)}
        />
        {locked && (
          <Lock className="h-2.5 w-2.5 absolute -top-1 -right-1 text-muted-foreground" />
        )}
      </div>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
  if (!locked) return cell;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{cell}</TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        موروثة من المسمى الوظيفي — لا يمكن إلغاؤها يدوياً
      </TooltipContent>
    </Tooltip>
  );
}

function categoryLabel(c: string) {
  return {
    marketing: "تسويق",
    operations: "تشغيلي",
    hr: "موارد بشرية",
    quality: "جودة",
    finance: "مالي",
    general: "عام",
  }[c] || c;
}