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
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(
    localStorage.getItem('pos_last_sync')
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const offlineStartRef = useRef<string | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSyncingRef = useRef(false);

  // ── Real connectivity check ──
  const checkConnection = useCallback(async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  // ── Pre-cache data ──
  const preCacheData = useCallback(async () => {
    if (!userId) return;
    try {
      const productsRes: any = await (supabase.from('products') as any)
        .select('id, name_ar, sell_price, buy_price, quantity, category, sku, barcode, tax_rate, unit, is_pos_available, pos_category_id, color, image_url, min_quantity')
        .eq('user_id', userId)
        .eq('is_active', true);
      const customersRes: any = await (supabase.from('contacts') as any)
        .select('id, contact_name, phone, current_balance, credit_limit, contact_type')
        .eq('user_id', userId)
        .or('contact_type.eq.عميل,contact_type.eq.both,contact_type.eq.customer');

      if (productsRes.data) await cacheProducts(productsRes.data);
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
    const pending = await getPendingSales();
    if (pending.length === 0) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    setSyncProgress({ current: 0, total: pending.length });

    let synced = 0;
    let failed = 0;
    const offlineStart = offlineStartRef.current;

    for (const sale of pending) {
      try {
        // Insert via pos_orders — cast to any since new columns may not be in generated types yet
        const insertData: Record<string, any> = {
          user_id: userId,
          company_id: companyId || '',
          session_id: sale.session_id,
          order_number: sale.order_number,
          total: sale.total,
          subtotal: sale.total,
          tax_amount: 0,
          discount_amount: 0,
          state: 'paid',
          paid_at: sale.created_at,
          customer_id: sale.customer_id,
          customer_name: sale.customer_name,
          was_offline: true,
          local_id: sale.local_id,
          synced_at: new Date().toISOString(),
          sync_status: 'synced',
          notes: `عملية offline — ${sale.payment_method}`,
        };

        const { error } = await supabase.from('pos_orders').insert(insertData as any);

        if (error) throw error;

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
    setPendingCount(count);
    isSyncingRef.current = false;
    setIsSyncing(false);

    if (synced > 0) {
      toast.success(`تم ترحيل ${synced} عملية بنجاح`, { duration: 4000 });
    }
    if (failed > 0) {
      toast.error(`فشل ترحيل ${failed} عملية — راجع سجل المزامنة`, { duration: 5000 });
    }

    // Re-cache after sync
    await preCacheData();
  }, [userId, companyId, preCacheData]);

  // ── Create offline sale ──
  const createOfflineSale = useCallback(async (
    orderData: any,
    items: any[],
    total: number,
    paymentMethod: string,
    customerId: string | null,
    customerName: string,
  ): Promise<PendingSale> => {
    const sale: PendingSale = {
      id: crypto.randomUUID(),
      local_id: `OFFLINE-${Date.now()}`,
      order_data: orderData,
      items,
      total,
      payment_method: paymentMethod,
      customer_id: customerId,
      customer_name: customerName,
      cashier_id: userId || '',
      session_id: sessionId || '',
      terminal_id: terminalId || null,
      device_id: '',
      created_at: new Date().toISOString(),
      sync_status: 'pending',
      retry_count: 0,
      order_number: `OFFLINE-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-4)}`,
    };

    await addPendingSale(sale);
    const count = await countPending();
    setPendingCount(count);
    return sale;
  }, [userId, sessionId, terminalId]);

  // ── Online/Offline listeners ──
  useEffect(() => {
    const handleOnline = async () => {
      const reallyOnline = await checkConnection();
      if (reallyOnline) {
        setIsOnline(true);
        toast.success('تم استعادة الاتصال — جاري المزامنة...', { duration: 3000 });
        syncPendingQueue();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      offlineStartRef.current = new Date().toISOString();
      toast.warning('⚠️ انقطع الإنترنت — النظام يعمل محلياً وسيُزامن تلقائياً', { duration: 5000 });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkConnection, syncPendingQueue]);

  // ── Periodic sync & pre-cache (every 15 min) ──
  useEffect(() => {
    if (!userId) return;
    
    // Initial pre-cache
    preCacheData();

    // Load pending count
    countPending()
      .then(setPendingCount)
      .catch((err) => {
        console.warn("[usePOSOffline] countPending failed:", err);
      });

    syncIntervalRef.current = setInterval(async () => {
      const online = await checkConnection();
      setIsOnline(online);
      if (online) {
        await preCacheData();
        await syncPendingQueue();
      }
    }, 15 * 60 * 1000);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [userId, preCacheData, checkConnection, syncPendingQueue]);

  return {
    isOnline,
    pendingCount,
    lastSyncAt,
    isSyncing,
    syncProgress,
    createOfflineSale,
    syncPendingQueue,
    preCacheData,
    checkConnection,
  };
}
