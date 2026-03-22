import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

export default function PortalLogin() {
  const navigate = useNavigate();
  const { user: authUser, loading: authLoading } = useAuth();
  const { user: portalUser, loading: portalLoading } = usePortalAuth();

  useEffect(() => {
    if (authLoading || portalLoading) return;
    
    if (authUser && portalUser) {
      // User is logged in and is a portal user
      navigate('/portal/dashboard', { replace: true });
    } else {
      // Redirect to main auth page
      navigate('/auth', { replace: true });
    }
  }, [authLoading, portalLoading, authUser, portalUser, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
