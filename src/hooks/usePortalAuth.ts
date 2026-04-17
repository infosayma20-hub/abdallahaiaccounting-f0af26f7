import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface PortalUser {
  id: string;
  username: string;
  email?: string;
  full_name: string;
  role: 'viewer' | 'manager' | 'owner';
  can_see_sales: boolean;
  can_see_liquidity: boolean;
  can_see_all_branches: boolean;
  allowed_branch_ids: string[] | null;
  user_id: string;
}

export function usePortalAuth() {
  const { user: authUser, loading: authLoading } = useAuth();
  const [portalUser, setPortalUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!authUser) {
      setPortalUser(null);
      setLoading(false);
      return;
    }

    // Fetch portal permissions from malaki_portal_users by auth_user_id
    const fetchPortalUser = async () => {
      try {
        const { data, error } = await supabase
          .from('malaki_portal_users')
          .select('*')
          .eq('auth_user_id', authUser.id)
          .eq('is_active', true)
          .single();

        if (error || !data) {
          setPortalUser(null);
        } else {
          setPortalUser({
            id: data.id,
            username: data.username,
            email: data.email || undefined,
            full_name: data.full_name,
            role: (data.role as 'viewer' | 'manager' | 'owner') || 'viewer',
            can_see_sales: data.can_see_sales ?? true,
            can_see_liquidity: data.can_see_liquidity ?? true,
            can_see_all_branches: data.can_see_all_branches ?? true,
            allowed_branch_ids: data.allowed_branch_ids,
            user_id: data.user_id,
          });
          // Touch last_login (fire-and-forget)
          supabase
            .from('malaki_portal_users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', data.id)
            .then(() => {});
        }
      } catch {
        setPortalUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchPortalUser();
  }, [authUser, authLoading]);

  const logout = useCallback(async () => {
    // Clean up old localStorage sessions
    localStorage.removeItem('portal_session');
    localStorage.removeItem('malaki_session');
    await supabase.auth.signOut();
    setPortalUser(null);
  }, []);

  return { user: portalUser, loading, logout };
}
