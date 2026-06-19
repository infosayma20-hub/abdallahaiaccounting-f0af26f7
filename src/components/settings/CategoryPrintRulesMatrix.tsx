/**
 * CategoryPrintRulesMatrix — مصفوفة قواعد طباعة التصنيفات على محطات المطبخ
 *
 * - الصفوف: تصنيفات نقطة البيع (pos_categories)
 * - الأعمدة: محطات الطباعة الفعّالة (kitchen_stations) — مفلترة على الفرع المختار
 * - الخلية: ✓ = تطبع (افتراضي)  |  ✗ = مكتومة (لا تطبع تذكرة)
 *
 * وصل الزبون لا يتأثر إطلاقاً — هذا الكتم لتذاكر المحطات فقط.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Building2, Printer, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { invalidatePrintMuteRulesCache } from "@/hooks/usePrintMuteRules";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

interface Branch { id: string; name: string }
interface Category { id: string; name: string; color?: string }
interface Station { id: string; name: string; color?: string; branch_id: string | null }
interface Rule { id: string; branch_id: string | null; category_id: string; station_id: string }

const ALL_BRANCHES = "__all__";

export default function CategoryPrintRulesMatrix() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [branchId, setBranchId] = useState<string>(ALL_BRANCHES);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [b, c, s, r] = await Promise.all([
        supabase.from("branches").select("id, name").eq("is_active", true).order("name"),
        supabase.from("pos_categories").select("id, name, color").eq("is_active", true).order("display_order"),
        supabase.from("kitchen_stations").select("id, name, color, branch_id").eq("is_active", true).order("display_order"),
        supabase.from("pos_category_print_rules" as any).select("id, branch_id, category_id, station_id"),
      ]);
      setBranches((b.data as Branch[]) || []);
      setCategories((c.data as Category[]) || []);
      setStations((s.data as Station[]) || []);
      setRules(((r.data as unknown) as Rule[]) || []);
      setLoading(false);
    })();
  }, [user]);

  // Stations to show: when "all branches" → show ALL stations; else only stations of that branch + branchless ones
  const visibleStations = useMemo(() => {
    if (branchId === ALL_BRANCHES) return stations;
    return stations.filter((s) => s.branch_id === branchId || s.branch_id === null);
  }, [stations, branchId]);

  // Effective branch filter when scoping a rule: NULL means "all branches"
  const ruleBranchId: string | null = branchId === ALL_BRANCHES ? null : branchId;

  function isMuted(categoryId: string, stationId: string): boolean {
    return rules.some(
      (r) =>
        r.category_id === categoryId &&
        r.station_id === stationId &&
        (r.branch_id === ruleBranchId ||
          // When viewing a specific branch, an "all branches" rule (NULL) also mutes it
          (ruleBranchId !== null && r.branch_id === null)),
    );
  }

  async function toggle(categoryId: string, stationId: string) {
    if (!user) return;
    const key = `${categoryId}|${stationId}`;
    setSaving(key);
    try {
      // Look for a matching row at the CURRENT scope (specific branch or all-branches)
      const existing = rules.find(
        (r) =>
          r.category_id === categoryId &&
          r.station_id === stationId &&
          r.branch_id === ruleBranchId,
      );
      if (existing) {
        // Currently muted at this scope → unmute (delete the row)
        const { error } = await supabase
          .from("pos_category_print_rules" as any)
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
        setRules((prev) => prev.filter((r) => r.id !== existing.id));
        toast.success("تم تفعيل الطباعة");
      } else {
        // Not muted at this scope → insert mute row
        const { data, error } = await supabase
          .from("pos_category_print_rules" as any)
          .insert({
            user_id: dataOwnerId!,
            branch_id: ruleBranchId,
            category_id: categoryId,
            station_id: stationId,
          } as any)
          .select("id, branch_id, category_id, station_id")
          .single();
        if (error) throw error;
        setRules((prev) => [...prev, (data as unknown) as Rule]);
        toast.success("تم إيقاف الطباعة لهذا التصنيف على هذه المحطة");
      }
      invalidatePrintMuteRulesCache();
    } catch (e: any) {
      console.error(e);
      toast.error("فشل الحفظ: " + (e?.message || "خطأ"));
    } finally {
      setSaving(null);
    }
  }

  const branchOptionLabel =
    branchId === ALL_BRANCHES
      ? "كل الفروع"
      : branches.find((b) => b.id === branchId)?.name || "—";

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          <Printer className="h-4 w-4" />
          قواعد طباعة التصنيفات على المحطات
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          تحكم بأي تصنيف يطبع تذكرة على أي محطة في أي فرع. وصل الزبون يبقى يطبع دائماً — هذا التحكم لتذاكر المطبخ/السخان/البيتزا فقط.
        </p>
      </div>

      {/* Branch selector */}
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <Select value={branchId} onValueChange={setBranchId}>
          <SelectTrigger className="h-9 w-[220px]">
            <SelectValue placeholder="اختر الفرع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_BRANCHES}>كل الفروع (قاعدة عامة)</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          النطاق الحالي: <b className="text-foreground">{branchOptionLabel}</b>
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> جارٍ التحميل...
        </div>
      ) : categories.length === 0 || visibleStations.length === 0 ? (
        <div className="flex items-start gap-2 p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>
            {categories.length === 0
              ? "لا توجد تصنيفات نقطة بيع. أضف تصنيفات أولاً."
              : "لا توجد محطات طباعة فعّالة لهذا الفرع. أضف محطة من قسم محطات المطبخ."}
          </span>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-right p-3 font-semibold sticky right-0 bg-muted/50 z-10 min-w-[160px]">
                  التصنيف
                </th>
                {visibleStations.map((s) => (
                  <th key={s.id} className="p-3 font-semibold text-center min-w-[120px]">
                    <div className="flex flex-col items-center gap-1">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: s.color || "#64748b" }}
                      />
                      <span>{s.name}</span>
                      {s.branch_id === null && (
                        <span className="text-[10px] text-muted-foreground">(كل الفروع)</span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((c, idx) => (
                <tr key={c.id} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                  <td className="p-3 sticky right-0 bg-inherit z-10 font-medium">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: c.color || "#64748b" }}
                      />
                      {c.name}
                    </div>
                  </td>
                  {visibleStations.map((s) => {
                    const muted = isMuted(c.id, s.id);
                    const key = `${c.id}|${s.id}`;
                    const isSaving = saving === key;
                    // When viewing a specific branch and the rule comes from
                    // a global (NULL) override, lock the toggle and hint why.
                    const globalLock =
                      ruleBranchId !== null &&
                      muted &&
                      !rules.some(
                        (r) =>
                          r.category_id === c.id &&
                          r.station_id === s.id &&
                          r.branch_id === ruleBranchId,
                      );
                    return (
                      <td key={s.id} className="p-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Switch
                            checked={!muted}
                            disabled={isSaving || globalLock}
                            onCheckedChange={() => toggle(c.id, s.id)}
                          />
                          {globalLock && (
                            <span className="text-[10px] text-amber-600">
                              مكتوم من "كل الفروع"
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-muted-foreground space-y-1">
        <p>• <b>مُفعّل</b> = الصنف يطبع تذكرة على هذه المحطة (الوضع الافتراضي).</p>
        <p>• <b>مطفأ</b> = الصنف لا يطبع تذكرة على هذه المحطة، ويبقى يطبع على وصل الزبون.</p>
        <p>• قاعدة "كل الفروع" تكتم على جميع الفروع — وتظهر مقفلة عند تصفح فرع محدد.</p>
      </div>
    </div>
  );
}