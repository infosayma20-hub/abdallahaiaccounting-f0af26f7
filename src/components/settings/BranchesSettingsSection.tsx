import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, MapPin, Building2, Pencil, X, Check, QrCode, Copy, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Branch {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: boolean;
  created_at: string;
  qr_mode?: string;
}

export default function BranchesSettingsSection() {
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);

  // Form
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState(31.9);
  const [longitude, setLongitude] = useState(35.2);
  const [radius, setRadius] = useState(100);
  const [qrMode, setQrMode] = useState("static");

  useEffect(() => {
    if (user && dataOwnerId) loadBranches();
  }, [user, dataOwnerId]);

  const loadBranches = async () => {
    if (!dataOwnerId) return;
    const { data } = await supabase
      .from("branches_safe")
      .select("*")
      .eq("user_id", dataOwnerId)
      .order("created_at");
    setBranches((data as Branch[]) || []);
    setLoading(false);
  };

  const resetForm = () => {
    setName("");
    setAddress("");
    setLatitude(31.9);
    setLongitude(35.2);
    setRadius(100);
    setQrMode("static");
    setEditing(null);
  };

  const openAdd = () => {
    resetForm();
    setShowDialog(true);
  };

  const openEdit = (b: Branch) => {
    setEditing(b);
    setName(b.name);
    setAddress(b.address || "");
    setLatitude(b.latitude);
    setLongitude(b.longitude);
    setRadius(b.radius_meters);
    setQrMode(b.qr_mode || "static");
    setShowDialog(true);
  };

  const saveBranch = async () => {
    if (!name.trim()) return toast.error("أدخل اسم الفرع");

    const payload = {
      user_id: user!.id,
      name: name.trim(),
      address: address.trim() || null,
      latitude,
      longitude,
      radius_meters: radius,
      qr_mode: qrMode,
    };

    if (editing) {
      const { error } = await supabase
        .from("branches")
        .update(payload)
        .eq("id", editing.id);
      if (error) return toast.error("خطأ في التحديث");
      toast.success("تم تحديث الفرع");
    } else {
      const { error } = await supabase
        .from("branches")
        .insert({ ...payload, user_id: dataOwnerId });
      if (error) return toast.error("خطأ في الإضافة");
      toast.success("تمت إضافة الفرع");
    }

    setShowDialog(false);
    resetForm();
    loadBranches();
  };

  const toggleBranch = async (id: string, is_active: boolean) => {
    await supabase.from("branches").update({ is_active }).eq("id", id);
    loadBranches();
  };

  const deleteBranch = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الفرع؟")) return;
    const { error } = await supabase.from("branches").delete().eq("id", id);
    if (error) {
      toast.error("لا يمكن حذف الفرع - قد يكون مرتبطاً بموظفين أو محطات");
      return;
    }
    toast.success("تم حذف الفرع");
    loadBranches();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <span className="w-1 h-5 bg-primary rounded-full" />
            إدارة الأفرع
          </h3>
          <p className="text-xs text-muted-foreground pr-3">أضف وأدر أفرع شركتك - يتم ربط الموظفين والمحطات والطابعات بالأفرع</p>
        </div>
        <Button onClick={openAdd} size="sm" className="gap-1.5 shrink-0">
          <Plus className="h-3.5 w-3.5" /> إضافة فرع
        </Button>
      </div>

      {/* Branches List */}
      <div className="space-y-3">
        {branches.map(b => (
          <div key={b.id} className="flex items-center gap-4 p-4 bg-background rounded-xl border border-border">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${b.is_active ? "bg-primary/10" : "bg-muted"}`}>
              <Building2 className={`h-5 w-5 ${b.is_active ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{b.name}</p>
              {b.address && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {b.address}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground mt-0.5 font-mono" dir="ltr">
                📍 {b.latitude.toFixed(4)}, {b.longitude.toFixed(4)} • نطاق {b.radius_meters}م
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-[10px]">
                  <QrCode className="h-3 w-3 ml-1" />
                  {b.qr_mode === 'rotating' ? 'QR متجدد' : 'QR ثابت'}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] gap-1 text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    const url = `${window.location.origin}/branch/${b.id}`;
                    navigator.clipboard.writeText(url);
                    toast.success("تم نسخ رابط QR");
                  }}
                >
                  <Copy className="h-3 w-3" /> نسخ رابط
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] gap-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(`/branch/${b.id}`, '_blank');
                  }}
                >
                  <ExternalLink className="h-3 w-3" /> فتح شاشة QR
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(b)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Switch checked={b.is_active} onCheckedChange={v => toggleBranch(b.id, v)} />
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteBranch(b.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
        {branches.length === 0 && !loading && (
          <div className="text-center py-12 space-y-2">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">لم تُضف أي أفرع بعد</p>
            <p className="text-xs text-muted-foreground">أضف فرعك الأول لربط الموظفين والمحطات به</p>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              {editing ? "تعديل فرع" : "إضافة فرع جديد"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-3">
            {/* Branch Name & Address */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">اسم الفرع <span className="text-destructive">*</span></Label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="مثال: فرع سفيان"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">العنوان <span className="text-muted-foreground">(اختياري)</span></Label>
                <Input
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="مثال: شارع الرئيسي، نابلس"
                  className="h-10"
                />
              </div>
            </div>

            {/* Location Section */}
            <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                الموقع الجغرافي
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">خط العرض (Lat)</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={latitude}
                    onChange={e => setLatitude(Number(e.target.value))}
                    className="h-9 font-mono text-sm"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">خط الطول (Lng)</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={longitude}
                    onChange={e => setLongitude(Number(e.target.value))}
                    className="h-9 font-mono text-sm"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">نطاق الحضور (م)</Label>
                  <Input
                    type="number"
                    value={radius}
                    onChange={e => setRadius(Number(e.target.value))}
                    className="h-9 font-mono text-sm"
                    dir="ltr"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                المسافة المسموحة لتسجيل حضور الموظفين من موقع الفرع
              </p>
            </div>

            {/* QR Mode */}
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <QrCode className="h-3.5 w-3.5 text-primary" />
                نوع رمز QR
              </Label>
              <Select value={qrMode} onValueChange={setQrMode}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="static">ثابت (للطباعة على ورقة)</SelectItem>
                  <SelectItem value="rotating">متجدد (أمان أعلى)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                {qrMode === 'static'
                  ? 'رمز ثابت يمكن طباعته وتعليقه — مناسب للمطاعم والمحلات'
                  : 'يتجدد تلقائياً كل 5 دقائق — أمان أعلى ضد التزوير'}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button onClick={saveBranch} className="flex-1 gap-1.5">
                <Check className="h-3.5 w-3.5" />
                {editing ? "حفظ التعديلات" : "إضافة الفرع"}
              </Button>
              <Button variant="outline" onClick={() => { setShowDialog(false); resetForm(); }}>
                إلغاء
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
