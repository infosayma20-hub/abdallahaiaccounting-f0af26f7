import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type HRReminder = {
  id: string;
  title: string;
  note: string | null;
  remind_at: string; // YYYY-MM-DD
  is_done: boolean;
  employee_id: string | null;
  related_form_id: string | null;
  employee_name?: string | null;
};

/**
 * تذكيرات الموارد البشرية المخصصة: "ذكّرني بتاريخ X أن مر شهر على طلب قرض الموظف الفلاني".
 * النطاق: فريق الشركة (user_id = get_team_owner_id()) — مثل فترات حظر الإجازات.
 * فشل صامت عند القراءة: تبقى القائمة فاضية ويشتغل النظام كالسابق.
 */
export function useHRReminders() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [reminders, setReminders] = useState<HRReminder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: owner } = await supabase.rpc("get_team_owner_id");
      const { data: auth } = await supabase.auth.getUser();
      if (!cancelled) setOwnerId(((owner as string) || auth?.user?.id) ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("hr_reminders")
      .select("id, title, note, remind_at, is_done, employee_id, related_form_id, employees(full_name)")
      .eq("user_id", ownerId)
      .eq("is_done", false)
      .order("remind_at", { ascending: true })
      .limit(200);
    if (!error) {
      setReminders(
        ((data ?? []) as any[]).map((r) => ({
          ...r,
          employee_name: r.employees?.full_name ?? null,
        })),
      );
    }
    setLoading(false);
  }, [ownerId]);

  useEffect(() => { refresh(); }, [refresh]);

  const add = useCallback(
    async (input: {
      title: string;
      note?: string | null;
      remind_at: string;
      employee_id?: string | null;
      related_form_id?: string | null;
    }) => {
      if (!ownerId) throw new Error("تعذر تحديد الشركة");
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("hr_reminders").insert({
        user_id: ownerId,
        created_by: auth?.user?.id ?? null,
        title: input.title.trim(),
        note: input.note?.trim() || null,
        remind_at: input.remind_at,
        employee_id: input.employee_id || null,
        related_form_id: input.related_form_id || null,
      });
      if (error) throw error;
      await refresh();
    },
    [ownerId, refresh],
  );

  const markDone = useCallback(
    async (id: string) => {
      const { error } = await (supabase as any)
        .from("hr_reminders")
        .update({ is_done: true, done_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await (supabase as any).from("hr_reminders").delete().eq("id", id);
      if (error) throw error;
      await refresh();
    },
    [refresh],
  );

  return { reminders, loading, refresh, add, markDone, remove, ownerId };
}

/** تاريخ اليوم المحلي بصيغة YYYY-MM-DD */
export function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
