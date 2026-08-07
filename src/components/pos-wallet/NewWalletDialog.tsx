/** NewWalletDialog — فتح محفظة جديدة: اختر زبوناً موجوداً أو أنشئ زبوناً جديداً. */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DynamicsDialog, DynamicsSection } from "@/components/ui/dynamics-dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dataOwnerId: string | null;
  existingContactIds: string[];
  /** يُستدعى بعد اختيار/إنشاء الزبون لفتح شاشة الشحن. */
  onPick: (contactId: string) => void;
}

export default function NewWalletDialog({ open, onOpenChange, dataOwnerId, existingContactIds, onPick }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; contact_name: string; phone: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setQ(""); setResults([]); setNewName(""); setNewPhone(""); }
  }, [open]);

  useEffect(() => {
    if (!open || !dataOwnerId) return;
    const term = q.trim();
    setLoading(true);
    const t = setTimeout(async () => {
      let query = (supabase as any).from("contacts")
        .select("id, contact_name, phone")
        .eq("user_id", dataOwnerId)
        .order("contact_name")
        .limit(30);
      if (term.length >= 1) query = query.or(`contact_name.ilike.%${term}%,phone.ilike.%${term}%`);
      const { data } = await query;
      setResults((data as any[]) || []);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, open, dataOwnerId]);

  const createContact = async () => {
    const name = newName.trim();
    if (!name) { toast.error("اكتب اسم الزبون"); return; }
    if (!dataOwnerId) return;
    setSaving(true);
    const { data, error } = await (supabase as any).from("contacts")
      .insert({ user_id: dataOwnerId, contact_name: name, phone: newPhone.trim() || null, contact_type: "customer" })
      .select("id").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم إنشاء الزبون");
    onOpenChange(false);
    onPick(data.id as string);
  };

  return (
    <DynamicsDialog
      open={open}
      onOpenChange={onOpenChange}
      title="فتح محفظة جديدة"
      description="اختر زبوناً من جهات الاتصال — تُفتح المحفظة تلقائياً عند أول عملية شحن."
      className="max-w-2xl"
      maxBodyHeight="65vh"
    >
      <DynamicsSection title="اختيار زبون موجود">
        <div dir="rtl" className="p-3 text-right">
        <div className="relative mb-2">
          <Search className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث بالاسم أو رقم الهاتف…" className="h-9 pr-7 text-right text-xs" />
        </div>
        <div className="max-h-64 overflow-auto rounded-md border border-border">
          {loading && results.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">جاري التحميل…</div>
          ) : results.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">لا يوجد زبائن مطابقين — أنشئ زبوناً جديداً بالأسفل</div>
          ) : results.map((c) => {
            const has = existingContactIds.includes(c.id);
            return (
              <button key={c.id} type="button" dir="rtl" onClick={() => { onOpenChange(false); onPick(c.id); }}
                className="flex w-full flex-row items-center justify-between border-b border-border px-3 py-2 text-right text-xs last:border-b-0 hover:bg-muted">
                <span className="font-medium">{c.contact_name}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className="tabular-nums">{c.phone || ""}</span>
                  {has && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600">له محفظة</span>}
                </span>
              </button>
            );
          })}
        </div>
        </div>
      </DynamicsSection>

      <DynamicsSection title="أو أنشئ زبوناً جديداً">
        <div dir="rtl" className="flex flex-row flex-wrap items-end gap-2 p-3 text-right">
          <div>
            <div className="mb-1 text-[10.5px] text-muted-foreground">اسم الزبون</div>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="h-9 w-56 text-right text-xs" placeholder="مثال: أحمد محمود" />
          </div>
          <div>
            <div className="mb-1 text-[10.5px] text-muted-foreground">رقم الهاتف</div>
            <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="h-9 w-44 text-right text-xs tabular-nums" placeholder="059…" />
          </div>
          <Button size="sm" className="h-9" onClick={createContact} disabled={saving}>
            <UserPlus className="ml-1.5 h-3.5 w-3.5" /> إنشاء وفتح المحفظة
          </Button>
        </div>
      </DynamicsSection>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>إغلاق</Button>
      </div>
    </DynamicsDialog>
  );
}