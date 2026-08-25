import { useState, useMemo, useEffect, Fragment, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Search, ArrowUp, ArrowDown, FileDown, RefreshCw, ChevronDown, ChevronLeft } from 'lucide-react';

/**
 * Cheque report — Microsoft Dynamics 365 "Finance" shell styling:
 * command bar, filter strip, dense flat data grid, square corners, Segoe UI.
 */

const FLUENT = {
  accent: '#0F6CBD',
  accentDark: '#115EA3',
};

function getThemeColors(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? {
        shell: '#1B1A19', surface: '#252423', header: '#292827', text: '#F3F2F1',
        textMuted: '#C8C6C4', textFaint: '#A19F9D', border: '#3B3A39',
        inputBg: '#1B1A19', rowAlt: '#2B2A29', rowHover: '#323130', gridHead: '#323130',
      }
    : {
        shell: '#FAF9F8', surface: '#FFFFFF', header: '#F3F2F1', text: '#201F1E',
        textMuted: '#484644', textFaint: '#8A8886', border: '#EDEBE9',
        inputBg: '#FFFFFF', rowAlt: '#FAF9F8', rowHover: '#F3F2F1', gridHead: '#F3F2F1',
      };
}

const FONT = "'Segoe UI', Tajawal, system-ui, sans-serif";

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
  'محصل': '#107C10', 'مصروف': '#107C10', 'مرتجع': '#A4262C', 'ملغي': '#8A8886',
  'مودع': '#0F6CBD', 'مستحق': '#C19C00', 'آجل': '#8764B8', 'مسجل': '#605E5C', 'مظهر': '#038387',
};

type SortKey = 'cheque_date' | 'amount' | 'party_name' | 'cheque_number' | 'status';

function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export default function PortalChequesTab({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const t = getThemeColors(theme);
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [mode, setMode] = useState<'month' | 'range' | 'all'>('month');
  const [month, setMonth] = useState(defaultMonth);
  const [dateFrom, setDateFrom] = useState(monthRange(defaultMonth).from);
  const [dateTo, setDateTo] = useState(monthRange(defaultMonth).to);
  const [chequeType, setChequeType] = useState<'all' | 'وارد' | 'صادر'>('all');
  const [status, setStatus] = useState('all');
  const [currency, setCurrency] = useState('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('cheque_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showFilters, setShowFilters] = useState(true);

  const [rows, setRows] = useState<ChequeRow[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const effectiveRange =
    mode === 'all' ? { from: '2000-01-01', to: '2100-12-31' }
      : mode === 'month' ? monthRange(month)
        : { from: dateFrom, to: dateTo };

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
        setStatuses(data.statuses || []);
        setCurrencies(data.currencies || []);
      }
      setLoaded(true);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Auto-refresh whenever any filter changes (debounced).
  const timer = useRef<any>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fetchData, 250);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, month, dateFrom, dateTo, chequeType, status, currency]);

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
      const va: any = a[sortKey] ?? '';
      const vb: any = b[sortKey] ?? '';
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
    height: 32, background: t.inputBg, border: `1px solid ${t.border}`,
    borderBottom: `1px solid ${t.textFaint}`, borderRadius: 2, padding: '0 8px',
    color: t.text, fontSize: 12, outline: 'none', width: '100%', fontFamily: FONT,
  };

  const seg = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: FONT,
    whiteSpace: 'nowrap', borderRadius: 0, background: 'transparent',
    border: 'none', borderBottom: `2px solid ${active ? FLUENT.accent : 'transparent'}`,
    color: active ? FLUENT.accent : t.textMuted, fontWeight: active ? 600 : 400,
  });

  const pill = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: FONT,
    whiteSpace: 'nowrap', borderRadius: 2,
    border: `1px solid ${active ? FLUENT.accent : t.border}`,
    background: active ? FLUENT.accent : t.surface,
    color: active ? '#fff' : t.textMuted,
  });

  const thStyle: React.CSSProperties = {
    padding: '7px 8px', fontSize: 11, color: t.textMuted, fontWeight: 600,
    whiteSpace: 'nowrap', textAlign: 'right', cursor: 'pointer',
    borderBottom: `1px solid ${t.border}`, background: t.gridHead,
  };

  const sortIcon = (k: SortKey) => sortKey !== k ? null
    : sortDir === 'asc' ? <ArrowUp size={10} style={{ display: 'inline' }} /> : <ArrowDown size={10} style={{ display: 'inline' }} />;

  return (
    <div style={{ direction: 'rtl', fontFamily: FONT, background: t.shell, margin: '-4px', padding: 4 }}>
      {/* Command bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px',
        background: t.surface, border: `1px solid ${t.border}`, borderRadius: 2, marginBottom: 6,
        overflowX: 'auto',
      }}>
        <button onClick={fetchData} disabled={loading} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12,
          background: 'transparent', border: 'none', color: t.text, cursor: 'pointer', fontFamily: FONT,
        }}>
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} تحديث
        </button>
        <div style={{ width: 1, height: 18, background: t.border }} />
        <button onClick={exportCsv} disabled={!filtered.length} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12,
          background: 'transparent', border: 'none', color: t.text, cursor: 'pointer', fontFamily: FONT,
        }}>
          <FileDown size={13} /> تصدير Excel
        </button>
        <div style={{ width: 1, height: 18, background: t.border }} />
        <button onClick={() => setShowFilters(s => !s)} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12,
          background: 'transparent', border: 'none', color: t.text, cursor: 'pointer', fontFamily: FONT,
        }}>
          {showFilters ? <ChevronDown size={13} /> : <ChevronLeft size={13} />} الفلاتر
        </button>
        <span style={{ marginInlineStart: 'auto', fontSize: 11, color: t.textFaint, whiteSpace: 'nowrap' }}>
          {filtered.length} سجل
        </span>
      </div>

      {/* FastTab: filters */}
      {showFilters && (
        <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 2, marginBottom: 6 }}>
          <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${t.border}`, padding: '0 6px' }}>
            <button onClick={() => setMode('month')} style={seg(mode === 'month')}>شهري</button>
            <button onClick={() => setMode('range')} style={seg(mode === 'range')}>فترة مخصصة</button>
            <button onClick={() => setMode('all')} style={seg(mode === 'all')}>كل الشيكات</button>
          </div>

          <div style={{ padding: 10, display: 'grid', gap: 8 }}>
            {mode === 'month' && (
              <div>
                <label style={{ fontSize: 10, color: t.textFaint, display: 'block', marginBottom: 3 }}>الشهر</label>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={inputStyle} />
              </div>
            )}
            {mode === 'range' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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

            <div style={{ display: 'flex', gap: 5, overflowX: 'auto' }}>
              {([['all', 'الكل'], ['وارد', 'وارد'], ['صادر', 'صادر']] as const).map(([v, l]) => (
                <button key={v} onClick={() => setChequeType(v as any)} style={pill(chequeType === v)}>{l}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 5, overflowX: 'auto' }}>
              <button onClick={() => setStatus('all')} style={pill(status === 'all')}>كل الحالات</button>
              {statuses.map(s => <button key={s} onClick={() => setStatus(s)} style={pill(status === s)}>{s}</button>)}
            </div>
            {currencies.length > 1 && (
              <div style={{ display: 'flex', gap: 5, overflowX: 'auto' }}>
                <button onClick={() => setCurrency('all')} style={pill(currency === 'all')}>كل العملات</button>
                {currencies.map(cur => <button key={cur} onClick={() => setCurrency(cur)} style={pill(currency === cur)}>{cur}</button>)}
              </div>
            )}

            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', right: 8, top: 9, color: t.textFaint }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث: اسم، رقم شيك، بنك، ملاحظة..."
                style={{ ...inputStyle, paddingRight: 28 }} />
            </div>
          </div>
        </div>
      )}

      {/* Tiles: totals per currency */}
      {loaded && visibleTotals.length > 0 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 6 }}>
          {visibleTotals.map(tot => (
            <div key={tot.currency} style={{
              minWidth: 210, flex: '0 0 auto', background: t.surface,
              border: `1px solid ${t.border}`, borderTop: `3px solid ${FLUENT.accent}`,
              borderRadius: 2, padding: '8px 10px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: t.text }}>{tot.currency}</span>
                <span style={{ fontSize: 10, color: t.textFaint }}>{tot.count} شيك</span>
              </div>
              {[
                { l: 'وارد', v: tot.incoming, c: '#107C10' },
                { l: 'صادر', v: tot.outgoing, c: '#A4262C' },
                { l: 'الصافي', v: tot.incoming - tot.outgoing, c: tot.incoming - tot.outgoing >= 0 ? '#107C10' : '#A4262C' },
              ].map(k => (
                <div key={k.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                  <span style={{ fontSize: 11, color: t.textMuted }}>{k.l}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: k.c, direction: 'ltr' }}>{fmtAmount(k.v, tot.currency)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Data grid */}
      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 2 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '46px 20px' }}>
            <Loader2 size={22} className="animate-spin" style={{ color: FLUENT.accent, margin: '0 auto', display: 'block' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 20px', color: t.textFaint, fontSize: 12 }}>لا توجد شيكات ضمن هذه الفلاتر</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 540 }}>
              <thead>
                <tr>
                  <th style={thStyle} onClick={() => toggleSort('cheque_date')}>التاريخ {sortIcon('cheque_date')}</th>
                  <th style={thStyle} onClick={() => toggleSort('cheque_number')}>رقم الشيك {sortIcon('cheque_number')}</th>
                  <th style={thStyle} onClick={() => toggleSort('party_name')}>الطرف {sortIcon('party_name')}</th>
                  <th style={thStyle} onClick={() => toggleSort('status')}>الحالة {sortIcon('status')}</th>
                  <th style={{ ...thStyle, textAlign: 'left' }} onClick={() => toggleSort('amount')}>المبلغ {sortIcon('amount')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <Fragment key={r.id}>
                    <tr onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                      style={{
                        borderBottom: `1px solid ${t.border}`,
                        background: expanded === r.id ? t.rowHover : i % 2 ? t.rowAlt : 'transparent',
                        cursor: 'pointer',
                      }}>
                      <td style={{ padding: '7px 8px', fontSize: 11, color: t.textMuted, whiteSpace: 'nowrap' }}>{r.cheque_date}</td>
                      <td style={{ padding: '7px 8px', fontSize: 11, color: FLUENT.accent, fontWeight: 600 }}>{r.cheque_number || '—'}</td>
                      <td style={{ padding: '7px 8px', fontSize: 11, color: t.text, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.party_name || '—'}
                        <span style={{ fontSize: 9, color: t.textFaint, marginInlineStart: 4 }}>({r.cheque_type})</span>
                      </td>
                      <td style={{ padding: '7px 8px' }}>
                        <span style={{
                          fontSize: 10, padding: '1px 6px', borderRadius: 2, whiteSpace: 'nowrap',
                          border: `1px solid ${STATUS_COLOR[r.status] || '#605E5C'}`,
                          color: STATUS_COLOR[r.status] || '#605E5C',
                        }}>{r.status}</span>
                      </td>
                      <td style={{
                        padding: '7px 8px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                        direction: 'ltr', textAlign: 'left',
                        color: r.cheque_type === 'وارد' ? '#107C10' : '#A4262C',
                      }}>{fmtAmount(r.amount, r.currency)}</td>
                    </tr>
                    {expanded === r.id && (
                      <tr style={{ background: t.rowHover }}>
                        <td colSpan={5} style={{ padding: '10px 12px', borderBottom: `1px solid ${t.border}` }}>
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
        )}
      </div>

      {theme === 'dark' && (
        <style>{`
          input[type="date"]::-webkit-calendar-picker-indicator,
          input[type="month"]::-webkit-calendar-picker-indicator { filter: invert(1); }
        `}</style>
      )}
    </div>
  );
}
