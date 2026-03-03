import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface LockState {
  isLocked: boolean;
  lockedByMe: boolean;
  lockedByName: string | null;
  lockedAt: string | null;
  loading: boolean;
}

interface UseRecordLockOptions {
  tableName: string;
  recordId: string | null;
  autoAcquire?: boolean;
  refreshInterval?: number; // ms, default 30s
}

export function useRecordLock({
  tableName,
  recordId,
  autoAcquire = false,
  refreshInterval = 30000,
}: UseRecordLockOptions) {
  const { user } = useAuth();
  const [lockState, setLockState] = useState<LockState>({
    isLocked: false,
    lockedByMe: false,
    lockedByName: null,
    lockedAt: null,
    loading: false,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const acquireLock = useCallback(async () => {
    if (!user || !recordId) return false;

    setLockState((s) => ({ ...s, loading: true }));

    const { data, error } = await (supabase.rpc as any)("acquire_record_lock", {
      _table_name: tableName,
      _record_id: recordId,
      _user_id: user.id,
    });

    if (error) {
      console.error("Lock error:", error);
      setLockState((s) => ({ ...s, loading: false }));
      return false;
    }

    const result = data as unknown as {
      success: boolean;
      locked_by?: string;
      locked_by_name?: string;
      locked_at?: string;
    };

    if (result.success) {
      setLockState({
        isLocked: true,
        lockedByMe: true,
        lockedByName: null,
        lockedAt: new Date().toISOString(),
        loading: false,
      });
      return true;
    } else {
      setLockState({
        isLocked: true,
        lockedByMe: false,
        lockedByName: result.locked_by_name || "مستخدم آخر",
        lockedAt: result.locked_at || null,
        loading: false,
      });
      return false;
    }
  }, [user, recordId, tableName]);

  const releaseLock = useCallback(async () => {
    if (!user || !recordId) return;

    await (supabase.rpc as any)("release_record_lock", {
      _table_name: tableName,
      _record_id: recordId,
      _user_id: user.id,
    });

    setLockState({
      isLocked: false,
      lockedByMe: false,
      lockedByName: null,
      lockedAt: null,
      loading: false,
    });
  }, [user, recordId, tableName]);

  // Auto-acquire on mount if requested
  useEffect(() => {
    if (autoAcquire && recordId) {
      acquireLock();
    }

    return () => {
      // Release lock on unmount
      if (recordId && user) {
        releaseLock();
      }
    };
  }, [autoAcquire, recordId]);

  // Keep lock alive with periodic refresh
  useEffect(() => {
    if (lockState.lockedByMe && recordId) {
      intervalRef.current = setInterval(() => {
        acquireLock(); // Re-acquire to refresh locked_at
      }, refreshInterval);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [lockState.lockedByMe, recordId, refreshInterval]);

  return {
    ...lockState,
    acquireLock,
    releaseLock,
  };
}
