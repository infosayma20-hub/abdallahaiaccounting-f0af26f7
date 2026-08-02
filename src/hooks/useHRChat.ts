import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ChatMessage = {
  id: string;
  thread_id: string;
  sender_type: "employee" | "hr";
  sender_user_id: string | null;
  sender_name: string | null;
  body: string;
  read_at: string | null;
  is_deleted: boolean;
  created_at: string;
};

const PAGE_SIZE = 50;

/**
 * Simple HR <-> employee chat for a single thread.
 * `side` decides which unread counter gets cleared on read.
 */
export function useHRChatThread(threadId: string | null, side: "employee" | "hr") {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const seen = useRef<Set<string>>(new Set());

  const load = useCallback(
    async (before?: string) => {
      if (!threadId) return;
      if (!before) setLoading(true);
      let q = supabase
        .from("hr_chat_messages")
        .select("*")
        .eq("thread_id", threadId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (before) q = q.lt("created_at", before);
      const { data, error } = await q;
      setLoading(false);
      if (error || !data) return;
      const rows = (data as ChatMessage[]).slice().reverse();
      setHasMore(data.length === PAGE_SIZE);
      setMessages((prev) => {
        if (!before) {
          seen.current = new Set(rows.map((r) => r.id));
          return rows;
        }
        const fresh = rows.filter((r) => !seen.current.has(r.id));
        fresh.forEach((r) => seen.current.add(r.id));
        return [...fresh, ...prev];
      });
    },
    [threadId]
  );

  const markRead = useCallback(async () => {
    if (!threadId) return;
    await supabase.rpc("hr_chat_mark_read", { p_thread_id: threadId });
  }, [threadId]);

  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      seen.current = new Set();
      return;
    }
    load();
    markRead();

    const channel = supabase
      .channel(`hr-chat-${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "hr_chat_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const row = payload.new as ChatMessage;
          if (seen.current.has(row.id)) return;
          seen.current.add(row.id);
          setMessages((prev) => [...prev, row]);
          if (row.sender_type !== side) markRead();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, side, load, markRead]);

  const send = useCallback(
    async (body: string) => {
      const text = body.trim();
      if (!threadId || !text) return false;
      setSending(true);
      const { error } = await supabase.rpc("hr_chat_send_message", {
        p_thread_id: threadId,
        p_body: text.slice(0, 2000),
      });
      setSending(false);
      if (error) return false;
      await load();
      return true;
    },
    [threadId, load]
  );

  const loadOlder = useCallback(async () => {
    if (!messages.length) return;
    await load(messages[0].created_at);
  }, [messages, load]);

  return { messages, loading, sending, hasMore, send, loadOlder, reload: load, markRead };
}

/** Resolves (and creates on demand) the thread id for an employee. */
export function useHRChatThreadId(employeeId?: string | null, enabled = true) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .rpc("hr_chat_get_or_create_thread", { p_employee_id: employeeId ?? undefined })
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error) {
          setError(error.message);
          return;
        }
        setThreadId((data as string) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId, enabled]);

  return { threadId, loading, error };
}

export type ChatThreadRow = {
  id: string;
  employee_id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_sender_type: string | null;
  unread_for_hr: number;
  unread_for_employee: number;
  is_pinned: boolean;
  employee_name?: string;
};

/** HR inbox: all threads visible to the current HR user, live-updated. */
export function useHRChatInbox() {
  const [threads, setThreads] = useState<ChatThreadRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("hr_chat_threads")
      .select("id, employee_id, last_message_at, last_message_preview, last_sender_type, unread_for_hr, unread_for_employee, is_pinned, employees!inner(full_name)")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(500);
    setLoading(false);
    if (error || !data) return;
    const rows: ChatThreadRow[] = (data as any[]).map((r) => ({
        id: r.id,
        employee_id: r.employee_id,
        last_message_at: r.last_message_at,
        last_message_preview: r.last_message_preview,
        last_sender_type: r.last_sender_type,
        unread_for_hr: r.unread_for_hr ?? 0,
        unread_for_employee: r.unread_for_employee ?? 0,
        is_pinned: !!r.is_pinned,
        employee_name: r.employees?.full_name || "—",
    }));
    // Pinned (important) conversations always float to the top.
    rows.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return (b.last_message_at || "").localeCompare(a.last_message_at || "");
    });
    setThreads(rows);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("hr-chat-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "hr_chat_threads" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const setPinned = useCallback(
    async (threadId: string, pinned: boolean) => {
      const { error } = await supabase.rpc("hr_chat_set_pinned", { p_thread_id: threadId, p_pinned: pinned });
      if (error) return false;
      await load();
      return true;
    },
    [load]
  );

  const markUnread = useCallback(
    async (threadId: string) => {
      const { error } = await supabase.rpc("hr_chat_mark_unread", { p_thread_id: threadId });
      if (error) return false;
      await load();
      return true;
    },
    [load]
  );

  return { threads, loading, reload: load, setPinned, markUnread };
}