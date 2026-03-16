import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Phone, MapPin, Edit, Eye } from "lucide-react";
import { useSuppliers, Supplier } from "@/hooks/useProcurement";
import { useNavigate } from "react-router-dom";
import BackButton from "@/components/BackButton";
import { Skeleton } from "@/components/ui/skeleton";

const SuppliersPage = () => {
  const { suppliers, loading, create, update } = useSuppliers();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", payment_terms: 30, opening_balance: 0, opening_balance_date: "", notes: "" });
  const navigate = useNavigate();

  const filtered = suppliers.filter(s =>
    s.name.includes(search) || s.phone?.includes(search)
  );

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", phone: "", address: "", payment_terms: 30, opening_balance: 0, opening_balance_date: "", notes: "" });
    setDialogOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name,
      phone: s.phone || "",
      address: s.address || "",
      payment_terms: s.payment_terms,
      opening_balance: s.opening_balance,
      opening_balance_date: s.opening_balance_date || "",
      notes: s.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const success = editing
      ? await update(editing.id, form)
      : await create(form);
    if (success) setDialogOpen(false);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-xl font-bold text-foreground">الموردون</h1>
          <Badge variant="secondary">{suppliers.length}</Badge>
        </div>
        <Button onClick={openNew} variant="accent">
          <Plus className="h-4 w-4 ml-1" />
          إضافة مورد
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="بحث بالاسم أو الهاتف..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pr-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <p className="text-lg font-medium">لا يوجد موردون</p>
              <p className="text-sm mt-1">ابدأ بإضافة أول مورد</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>اسم المورد</TableHead>
                  <TableHead>الهاتف</TableHead>
                  <TableHead>شروط الدفع</TableHead>
                  <TableHead>الرصيد الافتتاحي</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.phone || "—"}</TableCell>
                    <TableCell>{s.payment_terms} يوم</TableCell>
                    <TableCell>{Number(s.opening_balance).toLocaleString("en", { minimumFractionDigits: 2 })} ₪</TableCell>
                    <TableCell>
                      <Badge variant={s.is_active ? "default" : "secondary"}>
                        {s.is_active ? "نشط" : "غير نشط"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => navigate(`/procurement/suppliers/${s.id}`)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(s)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل المورد" : "إضافة مورد جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>اسم المورد *</Label>
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>رقم الهاتف</Label>
                <Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
              </div>
              <div>
                <Label>شروط الدفع (أيام)</Label>
                <Input type="number" value={form.payment_terms} onChange={e => setForm({...form, payment_terms: Number(e.target.value)})} />
              </div>
            </div>
            <div>
              <Label>العنوان</Label>
              <Input value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>الرصيد الافتتاحي</Label>
                <Input type="number" value={form.opening_balance} onChange={e => setForm({...form, opening_balance: Number(e.target.value)})} />
              </div>
              <div>
                <Label>تاريخ الرصيد</Label>
                <Input type="date" value={form.opening_balance_date} onChange={e => setForm({...form, opening_balance_date: e.target.value})} />
              </div>
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button variant="accent" onClick={handleSave}>{editing ? "حفظ" : "إضافة"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SuppliersPage;
