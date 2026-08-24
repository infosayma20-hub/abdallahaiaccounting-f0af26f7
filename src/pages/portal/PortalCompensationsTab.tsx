import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, HandCoins, CheckCircle2, Clock, Ban } from 'lucide-react';
import { formatMoney } from '../CompensationsPage';

function getThemeColors(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? { card: '#161B22', text: '#E6EDF3', textMuted: 'rgba(230,237,243,0.6)', border: 'rgba(230,237,243,0.08)', chipBg: 'rgba(230,237,243,0.06)', chipActive: '#E6EDF3', chipActiveText: '#0D1B2E', pageBg: 'transparent' }
    : { card: '#FFFFFF', text: '#0D1B2E', textMuted: 'rgba(13,27,46,0.6)', border: 'rgba(13,27,46,0.1)', chipBg: 'rgba(13,27,46,0.04)', chipActive: '#0D1B2E', chipActiveText: '#FFFFFF', pageBg: 'transparent' };
}

interface Row {
  id: string; party_kind: string; party_name: string; branch_id: string | null;
  compensation_date: string; amount: number; currency: string; details: string;
  status: string; notes: string | null;
  customer_name: string | null; customer_phone: string | null;
  compensation_type: string | null; responder_name: string | null;
  compensated_at: string | null;
}

type FilterKey = 'all' | 'قيد المتابعة' | 'تم التحصيل/الخصم' | 'ملغي';

export default function PortalCompensationsTab({ theme = 'light', ownerId }: { theme?: 'light' | 'dark'; ownerId?: string }) {
  const t = getThemeColors(theme);
  const [rows, setRows] = useState<Row[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    try {
      const [{ data, error }, { data: br }] = await Promise.all([
        supabase
          .from('compensations')
          .select('id, party_kind, party_name, branch_id, compensation_date, amount, currency, details, status, notes, customer_name, customer_phone, compensation_type, responder_name, compensated_at')
          .eq('user_id', ownerId)
          .order('compensation_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(300),
        supabase.from('branches').select('id, name').eq('user_id', ownerId),
      ]);
      if (error) throw error;
      setRows((data || []) as Row[]);
      setBranches((br || []) as { id: string; name: string }[]);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => { void load(); }, [load]);

  // Live reflection of changes made from the compensations screen
  useEffect(() => {
    if (!ownerId) return;
    const ch = supabase
      .channel(`portal-compensations-${ownerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'compensations', filter: `user_id=eq.${ownerId}` }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [ownerId, load]);

  const branchName = (id: string | null) => branches.find(b => b.id === id)?.name || '—';
  const visible = useMemo(() => rows.filter(r => filter === 'all' || (r.status || 'قيد المتابعة') === filter), [rows, filter]);
  const openCount = rows.filter(r => (r.status || 'قيد المتابعة') === 'قيد المتابعة').length;
  const doneCount = rows.filter(r => r.status === 'تم التحصيل/الخصم').length;

  // Per-currency totals (non-cancelled only) — multi-currency standard
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if ((r.status || 'قيد المتابعة') === 'ملغي') continue;
      map.set(r.currency, (map.get(r.currency) || 0) + Number(r.amount || 0));
    }
    return Array.from(map.entries());
  }, [rows]);

  const kpi = (label: string, value: string | number, color: string, Icon: any) => (
    <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: 12, flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: `${color}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} color={color} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>{value}</div>
          <div style={{ fontSize: 10.5, color: t.textMuted }}>{label}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ direction: 'rtl', fontFamily: 'Cairo', padding: 14 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: t.text }}>التعويضات</div>
        <div style={{ fontSize: 11, color: t.textMuted }}>سجل التعويضات الناتجة عن مشاكل العمل والجهة المتحمِّلة لها</div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {kpi('إجمالي التعويضات', rows.length, '#0D1B2E', HandCoins)}
        {kpi('قيد المتابعة', openCount, '#F59E0B', Clock)}
        {kpi('تم التحصيل/الخصم', doneCount, '#10B981', CheckCircle2)}
        {totals.map(([cur, sum]) => kpi(`المبالغ (${cur})`, formatMoney(sum, cur), '#7C3AED', HandCoins))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {(['all', 'قيد المتابعة', 'تم التحصيل/الخصم', 'ملغي'] as FilterKey[]).map(k => (
          <button key={k} onClick={() => setFilter(k)} style={{
            background: filter === k ? t.chipActive : t.chipBg,
            color: filter === k ? t.chipActiveText : t.textMuted,
            border: `1px solid ${t.border}`, borderRadius: 999, padding: '5px 12px',
            fontSize: 11.5, fontWeight: 600, fontFamily: 'Cairo', cursor: 'pointer',
          }}>{k === 'all' ? 'الكل' : k}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2 className="animate-spin" size={22} color={t.textMuted as string} />
        </div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: t.textMuted, fontSize: 12.5 }}>لا يوجد تعويضات</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {visible.map(r => {
            const status = r.status || 'قيد المتابعة';
            const done = status === 'تم التحصيل/الخصم';
            const cancelled = status === 'ملغي';
            return (
              <div key={r.id} style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>
                    {r.customer_name || r.party_name}
                    {r.customer_phone && (
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: t.textMuted, marginRight: 6 }} dir="ltr">{r.customer_phone}</span>
                    )}
                  </div>
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                    background: r.compensated_at ? '#10B9811A' : '#F59E0B1A',
                    color: r.compensated_at ? '#10B981' : '#B45309',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    {r.compensated_at
                      ? `تم التعويض ✓ ${new Date(r.compensated_at).toLocaleDateString('en-GB')}`
                      : 'لم يُعوَّض بعد'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>
                  {r.compensation_date} • {branchName(r.branch_id)}
                  {r.responder_name && <> • المستجيب: {r.responder_name}</>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#7C3AED' }}>{formatMoney(r.amount, r.currency)}</span>
                  {r.compensation_type && (
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: t.textMuted, background: t.chipBg, borderRadius: 999, padding: '2px 8px' }}>{r.compensation_type}</span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: t.text, lineHeight: 1.6 }}>{r.details}</div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span>على: {r.party_name} ({r.party_kind})</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                    background: done ? '#10B9811A' : cancelled ? '#6B72801A' : '#F59E0B1A',
                    color: done ? '#10B981' : cancelled ? '#6B7280' : '#B45309',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    {cancelled && <Ban size={10} />}
                    {status}
                  </span>
                </div>
                {r.notes && <div style={{ fontSize: 11, color: t.textMuted, marginTop: 6 }}>ملاحظات: {r.notes}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
