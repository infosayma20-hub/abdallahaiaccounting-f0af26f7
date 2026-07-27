import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type IMRole =
  | "admin"
  | "hr_manager"
  | "accountant_senior"
  | "accountant_sales"
  | "accountant_purchases"
  | "cashier"
  | "supervisor"
  | "super_admin";

export type IMRecipientInput =
  | { user_id: string; cc?: boolean }
  | { role: IMRole; cc?: boolean };

export interface InternalMessageRow {
  id: string;
  user_id: string;
  sender_id: string;
  sender_name: string | null;
  subject: string;
  body: string;
  context_type: string | null;
  context_id: string | null;
  context_label: string | null;
  remind_at: string | null;
  reminder_sent_at: string | null;
  status: "open" | "done" | "archived";
  priority: "low" | "normal" | "high";
  created_at: string;
  updated_at: string;
}

export interface InternalMessageRecipientRow {
  id: string;
  message_id: string;
  user_id: string;
  recipient_user_id: string | null;
  recipient_role: string | null;
  cc: boolean;
  read_at: string | null;
  done_at: string | null;
  created_at: string;
}

export interface InternalMessageReplyRow {
  id: string;
  message_id: string;
  sender_id: string;
  sender_name: string | null;
  body: string;
  created_at: string;
}

export function useInternalMessages() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<InternalMessageRow[]>([]);
  const [recipients, setRecipients] = useState<InternalMessageRecipientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRoles, setUserRoles] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const [{ data: msgs }, { data: recs }, { data: roles }] = await Promise.all([
      supabase
        .from("internal_messages" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300),
      supabase.from("internal_message_recipients" as any).select("*").limit(1000),
      supabase.from("user_roles").select("role").eq("user_id", user.id),
    ]);
    setMessages((msgs as any) || []);
    setRecipients((recs as any) || []);
    setUserRoles(((roles as any[]) || []).map(r => r.role));
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime — refresh on any message/recipient change
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`internal-messages-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_messages" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_message_recipients" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, load]);

  const isMyRecipient = useCallback(
    (r: InternalMessageRecipientRow) =>
      r.recipient_user_id === user?.id ||
      (!!r.recipient_role && userRoles.includes(r.recipient_role)),
    [user?.id, userRoles]
  );

  const inbox = useMemo(() => {
    const myRecMsgIds = new Set(recipients.filter(isMyRecipient).map(r => r.message_id));
    return messages.filter(m => myRecMsgIds.has(m.id));
  }, [messages, recipients, isMyRecipient]);

  const sent = useMemo(
    () => messages.filter(m => m.sender_id === user?.id),
    [messages, user?.id]
  );

  const unreadCount = useMemo(() => {
    return inbox.filter(m => {
      if (m.status === "archived") return false;
      const mine = recipients.filter(
        r => r.message_id === m.id && isMyRecipient(r)
      );
      return mine.some(r => !r.read_at);
    }).length;
  }, [inbox, recipients, isMyRecipient]);

  const send = useCallback(
    async (args: {
      subject: string;
      body: string;
      recipients: IMRecipientInput[];
      remind_at?: string | null;
      context_type?: string | null;
      context_id?: string | null;
      context_label?: string | null;
      priority?: "low" | "normal" | "high";
    }) => {
      const payload = args.recipients.map(r => ({
        user_id: "user_id" in r ? r.user_id : null,
        role: "role" in r ? r.role : null,
        cc: r.cc || false,
      }));
      const { data, error } = await supabase.rpc("send_internal_message" as any, {
        _subject: args.subject,
        _body: args.body,
        _recipients: payload as any,
        _remind_at: args.remind_at || null,
        _context_type: args.context_type || null,
        _context_id: args.context_id || null,
        _context_label: args.context_label || null,
        _priority: args.priority || "normal",
      });
      if (error) throw error;
      await load();
      return data as string;
    },
    [load]
  );

  const markRead = useCallback(async (message_id: string) => {
    await supabase.rpc("mark_internal_message_read" as any, { _message_id: message_id });
    setRecipients(prev =>
      prev.map(r =>
        r.message_id === message_id && isMyRecipient(r) && !r.read_at
          ? { ...r, read_at: new Date().toISOString() }
          : r
      )
    );
  }, [isMyRecipient]);

  const markDone = useCallback(async (message_id: string, done = true) => {
    await supabase.rpc("mark_internal_message_done" as any, {
      _message_id: message_id,
      _done: done,
    });
    await load();
  }, [load]);

  const archive = useCallback(async (message_id: string) => {
    await supabase
      .from("internal_messages" as any)
      .update({ status: "archived" })
      .eq("id", message_id);
    await load();
  }, [load]);

  const reply = useCallback(
    async (message_id: string, body: string) => {
      if (!user?.id) return;
      const owner = messages.find(m => m.id === message_id)?.user_id;
      if (!owner) return;
      await supabase.from("internal_message_replies" as any).insert({
        message_id,
        user_id: owner,
        sender_id: user.id,
        body,
      });
    },
    [messages, user?.id]
  );

  return {
    loading,
    messages,
    recipients,
    inbox,
    sent,
    unreadCount,
    userRoles,
    isMyRecipient,
    send,
    markRead,
    markDone,
    archive,
    reply,
    refresh: load,
  };
}
