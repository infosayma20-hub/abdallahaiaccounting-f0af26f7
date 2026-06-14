import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type FormAccessRow = {
  template_id: string;
  template_name: string;
  template_category: string | null;
  template_description: string | null;
  is_system: boolean;
  can_fill: boolean;
  can_view: boolean;
  fill_source: "job_title" | "manual" | "both" | null;
  view_source: "job_title" | "manual" | "both" | null;
};

/**
 * Fetches and mutates per-employee form access via
 * `get_employee_form_access` RPC + `form_template_assignments` table.
 */
export function useFormAccessManager(employeeId: string | null) {
  const [rows, setRows] = useState<FormAccessRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    if (!employeeId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_employee_form_access", {
        p_employee_id: employeeId,
      });
      if (error) throw error;
      setRows((data as FormAccessRow[]) || []);
    } catch (err: any) {
      console.error("[useFormAccessManager] fetch failed:", err);
      toast({ title: "تعذر تحميل النماذج", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const setAccess = useCallback(
    async (templateId: string, level: "fill" | "view", enabled: boolean) => {
      if (!employeeId) return;
      setSaving(true);
      try {
        if (enabled) {
          // Resolve owner via employee
          const { data: emp, error: empErr } = await supabase
            .from("employees")
            .select("user_id")
            .eq("id", employeeId)
            .maybeSingle();
          if (empErr) throw empErr;
          if (!emp?.user_id) throw new Error("الموظف غير مرتبط بشركة");
          const { data: caller } = await supabase.auth.getUser();
          const { error } = await supabase
            .from("form_template_assignments")
            .upsert(
              {
                template_id: templateId,
                employee_id: employeeId,
                access_level: level,
                user_id: emp.user_id,
                assigned_by: caller.user?.id ?? null,
                is_active: true,
              },
              { onConflict: "template_id,employee_id,access_level" },
            );
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("form_template_assignments")
            .delete()
            .eq("template_id", templateId)
            .eq("employee_id", employeeId)
            .eq("access_level", level);
          if (error) throw error;
        }
        await fetchRows();
        toast({ title: "تم الحفظ ✅" });
      } catch (err: any) {
        console.error(err);
        toast({ title: "تعذر الحفظ", description: err.message, variant: "destructive" });
      } finally {
        setSaving(false);
      }
    },
    [employeeId, fetchRows],
  );

  return { rows, loading, saving, refresh: fetchRows, setAccess };
}