import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Users, Star, Repeat, TrendingUp, RefreshCw, Trophy, UserPlus } from 'lucide-react';

interface Props { theme: 'light' | 'dark'; ownerId?: string; }

interface TopMember {
  name: string; phone: string | null; card_code: string | null;
  points: number; visits: number; spend: number; last_visit_at: string | null;
}

const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString('en-US');

export default function PortalLoyaltyTab({ theme, ownerId }: Props) {
  const dark = theme === 'dark';
  const c = {
    bg: dark ? '#0a0a0a' : '#F8FAFC',
    card: dark ? '#161616' : '#FFFFFF',
    border: dark ? '#262626' : '#EEF2F7',
    text: dark ? '#F1F5F9' : '#0D1B2E',
    sub: dark ? '#A1A1AA' : '#64748B',
    muted: dark ? '#71717A' : '#94A3B8',
  };

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);

  const load = useCallback(async () => {
    if (!ownerId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_portal_loyalty_stats' as any, { p_owner: ownerId });
      if (!error) setStats(data as any);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [ownerId]);

  useEffect(() => { load(); }, [load]);

  const top: TopMember[] = (stats?.top_members || []) as TopMember[];

  const cards = [
    { label: 'عدد المشتركين', value: fmt(stats?.members_total || 0), icon: Users, color: '#2563EB' },
    { label: 'مشتركين جدد (30 يوم)', value: fmt(stats?.members_new_30d || 0), icon: UserPlus, color: '#16A34A' },
    { label: 'إجمالي النقاط', value: fmt(stats?.points_total || 0), icon: Star, color: '#F59E0B' },
    { label: 'عدد الزيارات', value: fmt(stats?.visits_total || 0), icon: Repeat, color: '#7C3AED' },
    { label: 'زوار خلال 30 يوم', value: fmt(stats?.visitors_30d || 0), icon: TrendingUp, color: '#0EA5E9' },
    { label: 'إنفاق الأعضاء', value: `₪${fmt(stats?.spend_total || 0)}`, icon: Trophy, color: '#DC2626' },
  ];

  return (
    <div style={{ direction: 'rtl', fontFamily: 'Cairo', padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: c.text }}>تقارير برنامج الولاء</div>
          <div style={{ fontSize: 11, color: c.muted }}>المشتركون والنقاط والزيارات</div>
        </div>
        <button onClick={load} style={{
          background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: '7px 12px',
          color: c.text, fontFamily: 'Cairo', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
        }}>
          <RefreshCw size={13} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} /> تحديث
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
        {cards.map((s, i) => (
          <div key={i} style={{
            background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, padding: 14,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, right: 0, left: 0, height: 3, background: s.color }} />
            <div style={{
              width: 34, height: 34, borderRadius: 10, background: `${s.color}1A`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8,
            }}>
              <s.icon size={17} color={s.color} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c.text }}>{loading ? '—' : s.value}</div>
            <div style={{ fontSize: 11, color: c.sub, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 16, background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, overflow: 'hidden',
      }}>
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Trophy size={15} color="#F59E0B" />
          <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>ترتيب الأعضاء حسب النقاط</span>
        </div>
        {loading && <div style={{ padding: 16, fontSize: 12, color: c.muted }}>جاري التحميل...</div>}
        {!loading && top.length === 0 && (
          <div style={{ padding: 16, fontSize: 12, color: c.muted }}>لا يوجد أعضاء بعد</div>
        )}
        {!loading && top.map((m, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
            borderBottom: i < top.length - 1 ? `1px solid ${c.border}` : 'none',
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
              background: i === 0 ? '#F59E0B' : i === 1 ? '#94A3B8' : i === 2 ? '#B45309' : (dark ? '#1e1e1e' : '#F1F5F9'),
              color: i < 3 ? '#FFFFFF' : c.sub,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800,
            }}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: c.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {m.name || m.card_code || 'عضو'}
              </div>
              <div style={{ fontSize: 10.5, color: c.muted }}>
                {m.visits || 0} زيارة · ₪{fmt(m.spend || 0)}
              </div>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#F59E0B' }}>{fmt(m.points)}</div>
              <div style={{ fontSize: 10, color: c.muted }}>نقطة</div>
            </div>
          </div>
        ))}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }`}</style>
    </div>
  );
}
