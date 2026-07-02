/**
 * useJournalBooks — تحميل دفاتر السندات (Journal Books) للمستخدم الحالي مع
 * ضمان وجود دفتر افتراضي (GENERAL) دائماً. يُستخدم في شاشة إنشاء القيد وفي
 * صفحة إدارة الدفاتر.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useAuth } from "@/hooks/useAuth";

export interface JournalBook {
  id: string;
  user_id: string;
  code: string;
  name: string;
  description: string | null;
  color: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useJournalBooks(opts: { includeInactive?: boolean } = {}) {
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const owner = dataOwnerId || user?.id || null;
  const [books, setBooks] = useState<JournalBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!owner) return;
    setLoading(true);
    setError(null);
    try {
      // Ensure default book exists (idempotent)
      await supabase.rpc("ensure_default_journal_book" as any, { _user_id: owner });

      let q = supabase
        .from("journal_books" as any)
        .select("*")
        .eq("user_id", owner)
        .order("is_default", { ascending: false })
        .order("code", { ascending: true });

      if (!opts.includeInactive) q = q.eq("is_active", true);

      const { data, error: e } = await q;
      if (e) throw e;
      setBooks((data as unknown as JournalBook[]) || []);
    } catch (e: any) {
      setError(e.message || "فشل تحميل دفاتر السندات");
    } finally {
      setLoading(false);
    }
  }, [owner, opts.includeInactive]);

  useEffect(() => {
    load();
  }, [load]);

  const defaultBook = books.find((b) => b.is_default) || books[0] || null;

  return { books, defaultBook, loading, error, refresh: load };
}