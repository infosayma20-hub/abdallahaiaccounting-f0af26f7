import { useCallback, useEffect, useState } from 'react';
import { Bell, X, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { enablePushNotifications, pushSupported, isIos, isIosStandalone } from '@/lib/push-notifications';
import { setAppBadgeCount } from '@/lib/app-badge';

interface NotifRow {
  id: string;
  type: string;
  title: string | null;
  body: string | null;
  path: string | null;
  read_at: string | null;
  created_at: string;
}

const fmt = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('ar-EG', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
};

export default function PortalNotificationsBell({ onOpenPath, open: openProp, onOpenChange }: { onOpenPath?: (path: string) => void; open?: boolean; onOpenChange?: (v: boolean) => void }) {
  const [openState, setOpenState] = useState(false);
  const open = openProp !== undefined ? openProp : openState;
  const setOpen = (v: boolean) => { setOpenState(v); onOpenChange?.(v); };
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('notification_log')
      .select('id, type, title, body, path, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    setRows((data as NotifRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Lock background scroll while the drawer is open (mobile + desktop)
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPosition = body.style.position;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.width = '100%';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.width = '';
    };
  }, [open]);

  useEffect(() => {
    const channel = supabase
      .channel('portal-notification-log')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notification_log' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const unread = rows.filter((r) => !r.read_at).length;

  // Mirror the unread count onto the installed app icon (home screen badge).
  useEffect(() => { void setAppBadgeCount(unread); }, [unread]);

  const markAllRead = async () => {
    const ids = rows.filter((r) => !r.read_at).map((r) => r.id);
    if (!ids.length) return;
    setRows((prev) => prev.map((r) => (r.read_at ? r : { ...r, read_at: new Date().toISOString() })));
    await supabase.from('notification_log').update({ read_at: new Date().toISOString() }).in('id', ids);
  };

  const openRow = async (row: NotifRow) => {
    if (!row.read_at) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, read_at: new Date().toISOString() } : r)));
      await supabase.from('notification_log').update({ read_at: new Date().toISOString() }).eq('id', row.id);
    }
    if (row.path && onOpenPath) { setOpen(false); onOpenPath(row.path); }
  };

  const enablePush = async () => {
    if (!(await pushSupported())) { toast.error('المتصفح لا يدعم إشعارات Push.'); return; }
    if (isIos() && !isIosStandalone()) {
      toast.message('على iPhone: أضف التطبيق للشاشة الرئيسية أولاً ثم فعّل الإشعارات من داخله.');
      return;
    }
    const res = await enablePushNotifications();
    if (res.ok === true) toast.success('تم تفعيل الإشعارات على هذا الجهاز.');
    else toast.error(res.reason);
  };

  const pushOn = typeof Notification !== 'undefined' && Notification.permission === 'granted';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="الإشعارات"
        style={{
          background: unread > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.1)',
          border: 'none', borderRadius: 8, width: 28, height: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative',
        }}
      >
        <Bell size={14} color="rgba(255,255,255,0.85)" />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -4, insetInlineEnd: -4, minWidth: 15, height: 15, padding: '0 3px',
            borderRadius: 999, background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cairo',
          }}>{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 90 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
            style={{
              position: 'fixed', top: 0, insetInlineEnd: 0, width: 'min(420px, 100%)',
              height: '100dvh', background: '#fff', zIndex: 91,
              display: 'flex', flexDirection: 'column', fontFamily: 'Cairo',
              boxShadow: '0 0 30px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{
              padding: '10px 14px', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
              background: '#0D1B2E', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>الإشعارات {unread > 0 ? `(${unread})` : ''}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={markAllRead} title="تعليم الكل كمقروء" style={{
                  background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, width: 28, height: 28,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}><Check size={14} color="#fff" /></button>
                <button onClick={() => setOpen(false)} style={{
                  background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, width: 28, height: 28,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}><X size={14} color="#fff" /></button>
              </div>
            </div>

            {!pushOn && (
              <button onClick={enablePush} style={{
                margin: 10, padding: '8px 12px', borderRadius: 10, border: '1px solid #0D1B2E22',
                background: '#0D1B2E0d', color: '#0D1B2E', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Cairo',
              }}>
                🔔 تفعيل إشعارات الهاتف على هذا الجهاز
              </button>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 20px' }}>
              {loading && <div style={{ padding: 20, fontSize: 12, color: '#64748b' }}>جارِ التحميل…</div>}
              {!loading && rows.length === 0 && (
                <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: '#64748b' }}>لا توجد إشعارات</div>
              )}
              {rows.map((r) => (
                <div
                  key={r.id}
                  onClick={() => openRow(r)}
                  style={{
                    padding: '10px 12px', marginBottom: 8, borderRadius: 12, cursor: 'pointer',
                    background: r.read_at ? '#f8fafc' : '#eff6ff',
                    border: `1px solid ${r.read_at ? '#e2e8f0' : '#bfdbfe'}`,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{r.title || '—'}</div>
                  {r.body && <div style={{ fontSize: 12, color: '#475569', marginTop: 3, lineHeight: 1.6 }}>{r.body}</div>}
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{fmt(r.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
