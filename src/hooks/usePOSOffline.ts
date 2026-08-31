import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  cacheProducts,
  cacheCustomers,
  getPendingSales,
  removePendingSale,
  markSaleFailed,
  addPendingSale,
  addSyncLog,
  countPending,
  countQuarantined,
  MAX_SYNC_RETRIES,
  type PendingSale,
} from '@/lib/pos-offline-db';

interface UsePOSOfflineOptions {
  userId: string | null;
  sessionId: string | null;
  terminalId: string | null;
  companyId: string | null;
}

export function usePOSOffline({ userId, sessionId, terminalId, companyId }: UsePOSOfflineOptions) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [networkQuality, setNetworkQuality] = useState<'stable' | 'verifying' | 'offline'>(
    navigator.onLine ? 'stable' : 'offline'
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [quarantinedCount, setQuarantinedCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(
    localStorage.getItem('pos_last_sync')
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const offlineStartRef = useRef<string | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSyncingRef = useRef(false);
  const verifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fastRecheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consecutiveFailsRef = useRef(0);
  const lastVerifyAtRef = useRef<number>(0);
  const uploadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingUploadRef = useRef<any[]>([]);
  const [connectionInfo, setConnectionInfo] = useState<{
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    saveData?: boolean;
  }>({});

  // ── Capture navigator.connection info (Network Information API) ──
  const readConnectionInfo = useCallback(() => {
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (!conn) return {};
    return {
      effectiveType: conn.effectiveType,
      downlink: conn.downlink,
      rtt: conn.rtt,
      saveData: conn.saveData,
    };
  }, []);

  // ── Network log (in-memory + localStorage ring buffer, last 50 events) ──
  const logNetworkEvent = useCallback((event: {
    type: 'online' | 'offline' | 'verify_fail' | 'verify_pass' | 'browser_offline' | 'browser_online' | 'visibility_recheck' | 'connection_change' | 'manual_test';
    detail?: string;
    sources?: Record<string, boolean>;
  }) => {
    try {
      const key = 'pos_network_log';
      const raw = localStorage.getItem(key);
      const arr: any[] = raw ? JSON.parse(raw) : [];
      const entry = { ts: new Date().toISOString(), ...event };
      arr.push(entry);
      while (arr.length > 50) arr.shift();
      localStorage.setItem(key, JSON.stringify(arr));
      // Queue for server upload (only meaningful events, skip pure verify passes
      // to avoid spamming the table with the happy path)
      if (event.type !== 'verify_pass') {
        pendingUploadRef.current.push(entry);
      }
    } catch { /* ignore */ }
  }, []);

  // ── Probe one endpoint with timeout ──
  const probe = useCallback(async (url: string, timeoutMs = 4000, init?: RequestInit): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store', ...init });
      clearTimeout(t);
      // For no-cors opaque responses (status=0, type='opaque') we still consider it reachable.
      return res.ok || res.type === 'opaque';
    } catch {
      return false;
    }
  }, []);

  // ── Real multi-source connectivity check (any one passes = online) ──
  const checkConnection = useCallback(async (): Promise<{ ok: boolean; sources: Record<string, boolean> }> => {
    lastVerifyAtRef.current = Date.now();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    // Run probes in parallel — first that succeeds is enough but we keep all for logging
    const [supabaseOk, cloudflareOk, googleOk] = await Promise.all([
      probe(`${supabaseUrl}/rest/v1/`, 4000, {
        method: 'HEAD',
        headers: { apikey: apiKey },
      }),
      // Cloudflare trace endpoint — supports CORS, very fast, global anycast
      probe('https://1.1.1.1/cdn-cgi/trace', 3500, { method: 'GET', mode: 'cors' }),
      // Google's 204 endpoint — used by Chrome itself for connectivity, no-cors fallback
      probe('https://www.gstatic.com/generate_204', 3500, { method: 'GET', mode: 'no-cors' }),
    ]);

    const sources = { supabase: supabaseOk, cloudflare: cloudflareOk, google: googleOk };
    const ok = supabaseOk || cloudflareOk || googleOk;
    return { ok, sources };
  }, [probe]);

  // Wrapper that returns just a boolean (kept for backwards-compatible callers)
  const checkConnectionBool = useCallback(async (): Promise<boolean> => {
    const { ok } = await checkConnection();
    return ok;
  }, [checkConnection]);

  // ── Pre-cache data ──
  const preCacheData = useCallback(async () => {
    if (!userId) return;
    try {
      // products has no is_active column — the old .eq('is_active', true) made
      // this query fail outright, so the offline cache stayed empty. Also page
      // past PostgREST's 1000-row cap (Top Car has 2.8k products).
      const productRows: any[] = [];
      let afterId: string | null = null;
      for (let page = 0; page < 50; page++) {
        let pq: any = (supabase.from('products') as any)
          .select('id, name, sell_price, buy_price, quantity, category, sku, barcode, tax_rate, unit, is_pos_available, pos_category_id, color, image_url, min_quantity')
          .eq('user_id', userId)
          .order('id')
          .limit(1000);
        if (afterId) pq = pq.gt('id', afterId);
        const { data: chunk, error } = await pq;
        if (error) break;
        const rows = (chunk || []) as any[];
        productRows.push(...rows);
        if (rows.length < 1000) break;
        afterId = rows[rows.length - 1].id;
      }
      const customersRes: any = await (supabase.from('contacts') as any)
        .select('id, contact_name, phone, current_balance, credit_limit, contact_type')
        .eq('user_id', userId)
        .or('contact_type.eq.عميل,contact_type.eq.both,contact_type.eq.customer');

      if (productRows.length) await cacheProducts(productRows);
      if (customersRes.data) await cacheCustomers(customersRes.data);


      const now = new Date().toISOString();
      localStorage.setItem('pos_last_sync', now);
      setLastSyncAt(now);
    } catch (e) {
      console.warn('Pre-cache failed:', e);
    }
  }, [userId]);

  // ── Sync pending sales ──
  const syncPendingQueue = useCallback(async () => {
    if (!userId || isSyncingRef.current) return;
    const all = await getPendingSales();
    // Skip quarantined (>= MAX_SYNC_RETRIES) — need manual review
    const pending = all.filter(s => s.sync_status !== 'quarantined');
    if (pending.length === 0) {
      setQuarantinedCount(all.filter(s => s.sync_status === 'quarantined').length);
      return;
    }

    isSyncingRef.current = true;
    setIsSyncing(true);
    setSyncProgress({ current: 0, total: pending.length });

    let synced = 0;
    let failed = 0;
    const offlineStart = offlineStartRef.current;

    for (const sale of pending) {
      try {
        // Use the new RPC sync_offline_pos_sale — it handles:
        //   1. Idempotency check on local_id (no duplicates on retry)
        //   2. Insert pos_orders + pos_order_lines
        //   3. Call complete_pos_order for accounting + stock + payments
        const payload = {
          user_id: userId,
          company_id: companyId,
          session_id: sale.session_id,
          local_id: sale.local_id,
          order_number: sale.order_number,
          subtotal: sale.subtotal ?? sale.total,
          tax_amount: sale.tax_amount ?? 0,
          discount_amount: sale.discount_amount ?? 0,
          total: sale.total,
          customer_id: sale.customer_id,
          customer_name: sale.customer_name,
          notes: sale.notes ?? `عملية offline — ${sale.payment_method}`,
          offline_created_at: sale.created_at,
          items: sale.items || [],
          payments: sale.payments && sale.payments.length > 0
            ? sale.payments
            : [{
                method: sale.payment_method,
                amount: sale.total,
                tendered: sale.total,
                change: 0,
                currency: 'ILS',
                exchange_rate: 1,
                foreign_amount: sale.total,
              }],
        };

        const { data: rpcRes, error } = await supabase.rpc('sync_offline_pos_sale' as any, {
          p_payload: payload as any,
        });

        if (error) throw error;
        const res = rpcRes as any;
        if (!res?.success) {
          // 🔒 Phase 2.5 — if the server reports the bound session is closed,
          // immediately quarantine the sale instead of bumping retry_count
          // until the cap. This prevents 5 noisy retries and surfaces the
          // sale in SyncLogSheet right away for "reassign to a new session".
          if (res?.quarantine) {
            await markSaleFailed(sale.id, res?.detail || res?.error || 'session_not_open', { quarantine: true });
            failed++;
            setSyncProgress({ current: synced + failed, total: pending.length });
            continue;
          }
          throw new Error(res?.error || 'sync_offline_pos_sale returned failure');
        }

        await removePendingSale(sale.id);
        synced++;
        setSyncProgress({ current: synced + failed, total: pending.length });
      } catch (err: any) {
        failed++;
        await markSaleFailed(sale.id, err.message || 'Unknown error');
        setSyncProgress({ current: synced + failed, total: pending.length });
      }
    }

    // Log sync event
    if (offlineStart) {
      const duration = Math.round(
        (Date.now() - new Date(offlineStart).getTime()) / 60000
      );
      await addSyncLog({
        id: crypto.randomUUID(),
        offline_started_at: offlineStart,
        online_restored_at: new Date().toISOString(),
        offline_duration_minutes: duration,
        transactions_count: pending.length,
        synced_count: synced,
        failed_count: failed,
        created_at: new Date().toISOString(),
      });

      // Also log to server
      try {
        await supabase.from('pos_sync_log' as any).insert({
          user_id: userId,
          offline_started_at: offlineStart,
          online_restored_at: new Date().toISOString(),
          offline_duration_minutes: duration,
          transactions_count: pending.length,
          synced_count: synced,
          failed_count: failed,
        } as any);
      } catch { /* ignore server log failure */ }

      offlineStartRef.current = null;
    }

    const count = await countPending();
    const quar = await countQuarantined();
    setPendingCount(count);
    setQuarantinedCount(quar);
    isSyncingRef.current = false;
    setIsSyncing(false);

    if (synced > 0) {
      toast.success(`تم ترحيل ${synced} عملية بنجاح`, { duration: 4000 });
    }
    if (failed > 0) {
      toast.error(`فشل ترحيل ${failed} عملية — راجع سجل المزامنة`, { duration: 5000 });
    }
    if (quar > 0) {
      toast.warning(
        `⚠️ ${quar} عملية في الحجر (تجاوزت ${MAX_SYNC_RETRIES} محاولات) — تحتاج مراجعة يدوية`,
        { duration: 8000 }
      );
    }

    // Re-cache after sync
    await preCacheData();
  }, [userId, companyId, preCacheData]);

  // ── Create offline sale ──
  const createOfflineSale = useCallback(async (input: {
    orderData: any;
    items: any[];
    total: number;
    subtotal?: number;
    taxAmount?: number;
    discountAmount?: number;
    paymentMethod: string;
    payments?: any[];
    customerId: string | null;
    customerName: string;
    notes?: string;
  }): Promise<PendingSale> => {
    // Build a globally-unique local id including terminal short-hash
    // to prevent collisions across the 17 terminals at Malaky.
    const termShort = (terminalId || 'NOTERM').slice(0, 6).toUpperCase();
    const ts = Date.now();
    const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const localId = `OFFLINE-${termShort}-${ts}-${rand}`;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const orderNumber = `OFFLINE-${termShort}-${dateStr}-${String(ts).slice(-5)}`;

    const sale: PendingSale = {
      id: crypto.randomUUID(),
      local_id: localId,
      order_data: input.orderData,
      items: input.items,
      total: input.total,
      subtotal: input.subtotal ?? input.total,
      tax_amount: input.taxAmount ?? 0,
      discount_amount: input.discountAmount ?? 0,
      payment_method: input.paymentMethod,
      payments: input.payments,
      notes: input.notes,
      customer_id: input.customerId,
      customer_name: input.customerName,
      cashier_id: userId || '',
      session_id: sessionId || '',
      terminal_id: terminalId || null,
      device_id: '',
      created_at: new Date().toISOString(),
      sync_status: 'pending',
      retry_count: 0,
      order_number: orderNumber,
    };

    await addPendingSale(sale);
    const count = await countPending();
    setPendingCount(count);
    return sale;
  }, [userId, sessionId, terminalId]);

  // ── Confirm-then-flip state machine ──
  // browser fires 'offline' → we do NOT trust it immediately. Instead we
  // enter 'verifying' state and probe 3 times over ~10s. Only if all 3 fail
  // do we actually flip to offline. This protects from Wi-Fi flicker / DNS
  // blips / captive-portal probes that other apps don't even notice.
  const verifyAndFlip = useCallback(async (reason: string) => {
    if (verifyTimerRef.current) return; // already verifying
    setNetworkQuality('verifying');
    consecutiveFailsRef.current = 0;

    const runProbe = async (attempt: number) => {
      const { ok, sources } = await checkConnection();
      if (ok) {
        consecutiveFailsRef.current = 0;
        logNetworkEvent({ type: 'verify_pass', detail: `${reason}/attempt-${attempt}`, sources });
        setNetworkQuality('stable');
        setIsOnline(true);
        verifyTimerRef.current = null;
        // If we were previously offline, trigger sync now
        if (offlineStartRef.current) {
          toast.success('تم استعادة الاتصال — جاري المزامنة...', { duration: 3000 });
          syncPendingQueue();
        }
        return;
      }
      consecutiveFailsRef.current++;
      logNetworkEvent({ type: 'verify_fail', detail: `${reason}/attempt-${attempt}`, sources });

      if (consecutiveFailsRef.current >= 3) {
        // Confirmed offline
        verifyTimerRef.current = null;
        if (isOnline) {
          offlineStartRef.current = new Date().toISOString();
          logNetworkEvent({ type: 'offline', detail: reason });
          toast.warning('⚠️ انقطع الإنترنت فعلياً — النظام يعمل محلياً وسيُزامن تلقائياً', { duration: 5000 });
        }
        setIsOnline(false);
        setNetworkQuality('offline');
        return;
      }
      // schedule next attempt
      verifyTimerRef.current = setTimeout(() => runProbe(attempt + 1), 3500);
    };

    runProbe(1);
  }, [checkConnection, isOnline, logNetworkEvent, syncPendingQueue]);

  useEffect(() => {
    const handleOnline = () => {
      logNetworkEvent({ type: 'browser_online' });
      // Browser thinks we're back — verify before celebrating
      verifyAndFlip('browser_online');
    };

    const handleOffline = () => {
      logNetworkEvent({ type: 'browser_offline' });
      // DO NOT trust this event blindly. Start verification — other apps
      // keep working through micro-disconnects, we should too.
      verifyAndFlip('browser_offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (verifyTimerRef.current) {
        clearTimeout(verifyTimerRef.current);
        verifyTimerRef.current = null;
      }
    };
  }, [logNetworkEvent, verifyAndFlip]);

  // ── Fast re-check while offline (every 10s instead of 15min) ──
  useEffect(() => {
    if (isOnline) {
      if (fastRecheckRef.current) {
        clearInterval(fastRecheckRef.current);
        fastRecheckRef.current = null;
      }
      return;
    }
    fastRecheckRef.current = setInterval(async () => {
      const { ok, sources } = await checkConnection();
      if (ok) {
        logNetworkEvent({ type: 'online', detail: 'fast_recheck', sources });
        setIsOnline(true);
        setNetworkQuality('stable');
        toast.success('تم استعادة الاتصال — جاري المزامنة...', { duration: 3000 });
        syncPendingQueue();
      }
    }, 10_000);
    return () => {
      if (fastRecheckRef.current) clearInterval(fastRecheckRef.current);
    };
  }, [isOnline, checkConnection, logNetworkEvent, syncPendingQueue]);

  // ── Periodic sync & pre-cache (every 15 min) ──
  useEffect(() => {
    if (!userId) return;
    
    // Initial pre-cache
    preCacheData();

    // Load pending + quarantined counts and trigger a startup sync if needed
    countPending()
      .then(async (n) => {
        setPendingCount(n);
        setQuarantinedCount(await countQuarantined());
        // Auto-sync on mount if we already have pending sales and we're online
        if (n > 0) {
          const { ok: online } = await checkConnection();
          if (online) syncPendingQueue();
        }
      })
      .catch((err) => {
        console.warn("[usePOSOffline] countPending failed:", err);
      });

    syncIntervalRef.current = setInterval(async () => {
      const { ok } = await checkConnection();
      setIsOnline(ok);
      setNetworkQuality(ok ? 'stable' : 'offline');
      if (ok) {
        await preCacheData();
        await syncPendingQueue();
      }
    }, 15 * 60 * 1000);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [userId, preCacheData, checkConnection, syncPendingQueue]);

  // ── Page Visibility — re-check when cashier returns to the tab ──
  useEffect(() => {
    const onVisibility = async () => {
      if (document.visibilityState !== 'visible') return;
      const { ok, sources } = await checkConnection();
      logNetworkEvent({ type: 'visibility_recheck', sources });
      if (ok && !isOnline) {
        setIsOnline(true);
        setNetworkQuality('stable');
        toast.success('عاد الاتصال — جاري المزامنة...', { duration: 3000 });
        syncPendingQueue();
      } else if (!ok && isOnline) {
        verifyAndFlip('visibility');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isOnline, checkConnection, logNetworkEvent, syncPendingQueue, verifyAndFlip]);

  // ── navigator.connection — early-warning for weak network ──
  useEffect(() => {
    const conn = (navigator as any).connection;
    if (!conn) return;
    setConnectionInfo(readConnectionInfo());
    const onChange = () => {
      const info = readConnectionInfo();
      setConnectionInfo(info);
      logNetworkEvent({ type: 'connection_change', detail: JSON.stringify(info) });
      // If the OS reports a very weak connection, pre-emptively verify
      if (info.effectiveType === 'slow-2g' || info.effectiveType === '2g') {
        verifyAndFlip('weak_connection');
      }
    };
    conn.addEventListener?.('change', onChange);
    return () => conn.removeEventListener?.('change', onChange);
  }, [readConnectionInfo, logNetworkEvent, verifyAndFlip]);

  // ── Server-side log upload every 5 minutes ──
  useEffect(() => {
    if (!userId) return;
    const flush = async () => {
      if (pendingUploadRef.current.length === 0) return;
      const batch = pendingUploadRef.current.splice(0, pendingUploadRef.current.length);
      try {
        const conn = readConnectionInfo();
        const rows = batch.map((e) => ({
          user_id: userId,
          company_id: companyId,
          session_id: sessionId,
          terminal_id: terminalId,
          device_label: navigator.userAgent.slice(0, 80),
          event_type: e.type,
          detail: e.detail || null,
          sources: e.sources || null,
          connection_info: conn,
          occurred_at: e.ts,
        }));
        const { error } = await (supabase.from('pos_network_diagnostics' as any) as any).insert(rows);
        if (error) {
          // Re-queue on failure so we try again next tick
          pendingUploadRef.current.unshift(...batch);
        }
      } catch {
        pendingUploadRef.current.unshift(...batch);
      }
    };
    uploadTimerRef.current = setInterval(flush, 5 * 60 * 1000);
    // Also flush before tab unload
    const onUnload = () => { void flush(); };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [userId, companyId, sessionId, terminalId, readConnectionInfo]);

  // ── Manual network test (button in UI) ──
  const runNetworkTest = useCallback(async (): Promise<{
    overall: boolean;
    results: Array<{ name: string; ok: boolean; latencyMs: number }>;
    connection: ReturnType<typeof readConnectionInfo>;
  }> => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const tests = [
      { name: 'Supabase', url: `${supabaseUrl}/rest/v1/`, init: { method: 'HEAD' as const, headers: { apikey: apiKey } } },
      { name: 'Cloudflare 1.1.1.1', url: 'https://1.1.1.1/cdn-cgi/trace', init: { method: 'GET' as const, mode: 'cors' as const } },
      { name: 'Google', url: 'https://www.gstatic.com/generate_204', init: { method: 'GET' as const, mode: 'no-cors' as const } },
    ];
    const results = await Promise.all(tests.map(async (t) => {
      const started = performance.now();
      const ok = await probe(t.url, 5000, t.init);
      return { name: t.name, ok, latencyMs: Math.round(performance.now() - started) };
    }));
    const overall = results.some((r) => r.ok);
    const sources = Object.fromEntries(results.map((r) => [r.name, r.ok]));
    logNetworkEvent({ type: 'manual_test', detail: results.map(r => `${r.name}=${r.ok ? 'ok' : 'fail'}/${r.latencyMs}ms`).join(', '), sources });
    return { overall, results, connection: readConnectionInfo() };
  }, [probe, logNetworkEvent, readConnectionInfo]);

  return {
    isOnline,
    networkQuality,
    connectionInfo,
    pendingCount,
    quarantinedCount,
    lastSyncAt,
    isSyncing,
    syncProgress,
    createOfflineSale,
    syncPendingQueue,
    preCacheData,
    checkConnection: checkConnectionBool,
    checkConnectionDetailed: checkConnection,
    runNetworkTest,
  };
}
