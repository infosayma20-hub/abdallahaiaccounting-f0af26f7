import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Package, ChevronLeft } from 'lucide-react';

/** Home-screen orders summary tile (month to date). Tenant-scoped via RLS. */
interface Props {
  theme: 'light' | 'dark';
  onOpen: () => void;
}

interface Row { total: number | null; paid_amount: number | null; status: string }

function fmt(n: number) { return '₪' + Math.round(Number(n) || 0).toLocaleString('en-US'); }

export default function PortalOrdersSummaryCard({ theme, onOpen }: Props) {
  const dark = theme === 'dark';
  const t = dark
    ? { cardBg: '#161B22', border: 'rgba(230,237,243,0.08)', text: '#E6EDF3', muted: 'rgba(230,237,243,0.6)', faint: 'rgba(230,237,243,0.4)' }
    : { cardBg: '#FFFFFF', border: '#F1F5F9', text: '#0D1B2E', muted: '#64748B', faint: '#94A3B8' };

  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const now = new Date();
      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const { data } = await supabase
        .from('orders')
        .select('total, paid_amount, status')
        .gte('created_at', from);
      if (alive) setRows(((data || []) as any) as Row[]);
    })();
    return () => { alive = false; };
  }, []);

  const active = (rows || []).filter(r => r.status !== 'ملغي');
  const total = active.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const paid = active.reduce((s, r) => s + Math.max(0, Math.min(Number(r.paid_amount) || 0, Number(r.total) || 0)), 0);
  const remaining = Math.max(0, total - paid);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: t.text, fontFamily: 'Cairo' }}>الطلبيات</div>
        <button onClick={onOpen} style={{
          background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'Cairo',
          fontSize: 11, color: '#2A7B9B', display: 'flex', alignItems: 'center', gap: 3,
        }}>عرض مساحة العمل <ChevronLeft size={12} /></button>
      </div>
      <button onClick={onOpen} style={{
        width: '100%', textAlign: 'right', cursor: 'pointer', fontFamily: 'Cairo',
        background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 16, padding: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{
            width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center',
            background: 'rgba(42,123,155,0.12)', color: '#2A7B9B',
          }}><Package size={15} /></span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: t.text, lineHeight: 1 }}>{active.length}</div>
            <div style={{ fontSize: 10.5, color: t.faint }}>طلبية هذا الشهر</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <Cell t={t} label="قيمة الطلبيات" value={fmt(total)} color={t.text} />
          <Cell t={t} label="المحصّل" value={fmt(paid)} color="#16A34A" />
          <Cell t={t} label="المتبقي" value={fmt(remaining)} color="#D97706" />
        </div>
      </button>
    </div>
  );
}

function Cell({ t, label, value, color }: { t: any; label: string; value: string; color: string }) {
  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '8px 9px' }}>
      <div style={{ fontSize: 9.5, color: t.faint, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color, fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
    </div>
  );
}
