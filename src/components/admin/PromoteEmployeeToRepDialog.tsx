import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
}

export default function PromoteEmployeeToRepDialog({ open, onOpenChange, onDone }: Props) {
  const { toast } = useToast();
  const { dataOwnerId } = useDataOwnerId();
  const [employees, setEmployees] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [cashBoxes, setCashBoxes] = useState<any[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [cashBoxId, setCashBoxId] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !dataOwnerId) return;
    setEmployeeId(""); setWarehouseId(""); setCashBoxId("");
    setLoading(true);
    (async () => {
      // Tenant-safe: filter every dropdown source by the effective owner (P0-2026-06).
      const [emp, wh, cb] = await Promise.all([
        supabase.from("employees").select("id, full_name, auth_user_id, is_active")
          .eq("user_id", dataOwnerId).eq("is_active", true).order("full_name"),
        (supabase as any).from("warehouses").select("id, name")
          .eq("user_id", dataOwnerId).order("name"),
        (supabase as any).from("cash_boxes").select("id, name, currency")
          .eq("user_id", dataOwnerId).eq("is_active", true).order("name"),
      ]);
      setEmployees((emp.data as any[]) || []);
      setWarehouses(wh.data || []);
      setCashBoxes(cb.data || []);
      setLoading(false);
    })();
  }, [open, dataOwnerId]);

  const handleSubmit = async () => {
    if (!employeeId || !warehouseId || !cashBoxId) {
      toast({ title: "بيانات ناقصة", description: "اختر الموظف والمستودع والصندوق", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const emp = employees.find((e) => e.id === employeeId);
      if (!emp) throw new Error("الموظف غير موجود");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("غير مصرح");

      // Look up existing rep by employee_id first, then auth_user_id, then full_name within same owner.
      let existingId: string | null = null;
      const { data: byEmp } = await (supabase as any)
        .from("sales_representatives")
        .select("id")
        .eq("employee_id", emp.id)
        .maybeSingle();
      existingId = byEmp?.id ?? null;

      if (!existingId && emp.auth_user_id) {
        const { data: byAuth } = await (supabase as any)
          .from("sales_representatives")
          .select("id")
          .eq("auth_user_id", emp.auth_user_id)
          .maybeSingle();
        existingId = byAuth?.id ?? null;
      }
      if (!existingId) {
        const { data: byName } = await (supabase as any)
          .from("sales_representatives")
          .select("id")
          .eq("user_id", user.id)
          .eq("full_name", emp.full_name)
          .maybeSingle();
        existingId = byName?.id ?? null;
      }

      const repPayload: any = {
        full_name: emp.full_name,
        default_warehouse_id: warehouseId,
        cash_box_id: cashBoxId,
        employee_id: emp.id,
        is_active: true,
      };
      if (emp.auth_user_id) repPayload.auth_user_id = emp.auth_user_id;

      if (existingId) {
        const { error } = await (supabase as any).from("sales_representatives").update(repPayload).eq("id", existingId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("sales_representatives")
          .insert({ ...repPayload, user_id: user.id });
        if (error) throw error;
      }

      if (emp.auth_user_id) {
        const { error: roleErr } = await (supabase as any)
          .from("user_roles")
          .upsert({ user_id: emp.auth_user_id, role: "sales_rep" }, { onConflict: "user_id,role" });
        if (roleErr) console.warn("role upsert:", roleErr);
      }

      toast({
        title: "تمت الترقية",
        description: emp.auth_user_id
          ? "الموظف أصبح مندوب مبيعات وله صلاحية دخول"
          : "تم إنشاء سجل المندوب. يلزم ربط حساب دخول للموظف لتفعيل الدخول من /auth",
      });
      onOpenChange(false);
      onDone?.();
    } catch (err: any) {
      toast({ title: "فشلت الترقية", description: err.message || "حاول مرة أخرى", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" /> ترقية موظف إلى مندوب مبيعات
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>الموظف</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name} {!e.auth_user_id && <span className="text-xs text-muted-foreground">(بدون حساب)</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>المستودع المتنقل</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger><SelectValue placeholder="اختر المستودع" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الصندوق النقدي</Label>
              <Select value={cashBoxId} onValueChange={setCashBoxId}>
                <SelectTrigger><SelectValue placeholder="اختر الصندوق" /></SelectTrigger>
                <SelectContent>
                  {cashBoxes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.currency || "ILS"})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={submitting || loading}>
            {submitting && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
            تفعيل المندوب
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
