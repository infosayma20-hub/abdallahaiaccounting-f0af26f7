import { useEffect, useState } from "react";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Loader2, ExternalLink, Settings2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  employeeId: string;
  employeeName: string;
  authUserId: string | null;
}

interface RepRow {
  id: string;
  is_active: boolean;
  default_warehouse_id: string | null;
  cash_box_id: string | null;
  sales_commission_rate: number | null;
}

export default function SalesRepToggleSection({ employeeId, employeeName, authUserId }: Props) {
  const [rep, setRep] = useState<RepRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [cashBoxes, setCashBoxes] = useState<{ id: string; name: string; currency: string | null }[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [cashBoxId, setCashBoxId] = useState("");
  const [commissionRate, setCommissionRate] = useState<string>("");

  const loadRep = async () => {
    setLoading(true);
    try {
      let row: RepRow | null = null;
      // 1) Lookup by employee_id (canonical link)
      {
        const { data } = await (supabase as any)
          .from("sales_representatives")
          .select("id, is_active, default_warehouse_id, cash_box_id, sales_commission_rate")
          .eq("employee_id", employeeId)
          .maybeSingle();
        row = (data as RepRow | null) || null;
      }
      // 2) Fallback: by auth_user_id
      if (!row && authUserId) {
        const { data } = await (supabase as any)
          .from("sales_representatives")
          .select("id, is_active, default_warehouse_id, cash_box_id, sales_commission_rate")
          .eq("auth_user_id", authUserId)
          .maybeSingle();
        row = (data as RepRow | null) || null;
      }
      // 3) Fallback: by name within owner
      if (!row) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await (supabase as any)
            .from("sales_representatives")
            .select("id, is_active, default_warehouse_id, cash_box_id, sales_commission_rate")
            .eq("user_id", dataOwnerId!)
            .eq("full_name", employeeName)
            .maybeSingle();
          row = (data as RepRow | null) || null;
        }
      }
      setRep(row);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRep(); /* eslint-disable-next-line */ }, [employeeId, authUserId]);

  const loadOptions = async () => {
    const [wh, cb] = await Promise.all([
      (supabase as any).from("warehouses").select("id, name").order("name"),
      (supabase as any).from("cash_boxes").select("id, name, currency").eq("is_active", true).order("name"),
    ]);
    setWarehouses(wh.data || []);
    setCashBoxes(cb.data || []);
  };

  const openConfig = async () => {
    await loadOptions();
    setWarehouseId(rep?.default_warehouse_id || "");
    setCashBoxId(rep?.cash_box_id || "");
    setCommissionRate(rep?.sales_commission_rate ? String(rep.sales_commission_rate) : "");
    setShowDialog(true);
  };

  const handleToggle = async (checked: boolean) => {
    if (checked && !rep) {
      // First-time activation → open settings dialog
      await openConfig();
      return;
    }
    if (!rep) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("sales_representatives")
        .update({ is_active: checked })
        .eq("id", rep.id);
      if (error) throw error;
      setRep({ ...rep, is_active: checked });
      toast.success(checked ? "تم تفعيل المندوب" : "تم إيقاف المندوب");
    } catch (e: any) {
      toast.error(e.message || "فشل التحديث");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDialog = async () => {
    if (!warehouseId || !cashBoxId) {
      toast.error("اختر المستودع والصندوق");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("غير مصرح");

      const payload: any = {
        full_name: employeeName,
        default_warehouse_id: warehouseId,
        cash_box_id: cashBoxId,
        sales_commission_rate: commissionRate ? Number(commissionRate) : 0,
        employee_id: employeeId,
        is_active: true,
      };
      if (authUserId) payload.auth_user_id = authUserId;

      if (rep) {
        const { error } = await (supabase as any)
          .from("sales_representatives")
          .update(payload)
          .eq("id", rep.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("sales_representatives")
          .insert({ ...payload, user_id: dataOwnerId! });
        if (error) throw error;
      }

      if (authUserId) {
        await (supabase as any)
          .from("user_roles")
          .upsert({ user_id: authUserId, role: "sales_rep" }, { onConflict: "user_id,role" });
      }

      toast.success("تم حفظ إعدادات المندوب");
      setShowDialog(false);
      await loadRep();
    } catch (e: any) {
      toast.error(e.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const isActiveRep = !!(rep && rep.is_active);

  return (
    <>
      <div className="flex items-center gap-2">
        <Switch
          checked={isActiveRep}
          disabled={loading || saving}
          onCheckedChange={handleToggle}
        />
        <label className="text-xs font-medium flex items-center gap-1">
          <Truck className="h-3.5 w-3.5 text-emerald-600" /> مندوب مبيعات
        </label>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        {isActiveRep && (
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px] border-emerald-200">
            مفعّل
          </Badge>
        )}
        {rep && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={openConfig}>
            <Settings2 className="h-3 w-3" /> إعدادات
          </Button>
        )}
        {isActiveRep && authUserId && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs gap-1"
            onClick={() => window.open("/rep", "_blank")}
          >
            <ExternalLink className="h-3 w-3" /> واجهة المندوب
          </Button>
        )}
        {!authUserId && (
          <span className="text-[10px] text-amber-600">يلزم إنشاء حساب دخول للموظف أولاً</span>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-emerald-600" /> إعدادات مندوب المبيعات
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>المستودع المتنقل *</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger><SelectValue placeholder="اختر المستودع" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الصندوق النقدي *</Label>
              <Select value={cashBoxId} onValueChange={setCashBoxId}>
                <SelectTrigger><SelectValue placeholder="اختر الصندوق" /></SelectTrigger>
                <SelectContent>
                  {cashBoxes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.currency || "ILS"})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>نسبة العمولة (%)</Label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
                placeholder="0"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>إلغاء</Button>
            <Button onClick={handleSaveDialog} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}