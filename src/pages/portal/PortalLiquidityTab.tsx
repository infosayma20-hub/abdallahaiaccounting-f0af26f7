import { type LiquidityData } from '@/hooks/usePortalData';
import { Loader2 } from 'lucide-react';

const PRIMARY = '#1B3A5C';
const ACCENT = '#2A7B9B';

function fmtAmt(amount: number, currency: string): string {
  const n = amount.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (currency === 'ILS') return `₪ ${n}`;
  if (currency === 'JOD') return `${amount.toLocaleString('en', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} د.أ`;
  if (currency === 'USD') return `${n} $`;
  return `${n} ${currency}`;
}

const names: Record<string, string> = { ILS: 'شيكل', JOD: 'دينار', USD: 'دولار', EUR: 'يورو' };
const currencyIcons: Record<string, string> = { ILS: '₪', JOD: 'د.أ', USD: '$', EUR: '€' };

function getThemeColors(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? { card: '#161B22', text: '#E6EDF3', textMuted: 'rgba(230,237,243,0.6)', textFaint: 'rgba(230,237,243,0.4)', border: 'rgba(230,237,243,0.08)', chipBg: 'rgba(230,237,243,0.06)', branchGrad: `linear-gradient(135deg, ${PRIMARY}, #0D1B2A)`, totalCard: `linear-gradient(135deg, ${PRIMARY}, #0D1B2A)`, branchCard: '#1C2333' }
    : { card: '#FFFFFF', text: '#1B3A5C', textMuted: 'rgba(27,58,92,0.6)', textFaint: 'rgba(27,58,92,0.4)', border: 'rgba(27,58,92,0.1)', chipBg: 'rgba(27,58,92,0.04)', branchGrad: `linear-gradient(135deg, ${PRIMARY}, #0D1B2A)`, totalCard: `linear-gradient(135deg, ${PRIMARY}, #0D1B2A)`, branchCard: '#F8F9FA' };
}

interface Props {
  data: LiquidityData | null;
  loading: boolean;
  theme?: 'light' | 'dark';
}

export default function PortalLiquidityTab({ data, loading, theme = 'light' }: Props) {
  const t = getThemeColors(theme);

  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: ACCENT, margin: '0 auto 12px', display: 'block' }} />
        <div style={{ color: t.textMuted, fontSize: 13 }}>جاري تحميل البيانات...</div>
      </div>
    );
  }

  if (!data || data.cashBoxes.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: t.textFaint, fontSize: 13 }}>
        لا توجد صناديق مُعَرَّفة
      </div>
    );
  }

  const rates = data.exchangeRates;

  const toILS = (amount: number, currency: string): number => {
    if (currency === 'ILS') return amount;
    if (currency === 'JOD') return amount * rates.jod;
    if (currency === 'USD') return amount * rates.usd;
    return amount;
  };

  const currencyTotals: Record<string, number> = {};
  data.cashBoxes.forEach(box => {
    currencyTotals[box.currency] = (currencyTotals[box.currency] || 0) + box.balance;
  });
  const totalILS = data.cashBoxes.reduce((sum, box) => sum + toILS(box.balance, box.currency), 0);

  const branchGroups: Record<string, typeof data.cashBoxes> = {};
  data.cashBoxes.forEach(box => {
    const key = box.branchLocation || box.name;
    if (!branchGroups[key]) branchGroups[key] = [];
    branchGroups[key].push(box);
  });

  return (
    <div>
      {/* Exchange rates strip */}
      <div style={{
        padding: '8px 12px', marginBottom: 10,
        background: t.chipBg, borderRadius: 8,
        border: `1px solid ${t.border}`,
        fontSize: 10, color: t.textMuted,
        fontFamily: 'Cairo', sans-serif,
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      }}>
        💱 1 دينار = ₪{rates.jod}
        <span>•</span>
        1 دولار = ₪{rates.usd}
      </div>

      {/* Total Liquidity Card */}
      <div style={{
        background: t.totalCard,
        border: `1px solid rgba(42,123,155,0.3)`,
        borderRadius: 14, padding: '16px', marginBottom: 14,
      }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 700, marginBottom: 12 }}>
          💰 إجمالي السيولة
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 10, marginBottom: 12,
        }}>
          {Object.entries(currencyTotals).map(([currency, total]) => {
            const pct = totalILS > 0 ? (toILS(total, currency) / totalILS) * 100 : 0;
            return (
              <div key={currency} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
                  {currencyIcons[currency] || '💰'} {names[currency] || currency}
                </div>
                <div style={{
                  fontSize: 18, fontWeight: 700,
                  fontFamily: 'Cairo', sans-serif, color: 'white',
                }}>
                  {fmtAmt(total, currency)}
                </div>
                <div style={{
                  height: 4, borderRadius: 2,
                  background: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden', margin: '6px 0',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${ACCENT}, #1E6A85)`,
                  }} />
                </div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>
                  {Math.round(pct)}%
                </div>
              </div>
            );
          })}
        </div>

        {/* Total equivalent */}
        <div style={{
          textAlign: 'center', padding: '10px 0',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>بما يعادل:</div>
          <div style={{
            fontSize: 20, fontWeight: 700,
            fontFamily: 'Cairo', sans-serif, color: 'white',
          }}>
            ₪ {totalILS.toLocaleString('en', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Branch cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Object.entries(branchGroups).map(([branchName, boxes]) => {
          const branchTotal = boxes.reduce((sum, b) => sum + toILS(b.balance, b.currency), 0);
          return (
            <div key={branchName} style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${t.border}` }}>
              <div style={{
                background: t.branchGrad,
                borderTop: `3px solid ${ACCENT}`, padding: '10px 14px',
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>🏪 {branchName}</div>
              </div>

              <div style={{ background: t.branchCard, padding: '12px 14px' }}>
                {boxes.map(box => (
                  <div key={box.id} style={{
                    padding: '10px 0',
                    borderBottom: `1px solid ${t.border}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: ACCENT }}>{currencyIcons[box.currency] || '💰'}</span>
                      <span style={{ fontSize: 12, color: t.text }}>{names[box.currency] || box.currency}</span>
                    </div>
                    <div style={{
                      fontSize: 16, fontWeight: 700,
                      fontFamily: 'Cairo', sans-serif,
                      color: box.balance === 0 ? t.textFaint : ACCENT,
                    }}>
                      {box.balance === 0 ? '—' : fmtAmt(box.balance, box.currency)}
                    </div>
                  </div>
                ))}

                <div style={{
                  marginTop: 8, padding: '10px 0',
                  borderTop: `1px solid ${t.border}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: 11, color: t.textMuted }}>الإجمالي بالشيكل:</span>
                  <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Cairo', sans-serif, color: t.text }}>
                    ₪ {branchTotal.toLocaleString('en', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
