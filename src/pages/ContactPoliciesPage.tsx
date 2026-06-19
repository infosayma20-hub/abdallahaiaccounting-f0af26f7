import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Plus, Loader2, Pencil, Trash2, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

interface Policy {
  id: string;
  user_id: string;
  class: string;
  label: string | null;
  color: string | null;
  credit_limit_default: number | null;
  payment_terms_days: number | null;
  discount_pct: number | null;
  followup_days: number | null;
  description: string | null;
}

const defaultPolicies = [
  { class: "A", label: "عملاء مميزون", color: "#22C55E", credit_limit_default: 20000, payment_terms_days: 60, discount_pct: 5, followup_days: 45, description: "أولوية قصوى - مدير المبيعات يتابع شخصياً" },
  { class: "B", label: "عملاء جيدون", color: "#3B82F6", credit_limit_default: 10000, payment_terms_days: 45, discount_pct: 2, followup_days: 30, description: "متابعة دورية من المندوب المسؤول" },
  { class: "C", label: "عملاء عاديون", color: "#F59E0B", credit_limit_default: 5000, payment_terms_days: 30, discount_pct: 0, followup_days: 15, description: "متابعة عادية" },
  { class: "D", label: "عملاء مخاطرة", color: "#EF4444", credit_limit_default: 1000, payment_terms_days: 0, discount_pct: 0, followup_days: 7, description: "نقدي فقط - تنبيه فوري للمدير عند أي فاتورة جديدة" },
];

const classColors: Record<string, string> = { A: "border-emerald-400", B: "border-blue-400", C: "border-amber-400", D: "border-red-400" };
const classBgs: Record<string, string> = { A: "bg-emerald-50 dark:bg-emerald-950/30", B: "bg-blue-50 dark:bg-blue-950/30", C: "bg-amber-50 dark:bg-amber-950/30", D: "bg-red-50 dark:bg-red-950/30" };
const classTextColors: Record<string, string> = { A: "text-emerald-700", B: "text-blue-700", C: "text-amber-700", D: "text-red-700" };

const ContactPoliciesPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [editPolicy, setEditPolicy] = useState<Partial<Policy> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchPolicies = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from('contact_class_policies').select('*').eq("user_id", dataOwnerId!).order('class');
    setPolicies((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchPolicies(); }, [user]);

  const initializeDefaults = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const inserts = defaultPolicies.map(p => ({ ...p, user_id: dataOwnerId! }));
      const { error } = await supabase.from('contact_class_policies').insert(inserts);
      if (error) throw error;
      toast({ title: "تم إنشاء السياسات الافتراضية" });
      fetchPolicies();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!editPolicy || !user) return;
    setSaving(true);
    try {
      if (editPolicy.id) {
        const { error } = await supabase.from('contact_class_policies').update({
          label: editPolicy.label,
          color: editPolicy.color,
          credit_limit_default: editPolicy.credit_limit_default,
          payment_terms_days: editPolicy.payment_terms_days,
          discount_pct: editPolicy.discount_pct,
          followup_days: editPolicy.followup_days,
          description: editPolicy.description,
        }).eq('id', editPolicy.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('contact_class_policies').insert({
          user_id: dataOwnerId!,
          class: editPolicy.class || 'C',
          label: editPolicy.label,
          color: editPolicy.color,
          credit_limit_default: editPolicy.credit_limit_default,
          payment_terms_days: editPolicy.payment_terms_days,
          discount_pct: editPolicy.discount_pct,
          followup_days: editPolicy.followup_days,
          description: editPolicy.description,
        });
        if (error) throw error;
      }
      toast({ title: "تم الحفظ" });
      setEditPolicy(null);
      fetchPolicies();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('contact_class_policies').delete().eq('id', id);
    if (!error) { toast({ title: "تم الحذف" }); fetchPolicies(); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-3xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/contacts")} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">سياسات تصنيف الزبائن</h1>
            <p className="text-xs text-muted-foreground">إدارة سياسات التصنيف A B C D</p>
          </div>
        </div>
        {policies.length === 0 ? (
          <Button size="sm" onClick={initializeDefaults} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "إنشاء السياسات الافتراضية"}
          </Button>
        ) : (
          <Button size="sm" onClick={() => setEditPolicy({ class: "C", label: "", credit_limit_default: 5000, payment_terms_days: 30, discount_pct: 0, followup_days: 15, description: "" })}>
            <Plus className="h-4 w-4 ml-1" /> سياسة جديدة
          </Button>
        )}
      </div>

      {policies.length === 0 && !loading && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-4">لم يتم إعداد سياسات التصنيف بعد</p>
            <Button onClick={initializeDefaults} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              إنشاء السياسات الافتراضية (A, B, C, D)
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {policies.map(policy => (
          <Card key={policy.id} className={`border-r-4 ${classColors[policy.class] || 'border-gray-300'}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl text-lg font-bold ${classBgs[policy.class]} ${classTextColors[policy.class]}`}>
                    {policy.class}
                  </span>
                  <div>
                    <h3 className="font-semibold text-sm">{policy.label || `فئة ${policy.class}`}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span>سقف ائتمان: ₪{(policy.credit_limit_default || 0).toLocaleString()}</span>
                      <span>مدة الدفع: {policy.payment_terms_days === 0 ? 'نقدي فقط' : `${policy.payment_terms_days} يوم`}</span>
                      {(policy.discount_pct || 0) > 0 && <span>خصم: {policy.discount_pct}%</span>}
                      <span>متابعة: كل {policy.followup_days} يوم</span>
                    </div>
                    {policy.description && <p className="text-xs text-muted-foreground mt-1.5">{policy.description}</p>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditPolicy({ ...policy })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(policy.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit/Add Dialog */}
      <Dialog open={!!editPolicy} onOpenChange={(o) => !o && setEditPolicy(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>{editPolicy?.id ? 'تعديل السياسة' : 'سياسة جديدة'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!editPolicy?.id && (
              <div>
                <Label className="text-xs">الفئة</Label>
                <Select value={editPolicy?.class || "C"} onValueChange={(v) => setEditPolicy(p => p ? { ...p, class: v } : p)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-background">
                    <SelectItem value="A">A</SelectItem>
                    <SelectItem value="B">B</SelectItem>
                    <SelectItem value="C">C</SelectItem>
                    <SelectItem value="D">D</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">الاسم</Label>
              <Input value={editPolicy?.label || ""} onChange={(e) => setEditPolicy(p => p ? { ...p, label: e.target.value } : p)} dir="rtl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">سقف الائتمان ₪</Label>
                <Input type="number" value={editPolicy?.credit_limit_default || ""} onChange={(e) => setEditPolicy(p => p ? { ...p, credit_limit_default: parseFloat(e.target.value) || 0 } : p)} />
              </div>
              <div>
                <Label className="text-xs">مدة الدفع (يوم)</Label>
                <Input type="number" value={editPolicy?.payment_terms_days ?? ""} onChange={(e) => setEditPolicy(p => p ? { ...p, payment_terms_days: parseInt(e.target.value) || 0 } : p)} />
              </div>
              <div>
                <Label className="text-xs">خصم %</Label>
                <Input type="number" value={editPolicy?.discount_pct || ""} onChange={(e) => setEditPolicy(p => p ? { ...p, discount_pct: parseFloat(e.target.value) || 0 } : p)} />
              </div>
              <div>
                <Label className="text-xs">متابعة كل (يوم)</Label>
                <Input type="number" value={editPolicy?.followup_days || ""} onChange={(e) => setEditPolicy(p => p ? { ...p, followup_days: parseInt(e.target.value) || 0 } : p)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">الوصف</Label>
              <Textarea value={editPolicy?.description || ""} onChange={(e) => setEditPolicy(p => p ? { ...p, description: e.target.value } : p)} rows={2} dir="rtl" />
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 ml-1" /> حفظ</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContactPoliciesPage;
