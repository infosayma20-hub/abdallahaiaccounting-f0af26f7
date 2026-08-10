import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Receipt, ChevronDown, ChevronUp } from 'lucide-react';

function getThemeColors(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? { card: '#161B22', text: '#E6EDF3', textMuted: 'rgba(230,237,243,0.6)', border: 'rgba(230,237,243,0.08)', chipBg: 'rgba(230,237,243,0.06)', chipActive: '#E6EDF3', chipActiveText: '#0D1B2E' }
    : { card: '#FFFFFF', text: '#0D1B2E', textMuted: 'rgba(13,27,46,0.6)', border: 'rgba(13,27,46,0.1)', chipBg: 'rgba(13,27,46,0.04)', chipActive: '#0D1B2E', chipActiveText: '#FFFFFF' };
}

const fmt = (n: number) => '₪' + n.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type RangeKey = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

interface PettyRow {
  id: string; ref: string; date: string; amount: number;
  description: string; notes: string; status: string;
  cashBoxName: string; branchName: string;
  lines: { name: string; description: string; amount: number }[];
}

export default function PortalPettyCashTab({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const t = getThemeColors(theme);
  const [range, setRange] = useState<RangeKey>('today');
  const [from, setFrom] = useState(iso(new Date()));
  const [to, setTo] = useState(iso(new Date()));
  const [branch, setBranch] = useState('all');
  const [rows, setRows] = useState<PettyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const applyRange = (key: RangeKey) => {
    setRange(key);
    const now = new Date();
    if (key === 'today') { setFrom(iso(now)); setTo(iso(now)); }
    else if (key === 'yesterday') { const d = new Date(now); d.setDate(d.getDate() - 1); setFrom(iso(d)); setTo(iso(d)); }
    else if (key === 'week') { const d = new Date(now); d.setDate(d.getDate() - 6); setFrom(iso(d)); setTo(iso(now)); }
    else if (key === 'month') { setFrom(iso(new Date(now.getFullYear(), now.getMonth(), 1))); setTo(iso(now)); }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('malaki-data', {
        body: { action: 'petty_cash_expenses', dateFrom: from, dateTo: to },
      });
      if (error) throw error;
      setRows(data?.rows || []);
    } catch (e) { console.error(e); setRows([]); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const branches = useMemo(
    () => Array.from(new Set(rows.map(r => r.branchName))).sort(),
    [rows],
  );
  const visible = useMemo(
    () => rows.filter(r => r.status !== 'cancelled' && (branch === 'all' || r.branchName === branch)),
    [rows, branch],
  );
  const total = visible.reduce((s, r) => s + r.amount, 0);
  const perBranch = useMemo(() => {
    const m: Record<string, number> = {};
    visible.forEach(r => { m[r.branchName] = (m[r.branchName] || 0) + r.amount; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [visible]);

  const chip = (active: boolean) => ({
    padding: '6px 12px', borderRadius: 999, fontSize: 12, fontFamily: 'Cairo', cursor: 'pointer',
    border: `1px solid ${t.border}`, whiteSpace: 'nowrap' as const,
    background: active ? t.chipActive : t.chipBg, color: active ? t.chipActiveText : t.textMuted,
  });

  return (
    <div style={{ padding: '12px 12px 24px', direction: 'rtl', fontFamily: 'Cairo' }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: t.text, marginBottom: 2 }}>كشف المصاريف النثرية</div>
      <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 10 }}>مستورد من سندات الصرف الجماعية للنثرية</div>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
        {([['today', 'اليوم'], ['yesterday', 'أمس'], ['week', 'آخر ٧ أيام'], ['month', 'هذا الشهر'], ['custom', 'مخصص']] as [RangeKey, string][])
          .map(([k, label]) => (
            <button key={k} style={chip(range === k)} onClick={() => applyRange(k)}>{label}</button>
          ))}
      </div>

      {range === 'custom' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            style={{ flex: 1, padding: 8, borderRadius: 10, border: `1px solid ${t.border}`, background: t.card, color: t.text, fontFamily: 'Cairo', fontSize: 12 }} />
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            style={{ flex: 1, padding: 8, borderRadius: 10, border: `1px solid ${t.border}`, background: t.card, color: t.text, fontFamily: 'Cairo', fontSize: 12 }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10 }}>
        <button style={chip(branch === 'all')} onClick={() => setBranch('all')}>كل الفروع</button>
        {branches.map(b => (
          <button key={b} style={chip(branch === b)} onClick={() => setBranch(b)}>{b}</button>
        ))}
      </div>

      <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: t.textMuted }}>إجمالي النثريات</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: t.text, fontFamily: 'JetBrains Mono, monospace' }}>{fmt(total)}</div>
        {perBranch.length > 1 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {perBranch.map(([name, val]) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: t.textMuted }}>
                <span>{name}</span><span style={{ color: t.text, fontWeight: 700 }}>{fmt(val)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="animate-spin" color={t.textMuted} /></div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', color: t.textMuted, fontSize: 13, padding: 30 }}>لا توجد مصاريف نثرية في هذه الفترة</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map(r => {
            const open = expanded === r.id;
            return (
              <div key={r.id} style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, overflow: 'hidden' }}>
                <button onClick={() => setExpanded(open ? null : r.id)}
                  style={{ width: '100%', background: 'transparent', border: 'none', padding: 12, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'right', fontFamily: 'Cairo' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: t.chipBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textMuted, flexShrink: 0 }}>
                    <Receipt size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.description || r.cashBoxName || 'نثرية'}
                    </div>
                    <div style={{ fontSize: 10.5, color: t.textMuted }}>{r.branchName} · {r.date} · {r.ref}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: t.text, fontFamily: 'JetBrains Mono, monospace' }}>{fmt(r.amount)}</div>
                  {open ? <ChevronUp size={14} color={t.textMuted} /> : <ChevronDown size={14} color={t.textMuted} />}
                </button>
                {open && (
                  <div style={{ borderTop: `1px solid ${t.border}`, padding: '8px 12px 12px' }}>
                    {r.lines.length === 0 ? (
                      <div style={{ fontSize: 11, color: t.textMuted }}>لا توجد بنود</div>
                    ) : r.lines.map((l, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: i < r.lines.length - 1 ? `1px solid ${t.border}` : 'none' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: t.text }}>{l.name}</div>
                          {l.description && <div style={{ fontSize: 10.5, color: t.textMuted }}>{l.description}</div>}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: t.text, fontFamily: 'JetBrains Mono, monospace' }}>{fmt(l.amount)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
