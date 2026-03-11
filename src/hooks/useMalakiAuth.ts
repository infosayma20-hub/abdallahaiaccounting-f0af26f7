import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MalakiUser {
  id: string;
  username: string;
  full_name: string;
  role: 'viewer' | 'manager' | 'owner';
  can_see_sales: boolean;
  can_see_liquidity: boolean;
  can_see_all_branches: boolean;
  allowed_branch_ids: string[] | null;
}

interface MalakiSession {
  user: MalakiUser;
  loginAt: number;
  rememberMe: boolean;
}

const SESSION_KEY = 'malaki_session';
const SESSION_DURATION = 12 * 60 * 60 * 1000;
const REMEMBER_DURATION = 30 * 24 * 60 * 60 * 1000;

export function useMalakiAuth() {
  const [user, setUser] = useState<MalakiUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const session: MalakiSession = JSON.parse(stored);
        const maxAge = session.rememberMe ? REMEMBER_DURATION : SESSION_DURATION;
        if (Date.now() - session.loginAt < maxAge) {
          setUser(session.user);
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (username: string, password: string, rememberMe: boolean) => {
    const { data, error } = await supabase.functions.invoke('malaki-auth', {
      body: { action: 'login', username, password },
    });
    if (error) throw new Error('خطأ في الاتصال');
    if (!data?.success) throw new Error(data?.error || 'بيانات الدخول غير صحيحة');

    const session: MalakiSession = {
      user: data.user,
      loginAt: Date.now(),
      rememberMe,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  return { user, loading, login, logout };
}
