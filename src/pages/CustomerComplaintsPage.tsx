import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import useDataOwnerId from "@/hooks/useDataOwnerId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowRight, Plus, Search, Loader2, MessageSquareWarning, Pencil, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

interface ComplaintRow {
  id: string;
  customer_name: string;
  phone: string | null;
  complaint_date: string;
  branch_id: string | null;
  invoice_number: string | null;
  details: string;
  follow_up_method: string | null;
  responder: string | null;
  compensated: boolean;
  notes: string | null;
  created_at: string;
}

interface BranchOption { id: string; name: string }

const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
function dayName(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return AR_DAYS[d.getDay()];
}
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const emptyForm = () => ({
  id: null as string | null,
  customer_name: "",
  phone: "",
  complaint_date: todayStr(),
  branch_id: "",
  invoice_number: "",
  details: "",
  follow_up_method: "",
  responder: "",
  compensated: false,
  notes: "",
});

export default function CustomerComplaintsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const [rows, setRows] = useState<ComplaintRow[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const load = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    try {
      const [{ data: complaints, error }, { data: br }] = await Promise.all([
        supabase
          .from("customer_complaints")
          .select("id, customer_name, phone, complaint_date, branch_id, invoice_number, details, follow_up_method, responder, compensated, notes, created_at")
          .eq("user_id", dataOwnerId)
          .order("complaint_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("branches").select("id, name").eq("user_id", dataOwnerId).eq("is_active", true).order("name"),
      ]);
      if (error) throw error;
      setRows((complaints || []) as ComplaintRow[]);
      setBranches((br || []) as BranchOption[]);
    } catch (e: any) {
      toast.error(e?.message || "تعذّر تحميل الشكاوى");
    } finally {
      setLoading(false);
    }
  }, [dataOwnerId]);

  useEffect(() => { void load(); }, [load]);

  const branchName = (id: string | null) => branches.find(b => b.id === id)?.name || "—";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      [r.customer_name, r.phone, r.invoice_number, r.details, r.responder, branchName(r.branch_id)]
        .some(v => (v || "").toString().toLowerCase().includes(q))
    );
  }, [rows, search, branches]);

  const openNew = () => { setForm(emptyForm()); setOpen(true); };
  const openEdit = (r: ComplaintRow) => {
    setForm({
      id: r.id,
      customer_name: r.customer_name,
      phone: r.phone || "",
      complaint_date: r.complaint_date,
      branch_id: r.branch_id || "",
      invoice_number: r.invoice_number || "",
      details: r.details,
      follow_up_method: r.follow_up_method || "",
      responder: r.responder || "",
      compensated: r.compensated,
      notes: r.notes || "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!dataOwnerId) return;
    if (!form.customer_name.trim()) { toast.error("اسم الزبون مطلوب"); return; }
    if (!form.details.trim()) { toast.error("تفاصيل الشكوى مطلوبة"); return; }
    setSaving(true);
    try {
      const payload = {
        user_id: dataOwnerId,
        customer_name: form.customer_name.trim().slice(0, 120),
        phone: form.phone.trim().slice(0, 30) || null,
        complaint_date: form.complaint_date || todayStr(),
        branch_id: form.branch_id || null,
        invoice_number: form.invoice_number.trim().slice(0, 60) || null,
        details: form.details.trim().slice(0, 4000),
        follow_up_method: form.follow_up_method.trim().slice(0, 300) || null,
        responder: form.responder.trim().slice(0, 120) || null,
        compensated: form.compensated,
        notes: form.notes.trim().slice(0, 2000) || null,
        created_by: user?.id ?? null,
      };
      const { error } = form.id
        ? await supabase.from("customer_complaints").update(payload).eq("id", form.id)
        : await supabase.from("customer_complaints").insert(payload);
      if (error) throw error;
      toast.success(form.id ? "تم تحديث الشكوى" : "تم تسجيل الشكوى");
      setOpen(false);
      void load();
    } catch (e: any) {
      toast.error(e?.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-[100dvh] bg-muted/30 flex flex-col">
      {/* Dynamics 365 style command bar */}
      <header className="sticky top-0 z-20 bg-background border-b">
        <div className="h-12 px-3 flex items-center gap-2 border-b bg-primary text-primary-foreground">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-primary-foreground hover:bg-primary-foreground/10"
            onClick={() => navigate(-1)}
          >
            <ArrowRight className="w-4 h-4" /> رجوع
          </Button>
          <div className="flex items-center gap-2 font-semibold text-sm">
            <MessageSquareWarning className="w-4 h-4" /> شكاوى الزبائن
          </div>
        </div>
        <div className="px-3 py-2 flex flex-wrap items-center gap-2">
          <Button size="sm" className="gap-1" onClick={openNew}>
            <Plus className="w-4 h-4" /> شكوى جديدة
          </Button>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم، الرقم، الفاتورة..."
              className="pr-8 h-9"
            />
          </div>
          <Badge variant="secondary" className="h-7">{filtered.length} شكوى</Badge>
        </div>
      </header>

      <main className="flex-1 p-3 space-y-3">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">لا يوجد شكاوى مسجلة</div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="grid gap-2 md:hidden">
              {filtered.map((r) => (
                <button
                  key={r.id}
                  onClick={() => openEdit(r)}
                  className="text-right bg-background border rounded-lg p-3 space-y-1 hover:border-primary transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm">{r.customer_name}</span>
                    {r.compensated
                      ? <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1"><CheckCircle2 className="w-3 h-3" /> تم التعويض</Badge>
                      : <Badge variant="outline" className="gap-1 text-muted-foreground"><XCircle className="w-3 h-3" /> بدون تعويض</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.phone || "—"} • {dayName(r.complaint_date)} {r.complaint_date} • {branchName(r.branch_id)}
                  </div>
                  <div className="text-xs line-clamp-2">{r.details}</div>
                  {r.invoice_number && <div className="text-[11px] text-muted-foreground">فاتورة: {r.invoice_number}</div>}
                </button>
              ))}
            </div>

            {/* Desktop grid */}
            <div className="hidden md:block bg-background border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-xs">
                  <tr className="[&>th]:p-2 [&>th]:text-right [&>th]:font-medium">
                    <th>الاسم</th><th>الرقم</th><th>اليوم</th><th>التاريخ</th><th>الفرع</th>
                    <th>رقم الفاتورة</th><th>تفاصيل الشكوى</th><th>آلية المتابعة</th><th>المستجيب</th>
                    <th>التعويض</th><th>ملاحظات</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30 [&>td]:p-2 [&>td]:align-top">
                      <td className="font-medium whitespace-nowrap">{r.customer_name}</td>
                      <td className="whitespace-nowrap">{r.phone || "—"}</td>
                      <td className="whitespace-nowrap">{dayName(r.complaint_date)}</td>
                      <td className="whitespace-nowrap">{r.complaint_date}</td>
                      <td className="whitespace-nowrap">{branchName(r.branch_id)}</td>
                      <td className="whitespace-nowrap">{r.invoice_number || "—"}</td>
                      <td className="max-w-[260px]">{r.details}</td>
                      <td className="max-w-[160px]">{r.follow_up_method || "—"}</td>
                      <td className="whitespace-nowrap">{r.responder || "—"}</td>
                      <td>
                        {r.compensated
                          ? <span className="text-emerald-600 font-medium">✅ نعم</span>
                          : <span className="text-muted-foreground">❌ لا</span>}
                      </td>
                      <td className="max-w-[160px]">{r.notes || "—"}</td>
                      <td>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-right">{form.id ? "تعديل شكوى" : "تسجيل شكوى جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>الاسم *</Label>
                <Input value={form.customer_name} onChange={(e) => setForm(f => ({ ...f, customer_name: e.target.value }))} maxLength={120} />
              </div>
              <div className="space-y-1">
                <Label>الرقم</Label>
                <Input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} inputMode="tel" maxLength={30} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>التاريخ</Label>
                <Input type="date" value={form.complaint_date} onChange={(e) => setForm(f => ({ ...f, complaint_date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>اليوم</Label>
                <Input value={dayName(form.complaint_date)} readOnly className="bg-muted" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>الفرع</Label>
                <Select value={form.branch_id || "none"} onValueChange={(v) => setForm(f => ({ ...f, branch_id: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون</SelectItem>
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>رقم الفاتورة (إن وجد)</Label>
                <Input value={form.invoice_number} onChange={(e) => setForm(f => ({ ...f, invoice_number: e.target.value }))} maxLength={60} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>تفاصيل الشكوى *</Label>
              <Textarea rows={3} value={form.details} onChange={(e) => setForm(f => ({ ...f, details: e.target.value }))} maxLength={4000} />
            </div>
            <div className="space-y-1">
              <Label>آلية المتابعة</Label>
              <Textarea rows={2} value={form.follow_up_method} onChange={(e) => setForm(f => ({ ...f, follow_up_method: e.target.value }))} maxLength={300} />
            </div>
            <div className="space-y-1">
              <Label>المستجيب للشكوى</Label>
              <Input value={form.responder} onChange={(e) => setForm(f => ({ ...f, responder: e.target.value }))} maxLength={120} />
            </div>
            <div className="flex items-center justify-between border rounded-md p-3">
              <Label className="text-sm">تم التعويض</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{form.compensated ? "✅ نعم" : "❌ لا"}</span>
                <Switch checked={form.compensated} onCheckedChange={(v) => setForm(f => ({ ...f, compensated: v }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} maxLength={2000} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button onClick={save} disabled={saving} className="gap-1">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} حفظ
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
