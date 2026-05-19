/**
 * KDS Pilot Issues Log — used during Phase 4 field pilot.
 * Lets staff capture and triage operational problems without leaving /pos/kds-control.
 */
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Plus, Trash2, ClipboardList, CheckCircle2, XCircle } from "lucide-react";

interface Issue {
  id: string;
  order_number: string | null;
  occurred_at: string;
  device_label: string | null;
  internet_ok: boolean;
  was_refreshed: boolean;
  expected_result: string | null;
  actual_result: string | null;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "fixed" | "wontfix";
}

const PRIORITY_LABEL: Record<Issue["priority"], string> = {
  low: "منخفضة", medium: "متوسطة", high: "عالية", critical: "حرجة",
};
const PRIORITY_TONE: Record<Issue["priority"], string> = {
  low: "bg-slate-100 text-slate-700 border-slate-200",
  medium: "bg-sky-100 text-sky-700 border-sky-200",
  high: "bg-amber-100 text-amber-700 border-amber-200",
  critical: "bg-red-100 text-red-700 border-red-200",
};
const STATUS_LABEL: Record<Issue["status"], string> = {
  open: "مفتوحة", fixed: "تم الإصلاح", wontfix: "لن تُصلح",
};

const emptyForm = {
  order_number: "", device_label: "", description: "",
  expected_result: "", actual_result: "",
  internet_ok: true, was_refreshed: false,
  priority: "medium" as Issue["priority"],
};

export default function PilotIssuesPanel() {
  const { user } = useAuth();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: oid } = await supabase.rpc("get_team_owner_id", { _user_id: user.id });
    if (!oid) return;
    setOwnerId(oid as string);
    const { data } = await (supabase as any)
      .from("kds_pilot_issues").select("*")
      .eq("company_id", oid).order("occurred_at", { ascending: false }).limit(100);
    setIssues((data as Issue[]) || []);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!ownerId || !form.description.trim()) {
      toast.error("الوصف مطلوب"); return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from("kds_pilot_issues").insert({
      company_id: ownerId,
      order_number: form.order_number || null,
      device_label: form.device_label || null,
      description: form.description,
      expected_result: form.expected_result || null,
      actual_result: form.actual_result || null,
      internet_ok: form.internet_ok,
      was_refreshed: form.was_refreshed,
      priority: form.priority,
    });
    setSaving(false);
    if (error) { toast.error("تعذر الحفظ"); return; }
    toast.success("تم تسجيل الملاحظة");
    setForm(emptyForm); setOpen(false); load();
  };

  const setStatus = async (id: string, status: Issue["status"]) => {
    await (supabase as any).from("kds_pilot_issues").update({
      status, resolved_at: status === "open" ? null : new Date().toISOString(),
    }).eq("id", id);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("حذف الملاحظة؟")) return;
    await (supabase as any).from("kds_pilot_issues").delete().eq("id", id);
    load();
  };

  const openCount = issues.filter(i => i.status === "open").length;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold flex items-center gap-2">
          <ClipboardList className="h-4 w-4" /> سجل ملاحظات Pilot
          {openCount > 0 && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200">
              {openCount} مفتوحة
            </Badge>
          )}
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 ml-1" /> إضافة ملاحظة</Button>
          </DialogTrigger>
          <DialogContent dir="rtl" className="max-w-lg">
            <DialogHeader><DialogTitle>تسجيل ملاحظة Pilot</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>رقم الطلب</Label>
                  <Input value={form.order_number} onChange={e => setForm(f => ({ ...f, order_number: e.target.value }))} placeholder="مثلاً 12" />
                </div>
                <div>
                  <Label>الجهاز</Label>
                  <Input value={form.device_label} onChange={e => setForm(f => ({ ...f, device_label: e.target.value }))} placeholder="شاشة الزبائن / السخان" />
                </div>
              </div>
              <div>
                <Label>وصف المشكلة *</Label>
                <Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>النتيجة المتوقعة</Label>
                  <Input value={form.expected_result} onChange={e => setForm(f => ({ ...f, expected_result: e.target.value }))} />
                </div>
                <div>
                  <Label>النتيجة الفعلية</Label>
                  <Input value={form.actual_result} onChange={e => setForm(f => ({ ...f, actual_result: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 items-end">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.internet_ok} onCheckedChange={v => setForm(f => ({ ...f, internet_ok: v }))} /> إنترنت يعمل
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.was_refreshed} onCheckedChange={v => setForm(f => ({ ...f, was_refreshed: v }))} /> تم refresh
                </label>
                <div>
                  <Label>الأولوية</Label>
                  <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as Issue["priority"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["low","medium","high","critical"] as const).map(p => (
                        <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
              <Button onClick={save} disabled={saving}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {issues.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          لا توجد ملاحظات بعد. سجّل أي مشكلة تشغيلية أثناء الـ Pilot لمتابعتها.
        </p>
      ) : (
        <div className="space-y-2">
          {issues.map(i => (
            <div key={i.id} className="border rounded-md p-3 text-sm flex flex-col sm:flex-row gap-3 sm:items-start">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {i.order_number && <Badge variant="outline">#{i.order_number}</Badge>}
                  {i.device_label && <Badge variant="secondary">{i.device_label}</Badge>}
                  <Badge variant="outline" className={PRIORITY_TONE[i.priority]}>
                    {PRIORITY_LABEL[i.priority]}
                  </Badge>
                  <Badge variant={i.status === "open" ? "default" : "outline"}>
                    {STATUS_LABEL[i.status]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(i.occurred_at).toLocaleString("ar-PS")}
                  </span>
                </div>
                <p className="font-medium">{i.description}</p>
                {(i.expected_result || i.actual_result) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {i.expected_result && <>متوقع: {i.expected_result} · </>}
                    {i.actual_result && <>فعلي: {i.actual_result}</>}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {i.internet_ok ? "إنترنت يعمل" : "بدون إنترنت"} · {i.was_refreshed ? "تم refresh" : "بدون refresh"}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                {i.status !== "fixed" && (
                  <Button size="sm" variant="ghost" onClick={() => setStatus(i.id, "fixed")} title="تم الإصلاح">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  </Button>
                )}
                {i.status === "open" && (
                  <Button size="sm" variant="ghost" onClick={() => setStatus(i.id, "wontfix")} title="لن يُصلح">
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => remove(i.id)} title="حذف">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}