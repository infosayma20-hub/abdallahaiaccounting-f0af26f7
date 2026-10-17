import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { NAVY, MUTED, SOFT, card, label, input, btnPrimary, btnGhost } from "./waStyles";

type Channel = { id: string; phone_number_id: string; waba_id: string | null; display_phone: string | null; display_name: string | null; token_secret_id: string | null; status: string; connected_via: string };
const STATUS: Record<string, { t: string; bg: string; c: string }> = {
  test: { t: "تجريبي", bg: "#EEF2F8", c: NAVY },
  live: { t: "مباشر", bg: "#E7F5EE", c: "#0F6E56" },
  disconnected: { t: "غير متصل", bg: "#FDECEC", c: "#A32D2D" },
};

export default function ChannelTab({ ownerId }: { ownerId: string }) {
  const [ch, setCh] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ phone_number_id: "", waba_id: "", display_phone: "" });
  const [token, setToken] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("wa_channels").select("*").eq("owner_id", ownerId).order("created_at").limit(1).maybeSingle();
    setCh(data as Channel | null);
    if (data) setForm({ phone_number_id: data.phone_number_id, waba_id: data.waba_id || "", display_phone: data.display_phone || "" });
    setLoading(false);
  }, [ownerId]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!/^\d{6,30}$/.test(form.phone_number_id.trim())) return toast.error("Phone number ID أرقام فقط");
    setBusy(true);
    try {
      const row = { owner_id: ownerId, phone_number_id: form.phone_number_id.trim(), waba_id: form.waba_id.trim() || null, display_phone: form.display_phone.trim() || null };
      let id = ch?.id;
      if (ch) {
        const { error } = await supabase.from("wa_channels").update(row).eq("id", ch.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("wa_channels").insert({ ...row, status: "test", connected_via: "manual" }).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      if (token.trim()) {
        const { data, error } = await supabase.functions.invoke("wa-save-token", { body: { channel_id: id, token: token.trim() } });
        if (error || (data as any)?.error) throw new Error((data as any)?.error || "تعذر حفظ المفتاح");
      }
      setToken(""); setReplacing(false);
      toast.success("تم الحفظ");
      await load();
    } catch (e: any) {
      toast.error(e?.message?.includes("duplicate") ? "هذا الرقم مربوط بحساب آخر" : e?.message || "تعذر الحفظ");
    } finally { setBusy(false); }
  };

  if (loading) return <div style={{ color: MUTED, fontSize: 13 }}>جارٍ التحميل…</div>;
  const st = STATUS[ch?.status || "disconnected"];
  const hasToken = !!ch?.token_secret_id;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }} dir="ltr">{ch?.display_phone || "لا يوجد رقم مربوط"}</div>
          <div style={{ fontSize: 12, color: MUTED }}>{ch ? (ch.connected_via === "manual" ? "ربط يدوي" : "ربط عبر ميتا") : "اربط رقمك من النموذج أدناه"}</div>
        </div>
        {ch && <span style={{ background: st.bg, color: st.c, borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>{st.t}</span>}
        <button type="button" disabled title="قريباً" style={{ ...btnGhost, opacity: 0.55, cursor: "not-allowed" }}>ربط رقم واتساب · قريباً</button>
      </div>

      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontWeight: 700 }}>الربط اليدوي</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><span style={label}>Phone number ID</span><input dir="ltr" style={input} value={form.phone_number_id} onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })} /></div>
          <div><span style={label}>WABA ID</span><input dir="ltr" style={input} value={form.waba_id} onChange={(e) => setForm({ ...form, waba_id: e.target.value })} /></div>
          <div><span style={label}>الرقم الظاهر</span><input dir="ltr" style={input} value={form.display_phone} onChange={(e) => setForm({ ...form, display_phone: e.target.value })} /></div>
        </div>
        <div>
          <span style={label}>مفتاح الوصول (Access token)</span>
          {hasToken && !replacing ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: SOFT, borderRadius: 8, padding: "8px 12px" }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#0F6E56" }}>محفوظ</span>
              <button type="button" style={btnGhost} onClick={() => setReplacing(true)}>استبدال</button>
            </div>
          ) : (
            <input dir="ltr" type="password" autoComplete="off" style={input} value={token} onChange={(e) => setToken(e.target.value)} placeholder="يُحفظ مشفّرًا ولا يظهر مرة أخرى" />
          )}
        </div>
        <div><button type="button" onClick={save} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{busy ? "جارٍ الحفظ…" : "حفظ"}</button></div>
      </div>
    </div>
  );
}
