import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, ChefHat, Building2 } from "lucide-react";

interface Station {
  id: string;
  name: string;
  station_type: string;
  color: string;
  is_active: boolean;
  display_order: number;
  branch_id: string | null;
}

interface Branch {
  id: string;
  name: string;
}

const STATION_TYPES = [
  { value: "kitchen", label: "مطبخ" },
  { value: "drinks", label: "مشروبات" },
  { value: "desserts", label: "حلويات" },
  { value: "grill", label: "شواية" },
  { value: "cold", label: "أطباق باردة" },
  { value: "other", label: "أخرى" },
];

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#64748b"];

export default function KitchenStationsManager() {
  const { user } = useAuth();
  const [stations, setStations] = useState<Station[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("kitchen");
  const [newColor, setNewColor] = useState("#ef4444");
  const [newBranchId, setNewBranchId] = useState<string>("");
  const [filterBranch, setFilterBranch] = useState<string>("all");

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    const [stationsRes, branchesRes] = await Promise.all([
      supabase.from("kitchen_stations").select("*").order("display_order"),
      supabase.from("branches").select("id, name").eq("is_active", true).order("name"),
    ]);
    setStations((stationsRes.data as any[]) || []);
    setBranches((branchesRes.data as Branch[]) || []);
    setLoading(false);
  };

  const addStation = async () => {
    if (!newName.trim()) return toast.error("أدخل اسم المحطة");
    const { error } = await supabase.from("kitchen_stations").insert({
      user_id: dataOwnerId!,
      name: newName.trim(),
      station_type: newType,
      color: newColor,
      display_order: stations.length,
      branch_id: newBranchId && newBranchId !== "__none__" ? newBranchId : null,
    } as any);
    if (error) return toast.error("خطأ في الإضافة");
    toast.success("تمت إضافة المحطة");
    setNewName("");
    setNewBranchId("");
    loadData();
  };

  const toggleStation = async (id: string, is_active: boolean) => {
    await supabase.from("kitchen_stations").update({ is_active } as any).eq("id", id);
    loadData();
  };

  const deleteStation = async (id: string) => {
    await supabase.from("kitchen_stations").delete().eq("id", id);
    toast.success("تم حذف المحطة");
    loadData();
  };

  const filteredStations = filterBranch === "all"
    ? stations
    : filterBranch === "none"
      ? stations.filter(s => !s.branch_id)
      : stations.filter(s => s.branch_id === filterBranch);

  const getBranchName = (branchId: string | null) => {
    if (!branchId) return null;
    return branches.find(b => b.id === branchId)?.name;
  };

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
        <span className="w-1 h-5 bg-primary rounded-full" />
        <ChefHat className="h-4 w-4" />
        محطات المطبخ / الطباعة
      </h3>
      <p className="text-sm text-muted-foreground">
        أضف محطات (مطبخ، مشروبات، شواية...) لتقسيم الطلبات تلقائياً. كل محطة تظهر كشاشة منفصلة (KDS) مع إمكانية طباعة التذكرة.
      </p>

      {/* Branch Filter */}
      {branches.length > 0 && (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <Select value={filterBranch} onValueChange={setFilterBranch}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder="فلترة حسب الفرع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الأفرع</SelectItem>
              <SelectItem value="none">بدون فرع</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Add new */}
      <div className="flex flex-wrap gap-2 items-end p-3 bg-muted/50 rounded-lg">
        <div className="flex-1 min-w-[140px] space-y-1">
          <Label className="text-xs">اسم المحطة</Label>
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="مثال: المطبخ الرئيسي" className="h-9" />
        </div>
        <div className="w-[130px] space-y-1">
          <Label className="text-xs">النوع</Label>
          <Select value={newType} onValueChange={setNewType}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {branches.length > 0 && (
          <div className="w-[140px] space-y-1">
            <Label className="text-xs">الفرع</Label>
            <Select value={newBranchId} onValueChange={setNewBranchId}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="اختر فرع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">بدون فرع</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">اللون</Label>
          <div className="flex gap-1">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className="w-6 h-6 rounded-full border-2 transition-transform"
                style={{ backgroundColor: c, borderColor: newColor === c ? "#0f172a" : "transparent", transform: newColor === c ? "scale(1.2)" : "scale(1)" }}
              />
            ))}
          </div>
        </div>
        <Button onClick={addStation} size="sm" className="h-9 gap-1">
          <Plus className="h-3.5 w-3.5" />
          إضافة
        </Button>
      </div>

      {/* List */}
      <div className="space-y-2">
        {filteredStations.map(s => (
          <div key={s.id} className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border">
            <div className="w-3 h-8 rounded-full" style={{ backgroundColor: s.color }} />
            <div className="flex-1">
              <p className="font-medium text-sm">{s.name}</p>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">{STATION_TYPES.find(t => t.value === s.station_type)?.label || s.station_type}</p>
                {getBranchName(s.branch_id) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-2.5 w-2.5" />
                    {getBranchName(s.branch_id)}
                  </span>
                )}
              </div>
            </div>
            <Switch checked={s.is_active} onCheckedChange={v => toggleStation(s.id, v)} />
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteStation(s.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {filteredStations.length === 0 && !loading && (
          <p className="text-center text-sm text-muted-foreground py-6">لم تُضف أي محطات بعد</p>
        )}
      </div>
    </div>
  );
}
