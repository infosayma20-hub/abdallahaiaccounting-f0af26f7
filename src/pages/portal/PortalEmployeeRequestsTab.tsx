import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Search, ChevronDown } from 'lucide-react';

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
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('malaki-data', {
        body: { action: 'employee_requests' },
      });
      if (data?.requests) setRequests(data.requests);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: GOLD, margin: '0 auto 12px', display: 'block' }} />
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>جاري تحميل الطلبات...</div>
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
      {/* KPI Cards - 2x2 grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
        {[
          { label: 'إجمالي', value: requests.length, color: 'white' },
          { label: 'قيد المراجعة', value: pendingCount, color: '#FBBF24' },
          { label: 'موافق', value: approvedCount, color: '#22C55E' },
          { label: 'مرفوض', value: rejectedCount, color: '#EF4444' },
        ].map(k => (
          <div key={k.label} style={{
            background: '#111', borderRadius: 10, padding: '10px 12px',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.color, fontFamily: 'JetBrains Mono, monospace' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filter Buttons - not dropdown */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap',
      }}>
        {[
          { key: 'pending', label: `قيد المراجعة (${pendingCount})` },
          { key: 'approved', label: 'موافق' },
          { key: 'rejected', label: 'مرفوض' },
          { key: 'all', label: 'الكل' },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: '8px 14px', borderRadius: 20, fontSize: 11,
            background: filter === f.key ? 'rgba(212,160,23,0.2)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${filter === f.key ? 'rgba(212,160,23,0.4)' : 'rgba(255,255,255,0.08)'}`,
            color: filter === f.key ? GOLD : 'rgba(255,255,255,0.6)',
            cursor: 'pointer', fontFamily: 'Tajawal, sans-serif',
            whiteSpace: 'nowrap',
          }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Search size={14} style={{ position: 'absolute', right: 10, top: 11, color: 'rgba(255,255,255,0.3)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="بحث بالاسم..."
          style={{
            width: '100%', height: 38, background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, padding: '0 12px 0 12px',
            paddingRight: 32,
            color: 'white', fontSize: 13, outline: 'none',
            fontFamily: 'Tajawal, sans-serif', direction: 'rtl',
          }}
        />
      </div>

      {/* Card-based list instead of table for mobile */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
          لا توجد طلبات
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(r => {
            const st = statusLabels[r.status] || statusLabels.pending;
            const details = r.details || {};
            let detailText = '';
            if (r.formType === 'leave') detailText = `${details.leave_type || ''} • ${details.start_date || ''} → ${details.end_date || ''}`;
            else if (r.formType === 'advance') detailText = details.reason || '';
            else if (r.formType === 'attendance_correction') detailText = `${details.correction_type || ''} • ${details.correction_date || ''}`;
            else if (r.formType === 'complaint') detailText = details.subject || '';
            else if (r.formType === 'disciplinary') detailText = details.violation_type || '';
            else detailText = details.notes || details.description || '';

            const isExpanded = expandedId === r.id;

            return (
              <div
                key={r.id}
                onClick={() => setExpandedId(isExpanded ? null : r.id)}
                style={{
                  background: '#111', borderRadius: 12, overflow: 'hidden',
                  border: '1px solid rgba(255,255,255,0.06)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{r.employeeName}</span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                        background: st.bg, color: st.color,
                      }}>{st.label}</span>
                    </div>
                    <ChevronDown size={14} style={{
                      color: 'rgba(255,255,255,0.3)',
                      transform: isExpanded ? 'rotate(180deg)' : undefined,
                      transition: 'transform 0.2s',
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                      {formTypeLabels[r.formType] || r.formType}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {r.amount && (
                        <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: GOLD }}>
                          ₪{r.amount.toLocaleString()}
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'JetBrains Mono, monospace' }}>
                        {new Date(r.createdAt).toLocaleDateString('ar', { day: '2-digit', month: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
                {isExpanded && detailText && (
                  <div style={{
                    padding: '10px 14px',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    fontSize: 12, color: 'rgba(255,255,255,0.5)',
                    background: 'rgba(255,255,255,0.02)',
                  }}>
                    {detailText}
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
