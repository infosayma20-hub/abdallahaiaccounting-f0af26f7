import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Wallet, TrendingDown, TrendingUp, ChevronDown, ChevronUp, Utensils, User, HandCoins, Banknote, Truck, ShoppingCart, Receipt, Layers } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

function getThemeColors(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? { card: '#161B22', text: '#E6EDF3', textMuted: 'rgba(230,237,243,0.6)', border: 'rgba(230,237,243,0.08)', chipBg: 'rgba(230,237,243,0.06)', chipActive: '#E6EDF3', chipActiveText: '#0D1B2E', pageBg: 'transparent' }
    : { card: '#FFFFFF', text: '#0D1B2E', textMuted: 'rgba(13,27,46,0.6)', border: 'rgba(13,27,46,0.1)', chipBg: 'rgba(13,27,46,0.04)', chipActive: '#0D1B2E', chipActiveText: '#FFFFFF', pageBg: 'transparent' };
}

const fmt = (n: number) =>
  '₪' + Math.abs(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

interface Row {
  contact_name: string;
  account_code: string | null;
  is_liability: boolean;
  transaction_id: string;
  transaction_date: string;
  description: string | null;
  reference: string | null;
  transaction_type: string | null;
  debit: number;
  credit: number;
  running_balance: number;
}

type RangeKey = 'month' | 'quarter' | 'year' | 'all';

type CatKey = 'food' | 'personal' | 'advance' | 'cash' | 'pos' | 'delivery' | 'expense' | 'other';

const CATEGORIES: { key: CatKey; label: string; icon: LucideIcon; color: string; match: RegExp }[] = [
  { key: 'food', label: 'أكل ووجبات', icon: Utensils, color: '#F59E0B', match: /(اكل|أكل|وجب|فطور|غدا|غداء|عشاء|مطعم|شاورما|برغر|قهوة|كافيه|مشروب)/ },
  { key: 'personal', label: 'شخصي', icon: User, color: '#8B5CF6', match: /(شخصي|خاص)/ },
  { key: 'advance', label: 'سلف', icon: HandCoins, color: '#0EA5E9', match: /(سلف|سلفة|قرض)/ },
  { key: 'cash', label: 'سحب نقدي', icon: Banknote, color: '#EF4444', match: /(سحب نقد|نقدا|نقداً|كاش|صرف نقد)/ },
  { key: 'pos', label: 'مبيعات نقطة البيع', icon: ShoppingCart, color: '#14B8A6', match: /(نقطة البيع|POS)/i },
  { key: 'delivery', label: 'توصيل وطلبيات', icon: Truck, color: '#6366F1', match: /(توصيل|طلبي|وصيل|دليفري)/ },
  { key: 'expense', label: 'مصاريف', icon: Receipt, color: '#F97316', match: /(مصروف|مصاريف|فاتورة|كهرب|مياه|بنزين|محروق|صيانة)/ },
];

function categorize(r: Row): CatKey {
  const text = `${r.description || ''} ${r.reference || ''} ${r.transaction_type || ''}`;
  for (const c of CATEGORIES) if (c.match.test(text)) return c.key;
  return 'other';
}

export default function PortalMyDrawingsTab({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const t = getThemeColors(theme);
  const [range, setRange] = useState<RangeKey>('year');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState<CatKey | null>(null);

  const bounds = useMemo(() => {
    const now = new Date();
    if (range === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
    if (range === 'quarter') { const d = new Date(now); d.setMonth(d.getMonth() - 2); return { from: iso(new Date(d.getFullYear(), d.getMonth(), 1)), to: iso(now) }; }
    if (range === 'year') return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
    return { from: '2000-01-01', to: iso(now) };
  }, [range]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('portal_get_my_drawings', {
        p_from: bounds.from,
        p_to: bounds.to,
      });
      if (error) throw error;
      setRows((data as unknown as Row[]) || []);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [bounds.from, bounds.to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isLiability = rows[0]?.is_liability ?? false;
  const accountName = rows[0]?.contact_name || 'الحساب الموحّد';
  const accountCode = rows[0]?.account_code || '';

  const catOf = useMemo(() => {
    const m = new Map<string, CatKey>();
    rows.forEach((r) => m.set(r.transaction_id, categorize(r)));
    return m;
  }, [rows]);

  const catStats = useMemo(() => {
    const stats = new Map<CatKey, { drawn: number; count: number }>();
    rows.forEach((r) => {
      const k = catOf.get(r.transaction_id) || 'other';
      const s = stats.get(k) || { drawn: 0, count: 0 };
      s.drawn += Number(r.debit || 0);
      s.count += 1;
      stats.set(k, s);
    });
    const list = [...CATEGORIES.map((c) => ({ ...c })), { key: 'other' as CatKey, label: 'أخرى', icon: Layers, color: '#64748B', match: /$^/ }]
      .map((c) => ({ ...c, ...(stats.get(c.key) || { drawn: 0, count: 0 }) }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.drawn - a.drawn);
    return list;
  }, [rows, catOf]);

  const visibleRows = useMemo(
    () => (activeCat ? rows.filter((r) => catOf.get(r.transaction_id) === activeCat) : rows),
    [rows, catOf, activeCat],
  );

  const totals = useMemo(() => {
    const drawn = visibleRows.reduce((s, r) => s + Number(r.debit || 0), 0);
    const paid = visibleRows.reduce((s, r) => s + Number(r.credit || 0), 0);
    const balance = rows.length ? Number(rows[rows.length - 1].running_balance || 0) : 0;
    return { drawn, paid, balance };
  }, [visibleRows, rows]);

  const months = useMemo(() => {
    const map = new Map<string, { key: string; label: string; drawn: number; paid: number; items: Row[] }>();
    visibleRows.forEach((r) => {
      const d = new Date(`${r.transaction_date}T00:00:00`);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!map.has(key)) map.set(key, { key, label: `${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`, drawn: 0, paid: 0, items: [] });
      const m = map.get(key)!;
      m.drawn += Number(r.debit || 0);
      m.paid += Number(r.credit || 0);
      m.items.push(r);
    });
    return Array.from(map.values()).reverse();
  }, [visibleRows]);

  const chips: { key: RangeKey; label: string }[] = [
    { key: 'month', label: 'هذا الشهر' },
    { key: 'quarter', label: '٣ شهور' },
    { key: 'year', label: 'هذه السنة' },
    { key: 'all', label: 'الكل' },
  ];

  return (
    <div style={{ direction: 'rtl', fontFamily: 'Cairo', padding: 14 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: t.text }}>مسحوباتي</div>
        <div style={{ fontSize: 11, color: t.textMuted }}>
          {accountName}{accountCode ? ` · ${accountCode}` : ''}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12 }}>
        {chips.map((ch) => (
          <button
            key={ch.key}
            onClick={() => setRange(ch.key)}
            style={{
              padding: '6px 12px', borderRadius: 999, whiteSpace: 'nowrap', fontFamily: 'Cairo', fontSize: 12,
              border: `1px solid ${t.border}`, cursor: 'pointer',
              background: range === ch.key ? t.chipActive : t.chipBg,
              color: range === ch.key ? t.chipActiveText : t.textMuted,
            }}
          >{ch.label}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, marginBottom: 14 }}>
        <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <TrendingDown size={14} color="#EF4444" />
            <span style={{ fontSize: 11, color: t.textMuted }}>مسحوبات</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#EF4444' }}>{fmt(totals.drawn)}</div>
        </div>
        <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <TrendingUp size={14} color="#16A34A" />
            <span style={{ fontSize: 11, color: t.textMuted }}>إيداعات / تسديد</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#16A34A' }}>{fmt(totals.paid)}</div>
        </div>
        <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <Wallet size={14} color="#0D6EFD" />
            <span style={{ fontSize: 11, color: t.textMuted }}>الرصيد</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: t.text }}>{fmt(totals.balance)}</div>
          <div style={{ fontSize: 9, color: t.textMuted }}>
            {totals.balance === 0 ? 'مسوّى' : isLiability ? (totals.balance > 0 ? 'لك على الشركة' : 'عليك للشركة') : (totals.balance > 0 ? 'عليك للشركة' : 'لك على الشركة')}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2 className="animate-spin" size={22} color={t.textMuted} />
        </div>
      ) : rows.length === 0 ? (
        <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: 24, textAlign: 'center', color: t.textMuted, fontSize: 12 }}>
          لا توجد حركات ضمن الفترة المحددة
        </div>
      ) : (
        <>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 8 }}>تفنيد المسحوبات</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, marginBottom: 14 }}>
          {catStats.map((c) => {
            const Icon = c.icon;
            const active = activeCat === c.key;
            return (
              <button
                key={c.key}
                onClick={() => { setActiveCat(active ? null : c.key); setOpenMonth(null); }}
                style={{
                  background: active ? `${c.color}1A` : t.card,
                  border: `1px solid ${active ? c.color : t.border}`,
                  borderRadius: 14, padding: 10, cursor: 'pointer', fontFamily: 'Cairo',
                  direction: 'rtl', textAlign: 'right',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 8, background: `${c.color}22`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={13} color={c.color} />
                  </span>
                  <span style={{ fontSize: 11, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: c.color }}>{fmt(c.drawn)}</div>
                <div style={{ fontSize: 9, color: t.textMuted }}>{c.count} حركة</div>
              </button>
            );
          })}
        </div>
        {activeCat && (
          <button
            onClick={() => setActiveCat(null)}
            style={{ marginBottom: 10, padding: '6px 12px', borderRadius: 999, fontFamily: 'Cairo', fontSize: 11, border: `1px solid ${t.border}`, background: t.chipBg, color: t.textMuted, cursor: 'pointer' }}
          >إلغاء التصفية · عرض كل الحركات</button>
        )}
        {months.length === 0 ? (
          <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: 24, textAlign: 'center', color: t.textMuted, fontSize: 12 }}>
            لا توجد حركات ضمن هذا التصنيف
          </div>
        ) : (
        months.map((m) => {
          const open = openMonth === m.key;
          return (
            <div key={m.key} style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, marginBottom: 10, overflow: 'hidden' }}>
              <button
                onClick={() => setOpenMonth(open ? null : m.key)}
                style={{ width: '100%', background: 'transparent', border: 'none', padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontFamily: 'Cairo', direction: 'rtl' }}
              >
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{m.label}</div>
                  <div style={{ fontSize: 10, color: t.textMuted }}>{m.items.length} حركة</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#EF4444' }}>{fmt(m.drawn)}</div>
                    {m.paid > 0 && <div style={{ fontSize: 10, color: '#16A34A' }}>{fmt(m.paid)}</div>}
                  </div>
                  {open ? <ChevronUp size={16} color={t.textMuted} /> : <ChevronDown size={16} color={t.textMuted} />}
                </div>
              </button>
              {open && (
                <div style={{ borderTop: `1px solid ${t.border}` }}>
                  {m.items.slice().reverse().map((r) => {
                    const isDraw = Number(r.debit || 0) > 0;
                    const amount = isDraw ? Number(r.debit) : Number(r.credit);
                    return (
                      <div key={r.transaction_id} style={{ padding: '10px 12px', borderTop: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.description || r.transaction_type || 'حركة'}
                          </div>
                          <div style={{ fontSize: 10, color: t.textMuted }}>
                            {r.transaction_date}{r.reference ? ` · ${r.reference}` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'left', flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: isDraw ? '#EF4444' : '#16A34A' }}>
                            {isDraw ? '-' : '+'}{fmt(amount)}
                          </div>
                          <div style={{ fontSize: 9, color: t.textMuted }}>رصيد {fmt(Number(r.running_balance || 0))}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
        )}
        </>
      )}
    </div>
  );
}
