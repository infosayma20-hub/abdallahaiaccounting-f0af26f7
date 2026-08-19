import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { BUILTIN_FORMS } from "@/lib/hr/builtinForms";

export type FormKind = "builtin" | "template";

export type FormCatalogRow = {
  kind: FormKind;
  form_key: string | null;
  template_id: string | null;
  name: string;
  category: string | null;
  is_active: boolean;
  fill_count: number;
  view_count: number;
  fill_is_default: boolean;
};

export type FormAudienceRow = {
  employee_id: string;
  full_name: string;
  job_title: string | null;
  branch_name: string | null;
  roles: string[];
  can_fill: boolean;
  can_view: boolean;
  fill_source: "manual" | "job_title" | "both" | "default" | "branch_manager" | null;
  view_source: "manual" | "job_title" | "both" | "default" | null;
};

export type FormRef = {
  kind: FormKind;
  form_key?: string | null;
  template_id?: string | null;
  name: string;
  /** Builtin form restricted to branch managers (matches the employee app). */
  manager_only?: boolean;
};

const MANAGER_ONLY_KEYS = BUILTIN_FORMS.filter((f) => f.managerOnly).map((f) => f.key);

/** Catalog of all forms (builtin + templates) with audience counts. */
export function useFormCatalog() {
  const [rows, setRows] = useState<FormCatalogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("get_form_catalog", {
        p_builtin_keys: BUILTIN_FORMS.map((f) => f.key),
        p_manager_only_keys: MANAGER_ONLY_KEYS,
      });
      if (error) throw error;
      const list = ((data || []) as FormCatalogRow[]).map((r) =>
        r.kind === "builtin"
          ? { ...r, name: BUILTIN_FORMS.find((b) => b.key === r.form_key)?.name && r.name === r.form_key
              ? BUILTIN_FORMS.find((b) => b.key === r.form_key)!.name
              : r.name }
          : r,
      );
      setRows(list);
    } catch (err: any) {
      console.error("[useFormCatalog]", err);
      toast({ title: "تعذر تحميل النماذج", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { rows, loading, refresh };
}

/** Audience (all active employees + their access) for a single form. */
export function useFormAudience(form: FormRef | null) {
  const [rows, setRows] = useState<FormAudienceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!form) { setRows([]); return; }
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("get_form_audience", {
        p_kind: form.kind,
        p_form_key: form.form_key ?? null,
        p_template_id: form.template_id ?? null,
        p_manager_only: !!form.manager_only,
      });
      if (error) throw error;
      setRows((data || []) as FormAudienceRow[]);
    } catch (err: any) {
      console.error("[useFormAudience]", err);
      toast({ title: "تعذر تحميل الموظفين", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [form?.kind, form?.form_key, form?.template_id, form?.manager_only]);

  useEffect(() => { refresh(); }, [refresh]);

  const setAccess = useCallback(
    async (employeeIds: string[], level: "fill" | "view", enabled: boolean) => {
      if (!form || employeeIds.length === 0) return;
      setSaving(true);
      try {
        const { error } = await (supabase as any).rpc("set_form_access", {
          p_kind: form.kind,
          p_level: level,
          p_enabled: enabled,
          p_employee_ids: employeeIds,
          p_form_key: form.form_key ?? null,
          p_template_id: form.template_id ?? null,
        });
        if (error) throw error;
        await refresh();
        toast({ title: enabled ? "تم المنح ✅" : "تم السحب ✅" });
      } catch (err: any) {
        console.error(err);
        toast({ title: "تعذر الحفظ", description: err.message, variant: "destructive" });
      } finally {
        setSaving(false);
      }
    },
    [form?.kind, form?.form_key, form?.template_id, refresh],
  );

  return { rows, loading, saving, refresh, setAccess };
}
