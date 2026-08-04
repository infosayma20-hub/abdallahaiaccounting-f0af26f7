import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LeaveBlackout } from "@/lib/hr/leaveBlackout";

/**
 * قراءة/إدارة الفترات المحظورة لطلبات الإجازات.
 * يستخدمها الموارد البشرية (إضافة/حذف) والموظف (قراءة فقط لتعطيل التواريخ).
 * فشل صامت: عند أي خطأ تبقى القائمة فاضية فيشتغل النظام كالسابق.
 */
export function useLeaveBlackoutDates() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [ranges, setRanges] = useState<LeaveBlackout[]>([]);
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
      .from("hr_leave_blackout_dates")
      .select("id, start_date, end_date, reason, branch_id, is_active")
      .eq("user_id", ownerId)
      .eq("is_active", true)
      .order("start_date", { ascending: true });
    if (!error) setRanges((data ?? []) as LeaveBlackout[]);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => { refresh(); }, [refresh]);

  const add = useCallback(
    async (input: { start_date: string; end_date: string; reason?: string | null; branch_id?: string | null }) => {
      if (!ownerId) throw new Error("تعذر تحديد الشركة");
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("hr_leave_blackout_dates").insert({
        user_id: ownerId,
        start_date: input.start_date,
        end_date: input.end_date,
        reason: input.reason?.trim() || null,
        branch_id: input.branch_id || null,
        created_by: auth?.user?.id ?? null,
      });
      if (error) throw error;
      await refresh();
    },
    [ownerId, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await (supabase as any).from("hr_leave_blackout_dates").delete().eq("id", id);
      if (error) throw error;
      await refresh();
    },
    [refresh],
  );

  return { ranges, loading, refresh, add, remove, ownerId };
}
