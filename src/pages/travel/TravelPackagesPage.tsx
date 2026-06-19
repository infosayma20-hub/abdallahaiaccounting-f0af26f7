import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit, Package, MapPin, Moon, DollarSign } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function TravelPackagesPage() {
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const navigate = useNavigate();
  const [packages, setPackages] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    name: "", type: "", destination: "", duration_nights: "",
    cost_per_person: "", selling_price_per_person: "",
    includes: "", excludes: "", valid_from: "", valid_to: "", description: "", terms: "",
  });

  useEffect(() => {
    if (!dataOwnerId) return;
    fetchPackages();
  }, [dataOwnerId]);

  const fetchPackages = async () => {
    if (!dataOwnerId) return;
    const { data } = await supabase.from("travel_packages").select("*").eq("user_id", dataOwnerId!).order("created_at", { ascending: false });
    if (data) setPackages(data);
  };

  const handleSave = async () => {
    if (!user || !form.name) return;
    const payload = {
      user_id: user.id,
      name: form.name,
      type: form.type || null,
      destination: form.destination || null,
      duration_nights: parseInt(form.duration_nights) || null,
      cost_per_person: parseFloat(form.cost_per_person) || 0,
      selling_price_per_person: parseFloat(form.selling_price_per_person) || 0,
      includes: form.includes ? form.includes.split("\n").filter(Boolean) : null,
      excludes: form.excludes ? form.excludes.split("\n").filter(Boolean) : null,
      valid_from: form.valid_from || null,
      valid_to: form.valid_to || null,
      description: form.description || null,
      terms: form.terms || null,
    };

    if (editing) {
      await supabase.from("travel_packages").update(payload).eq("id", editing.id);
      toast({ title: "تم تحديث الباقة ✅" });
    } else {
      await supabase.from("travel_packages").insert(payload);
      toast({ title: "تم إضافة الباقة ✅" });
    }
    setShowAdd(false);
    setEditing(null);
    fetchPackages();
  };

  const openEdit = (p: any) => {
    setEditing(p);
    setForm({
      name: p.name, type: p.type || "", destination: p.destination || "",
      duration_nights: String(p.duration_nights || ""),
      cost_per_person: String(p.cost_per_person || ""),
      selling_price_per_person: String(p.selling_price_per_person || ""),
      includes: (p.includes || []).join("\n"),
      excludes: (p.excludes || []).join("\n"),
      valid_from: p.valid_from || "", valid_to: p.valid_to || "",
      description: p.description || "", terms: p.terms || "",
    });
    setShowAdd(true);
  };

  const resetForm = () => setForm({ name: "", type: "", destination: "", duration_nights: "", cost_per_person: "", selling_price_per_person: "", includes: "", excludes: "", valid_from: "", valid_to: "", description: "", terms: "" });

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: "#1B3A5C" }}>📦 الباقات والعروض</h1>
        <Button onClick={() => { setEditing(null); resetForm(); setShowAdd(true); }} style={{ background: "#1B3A5C" }} className="text-white">
          <Plus className="w-4 h-4 ml-1" /> باقة جديدة
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {packages.map(p => {
          const profitPP = (p.selling_price_per_person || 0) - (p.cost_per_person || 0);
          return (
            <Card key={p.id} className="overflow-hidden">
              <div className="p-1.5" style={{ background: "#1B3A5C" }}>
                <span className="text-[10px] text-white/80">{p.type || "باقة"}</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <h3 className="font-bold text-sm">{p.name}</h3>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}><Edit className="w-3.5 h-3.5" /></Button>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {p.destination && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {p.destination}</span>}
                  {p.duration_nights && <span className="flex items-center gap-1"><Moon className="w-3 h-3" /> {p.duration_nights} ليالي</span>}
                </div>
                {p.includes && p.includes.length > 0 && (
                  <div className="text-xs space-y-0.5">
                    {p.includes.slice(0, 3).map((item: string, i: number) => (
                      <span key={i} className="block">✅ {item}</span>
                    ))}
                    {p.includes.length > 3 && <span className="text-muted-foreground">+{p.includes.length - 3} أخرى</span>}
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="text-xs">
                    <span className="text-muted-foreground">للفرد: </span>
                    <span className="font-bold">₪{(p.selling_price_per_person || 0).toLocaleString()}</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">ربح: </span>
                    <span className="font-bold" style={{ color: profitPP >= 0 ? "#16A34A" : "#DC2626" }}>₪{profitPP.toLocaleString()}</span>
                  </div>
                </div>
                {p.is_active && <Badge variant="success" className="text-[10px]">نشطة</Badge>}
                <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => navigate("/travel/bookings/new")}>
                  تحويل لحجز
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {packages.length === 0 && (
        <Card className="p-12 text-center"><p className="text-muted-foreground">لا توجد باقات بعد</p></Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل الباقة" : "باقة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>اسم الباقة *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder='مثال: باقة إسطنبول 7 ليالي' /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>النوع</Label><Input value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} placeholder="عمرة، شهر عسل..." /></div>
              <div><Label>الوجهة</Label><Input value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} /></div>
            </div>
            <div><Label>عدد الليالي</Label><Input type="number" value={form.duration_nights} onChange={e => setForm({ ...form, duration_nights: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>التكلفة للفرد (₪)</Label><Input type="number" value={form.cost_per_person} onChange={e => setForm({ ...form, cost_per_person: e.target.value })} /></div>
              <div><Label>سعر البيع للفرد (₪)</Label><Input type="number" value={form.selling_price_per_person} onChange={e => setForm({ ...form, selling_price_per_person: e.target.value })} /></div>
            </div>
            <div><Label>يشمل (سطر لكل بند)</Label><Textarea value={form.includes} onChange={e => setForm({ ...form, includes: e.target.value })} placeholder="تذكرة ذهاب وإياب&#10;فندق 4 نجوم&#10;إفطار يومي" rows={3} /></div>
            <div><Label>لا يشمل</Label><Textarea value={form.excludes} onChange={e => setForm({ ...form, excludes: e.target.value })} rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>صالحة من</Label><Input type="date" value={form.valid_from} onChange={e => setForm({ ...form, valid_from: e.target.value })} /></div>
              <div><Label>صالحة حتى</Label><Input type="date" value={form.valid_to} onChange={e => setForm({ ...form, valid_to: e.target.value })} /></div>
            </div>
            <div><Label>الوصف</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            <Button onClick={handleSave} className="w-full text-white" style={{ background: "#1B3A5C" }}>{editing ? "تحديث" : "إضافة"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
