// Global CRM search — lookup leads, opportunities, and contacts in one box.
// Uses simple ilike queries; opens a dropdown with grouped results.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, Target, UserCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

interface Hit {
  id: string;
  kind: "lead" | "opportunity" | "contact";
  title: string;
  subtitle?: string;
}

export default function CrmGlobalSearch() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!user || q.trim().length < 2) { setResults([]); return; }
    const handle = setTimeout(async () => {
      setLoading(true);
      const term = `%${q.trim()}%`;
      const [leads, opps, contacts] = await Promise.all([
        supabase.from("crm_leads")
          .select("id, title, contact_name, phone, company_name")
          .or(`title.ilike.${term},contact_name.ilike.${term},phone.ilike.${term},company_name.ilike.${term}`)
          .limit(5),
        supabase.from("crm_opportunities")
          .select("id, title, customer_name, expected_value")
          .or(`title.ilike.${term},customer_name.ilike.${term}`)
          .limit(5),
        supabase.from("contacts")
          .select("id, contact_name, phone, contact_class")
          .eq("user_id", dataOwnerId!)
          .eq("is_archived", false)
          .or(`contact_name.ilike.${term},phone.ilike.${term}`)
          .limit(5),
      ]);

      const hits: Hit[] = [
        ...((leads.data as any[]) || []).map((l) => ({
          id: l.id, kind: "lead" as const,
          title: l.title || l.contact_name || "—",
          subtitle: [l.company_name, l.phone].filter(Boolean).join(" · "),
        })),
        ...((opps.data as any[]) || []).map((o) => ({
          id: o.id, kind: "opportunity" as const,
          title: o.title,
          subtitle: [o.customer_name, o.expected_value ? `${Number(o.expected_value).toLocaleString("ar")} ₪` : null].filter(Boolean).join(" · "),
        })),
        ...((contacts.data as any[]) || []).map((c) => ({
          id: c.id, kind: "contact" as const,
          title: c.contact_name,
          subtitle: [c.contact_class ? `فئة ${c.contact_class}` : null, c.phone].filter(Boolean).join(" · "),
        })),
      ];

      setResults(hits);
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [q, user]);

  const go = (hit: Hit) => {
    setOpen(false);
    setQ("");
    if (hit.kind === "lead") navigate("/crm/leads");
    else if (hit.kind === "opportunity") navigate(`/crm/opportunity/${hit.id}`);
    else navigate(`/crm/customer/${hit.id}`);
  };

  const groups = {
    contact: results.filter((r) => r.kind === "contact"),
    opportunity: results.filter((r) => r.kind === "opportunity"),
    lead: results.filter((r) => r.kind === "lead"),
  };

  const groupMeta = {
    contact: { label: "العملاء", icon: UserCircle2, color: "#1B3A5C" },
    opportunity: { label: "الفرص", icon: Target, color: "#7C3AED" },
    lead: { label: "العملاء المحتملون", icon: Users, color: "#0369A1" },
  };

  return (
    <div ref={ref} className="relative w-full max-w-sm" dir="rtl">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="بحث في العملاء، الفرص، العملاء المحتملين..."
          className="h-9 w-full pr-9 pl-3 rounded-lg border border-slate-200 text-[12px] bg-slate-50 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition"
        />
        {loading && <Loader2 className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 animate-spin" />}
      </div>

      {open && q.trim().length >= 2 && (
        <div className="absolute top-full mt-1.5 right-0 left-0 bg-white rounded-xl border border-slate-200 shadow-xl z-50 max-h-[420px] overflow-y-auto">
          {results.length === 0 && !loading ? (
            <div className="p-4 text-center text-[12px] text-slate-400">لا توجد نتائج</div>
          ) : (
            <div className="p-1.5">
              {(Object.keys(groups) as Array<keyof typeof groups>).map((k) => {
                const items = groups[k];
                if (items.length === 0) return null;
                const meta = groupMeta[k];
                const Icon = meta.icon;
                return (
                  <div key={k} className="mb-1">
                    <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-slate-500 uppercase">
                      <Icon className="h-3 w-3" style={{ color: meta.color }} />
                      {meta.label}
                    </div>
                    {items.map((hit) => (
                      <button
                        key={`${hit.kind}-${hit.id}`}
                        onClick={() => go(hit)}
                        className="w-full text-right px-2.5 py-2 rounded-md hover:bg-slate-50 transition group"
                      >
                        <div className="text-[12px] font-semibold text-slate-900 truncate group-hover:text-blue-700">
                          {hit.title}
                        </div>
                        {hit.subtitle && (
                          <div className="text-[10px] text-slate-500 truncate mt-0.5">{hit.subtitle}</div>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
