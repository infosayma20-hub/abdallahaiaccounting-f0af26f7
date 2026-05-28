import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PBXCallEvent {
  id: string;
  caller_number: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  status: string;
  handled: boolean;
  created_at: string;
}

interface UsePBXCallListenerOptions {
  userId: string | null;
  enabled: boolean;
  onIncomingCall: (event: PBXCallEvent) => void;
}

/**
 * Listens for incoming PBX call events via Realtime
 * and triggers callback to auto-open a new POS order.
 */
export function usePBXCallListener({ userId, enabled, onIncomingCall }: UsePBXCallListenerOptions) {
  const callbackRef = useRef(onIncomingCall);
  callbackRef.current = onIncomingCall;

  const markHandled = useCallback(async (eventId: string) => {
    await supabase
      .from('pbx_call_events' as any)
      .update({ handled: true } as any)
      .eq('id', eventId);
  }, []);

  useEffect(() => {
    if (!userId || !enabled) return;

    const channel = supabase
      .channel(`pbx-calls-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pbx_call_events',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const event = payload.new as PBXCallEvent;
          if (event.handled) return;

          // Show notification
          const customerLabel = event.customer_name || event.caller_number;
          toast.info(`📞 مكالمة واردة: ${customerLabel}`, {
            duration: 8000,
            description: event.customer_address
              ? `العنوان: ${event.customer_address}`
              : 'زبون غير مسجل',
            action: {
              label: 'فتح طلب',
              onClick: () => {
                callbackRef.current(event);
                markHandled(event.id);
              },
            },
          });

          // Auto-open order if customer is known
          if (event.customer_id) {
            callbackRef.current(event);
            markHandled(event.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, enabled, markHandled]);
}
