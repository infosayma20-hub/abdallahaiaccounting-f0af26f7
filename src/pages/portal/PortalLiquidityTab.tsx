import { type LiquidityData } from '@/hooks/usePortalData';
import { Loader2 } from 'lucide-react';

const GOLD = '#D4A017';

function fmtAmt(amount: number, currency: string): string {
  const n = amount.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (currency === 'ILS') return `₪ ${n}`;
  if (currency === 'JOD') return `${amount.toLocaleString('en', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} د.أ`;
  if (currency === 'USD') return `${n} $`;
  return `${n} ${currency}`;
}

const flags: Record<string, string> = { ILS: '🇮🇱', JOD: '🇯🇴', USD: '🇺🇸', EUR: '🇪🇺' };
const names: Record<string, string> = { ILS: 'شيكل إسرائيلي', JOD: 'دينار أردني', USD: 'دولار أمريكي', EUR: 'يورو' };

interface Props {
  data: LiquidityData | null;
  loading: boolean;
}

export default function PortalLiquidityTab({ data, loading }: Props) {
  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: GOLD, margin: '0 auto 12px', display: 'block' }} />
        <div style={{ color: 'rgba(255,255,255,0.5)' }}>جاري تحميل البيانات...</div>
      </div>
    );
  }

  if (!data || data.cashBoxes.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.4)' }}>
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
      <div style={{
        padding: '8px 16px', marginBottom: 16,
        background: 'rgba(255,255,255,0.04)', borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.06)',
        fontSize: 11, color: 'rgba(255,255,255,0.5)',
        fontFamily: 'JetBrains Mono, monospace',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        أسعار الصرف المستخدمة:
        <span>1 دينار = ₪{rates.jod}</span>
        <span>•</span>
        <span>1 دولار = ₪{rates.usd}</span>
      </div>

      <div style={{
        background: 'linear-gradient(135deg, #0A0A0A, #1A1200)',
        border: '1px solid rgba(212,160,23,0.3)',
        borderRadius: 16, padding: '20px 24px', marginBottom: 20,
      }}>
        <div style={{ fontSize: 14, color: GOLD, fontWeight: 700, marginBottom: 16 }}>
          💰 إجمالي السيولة — جميع الأفرع
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(150px, 1fr))`,
          gap: 16, marginBottom: 16,
        }}>
          {Object.entries(currencyTotals).map(([currency, total]) => {
            const pct = totalILS > 0 ? (toILS(total, currency) / totalILS) * 100 : 0;
            return (
              <div key={currency} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
                  {flags[currency] || '💰'} {names[currency] || currency}
                </div>
                <div style={{
                  fontSize: 22, fontWeight: 700,
                  fontFamily: 'JetBrains Mono, monospace', color: GOLD,
                }}>
                  {fmtAmt(total, currency)}
                </div>
                <div style={{
                  height: 6, borderRadius: 3,
                  background: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden', margin: '8px 0',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${GOLD}, #8B5E00)`,
                  }} />
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                  {Math.round(pct)}% من الإجمالي
                </div>
              </div>
            );
          })}
        </div>

        <div style={{
          textAlign: 'center', padding: '12px 0',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>بما يعادل إجمالي:</div>
          <div style={{
            fontSize: 20, fontWeight: 700,
            fontFamily: 'JetBrains Mono, monospace', color: 'white',
          }}>
            ₪ {totalILS.toLocaleString('en', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
            بسعر الصرف: 1 د.أ = ₪{rates.jod} | 1 $ = ₪{rates.usd}
          </div>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))',
        gap: 16,
      }}>
        {Object.entries(branchGroups).map(([branchName, boxes]) => {
          const branchTotal = boxes.reduce((sum, b) => sum + toILS(b.balance, b.currency), 0);
          return (
            <div key={branchName} style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{
                background: 'linear-gradient(135deg, #1A0A00, #2D1200)',
                borderTop: `3px solid ${GOLD}`, padding: '14px 18px',
              }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{branchName}</div>
              </div>

              <div style={{ background: '#161616', padding: 20 }}>
                {boxes.map(box => (
                  <div key={box.id} style={{
                    padding: '12px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{flags[box.currency] || '💰'}</span>
                      <span style={{ fontSize: 13 }}>{names[box.currency] || box.currency}</span>
                    </div>
                    <div style={{
                      fontSize: 18, fontWeight: 700,
                      fontFamily: 'JetBrains Mono, monospace',
                      color: box.balance === 0 ? 'rgba(255,255,255,0.3)' : GOLD,
                    }}>
                      {box.balance === 0 ? '—' : fmtAmt(box.balance, box.currency)}
                    </div>
                  </div>
                ))}

                <div style={{
                  marginTop: 12, padding: '12px 0',
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>الإجمالي المعادل بالشيكل:</span>
                  <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
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
