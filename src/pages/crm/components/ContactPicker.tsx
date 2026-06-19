import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

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

  useEffect(() => {
    if (!user) return;
    (supabase as any).from("contacts")
      .select("id, contact_name")
      .eq("user_id", dataOwnerId!)
      .eq("is_archived", false)
      .order("contact_name", { ascending: true })
      .limit(500)
      .then(({ data }: any) => setOptions((data as Option[]) || []));
  }, [user]);

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      required={required}
      className="w-full h-9 px-2 rounded-md border border-slate-200 text-[12px] bg-white"
    >
      {allowEmpty && <option value="">— بدون عميل —</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.contact_name}</option>
      ))}
    </select>
  );
}