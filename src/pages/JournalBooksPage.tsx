/**
 * JournalBooksPage — إدارة دفاتر السندات (Journal Books).
 *
 * كل مستخدم لديه دفتر افتراضي "عام" (GENERAL) لا يمكن حذفه، ويمكنه إنشاء
 * دفاتر إضافية (مصاريف، رواتب، بنوك...) لكل منها ترقيم مستقل داخل الدفتر
 * بصيغة CODE-YYYY-####.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useJournalBooks, type JournalBook } from "@/hooks/useJournalBooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { BookOpen, Plus, Pencil, Trash2, Star, Loader2, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const PRESET_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#64748B"];

interface FormState {
  code: string;
  name: string;
  description: string;
  color: string;
  is_active: boolean;
}

const EMPTY_FORM: FormState = {
  code: "",
  name: "",
  description: "",
  color: PRESET_COLORS[0],
  is_active: true,
};

export default function JournalBooksPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const owner = dataOwnerId || user?.id || null;
  const { books, loading, refresh } = useJournalBooks({ includeInactive: true });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<JournalBook | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (b: JournalBook) => {
    setEditing(b);
    setForm({
      code: b.code,
      name: b.name,
      description: b.description || "",
      color: b.color,
      is_active: b.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!owner) return;
    const code = form.code.trim().toUpperCase();
    const name = form.name.trim();
    if (!/^[A-Z0-9_-]{1,10}$/.test(code)) {
      toast.error("كود الدفتر يجب أن يكون حروف/أرقام إنجليزية (1–10 أحرف)");
      return;
    }
    if (!name) {
      toast.error("اسم الدفتر مطلوب");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        // For default books: prevent changing code, keep is_default=true always
        const payload: any = {
          code: editing.is_default ? editing.code : code,
          name,
          description: form.description.trim() || null,
          color: form.color,
          is_active: editing.is_default ? true : form.is_active,
        };
        const { error } = await supabase.from("journal_books" as any).update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("تم تحديث الدفتر");
      } else {
        const { error } = await supabase.from("journal_books" as any).insert({
          user_id: owner,
          code,
          name,
          description: form.description.trim() || null,
          color: form.color,
          is_active: form.is_active,
          is_default: false,
        });
        if (error) throw error;
        toast.success("تم إنشاء الدفتر");
      }
      setDialogOpen(false);
      await refresh();
    } catch (e: any) {
      toast.error(e.message?.includes("unique") ? "هذا الكود مستخدم مسبقاً" : e.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (b: JournalBook) => {
    if (b.is_default) {
      toast.error("لا يمكن حذف الدفتر الافتراضي");
      return;
    }
    if (!confirm(`هل تريد حذف دفتر "${b.name}"؟\n\nملاحظة: القيود المرتبطة به لن تُحذف — ستبقى موجودة في دفتر اليومية ولكن بدون دفتر.`)) return;
    try {
      const { error } = await supabase.from("journal_books" as any).delete().eq("id", b.id);
      if (error) throw error;
      toast.success("تم حذف الدفتر");
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "فشل الحذف");
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
            <ArrowRight className="h-4 w-4" /> رجوع
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              دفاتر السندات
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              نظّم قيود اليومية في دفاتر منفصلة، لكل دفتر ترقيم مستقل بصيغة <span className="font-mono">CODE-YYYY-####</span>
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" /> دفتر جديد
        </Button>
      </div>

      {/* Info card */}
      <Card className="border-2 border-primary/20 bg-primary/5 rounded-xl">
        <CardContent className="p-4 text-xs text-foreground/80 leading-6">
          <div className="font-bold text-sm text-primary mb-1">ما فائدة دفاتر السندات؟</div>
          كل دفتر بيمثل تصنيف/سلسلة لقيود اليومية (مثلاً: <span className="font-semibold">A</span> للمصاريف،
          <span className="font-semibold"> B</span> للرواتب، <span className="font-semibold"> C</span> للبنوك...).
          هيك بتقدر تفلتر التقارير حسب الدفتر، وكل دفتر إله ترقيم مستقل يتصفّر مع بداية كل سنة.
          الدفتر الافتراضي "<span className="font-semibold">عام</span>" بيستقبل أي قيد ما اخترتله دفتر معين.
        </CardContent>
      </Card>

      {/* Books list */}
      <Card className="border-2 border-border rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold">الدفاتر ({books.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل...
            </div>
          ) : books.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">لا توجد دفاتر بعد</div>
          ) : (
            <div className="divide-y-2 divide-border">
              {books.map((b) => (
                <div key={b.id} className="p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold shrink-0" style={{ backgroundColor: b.color }}>
                    {b.code.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-foreground">{b.name}</span>
                      <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">{b.code}</Badge>
                      {b.is_default && (
                        <Badge className="text-[10px] bg-amber-500/15 text-amber-700 border-amber-500/30 gap-1">
                          <Star className="h-2.5 w-2.5" /> افتراضي
                        </Badge>
                      )}
                      {!b.is_active && <Badge variant="secondary" className="text-[10px]">معطّل</Badge>}
                    </div>
                    {b.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{b.description}</p>}
                    <p className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">
                      مثال على الترقيم: {b.code}-{new Date().getFullYear()}-0001
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(b)} className="h-8 w-8 p-0">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(b)}
                      disabled={b.is_default}
                      title={b.is_default ? "لا يمكن حذف الدفتر الافتراضي" : "حذف"}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editing ? `تعديل دفتر: ${editing.name}` : "دفتر سندات جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-semibold">كود الدفتر <span className="text-destructive">*</span></Label>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="مثال: A أو BANK"
                disabled={!!editing?.is_default}
                maxLength={10}
                className="h-9 font-mono uppercase"
              />
              <p className="text-[10px] text-muted-foreground mt-1">1–10 أحرف إنجليزية/أرقام. سيظهر ضمن رقم القيد.</p>
            </div>
            <div>
              <Label className="text-xs font-semibold">اسم الدفتر <span className="text-destructive">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="مثال: دفتر المصاريف"
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">وصف (اختياري)</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="لمن يستخدم هذا الدفتر؟"
                rows={2}
                className="resize-none"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold mb-2 block">لون الدفتر</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={`h-8 w-8 rounded-lg border-2 transition-all ${form.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            {!editing?.is_default && (
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <div className="text-xs font-semibold">الدفتر نشط</div>
                  <div className="text-[10px] text-muted-foreground">الدفاتر المعطّلة لن تظهر عند إنشاء قيد جديد</div>
                </div>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              إلغاء
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" />}
              {editing ? "حفظ التعديلات" : "إنشاء الدفتر"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}