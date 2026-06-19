import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

export interface ReportFolder {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  parent_id: string | null;
  sort_order: number;
}

export function useReportFolders() {
  const { user } = useAuth();
  const [folders, setFolders] = useState<ReportFolder[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setFolders([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("report_folders")
      .select("id, name, color, icon, parent_id, sort_order")
      .eq("user_id", dataOwnerId!)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    setFolders((data as any) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const createFolder = useCallback(
    async (name: string, color = "#3b82f6") => {
      if (!user || !name.trim()) return null;
      const { data, error } = await supabase
        .from("report_folders")
        .insert({ user_id: dataOwnerId!, name: name.trim(), color })
        .select()
        .single();
      if (!error) await refresh();
      return data as any;
    },
    [user, refresh],
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      await supabase.from("report_folders").update({ name: name.trim() }).eq("id", id);
      await refresh();
    },
    [refresh],
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      // Reports inside become uncategorized via ON DELETE SET NULL
      await supabase.from("report_folders").delete().eq("id", id);
      await refresh();
    },
    [refresh],
  );

  return { folders, loading, refresh, createFolder, renameFolder, deleteFolder };
}
