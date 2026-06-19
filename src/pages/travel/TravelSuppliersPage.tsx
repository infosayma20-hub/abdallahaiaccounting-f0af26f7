import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit, Search, Phone, Mail, Globe } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

const SUPPLIER_SUBTYPES: Record<string, string> = {
  airline: "شركة طيران",
  hotel_chain: "سلسلة فنادق",
  ground_operator: "مشغل أرضي",
  visa_agency: "وكالة تأشيرات",
  insurance_company: "شركة تأمين",
  transport: "شركة نقل",
  general: "مورد عام",
};

export default function TravelSuppliersPage() {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    contact_name: "", phone: "", email: "", country: "",
    sub_type: "general", notes: "",
  });

  useEffect(() => {
    if (!user) return;
    fetchSuppliers();
  }, [user]);

  const fetchSuppliers = async () => {
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("contact_type", "supplier")
      .order("contact_name");
    if (data) setSuppliers(data);
  };

  const handleSave = async () => {
    if (!user || !form.contact_name) return;
    const payload: any = {
      user_id: dataOwnerId!,
      contact_type: "supplier",
      contact_name: form.contact_name,
      phone: form.phone || null,
      email: form.email || null,
      country: form.country || null,
      notes: form.notes || null,
    };

    if (editing) {
      await supabase.from("contacts").update(payload).eq("id", editing.id);
      toast({ title: "تم تحديث المورد ✅" });
    } else {
      await supabase.from("contacts").insert(payload);
      toast({ title: "تم إضافة المورد ✅" });
    }
    setShowAdd(false);
    setEditing(null);
    resetForm();
    fetchSuppliers();
  };

  const openEdit = (s: any) => {
    setEditing(s);
    setForm({
      contact_name: s.contact_name || "",
      phone: s.phone || "",
      email: s.email || "",
      country: s.country || "",
      sub_type: "general",
      notes: s.notes || "",
    });
    setShowAdd(true);
  };

  const resetForm = () => setForm({
    contact_name: "", phone: "", email: "", country: "",
    sub_type: "general", notes: "",
  });

  const filtered = suppliers.filter(s =>
    !search || s.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.phone?.includes(search) || s.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold" style={{ color: "#1B3A5C" }}>🤝 الموردون</h1>
        <Button onClick={() => { setEditing(null); resetForm(); setShowAdd(true); }} style={{ background: "#1B3A5C" }} className="text-white">
          <Plus className="w-4 h-4 ml-1" /> مورد جديد
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="بحث بالاسم أو الهاتف..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(s => (
          <Card key={s.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{s.contact_name}</h3>
                <Badge variant="outline" className="text-[10px] mt-1">مورد سفر</Badge>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                <Edit className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              {s.phone && (
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3 h-3" /> {s.phone}
                </div>
              )}
              {s.email && (
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3 h-3" /> {s.email}
                </div>
              )}
              {s.country && (
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3 h-3" /> {s.country}
                </div>
              )}
            </div>
            {s.notes && <p className="text-xs text-muted-foreground border-t pt-2">{s.notes}</p>}
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">
            {search ? "لا توجد نتائج للبحث" : "لا يوجد موردون بعد — أضف أول مورد!"}
          </p>
        </Card>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل المورد" : "مورد جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>اسم المورد *</Label>
              <Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} placeholder="مثال: شركة الطيران الأردنية" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>الهاتف</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+970..." />
              </div>
              <div>
                <Label>البريد الإلكتروني</Label>
                <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>البلد</Label>
              <Input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} placeholder="الأردن، تركيا..." />
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <Button onClick={handleSave} className="w-full text-white" style={{ background: "#1B3A5C" }}>
              {editing ? "تحديث" : "إضافة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
