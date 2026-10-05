import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Store, Link2, Unlink, Search, Loader2 } from "lucide-react";
import { FinanceShell } from "@/components/finance/shell";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessUnits, type BusinessUnit } from "@/hooks/useBusinessUnits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

interface Branch { id: string; name: string; business_unit_id: string | null }
interface Warehouse { id: string; name: string; business_unit_id: string | null }
interface CostCenter { id: string; name: string; code: string }

const COLORS = ["#0D1B2E", "#E8590C", "#2F9E44", "#1971C2", "#C2255C", "#7048E8"];

export default function BusinessUnitsPage() {
  const { dataOwnerId, units, reload } = useBusinessUnits();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<Partial<BusinessUnit> | null>(null);
  const [selBranches, setSelBranches] = useState<string[]>([]);
  const [selWarehouse, setSelWarehouse] = useState<string>("none");
  const [saving, setSaving] = useState(false);
  const [productsUnit, setProductsUnit] = useState<BusinessUnit | null>(null);

  const loadRefs = async () => {
    if (!dataOwnerId) return;
    const [b, w, c] = await Promise.all([
      supabase.from("branches").select("id,name,business_unit_id").eq("user_id", dataOwnerId).order("name"),
      supabase.from("warehouses").select("id,name,business_unit_id").eq("user_id", dataOwnerId).eq("is_active", true).order("name"),
      supabase.from("cost_centers").select("id,name,code").eq("user_id", dataOwnerId).eq("is_active", true).order("code"),
    ]);
    setBranches((b.data || []) as Branch[]);
    setWarehouses((w.data || []) as Warehouse[]);
    setCostCenters((c.data || []) as CostCenter[]);
    const counts: Record<string, number> = {};
    await Promise.all(units.map(async (u) => {
      const { count } = await supabase.from("product_business_units").select("product_id", { count: "exact", head: true }).eq("business_unit_id", u.id);
      counts[u.id] = count || 0;
    }));
    setProductCounts(counts);
  };

  useEffect(() => { loadRefs(); /* eslint-disable-next-line */ }, [dataOwnerId, units.length]);

  const openEdit = (u?: BusinessUnit) => {
    setEditing(u ? { ...u } : { name: "", code: "", color: COLORS[1], description: "", cost_center_id: null, is_active: true });
    setSelBranches(u ? branches.filter((b) => b.business_unit_id === u.id).map((b) => b.id) : []);
    setSelWarehouse(u ? warehouses.find((w) => w.business_unit_id === u.id)?.id ?? "none" : "none");
  };

  const save = async () => {
    if (!dataOwnerId || !editing?.name?.trim()) { toast({ title: "اكتب اسم النشاط", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = {
        name: editing.name.trim(),
        code: editing.code?.trim() || null,
        color: editing.color || null,
        description: editing.description?.trim() || null,
        cost_center_id: editing.cost_center_id || null,
        is_active: editing.is_active ?? true,
      };
      let id = editing.id;
      if (id) {
        const { error } = await supabase.from("business_units").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("business_units").insert({ ...payload, user_id: dataOwnerId }).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      // الفروع: ربط المختارة، وفك ربط ما أُلغي اختياره من هذا النشاط فقط
      const toUnlink = branches.filter((b) => b.business_unit_id === id && !selBranches.includes(b.id)).map((b) => b.id);
      if (toUnlink.length) await supabase.from("branches").update({ business_unit_id: null }).in("id", toUnlink);
      if (selBranches.length) {
        const { error } = await supabase.from("branches").update({ business_unit_id: id }).in("id", selBranches);
        if (error) throw error;
      }
      // المستودع الافتراضي
      const prevWh = warehouses.filter((w) => w.business_unit_id === id && w.id !== selWarehouse).map((w) => w.id);
      if (prevWh.length) await supabase.from("warehouses").update({ business_unit_id: null }).in("id", prevWh);
      if (selWarehouse !== "none") await supabase.from("warehouses").update({ business_unit_id: id }).eq("id", selWarehouse);
      toast({ title: "تم حفظ النشاط" });
      setEditing(null);
      await reload();
      await loadRefs();
    } catch (e: any) {
      toast({ title: "تعذّر الحفظ", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FinanceShell
      title="الأنشطة التجارية"
      subtitle="أكثر من محل على نفس الحساب: لكل نشاط فروعه ومستودعه وأصنافه وتقاريره"
      breadcrumb={[{ label: "النظام", href: "/" }, { label: "الإعدادات", href: "/settings" }, { label: "الأنشطة التجارية" }]}
      actionTabs={[{ key: "main", label: "عام", groups: [{ key: "new", label: "جديد", items: [{ key: "add", label: "نشاط جديد", icon: Plus, variant: "primary", onClick: () => openEdit() }] }] }]}
    >
      <div className="p-3 md:p-4" dir="rtl">
        {units.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
            لا توجد أنشطة بعد. أضف نشاطًا إذا كان لديك أكثر من محل بأنواع مختلفة.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {units.map((u) => {
              const ub = branches.filter((b) => b.business_unit_id === u.id);
              const wh = warehouses.find((w) => w.business_unit_id === u.id);
              const cc = costCenters.find((c) => c.id === u.cost_center_id);
              return (
                <div key={u.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"
                      style={u.color ? { background: u.color + "22", color: u.color } : undefined}><Store className="h-5 w-5" /></span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-foreground">{u.name}</h3>
                        {!u.is_active && <Badge variant="secondary">موقوف</Badge>}
                      </div>
                      {u.description && <p className="text-xs text-muted-foreground">{u.description}</p>}
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(u)} aria-label="تعديل"><Pencil className="h-4 w-4" /></Button>
                  </div>
                  <dl className="mt-3 space-y-1 text-sm">
                    <div className="flex gap-2"><dt className="text-muted-foreground w-24">الفروع</dt><dd className="flex-1">{ub.length ? ub.map((b) => b.name).join("، ") : "—"}</dd></div>
                    <div className="flex gap-2"><dt className="text-muted-foreground w-24">المستودع</dt><dd>{wh?.name ?? "—"}</dd></div>
                    <div className="flex gap-2"><dt className="text-muted-foreground w-24">مركز الكلفة</dt><dd>{cc ? `${cc.code} ${cc.name}` : "—"}</dd></div>
                    <div className="flex gap-2"><dt className="text-muted-foreground w-24">الأصناف المربوطة</dt><dd>{productCounts[u.id] ?? 0}</dd></div>
                  </dl>
                  <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setProductsUnit(u)}>ربط الأصناف</Button>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          الصنف غير المربوط بأي نشاط يظهر في كل نقاط البيع. الصنف المربوط يظهر فقط في نقاط بيع الأنشطة المربوط بها.
        </p>
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader className="text-right"><DialogTitle>{editing?.id ? "تعديل نشاط" : "نشاط جديد"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2"><Label>الاسم</Label><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
                <div><Label>الرمز</Label><Input value={editing.code ?? ""} onChange={(e) => setEditing({ ...editing, code: e.target.value })} /></div>
              </div>
              <div><Label>وصف</Label><Input value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div>
                <Label>اللون</Label>
                <div className="mt-1 flex gap-2">
                  {COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setEditing({ ...editing, color: c })} aria-label={c}
                      className={`h-7 w-7 rounded-full border-2 ${editing.color === c ? "border-foreground" : "border-transparent"}`} style={{ background: c }} />
                  ))}
                </div>
              </div>
              <div>
                <Label>مركز الكلفة</Label>
                <Select dir="rtl" value={editing.cost_center_id ?? "none"} onValueChange={(v) => setEditing({ ...editing, cost_center_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون</SelectItem>
                    {costCenters.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>المستودع الافتراضي</Label>
                <Select dir="rtl" value={selWarehouse} onValueChange={setSelWarehouse}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون</SelectItem>
                    {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>الفروع التابعة</Label>
                <div className="mt-1 max-h-40 space-y-1 overflow-auto rounded-md border border-border p-2">
                  {branches.map((b) => {
                    const other = b.business_unit_id && b.business_unit_id !== editing.id ? units.find((u) => u.id === b.business_unit_id)?.name : null;
                    return (
                      <label key={b.id} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={selBranches.includes(b.id)} onCheckedChange={(v) => setSelBranches((s) => v ? [...s, b.id] : s.filter((x) => x !== b.id))} />
                        <span className="flex-1">{b.name}</span>
                        {other && <span className="text-xs text-muted-foreground">حاليًا: {other}</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
              <label className="flex items-center justify-between text-sm">
                <span>نشط</span>
                <Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
              </label>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>إلغاء</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {productsUnit && dataOwnerId && (
        <ProductLinkDialog unit={productsUnit} ownerId={dataOwnerId} onClose={() => { setProductsUnit(null); loadRefs(); }} />
      )}
    </FinanceShell>
  );
}

function ProductLinkDialog({ unit, ownerId, onClose }: { unit: BusinessUnit; ownerId: string; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [onlyLinked, setOnlyLinked] = useState(false);
  const [rows, setRows] = useState<{ id: string; name: string; barcode: string | null }[]>([]);
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const loadLinked = async () => {
    const all = new Set<string>();
    for (let p = 0; p < 50; p++) {
      const { data } = await supabase.from("product_business_units").select("product_id").eq("business_unit_id", unit.id).range(p * 1000, p * 1000 + 999);
      (data || []).forEach((r) => all.add(r.product_id));
      if (!data || data.length < 1000) break;
    }
    setLinked(all);
    return all;
  };

  const search = async (linkedSet = linked) => {
    let query = supabase.from("products").select("id,name,barcode").eq("user_id", ownerId).order("name").limit(200);
    if (onlyLinked) {
      const ids = Array.from(linkedSet).slice(0, 200);
      if (!ids.length) { setRows([]); return; }
      query = query.in("id", ids);
    }
    const t = q.trim();
    if (t) query = query.or(`name.ilike.%${t.replace(/[%,()]/g, " ")}%,barcode.ilike.%${t.replace(/[%,()]/g, "")}%`);
    const { data } = await query;
    setRows((data || []) as any);
    setSel(new Set());
  };

  useEffect(() => { loadLinked().then((s) => search(s)); /* eslint-disable-next-line */ }, []);
  useEffect(() => { const h = setTimeout(() => search(), 300); return () => clearTimeout(h); /* eslint-disable-next-line */ }, [q, onlyLinked]);

  const apply = async (link: boolean) => {
    const ids = Array.from(sel);
    if (!ids.length) return;
    setBusy(true);
    try {
      if (link) {
        const add = ids.filter((id) => !linked.has(id)).map((product_id) => ({ product_id, business_unit_id: unit.id, user_id: ownerId }));
        if (add.length) { const { error } = await supabase.from("product_business_units").insert(add); if (error) throw error; }
      } else {
        const { error } = await supabase.from("product_business_units").delete().eq("business_unit_id", unit.id).in("product_id", ids);
        if (error) throw error;
      }
      toast({ title: link ? `رُبط ${ids.length} صنف` : `فُك ربط ${ids.length} صنف` });
      const s = await loadLinked();
      await search(s);
    } catch (e: any) {
      toast({ title: "تعذّر التنفيذ", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const allChecked = rows.length > 0 && rows.every((r) => sel.has(r.id));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader className="text-right"><DialogTitle>ربط الأصناف — {unit.name}</DialogTitle></DialogHeader>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pr-8" placeholder="بحث بالاسم أو الباركود" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm whitespace-nowrap">
            <Switch checked={onlyLinked} onCheckedChange={setOnlyLinked} />المربوطة فقط ({linked.size})
          </label>
        </div>
        <div className="max-h-[50dvh] overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="w-8 p-2"><Checkbox checked={allChecked} onCheckedChange={(v) => setSel(v ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
                <th className="p-2 text-right">الصنف</th><th className="p-2 text-right">الباركود</th><th className="p-2 text-right">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-2"><Checkbox checked={sel.has(r.id)} onCheckedChange={(v) => setSel((s) => { const n = new Set(s); v ? n.add(r.id) : n.delete(r.id); return n; })} /></td>
                  <td className="p-2">{r.name}</td>
                  <td className="p-2 font-mono text-xs">{r.barcode ?? "—"}</td>
                  <td className="p-2">{linked.has(r.id) ? <Badge>مربوط</Badge> : <span className="text-xs text-muted-foreground">—</span>}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">لا نتائج</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">يعرض أول 200 نتيجة — استخدم البحث للتضييق.</p>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy || !sel.size} onClick={() => apply(false)}><Unlink className="h-4 w-4" />فك الربط ({sel.size})</Button>
          <Button disabled={busy || !sel.size} onClick={() => apply(true)}><Link2 className="h-4 w-4" />ربط بالنشاط ({sel.size})</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
