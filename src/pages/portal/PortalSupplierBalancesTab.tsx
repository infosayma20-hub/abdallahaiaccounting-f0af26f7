import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Search } from 'lucide-react';
import { multiWordMatchAny } from "@/lib/utils";

const PRIMARY = '#1B3A5C';
const ACCENT = '#2A7B9B';

function getThemeColors(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? { card: '#161B22', text: '#E6EDF3', textMuted: 'rgba(230,237,243,0.6)', textFaint: 'rgba(230,237,243,0.4)', border: 'rgba(230,237,243,0.08)', chipBg: 'rgba(230,237,243,0.06)', inputBg: 'rgba(230,237,243,0.07)', inputBorder: 'rgba(230,237,243,0.12)', subCard: 'rgba(230,237,243,0.03)' }
    : { card: '#FFFFFF', text: '#1B3A5C', textMuted: 'rgba(27,58,92,0.6)', textFaint: 'rgba(27,58,92,0.4)', border: 'rgba(27,58,92,0.1)', chipBg: 'rgba(27,58,92,0.04)', inputBg: '#F5F5F5', inputBorder: 'rgba(27,58,92,0.12)', subCard: 'rgba(27,58,92,0.03)' };
}

interface SupplierBalance {
  id: string;
  name: string;
  openingBalance: number;
  totalPurchases: number;
  totalPayments: number;
  closingBalance: number;
}

function fmt(n: number) {
  return '₪' + Math.abs(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PortalSupplierBalancesTab({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + '01';
  const t = getThemeColors(theme);

  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(today);
  const [suppliers, setSuppliers] = useState<SupplierBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('malaki-data', {
        body: { action: 'supplier_balances', dateFrom, dateTo },
      });
      if (data?.suppliers) setSuppliers(data.suppliers);
      setLoaded(true);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const filtered = suppliers.filter(s => !search || s.name.includes(search));

  const totalOpening = filtered.reduce((s, r) => s + r.openingBalance, 0);
  const totalPurchases = filtered.reduce((s, r) => s + r.totalPurchases, 0);
  const totalPayments = filtered.reduce((s, r) => s + r.totalPayments, 0);
  const totalClosing = filtered.reduce((s, r) => s + r.closingBalance, 0);

  const inputStyle: React.CSSProperties = {
    height: 38, background: t.inputBg,
    border: `1px solid ${t.inputBorder}`,
    borderRadius: 10, padding: '0 12px',
    color: t.text, fontSize: 13, outline: 'none',
    fontFamily: 'Cairo', sans-serif,
    width: '100%',
  };

  return (
    <div>
      {/* Date Range */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
        marginBottom: 10,
      }}>
        <div>
          <label style={{ fontSize: 10, color: t.textFaint, marginBottom: 3, display: 'block' }}>من تاريخ</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={{ fontSize: 10, color: t.textFaint, marginBottom: 3, display: 'block' }}>إلى تاريخ</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
        </div>
      </div>

      <button onClick={fetchData} disabled={loading} style={{
        width: '100%', padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 700,
        background: ACCENT,
        border: 'none', color: 'white', cursor: 'pointer',
        fontFamily: "'Cairo', sans-serif",
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        marginBottom: 12,
      }}>
        {loading ? <Loader2 size={14} className="animate-spin" /> : null}
        عرض أرصدة الموردين
      </button>

      {!loaded && !loading && (
        <div style={{ textAlign: 'center', padding: '50px 20px', color: t.textFaint, fontSize: 13 }}>
          حدد الفترة واضغط "عرض" لتحميل الأرصدة
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '50px 20px' }}>
          <Loader2 size={28} className="animate-spin" style={{ color: ACCENT, margin: '0 auto 12px', display: 'block' }} />
        </div>
      )}

      {loaded && !loading && (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
            {[
              { label: 'رصيد افتتاحي', value: fmt(totalOpening), color: t.text },
              { label: 'مشتريات', value: fmt(totalPurchases), color: '#3B82F6' },
              { label: 'مدفوعات', value: fmt(totalPayments), color: '#22C55E' },
              { label: 'رصيد ختامي', value: fmt(totalClosing), color: totalClosing > 0 ? '#EF4444' : '#22C55E' },
            ].map(k => (
              <div key={k.label} style={{
                background: t.card, borderRadius: 10, padding: '10px 12px',
                border: `1px solid ${t.border}`,
              }}>
                <div style={{ fontSize: 9, color: t.textMuted, marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontFamily: 'Cairo', sans-serif }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Search size={14} style={{ position: 'absolute', right: 10, top: 11, color: t.textFaint }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالاسم..."
              style={{
                width: '100%', height: 38, background: t.inputBg,
                border: `1px solid ${t.inputBorder}`,
                borderRadius: 10, padding: '0 12px',
                paddingRight: 32,
                color: t.text, fontSize: 13, outline: 'none',
                fontFamily: "'Cairo', sans-serif", direction: 'rtl',
              }}
            />
          </div>

          {/* Supplier list */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: t.textFaint, fontSize: 13 }}>
              لا توجد بيانات
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(s => (
                <div key={s.id} style={{
                  background: t.card, borderRadius: 12, padding: '14px',
                  border: `1px solid ${t.border}`,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: t.text }}>{s.name}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                    {[
                      { label: 'افتتاحي', value: fmt(s.openingBalance), color: t.text },
                      { label: 'مشتريات', value: fmt(s.totalPurchases), color: '#3B82F6' },
                      { label: 'مدفوعات', value: fmt(s.totalPayments), color: '#22C55E' },
                      { label: 'ختامي', value: fmt(s.closingBalance), color: s.closingBalance > 0 ? '#EF4444' : '#22C55E' },
                    ].map(item => (
                      <div key={item.label} style={{
                        background: t.subCard, borderRadius: 8, padding: '6px 8px',
                      }}>
                        <div style={{ fontSize: 9, color: t.textFaint, marginBottom: 2 }}>{item.label}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Cairo', sans-serif, color: item.color }}>
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Total card */}
              <div style={{
                background: `rgba(42,123,155,0.08)`, borderRadius: 12, padding: '14px',
                border: `1px solid rgba(42,123,155,0.25)`,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: ACCENT, marginBottom: 10 }}>📊 المجموع</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {[
                    { label: 'افتتاحي', value: fmt(totalOpening), color: t.text },
                    { label: 'مشتريات', value: fmt(totalPurchases), color: '#3B82F6' },
                    { label: 'مدفوعات', value: fmt(totalPayments), color: '#22C55E' },
                    { label: 'ختامي', value: fmt(totalClosing), color: totalClosing > 0 ? '#EF4444' : '#22C55E' },
                  ].map(item => (
                    <div key={item.label}>
                      <div style={{ fontSize: 9, color: t.textFaint, marginBottom: 2 }}>{item.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Cairo', sans-serif, color: item.color }}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {theme === 'dark' && (
        <style>{`
          input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(1); }
        `}</style>
      )}
    </div>
  );
}
