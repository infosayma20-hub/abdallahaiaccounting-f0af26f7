import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CreditCard, Loader2, Plus, Trash2, Wifi } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsDeviceAdmin } from "@/hooks/useIsDeviceAdmin";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { pinpadPing } from "@/lib/pinpad-bridge";

interface Terminal {
  id: string;
  label: string;
  ip_address: string;
  port: number;
  merchant_id: string | null;
  outlet_no: string | null;
  pos_code: string | null;
  is_active: boolean;
  branch_id: string | null;
  pos_terminal_id: string | null;
  notes: string | null;
  last_batch_at: string | null;
}

const empty = {
  label: "",
  ip_address: "",
  port: 7800,
  merchant_id: "",
  outlet_no: "",
  pos_code: "",
  notes: "",
  is_active: true,
  branch_id: "",
  pos_terminal_id: "",
};

export default function BopPinpadPage() {
  const { user } = useAuth();
  const { isDeviceAdmin, checking } = useIsDeviceAdmin();
  const { dataOwnerId } = useDataOwnerId();
  const [rows, setRows] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...empty });
  const [bridgeStatus, setBridgeStatus] = useState<"idle" | "checking" | "ok" | "fail">("idle");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("bop_pinpad_terminals" as any)
      .select("id,label,ip_address,port,merchant_id,outlet_no,pos_code,is_active,branch_id,pos_terminal_id,notes,last_batch_at")
      .order("created_at", { ascending: false });
    if (error) toast({ title: "خطأ بالتحميل", description: error.message, variant: "destructive" });
    setRows((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const testBridge = async () => {
    setBridgeStatus("checking");
    const r = await pinpadPing();
    setBridgeStatus(r.ok ? "ok" : "fail");
  };

  const add = async () => {
    if (!form.label.trim() || !form.ip_address.trim()) {
      toast({ title: "بيانات ناقصة", description: "الاسم و IP مطلوبين", variant: "destructive" });
      return;
    }
    if (!dataOwnerId) return;
    setSaving(true);
    const payload: any = {
      data_owner_id: dataOwnerId,
      created_by: user?.id ?? null,
      label: form.label.trim(),
      ip_address: form.ip_address.trim(),
      port: Number(form.port) || 7800,
      merchant_id: form.merchant_id.trim() || null,
      outlet_no: form.outlet_no.trim() || null,
      pos_code: form.pos_code.trim() || null,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
      branch_id: form.branch_id || null,
      pos_terminal_id: form.pos_terminal_id || null,
    };
    const { error } = await supabase.from("bop_pinpad_terminals" as any).insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "فشل الحفظ", description: error.message, variant: "destructive" });
      return;
    }
    setForm({ ...empty });
    toast({ title: "تم الحفظ" });
    void load();
  };

  const toggle = async (row: Terminal) => {
    const { error } = await supabase
      .from("bop_pinpad_terminals" as any)
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    if (error) toast({ title: "خطأ", description: error.message, variant: "destructive" });
    else void load();
  };

  const remove = async (row: Terminal) => {
    if (!confirm(`حذف الجهاز "${row.label}"؟`)) return;
    const { error } = await supabase.from("bop_pinpad_terminals" as any).delete().eq("id", row.id);
    if (error) toast({ title: "خطأ", description: error.message, variant: "destructive" });
    else void load();
  };

  if (checking) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  if (!isDeviceAdmin) {
    return (
      <div dir="rtl" className="max-w-2xl mx-auto p-6 text-center space-y-3">
        <p className="text-lg font-semibold">هاي الصفحة للمسؤولين فقط</p>
        <Link to="/settings"><Button variant="outline"><ArrowRight className="w-4 h-4 ml-2" /> رجوع للإعدادات</Button></Link>
      </div>
    );
  }

  return (
    <div dir="rtl" className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center">
            <CreditCard className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">بنك فلسطين — أجهزة PinPad X990</h1>
            <p className="text-xs text-muted-foreground">إدارة الأجهزة المربوطة بكل فرع/محطة بيع.</p>
          </div>
        </div>
        <Link to="/settings"><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4 ml-1" /> رجوع</Button></Link>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>حالة Print Bridge على هذا الجهاز</span>
            <Button size="sm" variant="outline" onClick={testBridge} disabled={bridgeStatus === "checking"}>
              {bridgeStatus === "checking" ? <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" /> : <Wifi className="w-3.5 h-3.5 ml-1" />}
              اختبار الاتصال
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          {bridgeStatus === "ok"   && <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">وحدة PinPad متاحة في Bridge</Badge>}
          {bridgeStatus === "fail" && <Badge variant="destructive">Bridge لا يستجيب أو لم تُثبَّت وحدة PinPad بعد</Badge>}
          <p>الاتصال بأجهزة X990 يتم عبر Print Bridge المحلي (TCP:7800). وحدة PinPad ستُنشر ضمن Print Bridge بعد اعتماد اتفاقية الربط مع بنك فلسطين والحصول على مفاتيح البروتوكول.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">إضافة جهاز جديد</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">الاسم / التسمية *</Label>
            <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="مثال: كاشير فرع البيرة #1" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">IP الجهاز على الشبكة *</Label>
            <Input value={form.ip_address} onChange={e => setForm(f => ({ ...f, ip_address: e.target.value }))} placeholder="192.168.1.50" dir="ltr" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Port</Label>
            <Input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: Number(e.target.value) }))} dir="ltr" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Merchant ID</Label>
            <Input value={form.merchant_id} onChange={e => setForm(f => ({ ...f, merchant_id: e.target.value }))} dir="ltr" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Outlet No</Label>
            <Input value={form.outlet_no} onChange={e => setForm(f => ({ ...f, outlet_no: e.target.value }))} dir="ltr" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">POS Code</Label>
            <Input value={form.pos_code} onChange={e => setForm(f => ({ ...f, pos_code: e.target.value }))} dir="ltr" />
          </div>
          <div className="md:col-span-3 space-y-1">
            <Label className="text-xs">ملاحظات</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="اختياري" />
          </div>
          <div className="md:col-span-3 flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
              نشط
            </label>
            <Button onClick={add} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Plus className="w-4 h-4 ml-2" />}
              إضافة الجهاز
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">الأجهزة المسجّلة ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">لا توجد أجهزة مسجّلة بعد.</p>
          ) : (
            <div className="space-y-2">
              {rows.map(r => (
                <div key={r.id} className="flex items-center gap-3 border rounded-md p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{r.label}</p>
                      {!r.is_active && <Badge variant="outline" className="text-[10px]">معطّل</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono" dir="ltr">
                      {r.ip_address}:{r.port}
                      {r.merchant_id ? ` · MID ${r.merchant_id}` : ""}
                      {r.outlet_no ? ` · Outlet ${r.outlet_no}` : ""}
                    </p>
                  </div>
                  <Switch checked={r.is_active} onCheckedChange={() => toggle(r)} />
                  <Button variant="ghost" size="icon" onClick={() => remove(r)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}