import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

interface Option { id: string; contact_name: string }

export default function ContactPicker({
  value, onChange, required = false, allowEmpty = true,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  required?: boolean;
  allowEmpty?: boolean;
}) {
  const { user } = useAuth();
  const [options, setOptions] = useState<Option[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (supabase as any).from("contacts")
      .select("id, contact_name")
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .order("contact_name", { ascending: true })
      .limit(500)
      .then(({ data }: any) => setOptions((data as Option[]) || []));
  }, [user]);

  const handleQuickAdd = async () => {
    if (!user || !newName.trim()) {
      toast.error("الرجاء إدخال اسم العميل");
      return;
    }
    setSaving(true);
    const payload: Record<string, any> = {
      user_id: user.id,
      contact_name: newName.trim(),
      contact_type: "عميل",
    };
    if (newPhone.trim()) payload.phone = newPhone.trim();
    const { data, error } = await (supabase as any)
      .from("contacts")
      .insert(payload)
      .select("id, contact_name")
      .single();
    setSaving(false);
    if (error || !data) {
      toast.error("تعذر إضافة العميل: " + (error?.message || "خطأ غير معروف"));
      return;
    }
    setOptions((prev) => [...prev, { id: data.id, contact_name: data.contact_name }]
      .sort((a, b) => a.contact_name.localeCompare(b.contact_name, "ar")));
    onChange(data.id);
    toast.success("تمت إضافة العميل");
    setAddOpen(false);
    setNewName("");
    setNewPhone("");
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          required={required}
          className="flex-1 h-9 px-2 rounded-md border border-slate-200 text-[12px] bg-white"
        >
          {allowEmpty && <option value="">— بدون عميل —</option>}
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.contact_name}</option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAddOpen(true)}
          className="h-9 gap-1 text-[11px] shrink-0"
          title="إضافة عميل جديد"
        >
          <UserPlus className="h-3.5 w-3.5" />
          جديد
        </Button>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader><DialogTitle>إضافة عميل جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                اسم العميل <span className="text-red-500">*</span>
              </label>
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) handleQuickAdd(); }}
                placeholder="اسم العميل"
                className="h-9 text-[12px]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">رقم الهاتف (اختياري)</label>
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) handleQuickAdd(); }}
                placeholder="مثال: 0599123456"
                className="h-9 text-[12px]"
                dir="ltr"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>إلغاء</Button>
            <Button onClick={handleQuickAdd} disabled={saving || !newName.trim()}>
              {saving ? "جارٍ الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}