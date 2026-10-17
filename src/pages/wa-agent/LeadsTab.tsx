import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { WaTrack } from "@/lib/wa/agentPrompt";
import { NAVY, BORDER, MUTED, SOFT, card, input, th, td, btnPrimary, btnGhost, LEAD_STATUSES } from "./waStyles";

type Lead = {
  id: string; created_at: string; name: string | null; company: string | null; city: string | null;
  phone_given: string | null; track_key: string | null; details: string | null; questions: string | null;
  deadline: string | null; best_time: string | null; existing_client: boolean | null; urgent: boolean;
  attachments_count: number; status: string; conversation_id: string | null;
};
type Msg = { id: string; direction: string; type: string; body: string | null; transcript: string | null; created_at: string };

const fmt = (d: string) => new Date(d).toLocaleString("ar", { timeZone: "Asia/Hebron", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function LeadsTab({ ownerId }: { ownerId: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tracks, setTracks] = useState<WaTrack[]>([]);
  const [trackF, setTrackF] = useState("");
  const [statusF, setStatusF] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Lead | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: l, error }, { data: p }] = await Promise.all([
      supabase.from("wa_leads").select("*").eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(500),
      supabase.from("wa_agent_profiles").select("tracks").eq("owner_id", ownerId).maybeSingle(),
    ]);
    if (error) toast.error("تعذر تحميل الطلبات");
    setLeads((l || []) as Lead[]);
    setTracks(((p?.tracks as unknown) as WaTrack[]) || []);
    setLoading(false);
  }, [ownerId]);
  useEffect(() => { load(); }, [load]);

  const trackLabel = (k: string | null) => tracks.find((t) => t.key === k)?.label || k || "—";
  const rows = useMemo(() => leads.filter((l) => (!trackF || l.track_key === trackF) && (!statusF || l.status === statusF)), [leads, trackF, statusF]);

  const setStatus = async (lead: Lead, status: string) => {
    const { error } = await supabase.from("wa_leads").update({ status }).eq("id", lead.id);
    if (error) return toast.error("تعذر تحديث الحالة");
    setLeads((ls) => ls.map((x) => (x.id === lead.id ? { ...x, status } : x)));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select dir="rtl" value={trackF} onChange={(e) => setTrackF(e.target.value)} style={{ ...input, width: 200 }}>
          <option value="">كل المسارات</option>
          {tracks.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select dir="rtl" value={statusF} onChange={(e) => setStatusF(e.target.value)} style={{ ...input, width: 180 }}>
          <option value="">كل الحالات</option>
          {LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <span style={{ fontSize: 13, color: MUTED, alignSelf: "center" }}>{rows.length} طلب</span>
      </div>

      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th}>التاريخ</th><th style={th}>الاسم</th><th style={th}>الشركة</th>
            <th style={th}>المسار</th><th style={th}>الأولوية</th><th style={th}>الحالة</th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td style={{ ...td, color: MUTED }} colSpan={6}>جارٍ التحميل…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td style={{ ...td, color: MUTED, textAlign: "center", padding: 32 }} colSpan={6}>لا توجد طلبات بعد</td></tr>
            ) : rows.map((l) => (
              <tr key={l.id} onClick={() => setOpen(l)} style={{ cursor: "pointer" }}>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{fmt(l.created_at)}</td>
                <td style={{ ...td, fontWeight: 600 }}>{l.name || "—"}</td>
                <td style={td}>{l.company || "—"}</td>
                <td style={td}>{trackLabel(l.track_key)}</td>
                <td style={td}>{l.urgent && <span style={{ background: "#FDECEC", color: "#A32D2D", border: "1px solid #F3C5C5", borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>مستعجل</span>}</td>
                <td style={td} onClick={(e) => e.stopPropagation()}>
                  <select dir="rtl" value={l.status} onChange={(e) => setStatus(l, e.target.value)} style={{ ...input, width: 140, padding: "4px 8px", fontSize: 13 }}>
                    {LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && <LeadDrawer lead={open} ownerId={ownerId} trackLabel={trackLabel(open.track_key)} onClose={() => setOpen(null)} />}
    </div>
  );
}

function LeadDrawer({ lead, ownerId, trackLabel, onClose }: { lead: Lead; ownerId: string; trackLabel: string; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [waContact, setWaContact] = useState<{ id: string; linked_contact_id: string | null; profile_name: string | null; phone: string | null } | null>(null);
  const [linkedName, setLinkedName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!lead.conversation_id) return;
      const [{ data: m }, { data: conv }] = await Promise.all([
        supabase.from("wa_messages").select("id,direction,type,body,transcript,created_at").eq("conversation_id", lead.conversation_id).order("created_at"),
        supabase.from("wa_conversations").select("contact_id").eq("id", lead.conversation_id).maybeSingle(),
      ]);
      setMsgs((m || []) as Msg[]);
      if (conv?.contact_id) {
        const { data: c } = await supabase.from("wa_contacts").select("id,linked_contact_id,profile_name,phone").eq("id", conv.contact_id).maybeSingle();
        setWaContact(c);
        if (c?.linked_contact_id) {
          const { data: k } = await supabase.from("contacts").select("contact_name").eq("id", c.linked_contact_id).maybeSingle();
          setLinkedName(k?.contact_name || null);
        }
      }
    })();
  }, [lead.conversation_id]);

  const convert = async () => {
    if (!waContact) return toast.error("لا توجد جهة واتساب مرتبطة بهذا الطلب");
    setBusy(true);
    try {
      const phone = (lead.phone_given || waContact.phone || "").replace(/\D/g, "");
      let contactId: string | null = null;
      let name: string | null = null;
      if (phone.length >= 7) {
        const tail = phone.slice(-9);
        const { data: found } = await supabase.from("contacts").select("id, contact_name, phone")
          .eq("user_id", ownerId).eq("is_archived", false).ilike("phone", `%${tail}%`).limit(1);
        if (found?.length) { contactId = found[0].id; name = found[0].contact_name; }
      }
      if (!contactId) {
        name = lead.company || lead.name || waContact.profile_name || "عميل واتساب";
        const { data: created, error } = await supabase.from("contacts").insert({
          user_id: ownerId, contact_name: name, contact_type: "عميل", phone: phone || null,
          address: lead.city || null, source: "whatsapp",
          notes: lead.name && lead.company ? `جهة الاتصال: ${lead.name}` : null,
        }).select("id").single();
        if (error) throw error;
        contactId = created.id;
      }
      const { error: lErr } = await supabase.from("wa_contacts").update({ linked_contact_id: contactId }).eq("id", waContact.id);
      if (lErr) throw lErr;
      setWaContact({ ...waContact, linked_contact_id: contactId });
      setLinkedName(name);
      toast.success("تم الربط بجهة التعامل");
    } catch (e: any) {
      toast.error(e?.message || "تعذر التحويل");
    } finally { setBusy(false); }
  };

  const F = ({ k, v }: { k: string; v: string | null | undefined }) => (
    <div><div style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>{k}</div><div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{v || "—"}</div></div>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(13,27,46,0.35)", zIndex: 60 }}>
      <div dir="rtl" onClick={(e) => e.stopPropagation()} style={{
        position: "absolute", top: 0, bottom: 0, right: 0, width: "min(560px, 100%)", background: "#FFFFFF",
        display: "flex", flexDirection: "column", fontFamily: "Cairo, sans-serif", color: NAVY, boxShadow: "-8px 0 24px rgba(13,27,46,0.15)",
      }}>
        <div style={{ padding: 16, borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{lead.name || "طلب واتساب"} {lead.urgent && <span style={{ color: "#A32D2D", fontSize: 12 }}>· مستعجل</span>}</div>
          <button type="button" onClick={onClose} style={btnGhost}>إغلاق</button>
        </div>
        <div style={{ overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <F k="المسار" v={trackLabel} /><F k="الشركة" v={lead.company} />
            <F k="المدينة" v={lead.city} /><F k="الرقم" v={lead.phone_given} />
            <F k="أفضل وقت" v={lead.best_time} /><F k="الموعد" v={lead.deadline} />
            <F k="زبون حالي" v={lead.existing_client == null ? null : lead.existing_client ? "نعم" : "لا"} />
            <F k="مرفقات" v={String(lead.attachments_count || 0)} />
          </div>
          <F k="التفاصيل" v={lead.details} />
          {lead.questions && <F k="أسئلة الزبون" v={lead.questions} />}

          <div style={{ ...card, background: SOFT, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, fontSize: 13 }}>
              {waContact?.linked_contact_id ? <>مرتبط بجهة التعامل: <b>{linkedName || "—"}</b></> : "غير مرتبط بجهة تعامل"}
            </div>
            {!waContact?.linked_contact_id && (
              <button type="button" disabled={busy} onClick={convert} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>تحويل إلى جهة تعامل</button>
            )}
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>المحادثة</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {msgs.length === 0 && <div style={{ fontSize: 13, color: MUTED }}>لا توجد رسائل</div>}
              {msgs.map((m) => {
                const inbound = m.direction === "in";
                return (
                  <div key={m.id} style={{ alignSelf: inbound ? "flex-start" : "flex-end", maxWidth: "80%" }}>
                    <div style={{
                      background: inbound ? "#FFFFFF" : NAVY, color: inbound ? NAVY : "#FFFFFF",
                      border: inbound ? `1px solid ${BORDER}` : "none", borderRadius: 12, padding: "8px 12px", fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.7,
                    }}>
                      {m.type === "audio" ? "رسالة صوتية" : m.body}
                      {m.type === "audio" && m.transcript && (
                        <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px dashed ${inbound ? BORDER : "rgba(255,255,255,0.35)"}`, fontSize: 12, opacity: 0.9 }}>
                          النص: {m.transcript}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: MUTED, marginTop: 2, textAlign: inbound ? "right" : "left" }}>{fmt(m.created_at)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
