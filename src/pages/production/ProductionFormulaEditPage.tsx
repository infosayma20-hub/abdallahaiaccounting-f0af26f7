import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Save, X, Plus, Trash2, ArrowRight, Calculator, Factory,
  Package, Boxes, Layers, StickyNote, Loader2, CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Product { id: string; name: string; sku?: string | null; buy_price?: number | null; standard_cost?: number | null; average_cost?: number | null; }
interface FormulaItem { id?: string; product_id: string; quantity: number; scrap_pct: number; sequence: number; }
interface Byproduct { id?: string; product_id: string; quantity: number; unit_value: number; notes?: string; }

interface FormulaState {
  id: string;
  name: string;
  code: string;
  output_product_id: string;
  output_quantity: number;
  notes: string;
  is_active: boolean;
  version: number;
  status: string;
  expected_yield_pct: number;
  labor_cost_per_batch: number;
  overhead_cost_per_batch: number;
  overhead_rate_pct: number;
  effective_from: string | null;
  effective_to: string | null;
  items: FormulaItem[];
  byproducts: Byproduct[];
}

const EMPTY: FormulaState = {
  id: "", name: "", code: "", output_product_id: "", output_quantity: 1, notes: "",
  is_active: true, version: 1, status: "active",
  expected_yield_pct: 100, labor_cost_per_batch: 0, overhead_cost_per_batch: 0, overhead_rate_pct: 0,
  effective_from: null, effective_to: null, items: [], byproducts: [],
};

export default function ProductionFormulaEditPage() {
  const { id } = useParams<{ id: string }>();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const isNew = !id || id === "new";

  const [state, setState] = useState<FormulaState>(EMPTY);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [costPreview, setCostPreview] = useState<number | null>(null);

  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);

  useEffect(() => {
    (async () => {
      const { data: pData } = await supabase.from("products").select("id,name,sku,buy_price,standard_cost,average_cost").limit(2000);
      setProducts((pData ?? []) as Product[]);
      if (!isNew && id) {
        const [{ data: f }, { data: items }, { data: bps }] = await Promise.all([
          supabase.from("production_formulas" as any).select("*").eq("id", id).maybeSingle(),
          supabase.from("production_formula_items" as any).select("*").eq("formula_id", id).order("sequence"),
          supabase.from("production_formula_byproducts" as any).select("*").eq("formula_id", id),
        ]);
        if (f) {
          const ff = f as any;
          setState({
            id: ff.id, name: ff.name ?? "", code: ff.code ?? "",
            output_product_id: ff.output_product_id, output_quantity: Number(ff.output_quantity ?? 1),
            notes: ff.notes ?? "", is_active: ff.is_active ?? true,
            version: Number(ff.version ?? 1), status: ff.status ?? "active",
            expected_yield_pct: Number(ff.expected_yield_pct ?? 100),
            labor_cost_per_batch: Number(ff.labor_cost_per_batch ?? 0),
            overhead_cost_per_batch: Number(ff.overhead_cost_per_batch ?? 0),
            overhead_rate_pct: Number(ff.overhead_rate_pct ?? 0),
            effective_from: ff.effective_from ?? null, effective_to: ff.effective_to ?? null,
            items: ((items ?? []) as any[]).map((it, idx) => ({
              id: it.id, product_id: it.product_id,
              quantity: Number(it.quantity), scrap_pct: Number(it.scrap_pct ?? 0),
              sequence: Number(it.sequence ?? idx + 1),
            })),
            byproducts: ((bps ?? []) as any[]).map(b => ({
              id: b.id, product_id: b.product_id,
              quantity: Number(b.quantity), unit_value: Number(b.unit_value ?? 0),
              notes: b.notes ?? "",
            })),
          });
        }
        setLoading(false);
      } else {
        const preOut = sp.get("output_product_id");
        if (preOut) setState(s => ({ ...s, output_product_id: preOut }));
      }
    })();
  }, [id, isNew]);

  const patch = (u: Partial<FormulaState>) => { setState(s => ({ ...s, ...u })); setDirty(true); };

  // Live estimated material cost (client side, before save)
  const estimatedMaterialCost = useMemo(() => {
    return state.items.reduce((sum, i) => {
      const p = productMap[i.product_id];
      const unit = Number(p?.standard_cost ?? p?.average_cost ?? p?.buy_price ?? 0);
      return sum + i.quantity * (1 + i.scrap_pct / 100) * unit;
    }, 0);
  }, [state.items, productMap]);
  const estimatedTotalCost = estimatedMaterialCost + state.labor_cost_per_batch
    + state.overhead_cost_per_batch + (estimatedMaterialCost * state.overhead_rate_pct / 100);

  const validate = () => {
    if (!state.name.trim()) return "أدخل اسم المعادلة";
    if (!state.output_product_id) return "اختر المنتج النهائي";
    if (!(state.output_quantity > 0)) return "كمية الإخراج يجب أن تكون أكبر من صفر";
    if (state.items.length === 0) return "أضف مادة خام واحدة على الأقل";
    if (state.items.some(i => !i.product_id || !(i.quantity > 0))) return "تحقق من مكونات المعادلة (منتج + كمية)";
    if (state.byproducts.some(b => !b.product_id || !(b.quantity > 0))) return "تحقق من المنتجات الثانوية";
    return null;
  };

  const save = async (closeAfter: boolean) => {
    if (!user) return;
    const err = validate();
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        name: state.name.trim(),
        code: state.code || null,
        output_product_id: state.output_product_id,
        output_quantity: Number(state.output_quantity) || 1,
        notes: state.notes || null,
        is_active: state.is_active,
        status: state.status,
        expected_yield_pct: Number(state.expected_yield_pct),
        labor_cost_per_batch: Number(state.labor_cost_per_batch),
        overhead_cost_per_batch: Number(state.overhead_cost_per_batch),
        overhead_rate_pct: Number(state.overhead_rate_pct),
        effective_from: state.effective_from || null,
        effective_to: state.effective_to || null,
      };
      let formulaId = state.id;
      if (formulaId) {
        const { error } = await supabase.from("production_formulas" as any).update(payload).eq("id", formulaId);
        if (error) throw error;
        await supabase.from("production_formula_items" as any).delete().eq("formula_id", formulaId);
        await supabase.from("production_formula_byproducts" as any).delete().eq("formula_id", formulaId);
      } else {
        const { data, error } = await supabase.from("production_formulas" as any).insert(payload).select("id").single();
        if (error) throw error;
        formulaId = (data as any).id;
      }
      const itemRows = state.items.map((i, idx) => ({
        formula_id: formulaId, product_id: i.product_id,
        quantity: Number(i.quantity), scrap_pct: Number(i.scrap_pct ?? 0),
        sequence: Number(i.sequence ?? idx + 1),
      }));
      if (itemRows.length) {
        const { error } = await supabase.from("production_formula_items" as any).insert(itemRows);
        if (error) throw error;
      }
      const bpRows = state.byproducts.map(b => ({
        formula_id: formulaId, product_id: b.product_id,
        quantity: Number(b.quantity), unit_value: Number(b.unit_value ?? 0),
        notes: b.notes || null,
      }));
      if (bpRows.length) {
        const { error } = await supabase.from("production_formula_byproducts" as any).insert(bpRows);
        if (error) throw error;
      }
      toast.success("تم الحفظ");
      setDirty(false);
      if (closeAfter) nav("/production/formulas");
      else if (isNew) nav(`/production/formulas/${formulaId}/edit`, { replace: true });
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الحفظ");
    } finally { setSaving(false); }
  };

  const previewCost = async () => {
    if (!state.id) {
      setCostPreview(estimatedTotalCost);
      toast.message("تقدير محلي — احفظ للحصول على المحسوبة من الخادم");
      return;
    }
    const { data, error } = await supabase.rpc("calculate_formula_standard_cost" as any, { _formula_id: state.id });
    if (error) return toast.error(error.message);
    setCostPreview(Number(data ?? 0));
  };

  const back = () => {
    if (dirty && !confirm("لديك تعديلات غير محفوظة. الخروج؟")) return;
    nav("/production/formulas");
  };

  const addItem = () => patch({ items: [...state.items, { product_id: "", quantity: 1, scrap_pct: 0, sequence: state.items.length + 1 }] });
  const removeItem = (i: number) => { const items = [...state.items]; items.splice(i, 1); patch({ items }); };
  const updateItem = (i: number, u: Partial<FormulaItem>) => { const items = [...state.items]; items[i] = { ...items[i], ...u }; patch({ items }); };

  const addByproduct = () => patch({ byproducts: [...state.byproducts, { product_id: "", quantity: 1, unit_value: 0 }] });
  const removeByproduct = (i: number) => { const bps = [...state.byproducts]; bps.splice(i, 1); patch({ byproducts: bps }); };
  const updateByproduct = (i: number, u: Partial<Byproduct>) => { const bps = [...state.byproducts]; bps[i] = { ...bps[i], ...u }; patch({ byproducts: bps }); };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center" dir="rtl">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30" dir="rtl">
      {/* Dynamics-style top command bar */}
      <div className="sticky top-0 z-40 bg-card border-b border-border shadow-sm">
        <div className="px-4 py-2 flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={back} className="gap-1">
            <ArrowRight className="w-4 h-4" /> رجوع
          </Button>
          <div className="h-6 w-px bg-border mx-1" />
          <Button size="sm" onClick={() => save(false)} disabled={saving || !dirty} className="gap-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} حفظ
          </Button>
          <Button size="sm" variant="outline" onClick={() => save(true)} disabled={saving} className="gap-1">
            <CheckCircle2 className="w-4 h-4" /> حفظ وإغلاق
          </Button>
          <div className="h-6 w-px bg-border mx-1" />
          <Button size="sm" variant="outline" onClick={previewCost} className="gap-1">
            <Calculator className="w-4 h-4" /> معاينة التكلفة
          </Button>
          {costPreview !== null && (
            <Badge variant="secondary" className="text-sm">
              التكلفة المعيارية للدفعة: {costPreview.toFixed(2)}
            </Badge>
          )}
          <div className="mr-auto flex items-center gap-2">
            {dirty && <Badge variant="outline" className="text-amber-600 border-amber-300">تعديلات غير محفوظة</Badge>}
            <Badge className={state.status === "archived" ? "bg-slate-500" : state.status === "draft" ? "bg-amber-500" : "bg-emerald-600"}>
              {state.status === "archived" ? "مؤرشفة" : state.status === "draft" ? "مسودة" : "مفعّلة"}
            </Badge>
            <span className="text-xs text-muted-foreground">v{state.version}</span>
          </div>
        </div>

        {/* Breadcrumb / title */}
        <div className="px-4 py-3 border-t border-border bg-background/50">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Factory className="w-3 h-3" /> الإنتاج والتصنيع • معادلات الإنتاج • {isNew ? "معادلة جديدة" : "تعديل معادلة"}
          </div>
          <h1 className="text-xl font-bold text-foreground">
            {state.name || (isNew ? "معادلة جديدة" : "بدون اسم")}
            {state.code && <span className="text-sm text-muted-foreground mr-2">— {state.code}</span>}
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto p-4 pb-24 space-y-4">
        <Tabs defaultValue="general">
          <TabsList className="grid grid-cols-4 w-full max-w-2xl">
            <TabsTrigger value="general" className="gap-1"><Package className="w-4 h-4" /> عام</TabsTrigger>
            <TabsTrigger value="components" className="gap-1"><Boxes className="w-4 h-4" /> المكونات ({state.items.length})</TabsTrigger>
            <TabsTrigger value="costs" className="gap-1"><Calculator className="w-4 h-4" /> التكاليف</TabsTrigger>
            <TabsTrigger value="byproducts" className="gap-1"><Layers className="w-4 h-4" /> ثانوية ({state.byproducts.length})</TabsTrigger>
          </TabsList>

          {/* General */}
          <TabsContent value="general" className="mt-4">
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground">اسم المعادلة *</label>
                    <Input value={state.name} onChange={e => patch({ name: e.target.value })} placeholder="مثال: كيك شوكولاتة" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">الكود</label>
                    <Input value={state.code} onChange={e => patch({ code: e.target.value })} placeholder="BOM-001" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">المنتج النهائي *</label>
                    <select className="w-full border rounded-md p-2 bg-background" value={state.output_product_id} onChange={e => patch({ output_product_id: e.target.value })}>
                      <option value="">— اختر —</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">كمية الإخراج (لكل تشغيلة)</label>
                    <Input type="number" step="0.001" value={state.output_quantity} onChange={e => patch({ output_quantity: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">نسبة الإنتاجية المتوقعة %</label>
                    <Input type="number" step="0.1" value={state.expected_yield_pct} onChange={e => patch({ expected_yield_pct: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">الحالة</label>
                    <select className="w-full border rounded-md p-2 bg-background" value={state.status} onChange={e => patch({ status: e.target.value })}>
                      <option value="active">مفعّلة</option>
                      <option value="draft">مسودة</option>
                      <option value="archived">مؤرشفة</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">تاريخ سريان من</label>
                    <Input type="date" value={state.effective_from ?? ""} onChange={e => patch({ effective_from: e.target.value || null })} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">تاريخ سريان إلى</label>
                    <Input type="date" value={state.effective_to ?? ""} onChange={e => patch({ effective_to: e.target.value || null })} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">ملاحظات</label>
                  <Textarea rows={3} value={state.notes} onChange={e => patch({ notes: e.target.value })} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Components */}
          <TabsContent value="components" className="mt-4">
            <Card>
              <CardContent className="p-0">
                <div className="p-4 flex items-center justify-between border-b border-border">
                  <div>
                    <div className="font-semibold">المواد الخام (المكونات)</div>
                    <div className="text-xs text-muted-foreground">
                      التكلفة التقديرية للمواد: <b>{estimatedMaterialCost.toFixed(2)}</b> (بناءً على تكاليف المنتجات الحالية)
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={addItem} className="gap-1">
                    <Plus className="w-4 h-4" /> إضافة مادة
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="p-2 text-center w-14">#</th>
                        <th className="p-2 text-right">المنتج</th>
                        <th className="p-2 text-center w-28">الكمية</th>
                        <th className="p-2 text-center w-24">هدر %</th>
                        <th className="p-2 text-center w-28">تكلفة تقديرية</th>
                        <th className="p-2 text-center w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.items.map((it, idx) => {
                        const p = productMap[it.product_id];
                        const unit = Number(p?.standard_cost ?? p?.average_cost ?? p?.buy_price ?? 0);
                        const lineCost = it.quantity * (1 + it.scrap_pct / 100) * unit;
                        return (
                          <tr key={idx} className="border-t border-border">
                            <td className="p-1 text-center">
                              <Input type="number" className="text-center" value={it.sequence} onChange={e => updateItem(idx, { sequence: Number(e.target.value) })} />
                            </td>
                            <td className="p-1">
                              <select className="w-full border rounded-md p-1.5 bg-background" value={it.product_id} onChange={e => updateItem(idx, { product_id: e.target.value })}>
                                <option value="">— اختر —</option>
                                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            </td>
                            <td className="p-1"><Input type="number" step="0.001" value={it.quantity} onChange={e => updateItem(idx, { quantity: Number(e.target.value) })} /></td>
                            <td className="p-1"><Input type="number" step="0.1" value={it.scrap_pct} onChange={e => updateItem(idx, { scrap_pct: Number(e.target.value) })} /></td>
                            <td className="p-1 text-center text-xs text-muted-foreground">{lineCost.toFixed(2)}</td>
                            <td className="p-1 text-center">
                              <Button size="sm" variant="ghost" onClick={() => removeItem(idx)}><X className="w-4 h-4 text-destructive" /></Button>
                            </td>
                          </tr>
                        );
                      })}
                      {state.items.length === 0 && (
                        <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا توجد مواد بعد — اضغط "إضافة مادة"</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Costs */}
          <TabsContent value="costs" className="mt-4">
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground">تكلفة العمالة / دفعة</label>
                    <Input type="number" step="0.01" value={state.labor_cost_per_batch} onChange={e => patch({ labor_cost_per_batch: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">تكاليف غير مباشرة / دفعة (قيمة ثابتة)</label>
                    <Input type="number" step="0.01" value={state.overhead_cost_per_batch} onChange={e => patch({ overhead_cost_per_batch: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">نسبة تحميل غير مباشر % (من تكلفة المواد)</label>
                    <Input type="number" step="0.1" value={state.overhead_rate_pct} onChange={e => patch({ overhead_rate_pct: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="p-4 bg-muted/40 rounded-md space-y-2 text-sm">
                  <div className="flex justify-between"><span>تكلفة المواد الخام (مع الهدر):</span><b>{estimatedMaterialCost.toFixed(2)}</b></div>
                  <div className="flex justify-between"><span>تكلفة العمالة:</span><b>{state.labor_cost_per_batch.toFixed(2)}</b></div>
                  <div className="flex justify-between"><span>تكاليف غير مباشرة ثابتة:</span><b>{state.overhead_cost_per_batch.toFixed(2)}</b></div>
                  <div className="flex justify-between"><span>تحميل غير مباشر ({state.overhead_rate_pct}%):</span><b>{(estimatedMaterialCost * state.overhead_rate_pct / 100).toFixed(2)}</b></div>
                  <div className="flex justify-between border-t border-border pt-2 text-base"><span className="font-semibold">إجمالي التكلفة المعيارية للدفعة:</span><b className="text-primary">{estimatedTotalCost.toFixed(2)}</b></div>
                  <div className="flex justify-between text-xs text-muted-foreground"><span>تكلفة الوحدة (كمية إخراج {state.output_quantity}):</span><b>{state.output_quantity > 0 ? (estimatedTotalCost / state.output_quantity).toFixed(2) : "—"}</b></div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Byproducts */}
          <TabsContent value="byproducts" className="mt-4">
            <Card>
              <CardContent className="p-0">
                <div className="p-4 flex items-center justify-between border-b border-border">
                  <div>
                    <div className="font-semibold">المنتجات الثانوية</div>
                    <div className="text-xs text-muted-foreground">منتجات إضافية تُنتج تلقائياً مع المنتج الأصلي (تُضاف للمخزون عند الإتمام)</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={addByproduct} className="gap-1">
                    <Plus className="w-4 h-4" /> إضافة منتج ثانوي
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="p-2 text-right">المنتج</th>
                        <th className="p-2 text-center w-28">الكمية</th>
                        <th className="p-2 text-center w-28">القيمة/الوحدة</th>
                        <th className="p-2 text-right">ملاحظات</th>
                        <th className="p-2 text-center w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.byproducts.map((bp, idx) => (
                        <tr key={idx} className="border-t border-border">
                          <td className="p-1">
                            <select className="w-full border rounded-md p-1.5 bg-background" value={bp.product_id} onChange={e => updateByproduct(idx, { product_id: e.target.value })}>
                              <option value="">— اختر —</option>
                              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </td>
                          <td className="p-1"><Input type="number" step="0.001" value={bp.quantity} onChange={e => updateByproduct(idx, { quantity: Number(e.target.value) })} /></td>
                          <td className="p-1"><Input type="number" step="0.01" value={bp.unit_value} onChange={e => updateByproduct(idx, { unit_value: Number(e.target.value) })} /></td>
                          <td className="p-1"><Input value={bp.notes ?? ""} onChange={e => updateByproduct(idx, { notes: e.target.value })} /></td>
                          <td className="p-1 text-center">
                            <Button size="sm" variant="ghost" onClick={() => removeByproduct(idx)}><X className="w-4 h-4 text-destructive" /></Button>
                          </td>
                        </tr>
                      ))}
                      {state.byproducts.length === 0 && (
                        <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لا توجد منتجات ثانوية</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Sticky footer bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-2">
          <div className="text-sm">
            <span className="text-muted-foreground">التكلفة التقديرية للدفعة: </span>
            <b className="text-primary">{estimatedTotalCost.toFixed(2)}</b>
          </div>
          <div className="mr-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={back} className="gap-1"><X className="w-4 h-4" /> إلغاء</Button>
            <Button variant="outline" size="sm" onClick={() => save(true)} disabled={saving} className="gap-1">
              <CheckCircle2 className="w-4 h-4" /> حفظ وإغلاق
            </Button>
            <Button size="sm" onClick={() => save(false)} disabled={saving || !dirty} className="gap-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} حفظ
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}