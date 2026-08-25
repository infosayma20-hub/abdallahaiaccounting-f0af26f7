import { useState, useMemo, useEffect, Fragment } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Search, ArrowUpDown, FileDown } from 'lucide-react';

const ACCENT = '#2A7B9B';

function getThemeColors(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? { card: '#161B22', text: '#E6EDF3', textMuted: 'rgba(230,237,243,0.6)', textFaint: 'rgba(230,237,243,0.4)', border: 'rgba(230,237,243,0.08)', inputBg: 'rgba(230,237,243,0.07)', inputBorder: 'rgba(230,237,243,0.12)', subCard: 'rgba(230,237,243,0.03)', rowAlt: 'rgba(230,237,243,0.02)' }
    : { card: '#FFFFFF', text: '#1B3A5C', textMuted: 'rgba(27,58,92,0.6)', textFaint: 'rgba(27,58,92,0.4)', border: 'rgba(27,58,92,0.1)', inputBg: '#F5F5F5', inputBorder: 'rgba(27,58,92,0.12)', subCard: 'rgba(27,58,92,0.03)', rowAlt: 'rgba(27,58,92,0.02)' };
}

interface ChequeRow {
  id: string;
  cheque_number: string | null;
  cheque_type: string;
  status: string;
  cheque_date: string;
  amount: number;
  currency: string;
  party_name: string | null;
  bank_name: string | null;
  notes: string | null;
  deposit_date: string | null;
  collection_date: string | null;
  bounce_date: string | null;
  endorsed_to_name: string | null;
  account_number: string | null;
}

interface Totals { currency: string; incoming: number; outgoing: number; count: number }

const CURRENCY_SYMBOL: Record<string, string> = { ILS: '₪', USD: '$', JOD: 'د.أ', EUR: '€' };

function fmtAmount(n: number, currency: string) {
  const sym = CURRENCY_SYMBOL[currency] || currency;
  return `${sym} ${n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_COLOR: Record<string, string> = {
  'محصل': '#22C55E',
  'مصروف': '#22C55E',
  'مرتجع': '#EF4444',
  'ملغي': '#94A3B8',
  'مودع': '#3B82F6',
  'مستحق': '#F59E0B',
  'آجل': '#8B5CF6',
  'مسجل': '#64748B',
  'مظهر': '#0EA5E9',
};

type SortKey = 'cheque_date' | 'amount' | 'party_name' | 'cheque_number' | 'status';

function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const last = new Date(y, m, 0).getDate();
  return { from, to: `${month}-${String(last).padStart(2, '0')}` };
}

export default function PortalChequesTab({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const t = getThemeColors(theme);
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [mode, setMode] = useState<'month' | 'range'>('month');
  const [month, setMonth] = useState(defaultMonth);
  const [dateFrom, setDateFrom] = useState(monthRange(defaultMonth).from);
  const [dateTo, setDateTo] = useState(monthRange(defaultMonth).to);
  const [chequeType, setChequeType] = useState<'all' | 'وارد' | 'صادر'>('all');
  const [status, setStatus] = useState('all');
  const [currency, setCurrency] = useState('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('cheque_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [rows, setRows] = useState<ChequeRow[]>([]);
  const [totals, setTotals] = useState<Totals[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const effectiveRange = mode === 'month' ? monthRange(month) : { from: dateFrom, to: dateTo };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('malaki-data', {
        body: {
          action: 'cheques_report',
          dateFrom: effectiveRange.from,
          dateTo: effectiveRange.to,
          chequeType, status, currency,
        },
      });
      if (data?.success) {
        setRows(data.cheques || []);
        setTotals(data.totals || []);
        setStatuses(data.statuses || []);
        setCurrencies(data.currencies || []);
      }
      setLoaded(true);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const filtered = useMemo(() => {
    const q = search.trim();
    const list = q
      ? rows.filter(r =>
        (r.party_name || '').includes(q) ||
        (r.cheque_number || '').includes(q) ||
        (r.bank_name || '').includes(q) ||
        (r.notes || '').includes(q))
      : rows;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      let va: any = a[sortKey] ?? '';
      let vb: any = b[sortKey] ?? '';
      if (sortKey === 'amount') return (Number(va) - Number(vb)) * dir;
      return String(va).localeCompare(String(vb), 'ar') * dir;
    });
  }, [rows, search, sortKey, sortDir]);

  const visibleTotals = useMemo(() => {
    const map: Record<string, Totals> = {};
    for (const r of filtered) {
      const cur = r.currency || 'ILS';
      if (!map[cur]) map[cur] = { currency: cur, incoming: 0, outgoing: 0, count: 0 };
      map[cur].count += 1;
      if (r.cheque_type === 'وارد') map[cur].incoming += r.amount; else map[cur].outgoing += r.amount;
    }
    return Object.values(map);
  }, [filtered]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  };

  const exportCsv = () => {
    const head = ['التاريخ', 'رقم الشيك', 'النوع', 'الحالة', 'الطرف', 'البنك', 'العملة', 'المبلغ', 'ملاحظات'];
    const lines = filtered.map(r => [
      r.cheque_date, r.cheque_number || '', r.cheque_type, r.status,
      r.party_name || '', r.bank_name || '', r.currency,
      r.amount.toFixed(2), (r.notes || '').replace(/[\n,;]/g, ' '),
    ].join(','));
    const blob = new Blob(['\uFEFF' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cheques-${effectiveRange.from}_${effectiveRange.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const inputStyle: React.CSSProperties = {
    height: 36, background: t.inputBg, border: `1px solid ${t.inputBorder}`,
    borderRadius: 10, padding: '0 10px', color: t.text, fontSize: 12,
    outline: 'none', width: '100%', fontFamily: 'Tajawal, sans-serif',
  };

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '5px 10px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
    fontFamily: 'Tajawal, sans-serif', whiteSpace: 'nowrap',
    border: `1px solid ${active ? ACCENT : t.inputBorder}`,
    background: active ? ACCENT : 'transparent',
    color: active ? '#fff' : t.textMuted,
  });

  const th = (label: string, k?: SortKey): React.CSSProperties => ({
    padding: '8px 6px', fontSize: 10, color: t.textMuted, fontWeight: 700,
    whiteSpace: 'nowrap', cursor: k ? 'pointer' : 'default', textAlign: 'right',
  });

  return (
    <div style={{ direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}>
      {/* Period selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button onClick={() => setMode('month')} style={chip(mode === 'month')}>شهري</button>
        <button onClick={() => setMode('range')} style={chip(mode === 'range')}>فترة مخصصة</button>
      </div>

      {mode === 'month' ? (
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 10, color: t.textFaint, display: 'block', marginBottom: 3 }}>الشهر</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={inputStyle} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label style={{ fontSize: 10, color: t.textFaint, display: 'block', marginBottom: 3 }}>من</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: t.textFaint, display: 'block', marginBottom: 3 }}>إلى</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
          </div>
        </div>
      )}

      {/* Type / status / currency filters */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 4 }}>
        {([['all', 'الكل'], ['وارد', '🟢 وارد'], ['صادر', '🔴 صادر']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setChequeType(v as any)} style={chip(chequeType === v)}>{l}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 4 }}>
        <button onClick={() => setStatus('all')} style={chip(status === 'all')}>كل الحالات</button>
        {statuses.map(s => <button key={s} onClick={() => setStatus(s)} style={chip(status === s)}>{s}</button>)}
      </div>
      {currencies.length > 1 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 4 }}>
          <button onClick={() => setCurrency('all')} style={chip(currency === 'all')}>كل العملات</button>
          {currencies.map(cur => <button key={cur} onClick={() => setCurrency(cur)} style={chip(currency === cur)}>{CURRENCY_SYMBOL[cur] || cur} {cur}</button>)}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button onClick={fetchData} disabled={loading} style={{
          flex: 1, padding: '9px', borderRadius: 10, fontSize: 13, fontWeight: 700,
          background: ACCENT, border: 'none', color: 'white', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          fontFamily: 'Tajawal, sans-serif',
        }}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}
          عرض التقرير
        </button>
        <button onClick={exportCsv} disabled={!filtered.length} style={{
          padding: '9px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
          background: 'transparent', border: `1px solid ${t.inputBorder}`, color: t.text,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <FileDown size={14} /> Excel
        </button>
      </div>

      {/* Totals per currency */}
      {loaded && visibleTotals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {visibleTotals.map(tot => (
            <div key={tot.currency} style={{
              background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: '10px 12px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: t.text }}>{CURRENCY_SYMBOL[tot.currency] || tot.currency} {tot.currency}</span>
                <span style={{ fontSize: 10, color: t.textFaint }}>{tot.count} شيك</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                {[
                  { l: 'وارد', v: tot.incoming, c: '#22C55E' },
                  { l: 'صادر', v: tot.outgoing, c: '#EF4444' },
                  { l: 'الصافي', v: tot.incoming - tot.outgoing, c: tot.incoming - tot.outgoing >= 0 ? '#22C55E' : '#EF4444' },
                ].map(k => (
                  <div key={k.l} style={{ background: t.subCard, borderRadius: 8, padding: '6px 8px' }}>
                    <div style={{ fontSize: 9, color: t.textFaint }}>{k.l}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: k.c, fontFamily: 'JetBrains Mono, monospace', direction: 'ltr' }}>
                      {fmtAmount(k.v, tot.currency)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={14} style={{ position: 'absolute', right: 10, top: 11, color: t.textFaint }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث: اسم، رقم شيك، بنك، ملاحظة..."
          style={{ ...inputStyle, height: 38, paddingRight: 32 }} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '50px 20px' }}>
          <Loader2 size={26} className="animate-spin" style={{ color: ACCENT, margin: '0 auto', display: 'block' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: t.textFaint, fontSize: 13 }}>لا توجد شيكات ضمن هذه الفلاتر</div>
      ) : (
        <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr style={{ background: t.subCard }}>
                  <th style={th('التاريخ', 'cheque_date')} onClick={() => toggleSort('cheque_date')}>التاريخ <ArrowUpDown size={9} /></th>
                  <th style={th('رقم', 'cheque_number')} onClick={() => toggleSort('cheque_number')}>رقم الشيك <ArrowUpDown size={9} /></th>
                  <th style={th('الطرف', 'party_name')} onClick={() => toggleSort('party_name')}>الطرف <ArrowUpDown size={9} /></th>
                  <th style={th('الحالة', 'status')} onClick={() => toggleSort('status')}>الحالة <ArrowUpDown size={9} /></th>
                  <th style={th('المبلغ', 'amount')} onClick={() => toggleSort('amount')}>المبلغ <ArrowUpDown size={9} /></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <Fragment key={r.id}>
                    <tr key={r.id} onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                      style={{ borderTop: `1px solid ${t.border}`, background: i % 2 ? t.rowAlt : 'transparent', cursor: 'pointer' }}>
                      <td style={{ padding: '8px 6px', fontSize: 11, color: t.textMuted, whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, monospace' }}>{r.cheque_date}</td>
                      <td style={{ padding: '8px 6px', fontSize: 11, color: t.text, fontFamily: 'JetBrains Mono, monospace' }}>{r.cheque_number || '—'}</td>
                      <td style={{ padding: '8px 6px', fontSize: 11, color: t.text, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.cheque_type === 'وارد' ? '🟢 ' : '🔴 '}{r.party_name || '—'}
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        <span style={{
                          fontSize: 9, padding: '2px 6px', borderRadius: 999, whiteSpace: 'nowrap',
                          background: `${STATUS_COLOR[r.status] || '#64748B'}22`, color: STATUS_COLOR[r.status] || '#64748B',
                        }}>{r.status}</span>
                      </td>
                      <td style={{
                        padding: '8px 6px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', direction: 'ltr',
                        fontFamily: 'JetBrains Mono, monospace', color: r.cheque_type === 'وارد' ? '#22C55E' : '#EF4444',
                      }}>{fmtAmount(r.amount, r.currency)}</td>
                    </tr>
                    {expanded === r.id && (
                      <tr key={`${r.id}-d`} style={{ background: t.subCard }}>
                        <td colSpan={5} style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            {[
                              { l: 'البنك', v: r.bank_name },
                              { l: 'رقم الحساب', v: r.account_number },
                              { l: 'تاريخ الإيداع', v: r.deposit_date },
                              { l: 'تاريخ التحصيل', v: r.collection_date },
                              { l: 'تاريخ الارتجاع', v: r.bounce_date },
                              { l: 'مظهر إلى', v: r.endorsed_to_name },
                            ].filter(x => x.v).map(x => (
                              <div key={x.l}>
                                <div style={{ fontSize: 9, color: t.textFaint }}>{x.l}</div>
                                <div style={{ fontSize: 11, color: t.text }}>{x.v}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 9, color: t.textFaint }}>ملاحظة</div>
                            <div style={{ fontSize: 11, color: r.notes ? t.text : t.textFaint, whiteSpace: 'pre-wrap' }}>{r.notes || 'لا توجد ملاحظة'}</div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {theme === 'dark' && (
        <style>{`
          input[type="date"]::-webkit-calendar-picker-indicator,
          input[type="month"]::-webkit-calendar-picker-indicator { filter: invert(1); }
        `}</style>
      )}
    </div>
  );
}
