import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, Pencil, Trash2, Search, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * Inventory Catalog Manager (Admin)
 * Lets admins manage the master list (branch / category / item / unit)
 * consumed by the "monthly_inventory" form renderer. No SQL required.
 */

const BRANCHES: { key: string; label: string }[] = [
  { key: "sufyan",   label: "سفيان" },
  { key: "faisal",   label: "فيصل" },
  { key: "ramallah", label: "رام الله" },
  { key: "central",  label: "المركزي" },
  { key: "taawon",   label: "تعاون" },
];

type Row = {
  id: string;
  branch_key: string;
  category: string;
  item_name: string;
  unit: string;
  sort_order: number;
  is_active: boolean;
};

const EMPTY_FORM = {
  id: "" as string | null,
  branch_key: "ramallah",
  category: "",
  item_name: "",
  unit: "",
  sort_order: 0,
  is_active: true,
};

export default function InventoryCatalogPage() {
  useEffect(() => {
    const prev = document.title;
    document.title = "كتالوج الجرد الشهري";
    return () => { document.title = prev; };
  }, []);
  const [branch, setBranch] = useState<string>("ramallah");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");

  const load = async (branchKey: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inventory_catalog_items")
      .select("id, branch_key, category, item_name, unit, sort_order, is_active")
      .eq("branch_key", branchKey)
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) toast({ title: "تعذر تحميل الكتالوج", description: error.message, variant: "destructive" });
    setRows((data || []) as Row[]);
    setLoading(false);
  };

  useEffect(() => { load(branch); }, [branch]);

  const filtered = useMemo(() => {
    const s = search.trim();
    if (!s) return rows;
    return rows.filter((r) =>
      r.item_name.includes(s) || r.category.includes(s) || r.unit.includes(s)
    );
  }, [rows, search]);

  const grouped = useMemo(() => {
    const m = new Map<string, Row[]>();
    filtered.forEach((r) => {
      const arr = m.get(r.category) || [];
      arr.push(r);
      m.set(r.category, arr);
    });
    return Array.from(m.entries());
  }, [filtered]);

  const stats = useMemo(() => {
    const cats = new Set(rows.map((r) => r.category));
    return { items: rows.length, categories: cats.size, active: rows.filter((r) => r.is_active).length };
  }, [rows]);

  const openCreate = () => {
    const maxSort = rows.reduce((m, r) => Math.max(m, r.sort_order || 0), 0);
    setForm({ ...EMPTY_FORM, branch_key: branch, sort_order: maxSort + 10 });
    setEditOpen(true);
  };
  const openEdit = (r: Row) => {
    setForm({
      id: r.id,
      branch_key: r.branch_key,
      category: r.category,
      item_name: r.item_name,
      unit: r.unit,
      sort_order: r.sort_order,
      is_active: r.is_active,
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!form.branch_key || !form.category.trim() || !form.item_name.trim()) {
      toast({ title: "أكمل الحقول المطلوبة (الفرع/التصنيف/الصنف)", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const branchLabel = BRANCHES.find((b) => b.key === form.branch_key)?.label || form.branch_key;
      const payload = {
        branch_key: form.branch_key,
        branch_name: branchLabel,
        category: form.category.trim(),
        item_name: form.item_name.trim(),
        unit: form.unit.trim() || "وحدة",
        sort_order: Number(form.sort_order) || 0,
        is_active: !!form.is_active,
      };
      if (form.id) {
        const { error } = await supabase
          .from("inventory_catalog_items")
          .update(payload)
          .eq("id", form.id);
        if (error) throw error;
        toast({ title: "تم حفظ التعديلات" });
      } else {
        const { error } = await supabase
          .from("inventory_catalog_items")
          .insert(payload);
        if (error) throw error;
        toast({ title: "تمت إضافة الصنف" });
      }
      setEditOpen(false);
      load(branch);
    } catch (e: any) {
      toast({ title: "تعذر الحفظ", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    const { error } = await supabase
      .from("inventory_catalog_items")
      .delete()
      .eq("id", confirmDeleteId);
    if (error) {
      toast({ title: "تعذر الحذف", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم الحذف" });
      setRows((prev) => prev.filter((r) => r.id !== confirmDeleteId));
    }
    setConfirmDeleteId(null);
  };

  /** Bulk-add lines via paste: each line = "اسم الصنف | الوحدة" or just "اسم الصنف". */
  const handleBulkAdd = async () => {
    if (!bulkCategory.trim()) {
      toast({ title: "اكتب اسم التصنيف", variant: "destructive" });
      return;
    }
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) {
      toast({ title: "ألصق الأصناف أولاً", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const startSort = rows
        .filter((r) => r.category === bulkCategory.trim())
        .reduce((m, r) => Math.max(m, r.sort_order || 0), 0);
      const branchLabel = BRANCHES.find((b) => b.key === branch)?.label || branch;
      const payload = lines.map((line, i) => {
        const [name, unit] = line.split("|").map((s) => s?.trim() ?? "");
        return {
          branch_key: branch,
          branch_name: branchLabel,
          category: bulkCategory.trim(),
          item_name: name,
          unit: unit || "وحدة",
          sort_order: startSort + (i + 1) * 10,
          is_active: true,
        };
      }).filter((r) => r.item_name);
      const { error } = await supabase
        .from("inventory_catalog_items")
        .insert(payload);
      if (error) throw error;
      toast({ title: `تمت إضافة ${payload.length} صنف` });
      setBulkOpen(false);
      setBulkText("");
      setBulkCategory("");
      load(branch);
    } catch (e: any) {
      toast({ title: "تعذر الإضافة الجماعية", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="container mx-auto p-4 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base sm:text-lg">كتالوج الجرد الشهري</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  أصناف ووحدات ثابتة لكل فرع — يستخدمها نموذج "جرد شهري" تلقائياً.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)} className="gap-1">
                  <Upload className="h-4 w-4" /> إضافة جماعية
                </Button>
                <Button size="sm" onClick={openCreate} className="gap-1">
                  <Plus className="h-4 w-4" /> صنف جديد
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">الفرع</Label>
                <Select value={branch} onValueChange={setBranch}>
                  <SelectTrigger className="h-10 text-right"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BRANCHES.map((b) => (
                      <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">بحث</Label>
                <div className="relative">
                  <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="اسم الصنف، التصنيف، الوحدة…"
                    className="pr-8 h-10 text-right"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-1 rounded-full bg-primary/10 text-primary">
                {stats.items} صنف
              </span>
              <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground">
                {stats.categories} تصنيف
              </span>
              <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
                {stats.active} مفعّل
              </span>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : grouped.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
            لا توجد أصناف. اضغط "صنف جديد" أو "إضافة جماعية" للبدء.
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {grouped.map(([cat, items]) => (
              <Card key={cat}>
                <CardHeader className="py-2 px-3 bg-muted/40">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>{cat}</span>
                    <span className="text-[11px] text-muted-foreground font-normal">{items.length} صنف</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground border-b">
                        <tr>
                          <th className="text-right p-2 font-medium">الصنف</th>
                          <th className="text-right p-2 font-medium">الوحدة</th>
                          <th className="text-right p-2 font-medium w-[80px]">ترتيب</th>
                          <th className="text-right p-2 font-medium w-[70px]">الحالة</th>
                          <th className="text-right p-2 font-medium w-[100px]">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((r) => (
                          <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-2">{r.item_name}</td>
                            <td className="p-2 text-muted-foreground">{r.unit}</td>
                            <td className="p-2 text-muted-foreground">{r.sort_order}</td>
                            <td className="p-2">
                              {r.is_active ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">مفعّل</span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">معطّل</span>
                              )}
                            </td>
                            <td className="p-2">
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => setConfirmDeleteId(r.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit / Create dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right">{form.id ? "تعديل صنف" : "إضافة صنف جديد"}</DialogTitle>
            <DialogDescription className="text-right text-xs">
              هذه الأصناف تظهر للمدير في نموذج الجرد الشهري حسب الفرع.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs">الفرع</Label>
              <Select value={form.branch_key} onValueChange={(v) => setForm({ ...form, branch_key: v })}>
                <SelectTrigger className="text-right h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BRANCHES.map((b) => (
                    <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">التصنيف</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="text-right h-10" placeholder="مثلاً: لحوم، خضار، تعبئة…" />
            </div>
            <div>
              <Label className="text-xs">اسم الصنف</Label>
              <Input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} className="text-right h-10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">الوحدة</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="text-right h-10" placeholder="كغم، علبة، حبة…" />
              </div>
              <div>
                <Label className="text-xs">ترتيب</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} className="text-right h-10" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              مفعّل (يظهر للمدير)
            </label>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk-add dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-right">إضافة جماعية للأصناف</DialogTitle>
            <DialogDescription className="text-right text-xs">
              الفرع الحالي: <b>{BRANCHES.find((b) => b.key === branch)?.label}</b>. سطر لكل صنف بصيغة: <code>اسم الصنف | الوحدة</code>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs">التصنيف</Label>
              <Input value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className="text-right h-10" placeholder="مثلاً: خضار" />
            </div>
            <div>
              <Label className="text-xs">الأصناف</Label>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={10}
                dir="rtl"
                className="w-full rounded-md border bg-background p-2 text-sm text-right font-mono"
                placeholder={"بندورة | كغم\nخيار | كغم\nبصل | كغم"}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(false)}>إلغاء</Button>
            <Button onClick={handleBulkAdd} disabled={saving} className="gap-1">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">حذف هذا الصنف؟</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              لن يظهر بعد الآن في نموذج الجرد. النماذج المرسلة سابقاً لن تتأثر.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}