import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Search } from 'lucide-react';

const GOLD = '#D4A017';

interface EmployeeRequest {
  id: string;
  employeeName: string;
  formType: string;
  status: string;
  amount: number | null;
  createdAt: string;
  details: any;
}

const formTypeLabels: Record<string, string> = {
  leave: '🏖️ إجازة',
  advance: '💰 سلفة',
  loan: '🏦 قرض',
  overtime: '⏰ أوفرتايم',
  attendance_correction: '📋 تصحيح بصمة',
  complaint: '📝 شكوى',
  facility_quality: '🏢 جودة مرافق',
  equipment_issue: '🔧 أعطال معدات',
  disciplinary: '⚠️ إجراء عقابي',
  stock_balance: '📦 رصيد أصناف',
};

const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'قيد المراجعة', color: '#FBBF24', bg: 'rgba(251,191,36,0.15)' },
  approved: { label: 'موافق', color: '#22C55E', bg: 'rgba(34,197,94,0.15)' },
  rejected: { label: 'مرفوض', color: '#EF4444', bg: 'rgba(239,68,68,0.15)' },
};

export default function PortalEmployeeRequestsTab() {
  const [requests, setRequests] = useState<EmployeeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('malaki-data', {
        body: { action: 'employee_requests' },
      });
      if (data?.requests) setRequests(data.requests);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: GOLD, margin: '0 auto 12px', display: 'block' }} />
        <div style={{ color: 'rgba(255,255,255,0.5)' }}>جاري تحميل الطلبات...</div>
      </div>
    );
  }

  const filtered = requests.filter(r => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (search && !r.employeeName.includes(search) && !formTypeLabels[r.formType]?.includes(search)) return false;
    return true;
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const approvedCount = requests.filter(r => r.status === 'approved').length;
  const rejectedCount = requests.filter(r => r.status === 'rejected').length;

  return (
    <div>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'إجمالي الطلبات', value: requests.length, color: 'white' },
          { label: 'قيد المراجعة', value: pendingCount, color: '#FBBF24' },
          { label: 'موافق عليها', value: approvedCount, color: '#22C55E' },
          { label: 'مرفوضة', value: rejectedCount, color: '#EF4444' },
        ].map(k => (
          <div key={k.label} style={{
            background: '#111', borderRadius: 12, padding: '14px 16px',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: k.color, fontFamily: 'JetBrains Mono, monospace' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { key: 'all', label: 'الكل' },
          { key: 'pending', label: 'قيد المراجعة' },
          { key: 'approved', label: 'موافق' },
          { key: 'rejected', label: 'مرفوض' },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12,
            background: filter === f.key ? 'rgba(212,160,23,0.2)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${filter === f.key ? 'rgba(212,160,23,0.4)' : 'rgba(255,255,255,0.08)'}`,
            color: filter === f.key ? GOLD : 'rgba(255,255,255,0.6)',
            cursor: 'pointer', fontFamily: 'Tajawal, sans-serif',
          }}>
            {f.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', right: 10, top: 9, color: 'rgba(255,255,255,0.3)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم..."
            style={{
              height: 34, background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '0 12px 0 32px',
              color: 'white', fontSize: 12, outline: 'none',
              fontFamily: 'Tajawal, sans-serif', direction: 'rtl', width: 180,
            }}
          />
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
              {['الموظف', 'نوع الطلب', 'المبلغ', 'الحالة', 'التاريخ', 'التفاصيل'].map(h => (
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
                <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
                  لا توجد طلبات
                </td>
              </tr>
            ) : filtered.map(r => {
              const st = statusLabels[r.status] || statusLabels.pending;
              const details = r.details || {};
              let detailText = '';
              if (r.formType === 'leave') detailText = `${details.leave_type || ''} • ${details.start_date || ''} → ${details.end_date || ''}`;
              else if (r.formType === 'advance') detailText = details.reason || '';
              else if (r.formType === 'attendance_correction') detailText = `${details.correction_type || ''} • ${details.correction_date || ''}`;
              else if (r.formType === 'complaint') detailText = details.subject || '';
              else if (r.formType === 'disciplinary') detailText = details.violation_type || '';
              else detailText = details.notes || details.description || '';

              return (
                <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '10px 12px', fontSize: 13 }}>{r.employeeName}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12 }}>
                    {formTypeLabels[r.formType] || r.formType}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }}>
                    {r.amount ? `₪${r.amount.toLocaleString()}` : '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                      background: st.bg, color: st.color,
                    }}>{st.label}</span>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {new Date(r.createdAt).toLocaleDateString('ar', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {detailText || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
