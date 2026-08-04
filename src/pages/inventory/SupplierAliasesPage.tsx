import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link2, Loader2, Save, Trash2, Wand2 } from "lucide-react";
import { suggestMatches, parsePastedLines, type AliasProduct } from "@/lib/supplier-aliases";
import { normalizeArabicSearch } from "@/lib/utils";

interface Row {
  key: string;
  aliasName: string;
  aliasCode: string;
  productId: string | null;
  score: number;
  saved?: boolean;
}

export default function SupplierAliasesPage() {
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const ownerId = dataOwnerId || user?.id;

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState<string>("");
  const [products, setProducts] = useState<AliasProduct[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [existing, setExisting] = useState<any[]>([]);
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ownerId) return;
    (async () => {
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from("contacts").select("id, contact_name, contact_type")
          .eq("user_id", ownerId).in("contact_type", ["مورد", "عميل ومورد"])
          .eq("is_archived", false).order("contact_name"),
        supabase.from("products").select("id, name, sku, barcode, unit, buy_price")
          .eq("user_id", ownerId).order("name").limit(5000),
      ]);
      setSuppliers((c as any[]) || []);
      setProducts(((p as any[]) || []) as AliasProduct[]);
    })();
  }, [ownerId]);

  const loadExisting = async (sid: string) => {
    if (!ownerId || !sid) { setExisting([]); return; }
    setLoading(true);
    const { data } = await supabase.from("product_supplier_aliases")
      .select("id, alias_name, alias_code, product_id")
      .eq("user_id", ownerId).eq("supplier_id", sid).order("alias_name");
    setExisting((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { loadExisting(supplierId); /* eslint-disable-next-line */ }, [supplierId, ownerId]);

  const productMap = useMemo(() => {
    const m = new Map<string, AliasProduct>();
    products.forEach(p => m.set(p.id, p));
    return m;
  }, [products]);

  const analyze = () => {
    const parsed = parsePastedLines(raw);
    if (!parsed.length) { toast({ title: "لا توجد بنود", description: "الصق أسماء أصناف المورد أولاً", variant: "destructive" }); return; }
    const alreadyNorm = new Set(existing.map(e => normalizeArabicSearch(e.alias_name)));
    const next: Row[] = parsed
      .filter(l => !alreadyNorm.has(normalizeArabicSearch(l.name)))
      .map((l, i) => {
        const s = suggestMatches(l.name, products, 1)[0];
        return {
          key: `${i}-${l.name}`,
          aliasName: l.name,
          aliasCode: l.code || "",
          productId: s && s.score >= 0.55 ? s.product.id : null,
          score: s?.score ?? 0,
        };
      });
    setRows(next);
    toast({ title: `تم تحليل ${next.length} بند`, description: `مطابقة تلقائية: ${next.filter(r => r.productId).length}` });
  };

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));

  const saveAll = async () => {
    if (!ownerId || !supplierId) return;
    const ready = rows.filter(r => r.productId && !r.saved);
    if (!ready.length) { toast({ title: "لا يوجد ما يُحفظ", variant: "destructive" }); return; }
    setSaving(true);
    const supplierName = suppliers.find(s => s.id === supplierId)?.contact_name || null;
    const payload = ready.map(r => ({
      user_id: ownerId,
      supplier_id: supplierId,
      supplier_name: supplierName,
      alias_name: r.aliasName.trim(),
      alias_code: r.aliasCode.trim() || null,
      product_id: r.productId,
    }));
    const { error } = await supabase.from("product_supplier_aliases")
      .upsert(payload as any, { onConflict: "user_id,supplier_id,alias_name" });
    setSaving(false);
    if (error) { toast({ title: "❌ فشل الحفظ", description: error.message, variant: "destructive" }); return; }
    toast({ title: `✅ تم ربط ${payload.length} صنف` });
    setRows(prev => prev.map(r => (ready.some(x => x.key === r.key) ? { ...r, saved: true } : r)));
    loadExisting(supplierId);
  };

  const removeAlias = async (id: string) => {
    const { error } = await supabase.from("product_supplier_aliases").delete().eq("id", id);
    if (error) { toast({ title: "❌ خطأ", description: error.message, variant: "destructive" }); return; }
    toast({ title: "✅ تم حذف الربط" });
    loadExisting(supplierId);
  };

  return (
    <div className="p-3 md:p-6 space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <Link2 className="h-5 w-5 text-primary" />
        <h1 className="text-lg md:text-xl font-bold">معالج مطابقة أصناف المورد</h1>
      </div>
      <p className="text-xs text-muted-foreground">
        اربط أسماء الأصناف كما تكتبها فواتير المورد بالأصناف الموجودة عندك — بدون إنشاء أصناف مكرّرة وبدون المساس بالطلبيات القديمة.
      </p>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">1) المورد وقائمة أصنافه</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger className="max-w-md"><SelectValue placeholder="اختر المورد" /></SelectTrigger>
            <SelectContent>
              {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.contact_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Textarea
            dir="rtl"
            rows={7}
            value={raw}
            onChange={e => setRaw(e.target.value)}
            placeholder={"الصق أسماء أصناف المورد — سطر لكل صنف\nمثال:\nكرسي ايفين\nصالون فرح  1  0"}
            className="text-sm"
          />
          <Button onClick={analyze} disabled={!supplierId} className="gap-2">
            <Wand2 className="h-4 w-4" /> تحليل ومطابقة
          </Button>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="text-sm">2) مراجعة المطابقة ({rows.length})</CardTitle>
            <Button size="sm" onClick={saveAll} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ الروابط
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.map(r => {
              const sugg = suggestMatches(r.aliasName, products, 6);
              const chosen = r.productId ? productMap.get(r.productId) : null;
              return (
                <div key={r.key} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center border rounded-md p-2">
                  <div className="md:col-span-4">
                    <Input value={r.aliasName} onChange={e => setRow(r.key, { aliasName: e.target.value })} className="h-9 text-sm" />
                  </div>
                  <div className="md:col-span-2">
                    <Input value={r.aliasCode} onChange={e => setRow(r.key, { aliasCode: e.target.value })} placeholder="كود المورد" className="h-9 text-xs" />
                  </div>
                  <div className="md:col-span-5">
                    <Select value={r.productId ?? "__none__"} onValueChange={v => setRow(r.key, { productId: v === "__none__" ? null : v })}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر الصنف المطابق" /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value="__none__">— بدون ربط —</SelectItem>
                        {sugg.map(s => (
                          <SelectItem key={s.product.id} value={s.product.id}>
                            {s.product.name} · {Math.round(s.score * 100)}%
                          </SelectItem>
                        ))}
                        {products
                          .filter(p => !sugg.some(s => s.product.id === p.id))
                          .slice(0, 300)
                          .map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-1 flex justify-end">
                    {r.saved ? <Badge className="bg-emerald-600">تم</Badge>
                      : chosen ? <Badge variant="secondary">{Math.round(r.score * 100)}%</Badge>
                      : <Badge variant="outline">جديد</Badge>}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">الروابط المحفوظة {loading && <Loader2 className="inline h-3 w-3 animate-spin" />}</CardTitle></CardHeader>
        <CardContent>
          {!supplierId ? (
            <p className="text-xs text-muted-foreground">اختر مورداً لعرض روابطه.</p>
          ) : existing.length === 0 ? (
            <p className="text-xs text-muted-foreground">لا توجد روابط محفوظة لهذا المورد بعد.</p>
          ) : (
            <div className="space-y-1">
              {existing.map(e => (
                <div key={e.id} className="flex items-center gap-2 text-sm border-b py-1">
                  <span className="flex-1">{e.alias_name}</span>
                  <span className="text-muted-foreground text-xs">→</span>
                  <span className="flex-1 font-medium">{productMap.get(e.product_id)?.name || "—"}</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeAlias(e.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
