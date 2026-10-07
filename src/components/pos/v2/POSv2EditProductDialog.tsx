import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Cat = { id: string; name: string };
type Prod = { id: string; name: string; pos_category_id?: string | null; category?: string | null };

/**
 * Admin-only quick edit of a product's name + POS category from POS v2.
 * Writes directly to the shared `products` row (same row used by inventory),
 * touching ONLY name / pos_category_id / category — never price, stock or ledger.
 */
export default function POSv2EditProductDialog(props: {
  product: Prod | null;
  categories: Cat[];
  ownerId: string | null;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: (u: { id: string; name: string; pos_category_id: string | null; category: string | null }) => void;
}) {
  const { product } = props;
  const [name, setName] = useState("");
  const [catId, setCatId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!product) return;
    setName(product.name || "");
    const byId = product.pos_category_id && props.categories.some(c => c.id === product.pos_category_id) ? product.pos_category_id : "";
    const byName = !byId && product.category ? props.categories.find(c => c.name === product.category)?.id || "" : "";
    setCatId(byId || byName);
  }, [product, props.categories]);

  const save = async () => {
    if (!product || !props.ownerId || !props.isAdmin || saving) return;
    const trimmed = name.trim();
    if (!trimmed) { toast.error("اسم الصنف مطلوب"); return; }
    const cat = props.categories.find(c => c.id === catId) || null;
    const patch = { name: trimmed, pos_category_id: cat ? cat.id : null, category: cat ? cat.name : (product.category ?? null) };
    setSaving(true);
    const { data, error } = await supabase
      .from("products")
      .update(patch as any)
      .eq("id", product.id)
      .eq("user_id", props.ownerId)
      .select("id")
      .maybeSingle();
    setSaving(false);
    if (error || !data) { toast.error("تعذر حفظ التعديل" + (error?.message ? `: ${error.message}` : "")); return; }
    props.onSaved({ id: product.id, ...patch });
    toast.success("تم تعديل الصنف");
    props.onClose();
  };

  return (
    <Dialog open={!!product} onOpenChange={(o) => { if (!o && !saving) props.onClose(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader><DialogTitle>تعديل الصنف</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">اسم الصنف</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">التصنيف</label>
            <select
              dir="rtl"
              value={catId}
              onChange={(e) => setCatId(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">بدون تصنيف</option>
              {props.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">التعديل على الصنف نفسه في المخزون — السعر والكمية والقيود لا تتغير.</p>
        </div>
        <DialogFooter className="gap-2">
          <Button onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ"}</Button>
          <Button variant="outline" onClick={props.onClose} disabled={saving}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
