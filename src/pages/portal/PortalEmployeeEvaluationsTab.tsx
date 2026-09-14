import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Star, UserRound, CalendarDays, ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type Criterion = { label: string; value: string | number };
type Evaluation = {
  id: string;
  evaluated: string;
  jobTitle: string;
  evaluator: string;
  createdAt: string;
  average: number | null;
  notes: string[];
  criteria: Criterion[];
  status: string;
};

const colors = (dark: boolean) => dark
  ? { card: '#161B22', text: '#E6EDF3', muted: 'rgba(230,237,243,.62)', border: 'rgba(230,237,243,.1)', field: '#0F141A', accent: '#F59E0B' }
  : { card: '#FFFFFF', text: '#0D1B2E', muted: 'rgba(13,27,46,.62)', border: 'rgba(13,27,46,.1)', field: '#F8FAFC', accent: '#B45309' };

const statusLabel = (status: string) => ({ submitted: 'مُرسل', under_review: 'قيد المراجعة', approved: 'معتمد', rejected: 'مرفوض' }[status] || status);

export default function PortalEmployeeEvaluationsTab({ theme = 'light', focusId }: { theme?: 'light' | 'dark'; focusId?: string | null }) {
  const t = colors(theme === 'dark');
  const [rows, setRows] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(focusId || null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('malaki-data', { body: { action: 'employee_evaluations' } });
      if (error || !data?.success) throw error || new Error(data?.error || 'load_failed');
      setRows((data.evaluations || []) as Evaluation[]);
      if (focusId) setOpenId(focusId);
    } catch (error) {
      console.error('portal employee evaluations', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [focusId]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((row) => [row.evaluated, row.evaluator, row.jobTitle, ...row.notes].some((value) => String(value || '').toLowerCase().includes(q))) : rows;
  }, [query, rows]);
  const averages = rows.map((row) => row.average).filter((value): value is number => value !== null);
  const overall = averages.length ? Math.round((averages.reduce((a, b) => a + b, 0) / averages.length) * 10) / 10 : null;

  return (
    <div dir="rtl" style={{ fontFamily: 'Cairo', padding: 14 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: t.text }}>تقييم الموظفين</div>
        <div style={{ fontSize: 11, color: t.muted }}>التقييمات المكتملة وملاحظات المدير</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8, marginBottom: 12 }}>
        {([
          ['التقييمات', rows.length, Star],
          ['الموظفون', new Set(rows.map((r) => r.evaluated)).size, UserRound],
          ['المعدل', overall === null ? '—' : `${overall}/10`, CalendarDays],
        ] as [string, string | number, LucideIcon][]).map(([label, value, Icon]) => (
          <div key={String(label)} style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, padding: 10, minWidth: 0 }}>
            <Icon size={15} color={t.accent} />
            <div style={{ color: t.text, fontSize: 16, fontWeight: 800, marginTop: 5 }}>{String(value)}</div>
            <div style={{ color: t.muted, fontSize: 10 }}>{String(label)}</div>
          </div>
        ))}
      </div>
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Search size={15} color={t.muted} style={{ position: 'absolute', right: 11, top: 11 }} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالموظف أو المدير..." style={{ width: '100%', boxSizing: 'border-box', background: t.field, border: `1px solid ${t.border}`, borderRadius: 8, padding: '9px 34px 9px 10px', color: t.text, fontFamily: 'Cairo', fontSize: 12 }} />
      </div>
      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 42 }}><Loader2 className="animate-spin" size={22} color={t.muted} /></div>
        : filtered.length === 0 ? <div style={{ textAlign: 'center', padding: 42, color: t.muted, fontSize: 12 }}>لا توجد تقييمات مكتملة</div>
        : <div style={{ display: 'grid', gap: 9 }}>
          {filtered.map((row) => {
            const expanded = openId === row.id;
            return <button key={row.id} onClick={() => setOpenId(expanded ? null : row.id)} style={{ textAlign: 'right', background: t.card, color: t.text, border: `1px solid ${expanded ? t.accent : t.border}`, borderRadius: 8, padding: 12, fontFamily: 'Cairo', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}>
                <div><div style={{ fontSize: 14, fontWeight: 800 }}>{row.evaluated}</div><div style={{ fontSize: 11, color: t.muted }}>{row.jobTitle || '—'}</div></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 800, color: t.accent }}>{row.average === null ? '—' : `${row.average}/10`}</span>{expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</div>
              </div>
              <div style={{ fontSize: 11, color: t.muted, marginTop: 7 }}>المدير المقيّم: {row.evaluator}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: t.muted, fontSize: 10, marginTop: 5 }}><span>{new Date(row.createdAt).toLocaleString('ar-PS')}</span><span>{statusLabel(row.status)}</span></div>
              {expanded && <div style={{ borderTop: `1px solid ${t.border}`, marginTop: 10, paddingTop: 9 }}>
                {row.notes.length > 0 && <div style={{ marginBottom: 9 }}><div style={{ fontSize: 11, fontWeight: 700 }}>الملاحظات</div>{row.notes.map((note, index) => <div key={index} style={{ fontSize: 11, color: t.muted, lineHeight: 1.7 }}>• {note}</div>)}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>{row.criteria.map((item) => <div key={item.label} style={{ background: t.field, borderRadius: 6, padding: 7 }}><div style={{ fontSize: 9.5, color: t.muted }}>{item.label}</div><div style={{ fontSize: 12, fontWeight: 700 }}>{String(item.value)}</div></div>)}</div>
              </div>}
            </button>;
          })}
        </div>}
    </div>
  );
}