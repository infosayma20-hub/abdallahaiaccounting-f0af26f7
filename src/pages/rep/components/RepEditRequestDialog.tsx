import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Search } from "lucide-react";

type Item = { product_id: string; name: string; quantity: number; unit_price: number };

export function RepEditRequestDialog({
  open,
  onOpenChange,
  invoice,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoice: { id: string; invoice_number: string; user_id?: string } | null;
  onSubmitted?: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [reason, setReason] = useState("");
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !invoice) return;
    setReason("");
    setSearch("");
    setLoading(true);
    (async () => {
      try {
        const { data: inv } = await (supabase as any)
          .from("invoices").select("user_id").eq("id", invoice.id).maybeSingle();
        const ownerId = inv?.user_id || invoice.user_id;

        const [{ data: lines }, { data: prods }] = await Promise.all([
          (supabase as any)
            .from("invoice_items")
            .select("product_id, product_name, quantity, unit_price")
            .eq("invoice_id", invoice.id)
            .order("created_at", { ascending: true }),
          (supabase as any)
            .from("products")
            .select("id, name, sku, barcode, sell_price")
            .eq("user_id", ownerId)
            .limit(500),
        ]);
        setProducts(prods || []);
        setItems(
          (lines || []).map((l: any) => ({
            product_id: l.product_id,
            name: l.product_name,
            quantity: Number(l.quantity || 0),
            unit_price: Number(l.unit_price || 0),
          }))
        );
      } catch (e: any) {
        toast({ title: "تعذر تحميل بنود الفاتورة", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [open, invoice?.id]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q) ||
        (p.barcode || "").toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [search, products]);

  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  const addProduct = (p: any) => {
    setItems((prev) => {
      const found = prev.find((i) => i.product_id === p.id);
      if (found) return prev.map((i) => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: p.id, name: p.name, quantity: 1, unit_price: Number(p.sell_price || 0) }];
    });
    setSearch("");
  };

  const submit = async () => {
    if (!invoice) return;
    if (reason.trim().length < 3) {
      toast({ title: "اكتب سبب التعديل (3 حروف على الأقل)", variant: "destructive" });
      return;
    }
    if (items.length === 0) {
      toast({ title: "أضف بنداً واحداً على الأقل", variant: "destructive" });
      return;
    }
    const bad = items.find((i) => !(i.quantity > 0) || !(i.unit_price >= 0));
    if (bad) {
      toast({ title: "كمية أو سعر غير صالح", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("request_rep_invoice_edit", {
        p_invoice_id: invoice.id,
        p_reason: reason.trim(),
        p_proposed_items: items.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
        })),
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "تعذر إرسال الطلب");
      toast({ title: "تم إرسال طلب التعديل للأدمن للمراجعة" });
      onOpenChange(false);
      onSubmitted?.();
    } catch (e: any) {
      toast({ title: "فشل الإرسال", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>طلب تعديل الفاتورة {invoice?.invoice_number}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>سبب التعديل *</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="مثلاً: العميل طلب استبدال صنف بصنف آخر"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>إضافة صنف</Label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ابحث عن صنف..."
                  className="pr-9"
                />
              </div>
              {filteredProducts.length > 0 && (
                <div className="border rounded-md max-h-40 overflow-y-auto divide-y">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProduct(p)}
                      className="w-full text-right px-3 py-2 hover:bg-accent text-sm flex items-center justify-between"
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{Number(p.sell_price || 0).toFixed(2)} ₪</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>البنود ({items.length})</Label>
              {items.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-4">لا توجد بنود</div>
              )}
              {items.map((it, idx) => (
                <div key={`${it.product_id}-${idx}`} className="border rounded-md p-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate flex-1">{it.name}</span>
                    <Button
                      type="button" size="icon" variant="ghost"
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="h-8 w-8 text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">الكمية</Label>
                      <Input
                        type="number" inputMode="decimal" min="0" step="any"
                        value={it.quantity}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setItems((prev) => prev.map((p, i) => i === idx ? { ...p, quantity: v } : p));
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">السعر</Label>
                      <Input
                        type="number" inputMode="decimal" min="0" step="any"
                        value={it.unit_price}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setItems((prev) => prev.map((p, i) => i === idx ? { ...p, unit_price: v } : p));
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground text-left">
                    الإجمالي: {(it.quantity * it.unit_price).toFixed(2)} ₪
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm font-medium">الإجمالي المقترح</span>
              <span className="font-bold">{total.toFixed(2)} ₪</span>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button onClick={submit} disabled={saving || loading}>
            {saving && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
            إرسال للأدمن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}