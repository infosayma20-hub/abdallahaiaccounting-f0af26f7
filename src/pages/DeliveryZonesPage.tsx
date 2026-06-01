import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MapPin, Plus, Search, Pencil, Power, PowerOff } from "lucide-react";

interface Zone {
  id: string;
  city: string;
  area_name: string;
  branch_id: string;
  branch_name: string;
  price: number;
  is_active: boolean;
}

interface Branch {
  id: string;
  name: string;
}

export default function DeliveryZonesPage() {
  const dataOwnerId = useDataOwnerId();
  const [zones, setZones] = useState<Zone[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);

  const [editing, setEditing] = useState<Zone | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    const [{ data: zs }, { data: bs }] = await Promise.all([
      supabase
        .from("delivery_zones" as any)
        .select("id, city, area_name, branch_id, branch_name, price, is_active")
        .eq("user_id", dataOwnerId)
        .order("city")
        .order("area_name"),
      supabase
        .from("branches")
        .select("id, name")
        .eq("user_id", dataOwnerId)
        .eq("is_active", true),
    ]);
    setZones(((zs as any) || []) as Zone[]);
    setBranches(((bs as any) || []) as Branch[]);
    setLoading(false);
  }, [dataOwnerId]);

  useEffect(() => { load(); }, [load]);

  const cities = useMemo(() => Array.from(new Set(zones.map(z => z.city))).sort(), [zones]);

  const filtered = useMemo(() => {
    return zones.filter(z =>
      (showInactive || z.is_active) &&
      (cityFilter === "all" || z.city === cityFilter) &&
      (branchFilter === "all" || z.branch_id === branchFilter) &&
      (!search.trim() || z.area_name.includes(search.trim()) || z.city.includes(search.trim()))
    );
  }, [zones, search, cityFilter, branchFilter, showInactive]);

  const toggleActive = async (z: Zone) => {
    const { error } = await supabase
      .from("delivery_zones" as any)
      .update({ is_active: !z.is_active } as any)
      .eq("id", z.id);
    if (error) return toast.error("فشل التحديث: " + error.message);
    toast.success(z.is_active ? "تم التعطيل" : "تم التفعيل");
    load();
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <MapPin className="h-5 w-5 text-orange-500" />
          إدارة مناطق التوصيل
        </h1>
        <Button onClick={() => setAdding(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> إضافة منطقة
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-3 mb-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث عن منطقة أو مدينة..."
              className="h-9 pr-8"
            />
          </div>
          <select value={cityFilter} onChange={e => setCityFilter(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm">
            <option value="all">كل المدن</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm">
            <option value="all">كل الفروع</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            عرض المعطّلة
          </label>
          <Badge variant="outline" className="ml-auto">{filtered.length} منطقة</Badge>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">لا توجد مناطق</div>
        ) : (
          <div className="divide-y divide-border">
            <div className="grid grid-cols-[1fr_1.5fr_1.5fr_80px_80px_70px] gap-2 px-3 py-2 bg-muted/40 text-[11px] font-bold text-muted-foreground">
              <div>المدينة</div>
              <div>المنطقة</div>
              <div>الفرع</div>
              <div className="text-left">السعر</div>
              <div>الحالة</div>
              <div></div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {filtered.map(z => (
                <div key={z.id} className={`grid grid-cols-[1fr_1.5fr_1.5fr_80px_80px_70px] gap-2 px-3 py-1.5 items-center text-xs ${!z.is_active ? "opacity-50" : ""}`}>
                  <div>{z.city}</div>
                  <div className="font-semibold">{z.area_name}</div>
                  <div>{z.branch_name}</div>
                  <div className="font-mono text-left">₪{Number(z.price).toFixed(2)}</div>
                  <div>
                    <Badge className={z.is_active ? "bg-green-600" : "bg-gray-400"}>
                      {z.is_active ? "مفعّلة" : "معطّلة"}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(z)} title="تعديل">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleActive(z)} title={z.is_active ? "تعطيل" : "تفعيل"}>
                      {z.is_active ? <PowerOff className="h-3.5 w-3.5 text-red-500" /> : <Power className="h-3.5 w-3.5 text-green-600" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {editing && (
        <ZoneEditDialog
          zone={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {adding && dataOwnerId && (
        <ZoneAddDialog
          dataOwnerId={dataOwnerId}
          branches={branches}
          cities={cities}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); load(); }}
        />
      )}
    </div>
  );
}

function ZoneEditDialog({ zone, onClose, onSaved }: { zone: Zone; onClose: () => void; onSaved: () => void }) {
  const [price, setPrice] = useState(String(zone.price));
  const [areaName, setAreaName] = useState(zone.area_name);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const p = parseFloat(price);
    if (isNaN(p) || p < 0) return toast.error("سعر غير صالح");
    if (!areaName.trim()) return toast.error("اسم المنطقة مطلوب");
    setSaving(true);
    const { error } = await supabase
      .from("delivery_zones" as any)
      .update({ price: p, area_name: areaName.trim() } as any)
      .eq("id", zone.id);
    setSaving(false);
    if (error) {
      if (error.message?.includes("duplicate")) toast.error("منطقة مكررة لهذا الفرع");
      else toast.error("فشل الحفظ: " + error.message);
      return;
    }
    toast.success("تم الحفظ");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل منطقة التوصيل</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">المدينة</label>
            <Input value={zone.city} disabled className="h-9 mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium">الفرع</label>
            <Input value={zone.branch_name} disabled className="h-9 mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium">اسم المنطقة</label>
            <Input value={areaName} onChange={e => setAreaName(e.target.value)} className="h-9 mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium">السعر (₪)</label>
            <Input type="number" step="0.5" value={price} onChange={e => setPrice(e.target.value)} className="h-9 mt-1 text-left" dir="ltr" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? "جاري الحفظ..." : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ZoneAddDialog({ dataOwnerId, branches, cities, onClose, onSaved }: {
  dataOwnerId: string; branches: Branch[]; cities: string[]; onClose: () => void; onSaved: () => void;
}) {
  const [city, setCity] = useState(cities[0] || "");
  const [areaName, setAreaName] = useState("");
  const [branchId, setBranchId] = useState<string>("");
  const [price, setPrice] = useState("10");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!city.trim() || !areaName.trim() || !branchId) return toast.error("جميع الحقول مطلوبة");
    const p = parseFloat(price);
    if (isNaN(p) || p < 0) return toast.error("سعر غير صالح");
    const branch = branches.find(b => b.id === branchId);
    if (!branch) return toast.error("الفرع غير موجود");
    setSaving(true);
    const { error } = await supabase
      .from("delivery_zones" as any)
      .insert({
        user_id: dataOwnerId,
        city: city.trim(),
        area_name: areaName.trim(),
        branch_id: branchId,
        branch_name: branch.name,
        price: p,
        is_active: true,
      } as any);
    setSaving(false);
    if (error) {
      if (error.message?.includes("duplicate")) toast.error("هذه المنطقة موجودة مسبقاً لهذا الفرع");
      else toast.error("فشل الإضافة: " + error.message);
      return;
    }
    toast.success("تمت الإضافة");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>إضافة منطقة توصيل</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">المدينة</label>
            <Input value={city} onChange={e => setCity(e.target.value)} list="cities-list" className="h-9 mt-1" />
            <datalist id="cities-list">
              {cities.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label className="text-xs font-medium">اسم المنطقة</label>
            <Input value={areaName} onChange={e => setAreaName(e.target.value)} className="h-9 mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium">الفرع</label>
            <select value={branchId} onChange={e => setBranchId(e.target.value)}
              className="w-full h-9 mt-1 rounded-md border border-border bg-background px-2 text-sm">
              <option value="">— اختر الفرع —</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium">السعر (₪)</label>
            <Input type="number" step="0.5" value={price} onChange={e => setPrice(e.target.value)} className="h-9 mt-1 text-left" dir="ltr" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? "جاري الحفظ..." : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}