import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PosShiftInfo } from "@/lib/pos-shift-grouping";

export interface PosShiftDataResult {
  shifts: Map<string, PosShiftInfo>;
  orderToSession: Map<string, string>;
  txToSession: Map<string, string>;
  refToSession: Map<string, string>;
  isPosBox: boolean;
  loading: boolean;
}

/**
 * Fetches per-shift POS summary + order→session mapping for a specific
 * cash-box GL code within a date range. Only queries when the given
 * account code actually maps to a POS cash box (`cash_boxes` row).
 * Returns empty maps + isPosBox=false otherwise.
 *
 * Safe: read-only. Debounced by date changes. Aborts stale responses.
 */
export function usePosShiftData(
  userId: string | undefined,
  accountCode: string | undefined,
  fromDate: string,
  toDate: string,
  enabled: boolean,
): PosShiftDataResult {
  const [shifts, setShifts] = useState<Map<string, PosShiftInfo>>(new Map());
  const [orderToSession, setOrderToSession] = useState<Map<string, string>>(new Map());
  const [txToSession, setTxToSession] = useState<Map<string, string>>(new Map());
  const [refToSession, setRefToSession] = useState<Map<string, string>>(new Map());
  const [isPosBox, setIsPosBox] = useState(false);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    if (!enabled || !userId || !accountCode || !fromDate || !toDate) {
      setShifts(new Map()); setOrderToSession(new Map()); setIsPosBox(false);
      return;
    }
    const myReq = ++reqId.current;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // 1) Is this a POS cash-box code?
        const { data: boxRows } = await supabase
          .from('cash_boxes')
          .select('id, gl_account_code, pos_terminal_id')
          .eq('user_id', userId)
          .eq('gl_account_code', accountCode);
        if (cancelled || myReq !== reqId.current) return;
        const boxes = (boxRows || []) as any[];
        // Treat as POS box if any cash_box with this GL code exists (POS or manual –
        // manual boxes just won't yield any shifts and the toggle becomes inert).
        if (boxes.length === 0) {
          setIsPosBox(false); setShifts(new Map()); setOrderToSession(new Map());
          setLoading(false); return;
        }

        // 2) Fetch per-shift summary via RPC.
        const { data: rpcRows, error: rpcErr } = await supabase.rpc('get_pos_shift_summary', {
          p_user_id: userId,
          p_cash_box_gl: accountCode,
          p_from_date: fromDate,
          p_to_date: toDate,
        });
        if (cancelled || myReq !== reqId.current) return;
        if (rpcErr) {
          console.warn('[usePosShiftData] rpc failed:', rpcErr.message);
          setIsPosBox(true); setShifts(new Map()); setOrderToSession(new Map());
          setLoading(false); return;
        }
        const shiftMap = new Map<string, PosShiftInfo>();
        for (const r of (rpcRows || []) as any[]) {
          shiftMap.set(String(r.session_id), {
            session_id: String(r.session_id),
            business_date: r.business_date,
            opened_at: r.opened_at,
            closed_at: r.closed_at,
            state: r.state,
            cashier_name: r.cashier_name,
            device_name: r.device_name,
            cash_box_id: r.cash_box_id,
            cash_box_name: r.cash_box_name,
            session_seq: r.session_seq,
            order_count: Number(r.order_count) || 0,
            total_debit: Number(r.total_debit) || 0,
            total_credit: Number(r.total_credit) || 0,
            total_vat: Number(r.total_vat) || 0,
            expected_cash: r.expected_cash == null ? null : Number(r.expected_cash),
            closing_cash: r.closing_cash == null ? null : Number(r.closing_cash),
            cash_variance: r.cash_variance == null ? null : Number(r.cash_variance),
            currency: r.currency || 'ILS',
          });
        }

        // 3) Build order_number → session_id mapping via pos_orders.
        const sessionIds = Array.from(shiftMap.keys());
        const mapping = new Map<string, string>();
        if (sessionIds.length > 0) {
          // Chunk to stay under PostgREST URL limits (~2000 items).
          const CHUNK = 500;
          for (let i = 0; i < sessionIds.length; i += CHUNK) {
            const slice = sessionIds.slice(i, i + CHUNK);
            const { data: orderRows, error: orderErr } = await supabase
              .from('pos_orders')
              .select('order_number, session_id')
              .eq('user_id', userId)
              .in('session_id', slice);
            if (cancelled || myReq !== reqId.current) return;
            if (orderErr) { console.warn('[usePosShiftData] pos_orders fetch failed:', orderErr.message); continue; }
            for (const o of (orderRows || []) as any[]) {
              if (o.order_number && o.session_id) mapping.set(String(o.order_number), String(o.session_id));
            }
          }
        }

        // 4) Cash-out documents of the same shifts (expenses / purchases + reversals).
        const txMap = new Map<string, string>();
        const refMap = new Map<string, string>();
        for (let i = 0; i < sessionIds.length; i += 500) {
          const slice = sessionIds.slice(i, i + 500);
          const [{ data: exps }, { data: purs }] = await Promise.all([
            supabase.from('pos_expenses').select('shift_id, transaction_id, reversal_transaction_id').eq('user_id', userId).in('shift_id', slice),
            supabase.from('pos_purchases').select('id, shift_id, reversal_transaction_id, voucher_number').eq('user_id', userId).in('shift_id', slice),
          ]);
          if (cancelled || myReq !== reqId.current) return;
          for (const e of (exps || []) as any[]) {
            if (e.transaction_id) txMap.set(String(e.transaction_id), String(e.shift_id));
            if (e.reversal_transaction_id) txMap.set(String(e.reversal_transaction_id), String(e.shift_id));
          }
          for (const p of (purs || []) as any[]) {
            refMap.set('PUR-POS-' + String(p.id).slice(0, 8), String(p.shift_id));
            // مشتريات مسجلة كفاتورة: حركة الصندوق هي سند الصرف التلقائي
            if (p.voucher_number) refMap.set(String(p.voucher_number), String(p.shift_id));
            if (p.reversal_transaction_id) txMap.set(String(p.reversal_transaction_id), String(p.shift_id));
          }
        }

        if (cancelled || myReq !== reqId.current) return;
        setTxToSession(txMap);
        setRefToSession(refMap);
        setIsPosBox(true);
        setShifts(shiftMap);
        setOrderToSession(mapping);
        setLoading(false);
      } catch (e: any) {
        if (!cancelled && myReq === reqId.current) {
          console.warn('[usePosShiftData] failed:', e?.message);
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [userId, accountCode, fromDate, toDate, enabled]);

  return { shifts, orderToSession, txToSession, refToSession, isPosBox, loading };
}