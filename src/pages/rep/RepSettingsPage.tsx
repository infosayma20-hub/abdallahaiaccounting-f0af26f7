import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { User, Warehouse as WarehouseIcon, Wallet, LogOut, KeyRound, Loader2, RefreshCw } from "lucide-react";

export default function RepSettingsPage() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rep, setRep] = useState<any>(null);
  const [warehouseName, setWarehouseName] = useState<string>("");
  const [cashBoxName, setCashBoxName] = useState<string>("");
  const [dayStatus, setDayStatus] = useState<string | null>(null);
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: r } = await (supabase as any)
      .from("sales_representatives")
      .select("id, full_name, phone, email, region, default_warehouse_id, cash_box_id, sales_commission_rate, collection_commission_rate, is_active")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    setRep(r);
    if (r?.default_warehouse_id) {
      const { data: wh } = await (supabase as any).from("warehouses").select("name").eq("id", r.default_warehouse_id).maybeSingle();
      setWarehouseName(wh?.name || "");
    }
    if (r?.cash_box_id) {
      const { data: cb } = await (supabase as any).from("cash_boxes").select("name").eq("id", r.cash_box_id).maybeSingle();
      setCashBoxName(cb?.name || "");
    }
    if (r?.id) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: d } = await (supabase as any)
        .from("van_sales_days")
        .select("status")
        .eq("sales_rep_id", r.id)
        .eq("day_date", today)
        .maybeSingle();
      setDayStatus(d?.status || null);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const handlePwdChange = async () => {
    if (newPwd.length < 6) { toast({ title: "كلمة مرور قصيرة", description: "6 أحرف على الأقل", variant: "destructive" }); return; }
    if (newPwd !== confirmPwd) { toast({ title: "غير متطابقة", description: "كلمتا المرور غير متطابقتين", variant: "destructive" }); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setSaving(false);
    if (error) { toast({ title: "فشل التحديث", description: error.message, variant: "destructive" }); return; }
    setNewPwd(""); setConfirmPwd("");
    toast({ title: "تم", description: "تم تحديث كلمة المرور" });
  };

  const handleLogout = async () => { await signOut(); navigate("/auth", { replace: true }); };

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!rep) return <div className="p-6 text-center text-muted-foreground">لم يتم العثور على بيانات المندوب</div>;

  return (
    <div dir="rtl" className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">إعدادات المندوب</h1>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 ml-1" /> تحديث</Button>
      </div>

      {/* Profile */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-foreground font-semibold"><User className="w-4 h-4" /> الملف الشخصي</div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="الاسم" value={rep.full_name} />
          <Field label="الهاتف" value={rep.phone || "—"} />
          <Field label="البريد" value={rep.email || user?.email || "—"} />
          <Field label="المنطقة" value={rep.region || "—"} />
          <Field label="عمولة المبيعات" value={`${rep.sales_commission_rate || 0}%`} />
          <Field label="عمولة التحصيل" value={`${rep.collection_commission_rate || 0}%`} />
        </div>
      </Card>

      {/* Resources */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-foreground font-semibold"><WarehouseIcon className="w-4 h-4" /> الموارد المخصصة</div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="المستودع" value={warehouseName || "—"} icon={WarehouseIcon} />
          <Field label="الصندوق" value={cashBoxName || "—"} icon={Wallet} />
          <Field label="حالة يوم البيع" value={dayStatus === "open" ? "مفتوح" : dayStatus === "closed" ? "مغلق" : "غير مفتوح"} />
          <Field label="الحالة" value={rep.is_active ? "نشط" : "موقوف"} />
        </div>
        <p className="text-xs text-muted-foreground">لتعديل المستودع أو الصندوق راجع الإدارة.</p>
      </Card>

      {/* Password */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-foreground font-semibold"><KeyRound className="w-4 h-4" /> تغيير كلمة المرور</div>
        <div className="space-y-2">
          <div>
            <Label className="text-xs">كلمة مرور جديدة</Label>
            <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} dir="ltr" />
          </div>
          <div>
            <Label className="text-xs">تأكيد كلمة المرور</Label>
            <Input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} dir="ltr" />
          </div>
          <Button onClick={handlePwdChange} disabled={saving || !newPwd} className="w-full">
            {saving && <Loader2 className="w-4 h-4 animate-spin ml-2" />} تحديث كلمة المرور
          </Button>
        </div>
      </Card>

      <Button variant="destructive" className="w-full" onClick={handleLogout}>
        <LogOut className="w-4 h-4 ml-2" /> تسجيل الخروج
      </Button>
    </div>
  );
}

function Field({ label, value, icon: Icon }: { label: string; value: string; icon?: any }) {
  return (
    <div className="p-2 rounded-lg bg-muted/40 border border-border">
      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </div>
      <div className="text-sm font-medium text-foreground mt-0.5 truncate">{value}</div>
    </div>
  );
}