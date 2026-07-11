import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { CalendarClock, ChevronLeft, UserCog } from 'lucide-react';

interface Props {
  theme: 'light' | 'dark';
  onOpen: () => void;
}

interface RosterSummary {
  allowed: boolean;
  today_count?: number;
  week_count?: number;
  last_assignment?: {
    at: string;
    manager: string;
    employee: string | null;
    shift: string | null;
    date: string;
  } | null;
  top_managers?: Array<{ manager: string; assignments: number; last_at: string }>;
}

function tokens(dark: boolean) {
  return dark
    ? {
        cardBg: '#161B22',
        cardBorder: 'rgba(230,237,243,0.08)',
        text: '#E6EDF3',
        textMuted: 'rgba(230,237,243,0.6)',
        textFaint: 'rgba(230,237,243,0.4)',
        accent: '#8B5CF6',
        accentSoft: 'rgba(139,92,246,0.15)',
      }
    : {
        cardBg: '#FFFFFF',
        cardBorder: '#F1F5F9',
        text: '#0D1B2E',
        textMuted: '#64748B',
        textFaint: '#94A3B8',
        accent: '#8B5CF6',
        accentSoft: 'rgba(139,92,246,0.10)',
      };
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `قبل ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `قبل ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `قبل ${days} يوم`;
  return new Date(iso).toLocaleDateString('ar-PS');
}

export default function PortalRosterSummaryCard({ theme, onOpen }: Props) {
  const { user: portalUser } = usePortalAuth();
  const t = tokens(theme === 'dark');
  const [data, setData] = useState<RosterSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!portalUser?.user_id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: comp } = await supabase
          .from('companies')
          .select('id')
          .eq('owner_id', portalUser.user_id)
          .maybeSingle();
        if (!comp?.id || cancelled) {
          setLoading(false);
          return;
        }
        const { data: res, error } = await (supabase as any).rpc('get_portal_roster_summary', {
          p_company_id: comp.id,
        });
        if (cancelled) return;
        if (error) {
          console.error('[roster-summary]', error);
          setData({ allowed: false });
        } else {
          setData(res as RosterSummary);
        }
      } catch (e) {
        console.error('[roster-summary]', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [portalUser?.user_id]);

  if (loading || !data || data.allowed === false) return null;
  if (!data.today_count && !data.week_count && !data.last_assignment) return null;

  const last = data.last_assignment;

  return (
    <button
      onClick={onOpen}
      style={{
        width: '100%',
        textAlign: 'right',
        cursor: 'pointer',
        fontFamily: 'Cairo',
        background: t.cardBg,
        border: `1px solid ${t.cardBorder}`,
        borderRadius: 16,
        padding: 14,
        position: 'relative',
        overflow: 'hidden',
        marginBottom: 16,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          left: 0,
          height: 3,
          background: t.accent,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: t.accentSoft,
              color: t.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CalendarClock size={18} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: t.text }}>جداول الدوام</div>
            <div style={{ fontSize: 10, color: t.textFaint, marginTop: 2 }}>تعيينات المديرين</div>
          </div>
        </div>
        <ChevronLeft size={16} color={t.textMuted} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          marginTop: 12,
          padding: '10px 0',
          borderTop: `1px solid ${t.cardBorder}`,
          borderBottom: last ? `1px solid ${t.cardBorder}` : 'none',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: t.text, fontFamily: 'JetBrains Mono, monospace' }}>
            {data.today_count || 0}
          </div>
          <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>تعيين اليوم</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: t.text, fontFamily: 'JetBrains Mono, monospace' }}>
            {data.week_count || 0}
          </div>
          <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>هذا الأسبوع</div>
        </div>
      </div>

      {last && (
        <div style={{ paddingTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <UserCog size={12} color={t.textFaint} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: t.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              آخر تعيين: {last.manager}
            </div>
            <div style={{ fontSize: 10, color: t.textFaint, marginTop: 2 }}>
              {timeAgo(last.at)}
              {last.employee ? ` · ${last.employee}` : ''}
              {last.shift ? ` · ${last.shift}` : ''}
            </div>
          </div>
        </div>
      )}
    </button>
  );
}