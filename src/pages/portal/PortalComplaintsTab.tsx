import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, MessageSquareWarning, CheckCircle2, XCircle, Clock } from 'lucide-react';

function getThemeColors(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? { card: '#161B22', text: '#E6EDF3', textMuted: 'rgba(230,237,243,0.6)', border: 'rgba(230,237,243,0.08)', chipBg: 'rgba(230,237,243,0.06)', chipActive: '#E6EDF3', chipActiveText: '#0D1B2E', pageBg: 'transparent' }
    : { card: '#FFFFFF', text: '#0D1B2E', textMuted: 'rgba(13,27,46,0.6)', border: 'rgba(13,27,46,0.1)', chipBg: 'rgba(13,27,46,0.04)', chipActive: '#0D1B2E', chipActiveText: '#FFFFFF', pageBg: 'transparent' };
}

interface Row {
  id: string; customer_name: string; phone: string | null; complaint_date: string;
  branch_id: string | null; invoice_number: string | null; details: string;
  follow_up_method: string | null; responder: string | null; compensated: boolean;
  notes: string | null; status: string;
}

type FilterKey = 'all' | 'جاري المتابعة' | 'جاهز';

export default function PortalComplaintsTab({ theme = 'light', ownerId }: { theme?: 'light' | 'dark'; ownerId?: string }) {
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
          .from('customer_complaints')
          .select('id, customer_name, phone, complaint_date, branch_id, invoice_number, details, follow_up_method, responder, compensated, notes, status')
          .eq('user_id', ownerId)
          .order('complaint_date', { ascending: false })
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

  // Live reflection of status changes made from the complaints screen
  useEffect(() => {
    if (!ownerId) return;
    const ch = supabase
      .channel(`portal-complaints-${ownerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_complaints', filter: `user_id=eq.${ownerId}` }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [ownerId, load]);

  const branchName = (id: string | null) => branches.find(b => b.id === id)?.name || '—';
  const visible = useMemo(() => rows.filter(r => filter === 'all' || (r.status || 'جاري المتابعة') === filter), [rows, filter]);
  const openCount = rows.filter(r => (r.status || 'جاري المتابعة') === 'جاري المتابعة').length;
  const doneCount = rows.filter(r => r.status === 'جاهز').length;

  const kpi = (label: string, value: number, color: string, Icon: any) => (
    <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: 12, flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: `${color}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} color={color} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: t.text }}>{value}</div>
          <div style={{ fontSize: 10.5, color: t.textMuted }}>{label}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ direction: 'rtl', fontFamily: 'Cairo', padding: 14 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: t.text }}>شكاوى الزبائن</div>
        <div style={{ fontSize: 11, color: t.textMuted }}>سجل الشكاوى وحالات المتابعة</div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {kpi('إجمالي الشكاوى', rows.length, '#0D1B2E', MessageSquareWarning)}
        {kpi('جاري المتابعة', openCount, '#F59E0B', Clock)}
        {kpi('جاهز', doneCount, '#10B981', CheckCircle2)}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {(['all', 'جاري المتابعة', 'جاهز'] as FilterKey[]).map(k => (
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
        <div style={{ textAlign: 'center', padding: 40, color: t.textMuted, fontSize: 12.5 }}>لا يوجد شكاوى</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {visible.map(r => {
            const done = (r.status || 'جاري المتابعة') === 'جاهز';
            return (
              <div key={r.id} style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>{r.customer_name}</div>
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                    background: done ? '#10B9811A' : '#F59E0B1A', color: done ? '#10B981' : '#B45309',
                  }}>{done ? 'جاهز' : 'جاري المتابعة'}</span>
                </div>
                <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>
                  {r.phone || '—'} • {r.complaint_date} • {branchName(r.branch_id)}
                  {r.invoice_number ? ` • فاتورة ${r.invoice_number}` : ''}
                </div>
                <div style={{ fontSize: 12.5, color: t.text, lineHeight: 1.6 }}>{r.details}</div>
                {r.follow_up_method && (
                  <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 6 }}>آلية المتابعة: {r.follow_up_method}</div>
                )}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: t.textMuted }}>المستجيب: {r.responder || '—'}</span>
                  <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: r.compensated ? '#10B981' : t.textMuted }}>
                    {r.compensated ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                    {r.compensated ? 'تم التعويض' : 'بدون تعويض'}
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
