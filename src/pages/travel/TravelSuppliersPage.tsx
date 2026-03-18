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
import { Plus, Edit, DollarSign } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const TYPE_LABELS: Record<string, string> = {
  airline: "شركة طيران", hotel: "فندق", visa_agency: "وكالة تأشيرات",
  ground_operator: "مشغل أرضي", other: "أخرى",
};

export default function TravelSuppliersPage() {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", type: "airline", country: "", currency: "ILS", commission_rate: "0", payment_terms: "prepaid", contact_name: "", contact_phone: "", contact_email: "", notes: "" });

  useEffect(() => {
    if (!user) return;
    fetchSuppliers();
  }, [user]);

  const fetchSuppliers = async () => {
    const { data } = await supabase.from("travel_suppliers").select("*").order("name");
    if (data) setSuppliers(data);
  };

  const handleSave = async () => {
    if (!user || !form.name) return;
    const payload = {
      user_id: user.id,
      name: form.name,
      type: form.type,
      country: form.country || null,
      currency: form.currency,
      commission_rate: parseFloat(form.commission_rate) || 0,
      payment_terms: form.payment_terms || null,
      contact_name: form.contact_name || null,
      contact_phone: form.contact_phone || null,
      contact_email: form.contact_email || null,
      notes: form.notes || null,
    };

    if (editing) {
      await supabase.from("travel_suppliers").update(payload).eq("id", editing.id);
      toast({ title: "تم تحديث المورد ✅" });
    } else {
      await supabase.from("travel_suppliers").insert(payload);
      toast({ title: "تم إضافة المورد ✅" });
    }
    setShowAdd(false);
    setEditing(null);
    setForm({ name: "", type: "airline", country: "", currency: "ILS", commission_rate: "0", payment_terms: "prepaid", contact_name: "", contact_phone: "", contact_email: "", notes: "" });
    fetchSuppliers();
  };

  const openEdit = (s: any) => {
    setEditing(s);
    setForm({
      name: s.name, type: s.type || "airline", country: s.country || "",
      currency: s.currency || "ILS", commission_rate: String(s.commission_rate || 0),
      payment_terms: s.payment_terms || "prepaid",
      contact_name: s.contact_name || "", contact_phone: s.contact_phone || "",
      contact_email: s.contact_email || "", notes: s.notes || "",
    });
    setShowAdd(true);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: "#1B3A5C" }}>🤝 الموردون</h1>
        <Button onClick={() => { setEditing(null); setForm({ name: "", type: "airline", country: "", currency: "ILS", commission_rate: "0", payment_terms: "prepaid", contact_name: "", contact_phone: "", contact_email: "", notes: "" }); setShowAdd(true); }} style={{ background: "#1B3A5C" }} className="text-white">
          <Plus className="w-4 h-4 ml-1" /> مورد جديد
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {suppliers.map(s => (
          <Card key={s.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{s.name}</h3>
                <Badge variant="outline" className="text-[10px] mt-1">{TYPE_LABELS[s.type] || s.type}</Badge>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Edit className="w-3.5 h-3.5" /></Button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>البلد: {s.country || "—"}</div>
              <div>العملة: {s.currency}</div>
              <div>العمولة: {s.commission_rate}%</div>
              <div>الدفع: {s.payment_terms === "prepaid" ? "مسبق" : s.payment_terms === "credit_30" ? "30 يوم" : s.payment_terms === "credit_60" ? "60 يوم" : s.payment_terms || "—"}</div>
            </div>
            {s.contact_name && <p className="text-xs">👤 {s.contact_name} {s.contact_phone ? `| ${s.contact_phone}` : ""}</p>}
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-xs text-muted-foreground">الرصيد المستحق</span>
              <span className="font-bold text-sm" style={{ color: (s.balance || 0) > 0 ? "#DC2626" : "#16A34A" }}>
                ₪{(s.balance || 0).toLocaleString()}
              </span>
            </div>
          </Card>
        ))}
      </div>

      {suppliers.length === 0 && (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">لا يوجد موردون بعد — أضف أول مورد!</p>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل المورد" : "مورد جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>اسم المورد *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>النوع</Label>
                <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>البلد</Label><Input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>العملة</Label>
                <Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ILS">₪ شيكل</SelectItem>
                    <SelectItem value="USD">$ دولار</SelectItem>
                    <SelectItem value="JOD">د.أ دينار</SelectItem>
                    <SelectItem value="EUR">€ يورو</SelectItem>
                    <SelectItem value="TRY">₺ ليرة تركية</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>نسبة العمولة %</Label><Input type="number" value={form.commission_rate} onChange={e => setForm({ ...form, commission_rate: e.target.value })} /></div>
            </div>
            <div>
              <Label>شروط الدفع</Label>
              <Select value={form.payment_terms} onValueChange={v => setForm({ ...form, payment_terms: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prepaid">دفع مسبق</SelectItem>
                  <SelectItem value="credit_30">آجل 30 يوم</SelectItem>
                  <SelectItem value="credit_60">آجل 60 يوم</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>اسم جهة الاتصال</Label><Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>الهاتف</Label><Input value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} /></div>
              <div><Label>البريد</Label><Input value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} /></div>
            </div>
            <Button onClick={handleSave} className="w-full text-white" style={{ background: "#1B3A5C" }}>{editing ? "تحديث" : "إضافة"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
