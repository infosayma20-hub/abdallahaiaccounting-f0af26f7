import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Copy, Trash2, Upload, Pencil } from "lucide-react";

interface Portal { id: string; slug: string; owner_user_id: string; display_name: string; logo_url: string | null; primary_color: string; is_active: boolean }
const empty = { id: "", email: "", slug: "", display_name: "", logo_url: "", primary_color: "#0D1B2E", is_active: true };

export default function TenantPortalsPanel() {
  const [rows, setRows] = useState<Portal[]>([]);
  const [f, setF] = useState({ ...empty });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from("tenant_portals").select("*").order("created_at", { ascending: false });
    if (error) toast.error("تعذر تحميل الروابط"); else setRows((data || []) as Portal[]);
  };
  useEffect(() => { load(); }, []);

  const uploadLogo = async (file: File) => {
    if (file.size > 1024 * 1024) { toast.error("الشعار يجب أن يكون أقل من 1MB"); return; }
    const ext = file.name.split(".").pop() || "png";
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const path = `${user.id}/tenant-portals/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("company-assets").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { toast.error("تعذر رفع الشعار"); return; }
    const { data } = supabase.storage.from("company-assets").getPublicUrl(path);
    setF(s => ({ ...s, logo_url: data.publicUrl }));
  };

  const save = async () => {
    const slug = f.slug.trim().toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/.test(slug)) { toast.error("اسم الرابط: حروف إنجليزية صغيرة وأرقام وشرطة فقط"); return; }
    if (!f.display_name.trim()) { toast.error("اسم الشركة مطلوب"); return; }
    setBusy(true);
    try {
      let ownerId: string | undefined;
      if (!f.id) {
        const { data, error } = await supabase.rpc("sa_find_user_by_email", { p_email: f.email });
        const u = Array.isArray(data) ? data[0] : null;
        if (error || !u) { toast.error("لا يوجد حساب بهذا البريد"); return; }
        ownerId = (u as any).user_id;
      }
      const payload: any = { slug, display_name: f.display_name.trim(), logo_url: f.logo_url || null, primary_color: f.primary_color, is_active: f.is_active };
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = f.id
        ? await supabase.from("tenant_portals").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", f.id)
        : await supabase.from("tenant_portals").insert({ ...payload, owner_user_id: ownerId, created_by: user?.id });
      if (error) {
        toast.error(error.code === "23505" ? "اسم الرابط أو الحساب مستخدم مسبقًا" : "تعذر الحفظ");
        return;
      }
      toast.success("تم الحفظ");
      setF({ ...empty });
      load();
    } finally { setBusy(false); }
  };

  const remove = async (p: Portal) => {
    if (!confirm(`حذف الرابط ${p.slug}.unifyerp.app؟ الحساب وبياناته لا تتأثر.`)) return;
    const { error } = await supabase.from("tenant_portals").delete().eq("id", p.id);
    if (error) toast.error("تعذر الحذف"); else load();
  };

  const card = { background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)", borderRadius: 4, padding: 16 } as const;
  return (
    <div className="space-y-4" dir="rtl">
      <div style={card} className="space-y-3">
        <h3 className="font-bold text-[15px]" style={{ color: "var(--sa-text-primary)" }}>{f.id ? "تعديل رابط خاص" : "رابط خاص جديد لزبون"}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {!f.id && <div><label className="text-xs font-semibold">بريد حساب الشركة (المالك)</label><Input dir="ltr" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="admin@company.com" /></div>}
          <div>
            <label className="text-xs font-semibold">اسم الرابط</label>
            <div className="flex items-center gap-1" dir="ltr"><Input value={f.slug} onChange={e => setF({ ...f, slug: e.target.value.toLowerCase() })} placeholder="leen" /><span className="text-xs whitespace-nowrap">.unifyerp.app</span></div>
          </div>
          <div><label className="text-xs font-semibold">الاسم الظاهر بصفحة الدخول</label><Input value={f.display_name} onChange={e => setF({ ...f, display_name: e.target.value })} /></div>
          <div><label className="text-xs font-semibold">اللون</label><Input type="color" value={f.primary_color} onChange={e => setF({ ...f, primary_color: e.target.value })} className="h-10 w-24 p-1" /></div>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm border rounded px-3 py-2"><Upload className="h-4 w-4" /> رفع الشعار
              <input type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} /></label>
            {f.logo_url && <img src={f.logo_url} alt="" className="h-12 object-contain" />}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_active} onChange={e => setF({ ...f, is_active: e.target.checked })} /> مفعّل</label>
        </div>
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy}>{busy ? "جارٍ الحفظ..." : "حفظ"}</Button>
          {f.id && <Button variant="outline" onClick={() => setF({ ...empty })}>إلغاء</Button>}
        </div>
        <p className="text-xs" style={{ color: "var(--sa-text-muted)" }}>بعد الحفظ يجب إضافة الرابط في إعدادات الدومين ليصبح فعّالًا. للتجربة قبل ذلك: افتح صفحة الدخول مع ‎?portal=اسم_الرابط</p>
      </div>

      <div style={card}>
        {rows.length === 0 ? <p className="text-sm" style={{ color: "var(--sa-text-muted)" }}>لا توجد روابط خاصة بعد.</p> : (
          <div className="space-y-2">
            {rows.map(p => (
              <div key={p.id} className="flex items-center gap-3 border-b pb-2" style={{ borderColor: "var(--sa-card-border)" }}>
                {p.logo_url ? <img src={p.logo_url} alt="" className="h-9 w-9 object-contain" /> : <div className="h-9 w-9 rounded" style={{ background: p.primary_color }} />}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm" style={{ color: "var(--sa-text-primary)" }}>{p.display_name} {!p.is_active && <span className="text-xs text-amber-600">(موقوف)</span>}</div>
                  <div className="text-xs" dir="ltr" style={{ color: "var(--sa-text-muted)", textAlign: "right" }}>{p.slug}.unifyerp.app</div>
                </div>
                <Button size="icon" variant="ghost" title="نسخ الرابط" onClick={() => { navigator.clipboard.writeText(`https://${p.slug}.unifyerp.app`); toast.success("تم النسخ"); }}><Copy className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" title="تعديل" onClick={() => setF({ id: p.id, email: "", slug: p.slug, display_name: p.display_name, logo_url: p.logo_url || "", primary_color: p.primary_color, is_active: p.is_active })}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" title="حذف" onClick={() => remove(p)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
