import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { RefreshCw, UserCheck, UserX, Clock, Users } from 'lucide-react';

interface Props {
  theme: 'light' | 'dark';
}

interface EmployeeStatus {
  id: string;
  full_name: string;
  position: string;
  shift_start: string | null;
  shift_end: string | null;
  is_present: boolean;
  check_in_time: string | null;
  check_out_time: string | null;
  total_hours: number | null;
  status: string;
}

export default function PortalAttendanceTab({ theme }: Props) {
  const [employees, setEmployees] = useState<EmployeeStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Get linked_user_id from portal settings
      const { data: settingsData } = await supabase.functions.invoke('malaki-data', {
        body: { action: 'get_settings' },
      });
      const linkedUserId = settingsData?.settings?.linked_user_id;
      if (!linkedUserId) { setLoading(false); return; }

      // Fetch active employees
      const { data: emps } = await supabase
        .from('employees')
        .select('id, full_name, position, job_title, shift_start, shift_end')
        .eq('user_id', linkedUserId)
        .eq('is_active', true)
        .order('full_name');

      if (!emps?.length) { setEmployees([]); setLoading(false); return; }

      const today = format(new Date(), 'yyyy-MM-dd');

      // Fetch today's attendance
      const { data: attendance } = await supabase
        .from('attendance_days')
        .select('employee_id, first_check_in, last_check_out, total_hours, status')
        .eq('attendance_date', today)
        .in('employee_id', emps.map(e => e.id));

      const attMap = new Map<string, any>();
      attendance?.forEach(a => attMap.set(a.employee_id, a));

      const result: EmployeeStatus[] = emps.map(emp => {
        const att = attMap.get(emp.id);
        const hasCheckedIn = !!att?.first_check_in;
        const hasCheckedOut = !!att?.last_check_out;
        const isPresent = hasCheckedIn && !hasCheckedOut;

        return {
          id: emp.id,
          full_name: emp.full_name,
          position: emp.job_title || emp.position || '',
          shift_start: emp.shift_start,
          shift_end: emp.shift_end,
          is_present: isPresent,
          check_in_time: att?.first_check_in || null,
          check_out_time: att?.last_check_out || null,
          total_hours: att?.total_hours || null,
          status: !hasCheckedIn ? 'absent' : isPresent ? 'present' : 'left',
        };
      });

      setEmployees(result);
    } catch (e) {
      console.error('Portal attendance error:', e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const d = theme === 'dark';
  const t = {
    card: d ? '#161B22' : '#FFFFFF',
    text: d ? '#E6EDF3' : '#1B3A5C',
    textMuted: d ? 'rgba(230,237,243,0.5)' : 'rgba(27,58,92,0.5)',
    border: d ? 'rgba(230,237,243,0.08)' : 'rgba(27,58,92,0.1)',
    green: d ? '#22c55e' : '#16a34a',
    red: d ? '#ef4444' : '#dc2626',
    amber: d ? '#f59e0b' : '#d97706',
  };

  const presentCount = employees.filter(e => e.status === 'present').length;
  const absentCount = employees.filter(e => e.status === 'absent').length;
  const leftCount = employees.filter(e => e.status === 'left').length;

  const formatTime = (iso: string | null) => {
    if (!iso) return '—';
    return format(new Date(iso), 'hh:mm a');
  };

  return (
    <div style={{ direction: 'rtl' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={18} style={{ color: t.text }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: t.text }}>حضور الموظفين</span>
          <span style={{ fontSize: 11, color: t.textMuted }}>
            {format(clock, 'EEEE d MMMM', { locale: ar })}
          </span>
        </div>
        <button onClick={fetchData} style={{
          background: 'rgba(42,123,155,0.1)', border: '1px solid rgba(42,123,155,0.25)',
          borderRadius: 8, padding: '5px 12px', color: '#2A7B9B', fontSize: 11,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          fontFamily: 'Tajawal, sans-serif',
        }}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> تحديث
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'حاضر الآن', value: presentCount, icon: UserCheck, color: t.green },
          { label: 'غائب', value: absentCount, icon: UserX, color: t.red },
          { label: 'غادر', value: leftCount, icon: Clock, color: t.amber },
        ].map((kpi, i) => (
          <div key={i} style={{
            background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 12,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${kpi.color}15`,
            }}>
              <kpi.icon size={18} style={{ color: kpi.color }} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
              <div style={{ fontSize: 10, color: t.textMuted }}>{kpi.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Employee List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: t.textMuted, fontSize: 13 }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
            جاري التحميل...
          </div>
        ) : employees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: t.textMuted, fontSize: 13 }}>
            لا يوجد موظفين مسجلين
          </div>
        ) : (
          employees.map(emp => {
            const statusColor = emp.status === 'present' ? t.green : emp.status === 'left' ? t.amber : t.red;
            const statusLabel = emp.status === 'present' ? 'مداوم ✅' : emp.status === 'left' ? 'غادر 🕐' : 'غائب ❌';

            return (
              <div key={emp.id} style={{
                background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                {/* Status dot */}
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: statusColor,
                  boxShadow: emp.status === 'present' ? `0 0 8px ${statusColor}80` : 'none',
                  flexShrink: 0,
                  animation: emp.status === 'present' ? 'pulse 2s infinite' : 'none',
                }} />

                {/* Name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{emp.full_name}</div>
                  <div style={{ fontSize: 10, color: t.textMuted }}>
                    {emp.position}
                    {emp.shift_start && emp.shift_end && (
                      <span style={{ marginRight: 6 }}>
                        • وردية {emp.shift_start?.slice(0, 5)} - {emp.shift_end?.slice(0, 5)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Times */}
                <div style={{ textAlign: 'center', minWidth: 60 }}>
                  {emp.check_in_time && (
                    <div style={{ fontSize: 11, color: t.green, fontWeight: 600 }}>
                      ⬅ {formatTime(emp.check_in_time)}
                    </div>
                  )}
                  {emp.check_out_time && (
                    <div style={{ fontSize: 11, color: t.amber }}>
                      ➡ {formatTime(emp.check_out_time)}
                    </div>
                  )}
                  {emp.total_hours && (
                    <div style={{ fontSize: 10, color: t.textMuted }}>
                      {emp.total_hours.toFixed(1)} ساعة
                    </div>
                  )}
                </div>

                {/* Status badge */}
                <div style={{
                  background: `${statusColor}15`, color: statusColor,
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}>
                  {statusLabel}
                </div>
              </div>
            );
          })
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
