import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buildAgentPrompt, type WaTrack } from "@/lib/wa/agentPrompt";
import { NAVY, BORDER, MUTED, SOFT, card, label, input, textarea, btnPrimary, btnGhost } from "./waStyles";

type Profile = {
  id?: string; business_name: string; agent_name: string; intro_line: string; tracks: WaTrack[];
  pricing_rule: string; forbidden_topics: string; office_hours: string; response_promise: string;
  notify_whatsapp: string; custom_prompt: string; model: string; is_active: boolean;
};
const EMPTY: Profile = {
  business_name: "", agent_name: "", intro_line: "", tracks: [], pricing_rule: "", forbidden_topics: "",
  office_hours: "", response_promise: "", notify_whatsapp: "", custom_prompt: "", model: "claude-sonnet-5-5", is_active: false,
};
const MAX_TRACKS = 8;

export default function SettingsTab({ ownerId }: { ownerId: string }) {
  const [p, setP] = useState<Profile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("wa_agent_profiles").select("*").eq("owner_id", ownerId).maybeSingle().then(({ data }) => {
      if (data) {
        const d: any = data;
        setP({
          id: d.id, business_name: d.business_name || "", agent_name: d.agent_name || "", intro_line: d.intro_line || "",
          tracks: Array.isArray(d.tracks) ? d.tracks : [], pricing_rule: d.pricing_rule || "", forbidden_topics: d.forbidden_topics || "",
          office_hours: d.office_hours || "", response_promise: d.response_promise || "", notify_whatsapp: d.notify_whatsapp || "",
          custom_prompt: d.custom_prompt || "", model: d.model || EMPTY.model, is_active: !!d.is_active,
        });
      }
      setLoading(false);
    });
  }, [ownerId]);

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }));
  const setTrack = (i: number, patch: Partial<WaTrack>) => set("tracks", p.tracks.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const moveTrack = (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= p.tracks.length) return;
    const arr = [...p.tracks]; [arr[i], arr[j]] = [arr[j], arr[i]]; set("tracks", arr);
  };

  const preview = useMemo(() => buildAgentPrompt({ ...p, custom_prompt: p.custom_prompt || null }), [p]);

  const save = async () => {
    const keys = p.tracks.map((t) => t.key.trim());
    if (keys.some((k) => !/^[a-z0-9_]+$/.test(k))) return toast.error("مفتاح كل مسار: أحرف إنجليزية صغيرة وأرقام و _ فقط");
    if (new Set(keys).size !== keys.length) return toast.error("مفاتيح المسارات يجب أن تكون مختلفة");
    if (p.tracks.some((t) => !t.label.trim())) return toast.error("اكتب اسم كل مسار");
    setSaving(true);
    const tracks = p.tracks.map((t) => ({
      key: t.key.trim(), label: t.label.trim(),
      questions: (t.questions || []).map((q) => q.trim()).filter(Boolean),
      urgency_hint: t.urgency_hint?.trim() || null,
      ...(t.notify_whatsapp?.trim() ? { notify_whatsapp: t.notify_whatsapp.replace(/\D/g, "") } : {}),
    }));
    const row = {
      owner_id: ownerId, business_name: p.business_name || null, agent_name: p.agent_name || null, intro_line: p.intro_line || null,
      tracks, pricing_rule: p.pricing_rule || null, forbidden_topics: p.forbidden_topics || null, office_hours: p.office_hours || null,
      response_promise: p.response_promise || null, notify_whatsapp: p.notify_whatsapp.replace(/\D/g, "") || null,
      custom_prompt: p.custom_prompt.trim() || null, model: p.model.trim() || EMPTY.model, is_active: p.is_active,
    };
    const { error } = await supabase.from("wa_agent_profiles").upsert(row as any, { onConflict: "owner_id" });
    setSaving(false);
    if (error) return toast.error("تعذر الحفظ: " + error.message);
    toast.success("تم حفظ الإعدادات");
  };

  if (loading) return <div style={{ color: MUTED, fontSize: 13 }}>جارٍ التحميل…</div>;

  const Field = ({ k, l, area }: { k: keyof Profile; l: string; area?: boolean }) => (
    <div>
      <span style={label}>{l}</span>
      {area
        ? <textarea dir="rtl" style={textarea} value={p[k] as string} onChange={(e) => set(k, e.target.value as any)} />
        : <input dir="rtl" style={input} value={p[k] as string} onChange={(e) => set(k, e.target.value as any)} />}
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: 16, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ ...card, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{p.is_active ? "الوكيل شغال" : "الوكيل موقوف"}</div>
            <div style={{ fontSize: 12, color: MUTED }}>عند الإيقاف تُحفظ الرسائل فقط دون رد.</div>
          </div>
          <button type="button" role="switch" aria-checked={p.is_active} onClick={() => set("is_active", !p.is_active)}
            style={{ width: 52, height: 28, borderRadius: 999, border: "none", cursor: "pointer", position: "relative", background: p.is_active ? NAVY : "#C9D0DA" }}>
            <span style={{ position: "absolute", top: 3, width: 22, height: 22, borderRadius: "50%", background: "#FFFFFF", right: p.is_active ? 3 : 27, transition: "right .15s" }} />
          </button>
        </div>

        <div style={{ ...card, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {Field({ k: "business_name", l: "اسم النشاط" })}
          {Field({ k: "agent_name", l: "اسم المساعد" })}
          <div style={{ gridColumn: "1 / -1" }}>{Field({ k: "intro_line", l: "سطر التعريف", area: true })}</div>
          {Field({ k: "office_hours", l: "ساعات الدوام" })}
          {Field({ k: "response_promise", l: "وعد الرد" })}
          {Field({ k: "notify_whatsapp", l: "رقم واتساب للتنبيهات" })}
          {Field({ k: "model", l: "النموذج" })}
        </div>

        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ fontWeight: 700, flex: 1 }}>المسارات ({p.tracks.length}/{MAX_TRACKS})</div>
            <button type="button" style={{ ...btnGhost, opacity: p.tracks.length >= MAX_TRACKS ? 0.5 : 1 }} disabled={p.tracks.length >= MAX_TRACKS}
              onClick={() => set("tracks", [...p.tracks, { key: `track_${p.tracks.length + 1}`, label: "", questions: [""], urgency_hint: "" }])}>إضافة مسار</button>
          </div>
          {p.tracks.map((t, i) => (
            <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12, background: SOFT, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
                <span style={{ fontWeight: 700, width: 20 }}>{i + 1}</span>
                <div style={{ flex: 2 }}><span style={label}>اسم المسار</span><input dir="rtl" style={input} value={t.label} onChange={(e) => setTrack(i, { label: e.target.value })} /></div>
                <div style={{ flex: 1 }}><span style={label}>المفتاح</span><input dir="ltr" style={input} value={t.key} onChange={(e) => setTrack(i, { key: e.target.value })} /></div>
                <button type="button" style={btnGhost} onClick={() => moveTrack(i, -1)} aria-label="أعلى">▲</button>
                <button type="button" style={btnGhost} onClick={() => moveTrack(i, 1)} aria-label="أسفل">▼</button>
                <button type="button" style={{ ...btnGhost, color: "#A32D2D" }} onClick={() => set("tracks", p.tracks.filter((_, j) => j !== i))}>حذف</button>
              </div>
              <span style={label}>الأسئلة</span>
              {(t.questions || []).map((q, qi) => (
                <div key={qi} style={{ display: "flex", gap: 6 }}>
                  <input dir="rtl" style={input} value={q} onChange={(e) => setTrack(i, { questions: (t.questions || []).map((x, y) => (y === qi ? e.target.value : x)) })} />
                  <button type="button" style={btnGhost} onClick={() => setTrack(i, { questions: (t.questions || []).filter((_, y) => y !== qi) })}>حذف</button>
                </div>
              ))}
              <button type="button" style={{ ...btnGhost, alignSelf: "flex-start" }} onClick={() => setTrack(i, { questions: [...(t.questions || []), ""] })}>إضافة سؤال</button>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div><span style={label}>مؤشر الاستعجال</span><input dir="rtl" style={input} value={t.urgency_hint || ""} onChange={(e) => setTrack(i, { urgency_hint: e.target.value })} /></div>
                <div><span style={label}>رقم تنبيه خاص (اختياري)</span><input dir="ltr" style={input} value={t.notify_whatsapp || ""} onChange={(e) => setTrack(i, { notify_whatsapp: e.target.value })} /></div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
          {Field({ k: "pricing_rule", l: "قاعدة الأسعار", area: true })}
          {Field({ k: "forbidden_topics", l: "مواضيع ممنوعة", area: true })}
          {Field({ k: "custom_prompt", l: "تعليمات إضافية (اختياري)", area: true })}
        </div>

        <div><button type="button" onClick={save} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1, padding: "10px 28px" }}>{saving ? "جارٍ الحفظ…" : "حفظ الإعدادات"}</button></div>
      </div>

      <div style={{ ...card, position: "sticky", top: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>معاينة تعليمات المساعد</div>
        <pre dir="rtl" style={{ whiteSpace: "pre-wrap", fontFamily: "Cairo, sans-serif", fontSize: 12, lineHeight: 1.8, color: NAVY, background: SOFT, borderRadius: 8, padding: 12, maxHeight: "70vh", overflowY: "auto", margin: 0 }}>{preview}</pre>
      </div>
    </div>
  );
}
