import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical, Truck } from "lucide-react";

interface DeliveryApp {
  id: string;
  name: string;
  icon: string;
  is_active: boolean;
  display_order: number;
}

interface Props {
  userId: string;
}

const EMOJI_OPTIONS = ["🛵", "🍔", "⏰", "📞", "🚗", "🍕", "📱", "🏍️", "🚲", "🛒"];

const DeliveryAppsManager = ({ userId }: Props) => {
  const [apps, setApps] = useState<DeliveryApp[]>([]);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("📱");
  const [loading, setLoading] = useState(true);

  const loadApps = async () => {
    const { data } = await supabase
      .from("delivery_apps" as any)
      .select("*")
      .eq("user_id", userId)
      .order("display_order");
    setApps((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (userId) loadApps();
  }, [userId]);

  const addApp = async () => {
    if (!newName.trim()) return;
    await supabase.from("delivery_apps" as any).insert({
      user_id: userId,
      name: newName.trim(),
      icon: newIcon,
      display_order: apps.length + 1,
    } as any);
    setNewName("");
    toast.success("تمت الإضافة");
    loadApps();
  };

  const toggleApp = async (id: string, isActive: boolean) => {
    await supabase.from("delivery_apps" as any).update({ is_active: isActive } as any).eq("id", id);
    loadApps();
  };

  const deleteApp = async (id: string) => {
    await supabase.from("delivery_apps" as any).delete().eq("id", id);
    toast.success("تم الحذف");
    loadApps();
  };

  if (loading) return null;

  return (
    <div>
      <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
        <span className="w-1 h-5 bg-primary rounded-full" />
        <Truck className="h-4 w-4" />
        تطبيقات التوصيل (كول سنتر)
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        إدارة قائمة تطبيقات التوصيل التي يستخدمها الكول سنتر لتحويل الطلبات
      </p>

      <div className="space-y-2 mb-4">
        {apps.map((app) => (
          <div key={app.id} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg border border-border">
            <div className="flex items-center gap-3">
              <span className="text-xl">{app.icon}</span>
              <span className="text-sm font-medium">{app.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={app.is_active} onCheckedChange={(v) => toggleApp(app.id, v)} />
              <button
                onClick={() => deleteApp(app.id)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <select
          value={newIcon}
          onChange={(e) => setNewIcon(e.target.value)}
          className="h-10 w-16 rounded-lg border border-input bg-background text-center text-lg"
        >
          {EMOJI_OPTIONS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="اسم التطبيق الجديد..."
          className="h-10 flex-1"
          onKeyDown={(e) => e.key === "Enter" && addApp()}
        />
        <Button onClick={addApp} size="sm" disabled={!newName.trim()} className="gap-1">
          <Plus className="h-4 w-4" /> إضافة
        </Button>
      </div>
    </div>
  );
};

export default DeliveryAppsManager;
