import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { toast } from "sonner";
import type {
  CsNote, CsCall, CsMeeting, CsSupportTicket, CsTicketComment,
  CsFeatureRequest, CsContract, CsSubscription, CsKbArticle, CsTimelineEvent,
} from "../types-cs";

const sb = supabase as any;

function makeListHook<T>(table: string, orderCol: string, errMsg: string) {
  return function useList(contactId?: string) {
    const { user } = useAuth();
    const [items, setItems] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);

    const refetch = useCallback(async () => {
      if (!user) return;
      setLoading(true);
      let q = sb.from(table).select("*").order(orderCol, { ascending: false });
      if (contactId) q = q.eq("contact_id", contactId);
      const { data, error } = await q;
      if (error) toast.error(errMsg);
      setItems((data as T[]) || []);
      setLoading(false);
    }, [user, contactId]);

    useEffect(() => { refetch(); }, [refetch]);
    return { items, loading, refetch };
  };
}

export const useCsNotes = makeListHook<CsNote>("cs_notes", "created_at", "تعذر تحميل الملاحظات");
export const useCsCalls = makeListHook<CsCall>("cs_calls", "called_at", "تعذر تحميل المكالمات");
export const useCsMeetings = makeListHook<CsMeeting>("cs_meetings", "meeting_date", "تعذر تحميل الاجتماعات");
export const useCsTickets = makeListHook<CsSupportTicket>("cs_support_tickets", "created_at", "تعذر تحميل التذاكر");
export const useCsFeatureRequests = makeListHook<CsFeatureRequest>("cs_feature_requests", "created_at", "تعذر تحميل طلبات الميزات");
export const useCsContracts = makeListHook<CsContract>("cs_contracts", "created_at", "تعذر تحميل العقود");
export const useCsSubscriptions = makeListHook<CsSubscription>("cs_subscriptions", "renewal_date", "تعذر تحميل الاشتراكات");
export const useCsKbArticles = makeListHook<CsKbArticle>("cs_kb_articles", "updated_at", "تعذر تحميل قاعدة المعرفة");

export function useCsTicketComments(ticketId?: string) {
  const [items, setItems] = useState<CsTicketComment[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    const { data, error } = await sb.from("cs_ticket_comments")
      .select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true });
    if (error) toast.error("تعذر تحميل التعليقات");
    setItems((data as CsTicketComment[]) || []);
    setLoading(false);
  }, [ticketId]);

  useEffect(() => { refetch(); }, [refetch]);
  return { items, loading, refetch };
}

export function useCustomerTimeline(contactId?: string) {
  const { user } = useAuth();
  const [events, setEvents] = useState<CsTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user || !contactId) return;
    setLoading(true);
    const { data, error } = await sb.from("cs_customer_timeline_view")
      .select("*").eq("contact_id", contactId).order("event_date", { ascending: false }).limit(200);
    if (error) toast.error("تعذر تحميل الجدول الزمني");
    setEvents((data as CsTimelineEvent[]) || []);
    setLoading(false);
  }, [user, contactId]);

  useEffect(() => { refetch(); }, [refetch]);
  return { events, loading, refetch };
}

export async function csInsert<T extends Record<string, any>>(table: string, payload: T, userId: string) {
  const { error } = await sb.from(table).insert({ ...payload, user_id: dataOwnerId!, created_by: userId });
  if (error) { toast.error(error.message); return false; }
  return true;
}

export async function csUpdate<T extends Record<string, any>>(table: string, id: string, payload: T) {
  const { error } = await sb.from(table).update(payload).eq("id", id);
  if (error) { toast.error(error.message); return false; }
  return true;
}

export async function csDelete(table: string, id: string) {
  const { error } = await sb.from(table).delete().eq("id", id);
  if (error) { toast.error(error.message); return false; }
  return true;
}