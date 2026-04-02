import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Search, ChevronDown } from 'lucide-react';
import { multiWordMatchAny } from "@/lib/utils";

const ACCENT = '#2A7B9B';

function getThemeColors(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? { card: '#161B22', text: '#E6EDF3', textMuted: 'rgba(230,237,243,0.6)', textFaint: 'rgba(230,237,243,0.4)', border: 'rgba(230,237,243,0.08)', chipBg: 'rgba(230,237,243,0.06)', inputBg: 'rgba(230,237,243,0.06)', inputBorder: 'rgba(230,237,243,0.1)', expandBg: 'rgba(230,237,243,0.02)' }
    : { card: '#FFFFFF', text: '#1B3A5C', textMuted: 'rgba(27,58,92,0.6)', textFaint: 'rgba(27,58,92,0.4)', border: 'rgba(27,58,92,0.1)', chipBg: 'rgba(27,58,92,0.04)', inputBg: '#F5F5F5', inputBorder: 'rgba(27,58,92,0.12)', expandBg: 'rgba(27,58,92,0.02)' };
}

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
  leave_request: '🏖️ إجازة',
  advance: '💰 سلفة',
  advance_request: '💰 سلفة',
  loan: '🏦 قرض',
  loan_request: '🏦 قرض',
  overtime: '⏰ أوفرتايم',
  overtime_request: '⏰ أوفرتايم',
  attendance_correction: '📋 تصحيح بصمة',
  complaint: '📝 شكوى',
  facility_quality: '🏢 جودة مرافق',
  equipment_issue: '🔧 أعطال معدات',
  equipment_fault: '🔧 أعطال معدات',
  disciplinary: '⚠️ إجراء عقابي',
  stock_balance: '📦 رصيد أصناف',
  inventory_balance: '📦 رصيد أصناف',
};

const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'قيد المراجعة', color: '#FBBF24', bg: 'rgba(251,191,36,0.15)' },
  approved: { label: 'موافق', color: '#22C55E', bg: 'rgba(34,197,94,0.15)' },
  rejected: { label: 'مرفوض', color: '#EF4444', bg: 'rgba(239,68,68,0.15)' },
};

export default function PortalEmployeeRequestsTab({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const [requests, setRequests] = useState<EmployeeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const t = getThemeColors(theme);

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
        <Loader2 size={28} className="animate-spin" style={{ color: ACCENT, margin: '0 auto 12px', display: 'block' }} />
        <div style={{ color: t.textMuted, fontSize: 13 }}>جاري تحميل الطلبات...</div>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
        {[
          { label: 'إجمالي', value: requests.length, color: t.text },
          { label: 'قيد المراجعة', value: pendingCount, color: '#FBBF24' },
          { label: 'موافق', value: approvedCount, color: '#22C55E' },
          { label: 'مرفوض', value: rejectedCount, color: '#EF4444' },
        ].map(k => (
          <div key={k.label} style={{
            background: t.card, borderRadius: 10, padding: '10px 12px',
            border: `1px solid ${t.border}`,
          }}>
            <div style={{ fontSize: 9, color: t.textMuted, marginBottom: 2 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.color, fontFamily: 'JetBrains Mono, monospace' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filter Buttons */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {[
          { key: 'pending', label: `قيد المراجعة (${pendingCount})` },
          { key: 'approved', label: 'موافق' },
          { key: 'rejected', label: 'مرفوض' },
          { key: 'all', label: 'الكل' },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: '8px 14px', borderRadius: 20, fontSize: 11,
            background: filter === f.key ? `rgba(42,123,155,0.15)` : t.chipBg,
            border: `1px solid ${filter === f.key ? `rgba(42,123,155,0.4)` : t.border}`,
            color: filter === f.key ? ACCENT : t.textMuted,
            cursor: 'pointer', fontFamily: 'Tajawal, sans-serif',
            whiteSpace: 'nowrap',
          }}>
            {f.label}
          </button>
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
            borderRadius: 10, padding: '0 12px 0 12px',
            paddingRight: 32,
            color: t.text, fontSize: 13, outline: 'none',
            fontFamily: 'Tajawal, sans-serif', direction: 'rtl',
          }}
        />
      </div>

      {/* Card-based list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: t.textFaint, fontSize: 13 }}>
          لا توجد طلبات
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(r => {
            const st = statusLabels[r.status] || statusLabels.pending;
            const details = r.details || {};
            const detailParts: string[] = [];
            
            // Type-specific info
            if (r.formType === 'leave' || r.formType === 'leave_request') {
              const leaveTypes: Record<string, string> = { annual: 'سنوية', sick: 'مرضية', unpaid: 'بدون راتب', emergency: 'طارئة', maternity: 'أمومة' };
              if (details.leave_type) detailParts.push(leaveTypes[details.leave_type] || details.leave_type);
              if (details.from_date) detailParts.push(`من ${details.from_date} إلى ${details.to_date || details.from_date}`);
            } else if (r.formType === 'advance' || r.formType === 'advance_request') {
              // amount already shown in the card
            } else if (r.formType === 'attendance_correction') {
              if (details.correction_type) detailParts.push(details.correction_type);
              if (details.correction_date) detailParts.push(details.correction_date);
            } else if (r.formType === 'complaint') {
              if (details.subject) detailParts.push(details.subject);
            } else if (r.formType === 'disciplinary') {
              if (details.violation_type) detailParts.push(details.violation_type);
            }
            
            // Always show reason/notes if present
            if (details.reason) detailParts.push(`📝 ${details.reason}`);
            if (details.notes && details.notes !== details.reason) detailParts.push(`📝 ${details.notes}`);
            if (details.description && details.description !== details.reason) detailParts.push(details.description);
            if (details.items) detailParts.push(`📦 ${details.items}`);
            if (details.employee_name) detailParts.push(`👤 ${details.employee_name}`);
            
            const detailText = detailParts.join(' • ');

            const isExpanded = expandedId === r.id;

            return (
              <div
                key={r.id}
                onClick={() => setExpandedId(isExpanded ? null : r.id)}
                style={{
                  background: t.card, borderRadius: 12, overflow: 'hidden',
                  border: `1px solid ${t.border}`,
                  cursor: 'pointer',
                }}
              >
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{r.employeeName}</span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                        background: st.bg, color: st.color,
                      }}>{st.label}</span>
                    </div>
                    <ChevronDown size={14} style={{
                      color: t.textFaint,
                      transform: isExpanded ? 'rotate(180deg)' : undefined,
                      transition: 'transform 0.2s',
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: t.textMuted }}>
                      {formTypeLabels[r.formType] || r.formType}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {r.amount && (
                        <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: ACCENT }}>
                          ₪{r.amount.toLocaleString()}
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: t.textFaint, fontFamily: 'JetBrains Mono, monospace' }}>
                        {new Date(r.createdAt).toLocaleDateString('ar', { day: '2-digit', month: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  {detailText && (
                    <div style={{ fontSize: 11, color: t.textMuted, marginTop: 6, lineHeight: 1.6 }}>
                      {detailText}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
