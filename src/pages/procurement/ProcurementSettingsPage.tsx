import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Pencil, Trash2, GripVertical, Package, Wheat, Egg, Beef, Droplets, Sparkles, CupSoda, UtensilsCrossed, SprayCan, Shirt, ShoppingCart, Cookie, Flame, Snowflake, Leaf, Fish, Apple, Layers, Box } from "lucide-react";
import { useSuppliersCrud, useCategoriesCrud, useItemsCrud } from "@/hooks/useProcurementSettings";
import BackButton from "@/components/BackButton";
import { multiWordMatchAny } from "@/lib/utils";

const iconOptions = [
  { name: "wheat", Icon: Wheat }, { name: "package", Icon: Package }, { name: "beef", Icon: Beef },
  { name: "droplets", Icon: Droplets }, { name: "sparkles", Icon: Sparkles }, { name: "cup-soda", Icon: CupSoda },
  { name: "utensils", Icon: UtensilsCrossed }, { name: "spray-can", Icon: SprayCan }, { name: "shirt", Icon: Shirt },
  { name: "egg", Icon: Egg }, { name: "box", Icon: Box }, { name: "shopping-cart", Icon: ShoppingCart },
  { name: "cookie", Icon: Cookie }, { name: "flame", Icon: Flame }, { name: "snowflake", Icon: Snowflake },
  { name: "leaf", Icon: Leaf }, { name: "fish", Icon: Fish }, { name: "apple", Icon: Apple }, { name: "layers", Icon: Layers },
];

const presetColors = ["#4A9EE8","#FFFFFF","#E74C3C","#E67E22","#9B59B6","#3498DB","#27AE60","#1ABC9C","#2ECC71","#95A5A6"];
const commonUnits = ["كيلو","كرتون","علبة","رول","لتر","قطعة","شوال","رزمة","عدد","جالون","سطل","دفتر","عبوة","ألف حبة"];

// ══════════ SUPPLIERS TAB ══════════
function SuppliersTab() {
  const { suppliers, loading, create, update, remove, deactivate } = useSuppliersCrud();
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", payment_terms_days: 30, opening_balance: 0, opening_balance_date: "", is_active: true, notes: "" });
  const [deleteDialog, setDeleteDialog] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const filtered = suppliers.filter(s => !search || multiWordMatchAny(search, s.name, s.phone));

  const openNew = () => { setEditing(null); setForm({ name: "", phone: "", address: "", payment_terms_days: 30, opening_balance: 0, opening_balance_date: "", is_active: true, notes: "" }); setDrawerOpen(true); };
  const openEdit = (s: any) => { setEditing(s); setForm({ name: s.name || "", phone: s.phone || "", address: s.address || "", payment_terms_days: s.payment_terms_days || 30, opening_balance: s.opening_balance || 0, opening_balance_date: s.opening_balance_date || "", is_active: s.is_active !== false, notes: s.notes || "" }); setDrawerOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    if (editing) await update(editing.id, form);
    else await create(form);
    setSaving(false);
    setDrawerOpen(false);
  };

  const handleDelete = async (s: any) => {
    const result = await remove(s.id);
    if (result === "has_data") setDeleteDialog(s);
    else setDeleteDialog(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث عن مورد..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
        </div>
        <Button onClick={openNew} className="bg-[hsl(43,50%,54%)] hover:bg-[hsl(43,50%,45%)] text-white">
          <Plus className="h-4 w-4 ml-1" />إضافة مورد
        </Button>
      </div>

      <Table>
        <TableHeader><TableRow>
          <TableHead>الاسم</TableHead><TableHead>الهاتف</TableHead><TableHead>شروط الدفع</TableHead>
          <TableHead>الرصيد الافتتاحي</TableHead><TableHead>الحالة</TableHead><TableHead>إجراءات</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {filtered.map(s => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell>{s.phone || "—"}</TableCell>
              <TableCell>{s.payment_terms_days || 30} يوم</TableCell>
              <TableCell>{Number(s.opening_balance || 0).toFixed(2)} ₪</TableCell>
              <TableCell>
                {s.is_active === false
                  ? <Badge variant="secondary" className="text-[10px]">موقوف</Badge>
                  : <Badge className="bg-green-500/10 text-green-600 text-[10px] border-green-500/30">نشط</Badge>}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(s)}><Pencil className="h-3 w-3 ml-1" />تعديل</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => handleDelete(s)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">لا يوجد موردون</TableCell></TableRow>}
        </TableBody>
      </Table>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-[400px] sm:w-[450px]" dir="rtl">
          <SheetHeader><SheetTitle>{editing ? "تعديل المورد" : "إضافة مورد جديد"}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div><Label>اسم المورد *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div><Label>رقم الهاتف</Label><Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
            <div><Label>العنوان</Label><Textarea value={form.address} onChange={e => setForm({...form, address: e.target.value})} rows={2} /></div>
            <div><Label>شروط الدفع بالأيام</Label><Input type="number" value={form.payment_terms_days} onChange={e => setForm({...form, payment_terms_days: Number(e.target.value)})} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>الرصيد الافتتاحي</Label><Input type="number" value={form.opening_balance || ""} onChange={e => setForm({...form, opening_balance: Number(e.target.value)})} /></div>
              <div><Label>تاريخ الرصيد</Label><Input type="date" value={form.opening_balance_date} onChange={e => setForm({...form, opening_balance_date: e.target.value})} /></div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={v => setForm({...form, is_active: v})} /><Label>نشط</Label></div>
            <div><Label>ملاحظات</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} /></div>
            <div className="flex gap-2 pt-4">
              <Button className="flex-1" onClick={handleSave} disabled={saving || !form.name.trim()}>حفظ المورد</Button>
              <Button variant="outline" onClick={() => setDrawerOpen(false)}>إلغاء</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>لا يمكن حذف المورد</DialogTitle>
          <DialogDescription>المورد "{deleteDialog?.name}" مرتبط بطلبيات أو فواتير. هل تريد تعطيله بدلاً من حذفه؟</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteDialog(null)}>إلغاء</Button>
            <Button variant="outline" onClick={() => { deactivate(deleteDialog.id); setDeleteDialog(null); }}>تعطيل المورد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════ CATEGORIES TAB ══════════
function CategoriesTab() {
  const { categories, create, update, remove, moveItemsAndDelete } = useCategoriesCrud();
  const { items } = useItemsCrud();
  const [editCat, setEditCat] = useState<any>(null);
  const [form, setForm] = useState({ name: "", color: "#4A9EE8", icon: "package" });
  const [deleteDialog, setDeleteDialog] = useState<any>(null);
  const [targetCatId, setTargetCatId] = useState("");

  const catItemCount = (catId: string) => items.filter(i => i.category_id === catId).length;

  const openNew = () => { setEditCat("new"); setForm({ name: "", color: "#4A9EE8", icon: "package" }); };
  const openEdit = (c: any) => { setEditCat(c); setForm({ name: c.name, color: c.color || "#4A9EE8", icon: c.icon || "package" }); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (editCat === "new") await create(form);
    else await update(editCat.id, form);
    setEditCat(null);
  };

  const handleDelete = async (c: any) => {
    const count = catItemCount(c.id);
    if (count > 0) { setDeleteDialog(c); return; }
    await remove(c.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew} className="bg-[hsl(43,50%,54%)] hover:bg-[hsl(43,50%,45%)] text-white"><Plus className="h-4 w-4 ml-1" />إضافة تصنيف</Button>
      </div>

      <div className="space-y-1">
        {categories.map(c => {
          const count = catItemCount(c.id);
          const isEditing = editCat?.id === c.id;
          const CatIcon = iconOptions.find(i => i.name === c.icon)?.Icon || Package;
          return (
            <div key={c.id} className="border border-border/50 rounded-lg">
              <div className="flex items-center gap-3 px-4 py-3">
                <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab" />
                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: c.color || "#6b7280" }} />
                <CatIcon className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm flex-1">{c.name}</span>
                <Badge variant="secondary" className="text-[10px]">{count} صنف</Badge>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => openEdit(c)}><Pencil className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => handleDelete(c)}><Trash2 className="h-3 w-3" /></Button>
              </div>
              {isEditing && (
                <div className="px-4 pb-3 pt-1 border-t border-border/50 space-y-3">
                  <div><Label>اسم التصنيف *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
                  <div><Label>اللون</Label>
                    <div className="flex gap-1.5 mt-1">{presetColors.map(c => (
                      <button key={c} className={`h-6 w-6 rounded-full border-2 ${form.color === c ? "border-foreground" : "border-transparent"}`} style={{ backgroundColor: c }} onClick={() => setForm({...form, color: c})} />
                    ))}</div>
                  </div>
                  <div><Label>الأيقونة</Label>
                    <div className="flex flex-wrap gap-1.5 mt-1">{iconOptions.map(({ name, Icon }) => (
                      <button key={name} className={`h-8 w-8 rounded border flex items-center justify-center ${form.icon === name ? "border-accent bg-accent/10" : "border-border"}`} onClick={() => setForm({...form, icon: name})}>
                        <Icon className="h-4 w-4" />
                      </button>
                    ))}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSave} disabled={!form.name.trim()}>حفظ</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditCat(null)}>إلغاء</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editCat === "new" && (
        <div className="border border-accent rounded-lg p-4 space-y-3">
          <div><Label>اسم التصنيف *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} autoFocus /></div>
          <div><Label>اللون</Label>
            <div className="flex gap-1.5 mt-1">{presetColors.map(c => (
              <button key={c} className={`h-6 w-6 rounded-full border-2 ${form.color === c ? "border-foreground" : "border-transparent"}`} style={{ backgroundColor: c }} onClick={() => setForm({...form, color: c})} />
            ))}</div>
          </div>
          <div><Label>الأيقونة</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">{iconOptions.map(({ name, Icon }) => (
              <button key={name} className={`h-8 w-8 rounded border flex items-center justify-center ${form.icon === name ? "border-accent bg-accent/10" : "border-border"}`} onClick={() => setForm({...form, icon: name})}>
                <Icon className="h-4 w-4" />
              </button>
            ))}</div>
          </div>
          <div className="flex gap-2"><Button size="sm" onClick={handleSave} disabled={!form.name.trim()}>حفظ التصنيف</Button><Button size="sm" variant="ghost" onClick={() => setEditCat(null)}>إلغاء</Button></div>
        </div>
      )}

      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>التصنيف يحتوي على أصناف</DialogTitle>
          <DialogDescription>التصنيف "{deleteDialog?.name}" يحتوي على {catItemCount(deleteDialog?.id || "")} صنف. اختر تصنيفاً بديلاً لنقلهم:</DialogDescription></DialogHeader>
          <Select value={targetCatId} onValueChange={setTargetCatId}>
            <SelectTrigger><SelectValue placeholder="اختر تصنيفاً بديلاً" /></SelectTrigger>
            <SelectContent>{categories.filter(c => c.id !== deleteDialog?.id).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteDialog(null)}>إلغاء</Button>
            <Button variant="destructive" disabled={!targetCatId} onClick={() => { moveItemsAndDelete(deleteDialog.id, targetCatId); setDeleteDialog(null); setTargetCatId(""); }}>نقل وحذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════ ITEMS TAB ══════════
function ItemsTab() {
  const { items, loading, create, update, remove, toggleActive, bulkChangeCategory, bulkToggleActive } = useItemsCrud();
  const { categories } = useCategoriesCrud();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", category_id: "", unit: "قطعة", default_price: 0, notes: "", is_active: true });
  const [deleteDialog, setDeleteDialog] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saveAndAdd, setSaveAndAdd] = useState(false);

  const filtered = items.filter(i => {
    if (catFilter !== "all" && i.category_id !== catFilter) return false;
    if (statusFilter === "active" && !i.is_active) return false;
    if (statusFilter === "inactive" && i.is_active) return false;
    if (search && !i.name?.includes(search)) return false;
    return true;
  });

  const openNew = () => { setEditing(null); setForm({ name: "", category_id: categories[0]?.id || "", unit: "قطعة", default_price: 0, notes: "", is_active: true }); setDrawerOpen(true); };
  const openEdit = (item: any) => { setEditing(item); setForm({ name: item.name, category_id: item.category_id || "", unit: item.unit, default_price: Number(item.default_price) || 0, notes: item.notes || "", is_active: item.is_active }); setDrawerOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim() || !form.category_id) return;
    setSaving(true);
    let ok;
    if (editing) ok = await update(editing.id, form);
    else ok = await create(form);
    setSaving(false);
    if (ok && saveAndAdd) {
      setForm({ name: "", category_id: form.category_id, unit: "قطعة", default_price: 0, notes: "", is_active: true });
      setEditing(null);
      setSaveAndAdd(false);
    } else if (ok) setDrawerOpen(false);
  };

  const handleDelete = async (item: any) => {
    const result = await remove(item.id);
    if (result === "in_pending_orders") setDeleteDialog(item);
    else setDeleteDialog(null);
  };

  const toggleSelectAll = () => {
    if (selected.length === filtered.length) setSelected([]);
    else setSelected(filtered.map(i => i.id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث عن صنف..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="التصنيف" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل التصنيفات</SelectItem>
            {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="active">نشط</SelectItem>
            <SelectItem value="inactive">موقوف</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={openNew} className="bg-[hsl(43,50%,54%)] hover:bg-[hsl(43,50%,45%)] text-white"><Plus className="h-4 w-4 ml-1" />إضافة صنف</Button>
      </div>

      {selected.length > 0 && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-accent/10 border border-accent/30">
          <span className="text-sm">محدد: {selected.length}</span>
          <Select onValueChange={v => { bulkChangeCategory(selected, v); setSelected([]); }}>
            <SelectTrigger className="w-40 h-8"><SelectValue placeholder="تغيير التصنيف" /></SelectTrigger>
            <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8" onClick={() => { bulkToggleActive(selected, true); setSelected([]); }}>تفعيل</Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => { bulkToggleActive(selected, false); setSelected([]); }}>تعطيل</Button>
        </div>
      )}

      <Table>
        <TableHeader><TableRow>
          <TableHead className="w-8"><Checkbox checked={selected.length === filtered.length && filtered.length > 0} onCheckedChange={toggleSelectAll} /></TableHead>
          <TableHead>الصنف</TableHead><TableHead>التصنيف</TableHead><TableHead>الوحدة</TableHead>
          <TableHead>السعر الافتراضي</TableHead><TableHead>الحالة</TableHead><TableHead>إجراءات</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {filtered.map(item => (
            <TableRow key={item.id}>
              <TableCell><Checkbox checked={selected.includes(item.id)} onCheckedChange={v => setSelected(v ? [...selected, item.id] : selected.filter(s => s !== item.id))} /></TableCell>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.item_categories?.color || "#6b7280" }} />
                  <span className="text-xs">{item.item_categories?.name || "—"}</span>
                </div>
              </TableCell>
              <TableCell>{item.unit}</TableCell>
              <TableCell className={Number(item.default_price) === 0 ? "text-orange-500" : ""}>{Number(item.default_price).toFixed(2)} ₪</TableCell>
              <TableCell>
                {item.is_active
                  ? <Badge className="bg-green-500/10 text-green-600 text-[10px] border-green-500/30">نشط</Badge>
                  : <Badge variant="secondary" className="text-[10px]">موقوف</Badge>}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(item)}><Pencil className="h-3 w-3 ml-1" />تعديل</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleActive(item.id, !item.is_active)}>{item.is_active ? "تعطيل" : "تفعيل"}</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => handleDelete(item)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد أصناف</TableCell></TableRow>}
        </TableBody>
      </Table>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-[400px] sm:w-[450px]" dir="rtl">
          <SheetHeader><SheetTitle>{editing ? "تعديل الصنف" : "إضافة صنف جديد"}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div><Label>اسم الصنف *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} autoFocus /></div>
            <div><Label>التصنيف *</Label>
              <Select value={form.category_id} onValueChange={v => setForm({...form, category_id: v})}>
                <SelectTrigger><SelectValue placeholder="اختر تصنيفاً" /></SelectTrigger>
                <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>الوحدة *</Label>
              <Select value={form.unit} onValueChange={v => setForm({...form, unit: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{commonUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>السعر الافتراضي</Label><Input type="number" value={form.default_price || ""} onChange={e => setForm({...form, default_price: Number(e.target.value)})} /></div>
            <div><Label>ملاحظات</Label><Input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={v => setForm({...form, is_active: v})} /><Label>نشط</Label></div>
            <div className="flex gap-2 pt-4">
              <Button className="flex-1" onClick={() => { setSaveAndAdd(false); handleSave(); }} disabled={saving || !form.name.trim() || !form.category_id}>حفظ الصنف</Button>
              {!editing && <Button variant="outline" onClick={() => { setSaveAndAdd(true); handleSave(); }} disabled={saving || !form.name.trim() || !form.category_id}>حفظ وإضافة آخر</Button>}
              <Button variant="ghost" onClick={() => setDrawerOpen(false)}>إلغاء</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>الصنف مستخدم في طلبيات معلقة</DialogTitle>
          <DialogDescription>الصنف "{deleteDialog?.name}" مستخدم في طلبيات معلقة. هل تريد تعطيله بدلاً من حذفه؟</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteDialog(null)}>إلغاء</Button>
            <Button variant="outline" onClick={() => { toggleActive(deleteDialog.id, false); setDeleteDialog(null); }}>تعطيل</Button>
            <Button variant="destructive" onClick={async () => { await remove(deleteDialog.id); setDeleteDialog(null); }}>حذف نهائياً</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════ MAIN PAGE ══════════
const ProcurementSettingsPage = () => {
  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      <div className="flex items-center gap-3">
        <BackButton />
        <h1 className="text-xl font-bold text-foreground">إعدادات المشتريات</h1>
      </div>

      <Tabs defaultValue="suppliers" dir="rtl">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="suppliers">الموردون</TabsTrigger>
          <TabsTrigger value="categories">التصنيفات</TabsTrigger>
          <TabsTrigger value="items">الأصناف</TabsTrigger>
        </TabsList>
        <TabsContent value="suppliers"><SuppliersTab /></TabsContent>
        <TabsContent value="categories"><CategoriesTab /></TabsContent>
        <TabsContent value="items"><ItemsTab /></TabsContent>
      </Tabs>
    </div>
  );
};

export default ProcurementSettingsPage;
