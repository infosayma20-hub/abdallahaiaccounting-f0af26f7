import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface JournalTemplateLine {
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  memo?: string;
  contact_id?: string | null;
  contact_name?: string | null;
}

export interface JournalTemplate {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  description: string | null;
  default_subtype: string | null;
  default_contact_id: string | null;
  lines: JournalTemplateLine[];
  usage_count: number;
  last_used_at: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface SaveTemplateInput {
  name: string;
  icon?: string;
  description?: string;
  default_subtype?: string;
  default_contact_id?: string | null;
  lines: JournalTemplateLine[];
}

/**
 * useJournalTemplates — load / save / apply / delete journal templates
 * Per-user via RLS. Sorted: pinned → most-used → recent.
 */
export function useJournalTemplates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<JournalTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("journal_templates" as any)
      .select("*")
      .order("is_pinned", { ascending: false })
      .order("usage_count", { ascending: false })
      .order("last_used_at", { ascending: false, nullsFirst: false });
    if (!error && data) {
      setTemplates(
        (data as any[]).map((t) => ({
          ...t,
          lines: Array.isArray(t.lines) ? t.lines : [],
        })) as JournalTemplate[]
      );
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  const saveTemplate = useCallback(
    async (input: SaveTemplateInput): Promise<JournalTemplate | null> => {
      if (!user) return null;
      const cleanLines = (input.lines || []).filter(
        (l) => l.account_code || Number(l.debit) > 0 || Number(l.credit) > 0
      );
      if (!input.name.trim()) {
        toast.error("اسم القالب مطلوب");
        return null;
      }
      if (cleanLines.length < 2) {
        toast.error("القالب يحتاج سطرين على الأقل");
        return null;
      }
      const { data, error } = await supabase
        .from("journal_templates" as any)
        .insert({
          user_id: user.id,
          name: input.name.trim(),
          icon: input.icon || "📋",
          description: input.description || null,
          default_subtype: input.default_subtype || "normal",
          default_contact_id: input.default_contact_id || null,
          lines: cleanLines,
        })
        .select()
        .single();
      if (error) {
        toast.error(error.message);
        return null;
      }
      toast.success(`تم حفظ القالب "${input.name}"`);
      await reload();
      return data as unknown as JournalTemplate;
    },
    [user, reload]
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("journal_templates" as any).delete().eq("id", id);
      if (error) {
        toast.error(error.message);
        return false;
      }
      toast.success("تم حذف القالب");
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      return true;
    },
    []
  );

  const togglePin = useCallback(
    async (id: string, next: boolean) => {
      const { error } = await supabase
        .from("journal_templates" as any)
        .update({ is_pinned: next })
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setTemplates((prev) =>
        [...prev.map((t) => (t.id === id ? { ...t, is_pinned: next } : t))].sort((a, b) => {
          if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
          return (b.usage_count || 0) - (a.usage_count || 0);
        })
      );
    },
    []
  );

  const markUsed = useCallback(async (id: string) => {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    await supabase
      .from("journal_templates" as any)
      .update({
        usage_count: (tpl.usage_count || 0) + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", id);
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, usage_count: (t.usage_count || 0) + 1, last_used_at: new Date().toISOString() }
          : t
      )
    );
  }, [templates]);

  return {
    templates,
    loading,
    reload,
    saveTemplate,
    deleteTemplate,
    togglePin,
    markUsed,
  };
}

export default useJournalTemplates;
