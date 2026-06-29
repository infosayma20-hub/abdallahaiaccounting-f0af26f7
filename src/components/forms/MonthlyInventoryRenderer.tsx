import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, Send, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * Monthly Inventory Renderer
 * --------------------------
 * Custom renderer used when a form_template has schema.kind === "monthly_inventory".
 * - Manager picks branch (auto-detected when possible) + month (YYYY-MM).
 * - Catalog items + units are loaded from `inventory_catalog_items` per branch.
 * - Manager fills quantity per item. No prices, no totals in currency — only
 *   quantity totals per category.
 *
 * Output shape stored in employee_forms.form_data:
 * {
 *   branch_key, branch_name, month,
 *   quantities: { [itemId]: number },
 *   lines: [{ category, item, unit, qty }],
 *   summary: { totalQty, totalFilled, byCategory: [{category, qty, filled}] }
 * }
 */

const BRANCH_OPTIONS: { key: string; label: string; match: string[] }[] = [
  { key: "sufyan",   label: "سفيان",    match: ["سفيان"] },
  { key: "faisal",   label: "فيصل",     match: ["فيصل"] },
  { key: "ramallah", label: "رام الله", match: ["رام الله", "الطيرة", "بلازا"] },
  { key: "central",  label: "المركزي",  match: ["مركزي", "المركزي"] },
  { key: "taawon",   label: "تعاون",    match: ["تعاون", "التعاون"] },
];

function inferBranchKey(branchName?: string | null): string | null {
  if (!branchName) return null;
  const n = String(branchName);
  for (const b of BRANCH_OPTIONS) {
    if (b.match.some((m) => n.includes(m))) return b.key;
  }
  return null;
}

type CatalogItem = {
  id: string;
  branch_key: string;
  category: string;
  item_name: string;
  unit: string;
  sort_order: number;
};

interface Props {
  employeeId: string;
  initialData?: Record<string, any>;
  submitting?: boolean;
  onSubmit?: (data: Record<string, any>) => void;
  onSaveDraft?: (data: Record<string, any>) => void;
  readOnly?: boolean;
}

function currentMonthValue(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}`;
}

export default function MonthlyInventoryRenderer({
  employeeId,
  initialData,
  submitting,
  onSubmit,
  onSaveDraft,
  readOnly,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [autoBranchKey, setAutoBranchKey] = useState<string | null>(null);
  const [branchKey, setBranchKey] = useState<string>(initialData?.branch_key || "");
  const [month, setMonth] = useState<string>(initialData?.month || currentMonthValue());
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>(() => {
    const q = initialData?.quantities || {};
    const out: Record<string, string> = {};
    Object.keys(q).forEach((k) => { out[k] = String(q[k] ?? ""); });
    return out;
  });

  // Auto-detect manager's branch from their employee record.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: emp } = await supabase
          .from("employees")
          .select("branch_id, branches(name)")
          .eq("id", employeeId)
          .maybeSingle();
        const name = (emp as any)?.branches?.name as string | undefined;
        const inferred = inferBranchKey(name);
        if (alive) {
          setAutoBranchKey(inferred);
          if (!branchKey && inferred) setBranchKey(inferred);
        }
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  // Load catalog when branch changes.
  useEffect(() => {
    let alive = true;
    if (!branchKey) { setCatalog([]); setLoading(false); return; }
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("inventory_catalog_items")
        .select("id, branch_key, category, item_name, unit, sort_order")
        .eq("branch_key", branchKey)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (!alive) return;
      if (error) {
        toast({ title: "تعذر تحميل كتالوج الأصناف", description: error.message, variant: "destructive" });
        setCatalog([]);
      } else {
        setCatalog((data || []) as CatalogItem[]);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [branchKey]);

  const grouped = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    catalog.forEach((it) => {
      const arr = map.get(it.category) || [];
      arr.push(it);
      map.set(it.category, arr);
    });
    return Array.from(map.entries()); // preserves catalog order
  }, [catalog]);

  const summaryByCategory = useMemo(() => {
    return grouped.map(([cat, items]) => {
      let qty = 0, filled = 0;
      items.forEach((it) => {
        const n = Number(quantities[it.id]);
        if (Number.isFinite(n) && n > 0) { qty += n; filled += 1; }
      });
      return { category: cat, qty, filled, total: items.length };
    });
  }, [grouped, quantities]);

  const totals = useMemo(() => {
    let qty = 0, filled = 0, total = 0;
    summaryByCategory.forEach((s) => { qty += s.qty; filled += s.filled; total += s.total; });
    return { qty, filled, total };
  }, [summaryByCategory]);

  const buildPayload = () => {
    const selectedBranch = BRANCH_OPTIONS.find((b) => b.key === branchKey);
    const lines = catalog
      .map((it) => {
        const n = Number(quantities[it.id]);
        return Number.isFinite(n) && n > 0
          ? { category: it.category, item: it.item_name, unit: it.unit, qty: n }
          : null;
      })
      .filter(Boolean);
    const cleanQ: Record<string, number> = {};
    Object.keys(quantities).forEach((k) => {
      const n = Number(quantities[k]);
      if (Number.isFinite(n) && n > 0) cleanQ[k] = n;
    });
    return {
      kind: "monthly_inventory",
      branch_key: branchKey,
      branch_name: selectedBranch?.label || branchKey,
      month,
      quantities: cleanQ,
      lines,
      summary: { ...totals, byCategory: summaryByCategory },
    };
  };

  const handleSubmit = () => {
    if (!branchKey) { toast({ title: "اختر الفرع أولاً", variant: "destructive" }); return; }
    if (!month) { toast({ title: "اختر الشهر أولاً", variant: "destructive" }); return; }
    onSubmit?.(buildPayload());
  };
  const handleSaveDraft = () => {
    if (!branchKey || !month) {
      toast({ title: "اختر الفرع والشهر قبل الحفظ", variant: "destructive" });
      return;
    }
    onSaveDraft?.(buildPayload());
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header: branch + month */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">الفرع</Label>
              <Select
                value={branchKey}
                onValueChange={(v) => setBranchKey(v)}
                disabled={readOnly || (!!autoBranchKey && !!initialData?.branch_key === false && false)}
              >
                <SelectTrigger className="text-right">
                  <SelectValue placeholder="اختر الفرع" />
                </SelectTrigger>
                <SelectContent>
                  {BRANCH_OPTIONS.map((b) => (
                    <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {autoBranchKey && autoBranchKey === branchKey && (
                <p className="text-[10px] text-muted-foreground">تم اكتشاف الفرع تلقائياً من سجلك.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الشهر</Label>
              <Input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                disabled={readOnly}
                className="text-right"
              />
            </div>
          </div>
          {branchKey && !loading && catalog.length === 0 && (
            <p className="text-xs text-amber-600">لا توجد أصناف معرّفة لهذا الفرع في الكتالوج.</p>
          )}
        </CardContent>
      </Card>

      {/* Summary chip */}
      {!loading && catalog.length > 0 && (
        <div className="flex items-center gap-3 text-xs px-1">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary">
            <Package className="h-3.5 w-3.5" />
            مجموع الكميات: <b>{totals.qty}</b>
          </span>
          <span className="text-muted-foreground">
            أصناف معبّأة: {totals.filled} / {totals.total}
          </span>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && grouped.length > 0 && (
        <Accordion type="multiple" defaultValue={grouped.map(([c]) => c)} className="space-y-2">
          {grouped.map(([category, items]) => {
            const s = summaryByCategory.find((x) => x.category === category);
            return (
              <AccordionItem key={category} value={category} className="border rounded-lg bg-card">
                <AccordionTrigger className="px-3 py-2 hover:no-underline">
                  <div className="flex items-center justify-between w-full pl-2">
                    <span className="font-semibold text-sm">{category}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {s?.filled || 0}/{items.length} · مجموع الكمية {s?.qty || 0}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-2 pb-3">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground">
                        <tr className="border-b">
                          <th className="text-right p-2 font-medium">الصنف</th>
                          <th className="text-right p-2 font-medium w-[35%]">الوحدة</th>
                          <th className="text-right p-2 font-medium w-[110px]">الكمية</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it) => (
                          <tr key={it.id} className="border-b last:border-0">
                            <td className="p-2 align-middle">{it.item_name}</td>
                            <td className="p-2 align-middle text-muted-foreground">{it.unit}</td>
                            <td className="p-1.5">
                              <Input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="any"
                                value={quantities[it.id] ?? ""}
                                onChange={(e) =>
                                  setQuantities((q) => ({ ...q, [it.id]: e.target.value }))
                                }
                                disabled={readOnly}
                                className="h-8 text-right"
                                placeholder="0"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {!readOnly && (
        <div className="sticky bottom-0 -mx-2 sm:mx-0 px-2 sm:px-0 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-background via-background to-transparent">
          <div className="flex gap-2">
            {onSaveDraft && (
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveDraft}
                disabled={submitting}
                className="flex-1 gap-2"
              >
                <Save className="h-4 w-4" /> حفظ مسودة
              </Button>
            )}
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !branchKey || !month}
              className="flex-1 gap-2"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              حفظ النموذج
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}