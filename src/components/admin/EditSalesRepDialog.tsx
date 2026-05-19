import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Pencil } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  repId: string | null;
  onDone?: () => void;
}

export default function EditSalesRepDialog({ open, onOpenChange, repId, onDone }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [cashBoxes, setCashBoxes] = useState<any[]>([]);
  const [form, setForm] = useState<any>(null);

  useEffect(() => {
    if (!open || !repId) return;
    setLoading(true);
    (async () => {
      const [rep, wh, cb] = await Promise.all([
        (supabase as any).from("sales_representatives").select("*").eq("id", repId).maybeSingle(),
        (supabase as any).from("warehouses").select("id, name").order("name"),
        (supabase as any).from("cash_boxes").select("id, name, currency").eq("is_active", true).order("name"),
      ]);
      setForm(rep.data || {});
      setWarehouses(wh.data || []);
      setCashBoxes(cb.data || []);
      setLoading(false);
    })();
  }, [open, repId]);

  const update = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!repId || !form) return;
    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name,
        phone: form.phone || null,
        email: form.email || null,
        region: form.region || null,
        default_warehouse_id: form.default_warehouse_id || null,
        cash_box_id: form.cash_box_id || null,
        sales_commission_rate: Number(form.sales_commission_rate) || 0,
        collection_commission_rate: Number(form.collection_commission_rate) || 0,
        is_active: !!form.is_active,
        notes: form.notes || null,
      };
      const { error } = await (supabase as any).from("sales_representatives").update(payload).eq("id", repId);
      if (error) throw error;
      toast({ title: "تم الحفظ", description: "تم تحديث بيانات المندوب" });
      onOpenChange(false);
      onDone?.();
    } catch (e: any) {
      toast({ title: "فشل الحفظ", description: e.message || "حاول مرة أخرى", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5" /> تعديل بيانات المندوب</DialogTitle>
        </DialogHeader>
        {loading || !form ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>الاسم</Label><Input value={form.full_name || ""} onChange={(e) => update("full_name", e.target.value)} /></div>
              <div><Label>الهاتف</Label><Input value={form.phone || ""} onChange={(e) => update("phone", e.target.value)} dir="ltr" /></div>
              <div><Label>البريد</Label><Input value={form.email || ""} onChange={(e) => update("email", e.target.value)} dir="ltr" /></div>
              <div><Label>المنطقة</Label><Input value={form.region || ""} onChange={(e) => update("region", e.target.value)} /></div>
            </div>
            <div>
              <Label>المستودع</Label>
              <Select value={form.default_warehouse_id || ""} onValueChange={(v) => update("default_warehouse_id", v)}>
                <SelectTrigger><SelectValue placeholder="اختر المستودع" /></SelectTrigger>
                <SelectContent>{warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>الصندوق النقدي</Label>
              <Select value={form.cash_box_id || ""} onValueChange={(v) => update("cash_box_id", v)}>
                <SelectTrigger><SelectValue placeholder="اختر الصندوق" /></SelectTrigger>
                <SelectContent>{cashBoxes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.currency || "ILS"})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>عمولة المبيعات %</Label>
                <Input type="number" step="0.01" value={form.sales_commission_rate ?? 0} onChange={(e) => update("sales_commission_rate", e.target.value)} dir="ltr" />
              </div>
              <div>
                <Label>عمولة التحصيل %</Label>
                <Input type="number" step="0.01" value={form.collection_commission_rate ?? 0} onChange={(e) => update("collection_commission_rate", e.target.value)} dir="ltr" />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border">
              <div>
                <div className="text-sm font-medium">المندوب نشط</div>
                <div className="text-xs text-muted-foreground">إيقاف المندوب يمنع تسجيل دخوله للتطبيق</div>
              </div>
              <Switch checked={!!form.is_active} onCheckedChange={(v) => update("is_active", v)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="w-4 h-4 animate-spin ml-2" />} حفظ التغييرات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}