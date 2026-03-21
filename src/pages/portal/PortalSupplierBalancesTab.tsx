import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Search, Download } from 'lucide-react';

const GOLD = '#D4A017';

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

export default function PortalSupplierBalancesTab() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + '01';

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
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = suppliers.filter(s => !search || s.name.includes(search));

  const totalOpening = filtered.reduce((s, r) => s + r.openingBalance, 0);
  const totalPurchases = filtered.reduce((s, r) => s + r.totalPurchases, 0);
  const totalPayments = filtered.reduce((s, r) => s + r.totalPayments, 0);
  const totalClosing = filtered.reduce((s, r) => s + r.closingBalance, 0);

  const inputStyle: React.CSSProperties = {
    height: 36, background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8, padding: '0 12px',
    color: 'white', fontSize: 13, outline: 'none',
    fontFamily: 'JetBrains Mono, monospace',
  };

  return (
    <div>
      {/* Date Range Picker */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>من</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>إلى</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
        </div>
        <button onClick={fetchData} disabled={loading} style={{
          padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
          background: `linear-gradient(135deg, ${GOLD}, #8B5E00)`,
          border: 'none', color: 'white', cursor: 'pointer',
          fontFamily: 'Tajawal, sans-serif',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}
          عرض
        </button>
        <div style={{ flex: 1 }} />
        {loaded && (
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', right: 10, top: 10, color: 'rgba(255,255,255,0.3)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالاسم..."
              style={{
                ...inputStyle, fontFamily: 'Tajawal, sans-serif',
                paddingRight: 32, width: 180,
              }}
            />
          </div>
        )}
      </div>

      {!loaded && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.3)' }}>
          حدد الفترة واضغط "عرض" لتحميل أرصدة الموردين
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <Loader2 size={32} className="animate-spin" style={{ color: GOLD, margin: '0 auto 12px', display: 'block' }} />
        </div>
      )}

      {loaded && !loading && (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'رصيد افتتاحي', value: fmt(totalOpening), color: 'white' },
              { label: 'إجمالي المشتريات', value: fmt(totalPurchases), color: '#3B82F6' },
              { label: 'إجمالي المدفوعات', value: fmt(totalPayments), color: '#22C55E' },
              { label: 'رصيد ختامي', value: fmt(totalClosing), color: totalClosing > 0 ? '#EF4444' : '#22C55E' },
            ].map(k => (
              <div key={k.label} style={{
                background: '#111', borderRadius: 12, padding: '14px 16px',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: k.color, fontFamily: 'JetBrains Mono, monospace' }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  {['المورد', 'رصيد افتتاحي', 'مشتريات', 'مدفوعات', 'رصيد ختامي'].map(h => (
                    <th key={h} style={{
                      padding: '10px 12px', fontSize: 11, fontWeight: 600,
                      color: 'rgba(255,255,255,0.4)', textAlign: 'right',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
                      لا توجد بيانات
                    </td>
                  </tr>
                ) : filtered.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{s.name}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }}>{fmt(s.openingBalance)}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: '#3B82F6' }}>{fmt(s.totalPurchases)}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: '#22C55E' }}>{fmt(s.totalPayments)}</td>
                    <td style={{
                      padding: '10px 12px', fontSize: 13, fontWeight: 700,
                      fontFamily: 'JetBrains Mono, monospace',
                      color: s.closingBalance > 0 ? '#EF4444' : '#22C55E',
                    }}>{fmt(s.closingBalance)}</td>
                  </tr>
                ))}
                {/* Total Row */}
                {filtered.length > 0 && (
                  <tr style={{ background: 'rgba(212,160,23,0.08)', borderTop: '2px solid rgba(212,160,23,0.3)' }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: GOLD }}>المجموع</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{fmt(totalOpening)}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: '#3B82F6' }}>{fmt(totalPurchases)}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: '#22C55E' }}>{fmt(totalPayments)}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: totalClosing > 0 ? '#EF4444' : '#22C55E' }}>{fmt(totalClosing)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(1); }
      `}</style>
    </div>
  );
}
