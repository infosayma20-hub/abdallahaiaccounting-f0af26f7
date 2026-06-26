import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSpartaContext } from "@/hooks/sparta/useSpartaContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Search, Users, FileText, Download } from "lucide-react";
import { SpartaPageHeader, SpartaKpiCard, SpartaKpiGrid, SpartaSurface, SpartaPill } from "@/components/sparta/SpartaUI";

interface Customer {
  id: string;
  code: string | null;
  name: string;
  clinic_name: string | null;
  doctor_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  credit_limit: number;
  balance: number;
  is_active: boolean;
}

const empty = {
  code: "", name: "", clinic_name: "", doctor_name: "",
  phone: "", email: "", city: "", address: "", tax_id: "",
  credit_limit: 0, notes: "",
};

export default function SpartaCustomersPage() {
  const nav = useNavigate();
  const { companyId, isAdmin } = useSpartaContext();
  const [rows, setRows] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("sparta_customers")
      .select("id, code, name, clinic_name, doctor_name, phone, email, city, credit_limit, balance, is_active")
      .eq("company_id", companyId)
      .order("name");
    if (error) toast.error(error.message);
    setRows((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { if (companyId) load(); }, [companyId]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((c) =>
      [c.name, c.clinic_name, c.doctor_name, c.phone, c.code, c.city]
        .some((v) => (v || "").toLowerCase().includes(t)),
    );
  }, [rows, q]);

  const create = async () => {
    if (!isAdmin) return toast.error("صلاحية مدير القابضة مطلوبة");
    if (!form.name.trim()) return toast.error("اسم العميل مطلوب");
    if (!companyId) return;
    const { error } = await supabase.from("sparta_customers").insert({
      ...form,
      company_id: companyId,
      code: form.code || null,
      clinic_name: form.clinic_name || null,
      doctor_name: form.doctor_name || null,
      phone: form.phone || null,
      email: form.email || null,
      city: form.city || null,
      address: form.address || null,
      tax_id: form.tax_id || null,
      notes: form.notes || null,
    });
    if (error) return toast.error(error.message);
    toast.success("تمت إضافة العميل");
    setOpen(false);
    setForm(empty);
    load();
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto" dir="rtl">
      <SpartaPageHeader
        eyebrow="§ 02 · سجلّ العملاء"
        title="العملاء — العيادات والأطباء"
        actions={
          <>
            <Button variant="outline" size="sm"><Download className="h-4 w-4 ml-1" /> تصدير Excel</Button>
            {isAdmin && <Button data-sparta-primary onClick={() => setOpen(true)}><Plus className="h-4 w-4 ml-1" /> عميل جديد</Button>}
          </>
        }
      />

      <SpartaKpiGrid>
        <SpartaKpiCard label="إجمالي العملاء" value={rows.length} sub="كلهم نشطون" />
        <SpartaKpiCard label="إجمالي الأرصدة" value={`${rows.reduce((s, r) => s + Number(r.balance || 0), 0).toFixed(0)} ₪`} sub="مدين على العملاء" accent />
        <SpartaKpiCard label="عدد العيادات" value={new Set(rows.map(r => r.clinic_name).filter(Boolean)).size} sub="عيادات فريدة" />
        <SpartaKpiCard label="تجاوزوا حد الائتمان" value={rows.filter(r => r.credit_limit > 0 && r.balance > r.credit_limit).length} sub="بحاجة متابعة" accent />
      </SpartaKpiGrid>

      <div className="relative max-w-md mb-3">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم/العيادة/الطبيب/الجوال..." className="pr-9" />
      </div>

      <SpartaSurface>
        <table className="w-full text-sm min-w-[800px]">
          <thead className="text-right">
            <tr>
              <th className="p-3">الكود</th>
              <th className="p-3">الاسم</th>
              <th className="p-3">العيادة</th>
              <th className="p-3">الطبيب</th>
              <th className="p-3">الجوال</th>
              <th className="p-3">المدينة</th>
              <th className="p-3">حد الائتمان</th>
              <th className="p-3">الرصيد</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">لا يوجد عملاء</td></tr>}
            {filtered.map((c) => {
              const over = c.credit_limit > 0 && c.balance > c.credit_limit;
              return (
                <tr key={c.id}>
                  <td className="p-3 text-muted-foreground">{c.code || "—"}</td>
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3">{c.clinic_name || "—"}</td>
                  <td className="p-3">{c.doctor_name || "—"}</td>
                  <td className="p-3 ltr-num" dir="ltr">{c.phone || "—"}</td>
                  <td className="p-3">{c.city || "—"}</td>
                  <td className="p-3">₪ {Number(c.credit_limit).toFixed(2)}</td>
                  <td className="p-3">
                    <SpartaPill bg={over ? "#FEE2E2" : c.balance > 0 ? "#FEF3C7" : "#DCFCE7"} fg={over ? "#991B1B" : c.balance > 0 ? "#92400E" : "#166534"}>
                      ₪ {Number(c.balance).toFixed(2)}
                    </SpartaPill>
                  </td>
                  <td className="p-3">
                    <Button size="sm" variant="ghost" onClick={() => nav(`/sparta/invoices?customer=${c.id}`)}>
                      <FileText className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SpartaSurface>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader><DialogTitle>عميل جديد</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>الكود</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div><Label>الاسم *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>اسم العيادة</Label><Input value={form.clinic_name} onChange={(e) => setForm({ ...form, clinic_name: e.target.value })} /></div>
            <div><Label>اسم الطبيب</Label><Input value={form.doctor_name} onChange={(e) => setForm({ ...form, doctor_name: e.target.value })} /></div>
            <div><Label>الجوال</Label><Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>البريد الإلكتروني</Label><Input dir="ltr" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>المدينة</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div><Label>الرقم الضريبي</Label><Input dir="ltr" value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} /></div>
            <div className="col-span-2"><Label>العنوان</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div><Label>حد الائتمان (₪)</Label><Input type="number" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: Number(e.target.value) })} /></div>
            <div className="col-span-2"><Label>ملاحظات</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={create}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}