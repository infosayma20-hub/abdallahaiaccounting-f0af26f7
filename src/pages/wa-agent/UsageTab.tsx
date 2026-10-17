import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MUTED, card, th, td } from "./waStyles";

type Row = { month: string; conversations: number; leads: number; out: number; tokens: number; minutes: number };

const monthKey = (d: string) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Hebron" }).slice(0, 7);

export default function UsageTab({ ownerId }: { ownerId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    (async () => {
      const since = new Date(); since.setMonth(since.getMonth() - 11); since.setDate(1);
      const iso = since.toISOString();
      const [u, c, l] = await Promise.all([
        supabase.from("wa_usage").select("created_at,input_tokens,output_tokens,stt_seconds,messages_out").eq("owner_id", ownerId).gte("created_at", iso).limit(10000),
        supabase.from("wa_conversations").select("created_at").eq("owner_id", ownerId).gte("created_at", iso).limit(10000),
        supabase.from("wa_leads").select("created_at").eq("owner_id", ownerId).gte("created_at", iso).limit(10000),
      ]);
      const map = new Map<string, Row>();
      const get = (d: string) => {
        const k = monthKey(d);
        if (!map.has(k)) map.set(k, { month: k, conversations: 0, leads: 0, out: 0, tokens: 0, minutes: 0 });
        return map.get(k)!;
      };
      for (const r of u.data || []) {
        const x = get(r.created_at);
        x.out += r.messages_out || 0; x.tokens += (r.input_tokens || 0) + (r.output_tokens || 0); x.minutes += Number(r.stt_seconds || 0) / 60;
      }
      for (const r of c.data || []) get(r.created_at).conversations++;
      for (const r of l.data || []) get(r.created_at).leads++;
      setRows([...map.values()].sort((a, b) => b.month.localeCompare(a.month)));
    })();
  }, [ownerId]);

  const n = (v: number) => v.toLocaleString("en-US");
  const label = (m: string) => new Date(m + "-01T12:00:00").toLocaleDateString("ar", { month: "long", year: "numeric" });

  return (
    <div style={{ ...card, padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>
          <th style={th}>الشهر</th><th style={th}>المحادثات</th><th style={th}>الطلبات</th>
          <th style={th}>الرسائل المرسلة</th><th style={th}>رموز الذكاء الاصطناعي</th><th style={th}>دقائق الصوت</th>
        </tr></thead>
        <tbody>
          {rows === null ? <tr><td style={{ ...td, color: MUTED }} colSpan={6}>جارٍ التحميل…</td></tr>
            : rows.length === 0 ? <tr><td style={{ ...td, color: MUTED, textAlign: "center", padding: 32 }} colSpan={6}>لا يوجد استهلاك بعد</td></tr>
            : rows.map((r) => (
              <tr key={r.month}>
                <td style={{ ...td, fontWeight: 700 }}>{label(r.month)}</td>
                <td style={td}>{n(r.conversations)}</td><td style={td}>{n(r.leads)}</td><td style={td}>{n(r.out)}</td>
                <td style={td}>{n(r.tokens)}</td><td style={td}>{r.minutes.toFixed(1)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
