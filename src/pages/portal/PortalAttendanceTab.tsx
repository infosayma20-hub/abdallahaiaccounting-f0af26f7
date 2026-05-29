import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays } from 'date-fns';
import { ar } from 'date-fns/locale';
import { RefreshCw, UserCheck, UserX, Clock, Users, Calendar, ChevronDown, ChevronUp, Bell, BellOff, Search } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  theme: 'light' | 'dark';
}

interface EmployeeAtt {
  id: string;
  full_name: string;
  position: string;
  branch_id: string | null;
  branch_name: string | null;
  department: string | null;
  shift_start: string | null;
  shift_end: string | null;
  status: string;
  check_in_time: string | null;
  check_out_time: string | null;
  today_hours: number | null;
  total_days: number;
  total_hours: number;
  total_overtime: number;
  total_break_minutes: number;
  net_work_minutes: number | null;
  break_count: number;
  is_on_break: boolean;
  current_break_reason: string | null;
  breaks: { break_out: string; break_in: string | null; reason: string; duration_minutes: number | null }[];
  records: { date: string; check_in: string | null; check_out: string | null; hours: number | null; overtime: number | null; status: string; total_break_minutes: number; net_work_minutes: number | null }[];
}

interface Summary {
  present: number;
  absent: number;
  left: number;
  totalEmployees: number;
  totalAttendanceDays: number;
}

type DatePreset = 'today' | 'yesterday' | 'custom';
type StatusFilter = 'all' | 'present' | 'on_break' | 'left' | 'absent';

export default function PortalAttendanceTab({ theme }: Props) {
  const [employees, setEmployees] = useState<EmployeeAtt[]>([]);
  const [summary, setSummary] = useState<Summary>({ present: 0, absent: 0, left: 0, totalEmployees: 0, totalAttendanceDays: 0 });
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(new Date());
  const [preset, setPreset] = useState<DatePreset>('today');
  const [dateFrom, setDateFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(true);
  const notifAudioRef = useRef<HTMLAudioElement | null>(null);
  const employeeCacheRef = useRef<Map<string, string>>(new Map());

  // Create notification sound using AudioContext for better mobile support
  const playNotificationSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
      oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.4);
      // Also play a second beep
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.setValueAtTime(1100, ctx.currentTime + 0.5);
      osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.6);
      gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.5);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.9);
      osc2.start(ctx.currentTime + 0.5);
      osc2.stop(ctx.currentTime + 0.9);
    } catch {
      // Fallback to HTML Audio
      if (notifAudioRef.current) {
        notifAudioRef.current.play().catch(() => {});
      }
    }
  }, []);

  // Fallback audio element
  useEffect(() => {
    notifAudioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbsGczIz2LzN3LdzsaK4DI3NB+OBksh8nd0H84GSuIyt7Qfzkhb3R2goWDgoOFiIuOkZOWmZyen6GjpqirrrCztba5u76/wcTFyMrLzc/Q0tTW19nb3N3f4OLj5ebn6err7O3u8PHy8/T19vf4+fr7/P3+');
  }, []);

  // Request browser notification permission — mobile-friendly
  const enableNotifications = useCallback(() => {
    // Unlock audio on this user gesture immediately
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {}

    // Always enable in-app notifications + sound immediately
    setNotificationsEnabled(true);
    setAudioUnlocked(true);

    // Play test sound immediately to confirm it works
    setTimeout(() => playNotificationSound(), 200);

    // Try browser notifications as a bonus (non-blocking)
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission().then((perm) => {
          if (perm === 'granted') {
            new Notification('أموالي - إشعارات الحضور', {
              body: 'تم تفعيل الإشعارات بنجاح ✅',
              icon: '/favicon.ico',
            });
          }
        }).catch(() => {});
      } catch {
        // Old callback-based API
        try {
          Notification.requestPermission((perm) => {
            if (perm === 'granted') {
              new Notification('أموالي', { body: 'تم تفعيل الإشعارات ✅' });
            }
          });
        } catch {}
      }
    }

    toast.success('تم تفعيل الإشعارات والصوت ✅', { duration: 2000 });
  }, [playNotificationSound]);

  // Check if notifications already granted
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      setNotificationsEnabled(true);
    }
  }, []);

  const applyPreset = (p: DatePreset) => {
    setPreset(p);
    if (p === 'today') {
      const today = format(new Date(), 'yyyy-MM-dd');
      setDateFrom(today);
      setDateTo(today);
    } else if (p === 'yesterday') {
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      setDateFrom(yesterday);
      setDateTo(yesterday);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('malaki-data', {
        body: { action: 'attendance', dateFrom, dateTo },
      });
      if (data?.employees) {
        setEmployees(data.employees);
        // Cache employee names for realtime notifications
        data.employees.forEach((emp: EmployeeAtt) => {
          employeeCacheRef.current.set(emp.id, emp.full_name);
        });
      }
      if (data?.summary) setSummary(data.summary);
    } catch (e) {
      console.error('Portal attendance error:', e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [dateFrom, dateTo]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [dateFrom, dateTo]);

  // Realtime subscription for attendance events
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      const suffix = user?.id ?? 'anon';
      channel = supabase
        .channel(`portal-attendance-events-${suffix}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'attendance_events' },
        (payload) => {
          const evt = payload.new as any;
          const empName = employeeCacheRef.current.get(evt.employee_id) || 'موظف';
          const isCheckIn = evt.event_type === 'check_in';
          const time = format(new Date(evt.event_time), 'hh:mm a');
          const msg = isCheckIn
            ? `📥 ${empName} سجّل دخول الساعة ${time}`
            : `📤 ${empName} سجّل خروج الساعة ${time}`;

          // In-app toast notification
          toast(msg, {
            icon: isCheckIn ? '🟢' : '🟠',
            duration: 2000,
          });

          // Play notification sound (always when notifications enabled)
          if (notificationsEnabled || audioUnlocked) {
            playNotificationSound();
          }

          // Browser push notification
          if (notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification('حضور الموظفين - أموالي', {
                body: msg,
                icon: '/favicon.ico',
                tag: `att-${evt.id}`,
              });
            } catch {}
          }

          // Auto-refresh data
          fetchData();
        }
      )
      .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [notificationsEnabled, audioUnlocked, playNotificationSound]);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const d = theme === 'dark';
  const t = {
    card: d ? '#161B22' : '#FFFFFF',
    text: d ? '#E6EDF3' : '#1B3A5C',
    textMuted: d ? 'rgba(230,237,243,0.5)' : 'rgba(27,58,92,0.5)',
    border: d ? 'rgba(230,237,243,0.08)' : 'rgba(27,58,92,0.1)',
    green: d ? '#4ade80' : '#16a34a',
    red: d ? '#f87171' : '#dc2626',
    amber: d ? '#fbbf24' : '#d97706',
    orange: d ? '#fb923c' : '#ea580c',
    neutral: d ? 'rgba(230,237,243,0.4)' : '#64748b',
    bg: d ? '#0D1117' : '#F0F2F5',
    accent: d ? '#60a5fa' : '#1B3A5C',
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return '—';
    return format(new Date(iso), 'hh:mm a');
  };

  const isRangeMode = dateFrom !== dateTo;

  // Branch options (derived from data)
  const branches = Array.from(
    new Map(
      employees
        .filter(e => e.branch_id && e.branch_name)
        .map(e => [e.branch_id!, e.branch_name!])
    ).entries()
  );
  const hasBranches = branches.length > 0;

  // Filtered list — "الحاضرون الآن" by default shows present + on_break
  const filteredEmployees = employees.filter(emp => {
    if (statusFilter !== 'all' && emp.status !== statusFilter) return false;
    if (branchFilter !== 'all' && emp.branch_id !== branchFilter) return false;
    if (searchTerm && !emp.full_name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  // Live count of currently present (checked in, not left)
  const liveNow = employees.filter(e => e.status === 'present' || e.status === 'on_break').length;

  // Group filtered employees by branch (only when "all" branches selected and branches exist)
  const showGroups = branchFilter === 'all' && hasBranches;
  const groupedByBranch: { branchId: string; branchName: string; items: EmployeeAtt[] }[] = (() => {
    if (!showGroups) return [];
    const map = new Map<string, { branchId: string; branchName: string; items: EmployeeAtt[] }>();
    const unassigned: EmployeeAtt[] = [];
    filteredEmployees.forEach(emp => {
      if (emp.branch_id && emp.branch_name) {
        if (!map.has(emp.branch_id)) {
          map.set(emp.branch_id, { branchId: emp.branch_id, branchName: emp.branch_name, items: [] });
        }
        map.get(emp.branch_id)!.items.push(emp);
      } else {
        unassigned.push(emp);
      }
    });
    const groups = Array.from(map.values()).sort((a, b) => a.branchName.localeCompare(b.branchName, 'ar'));
    if (unassigned.length) groups.push({ branchId: '__none__', branchName: 'بدون فرع', items: unassigned });
    return groups;
  })();

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={notificationsEnabled ? () => { setNotificationsEnabled(false); setAudioUnlocked(false); } : enableNotifications} style={{
            background: notificationsEnabled ? 'rgba(34,197,94,0.1)' : 'rgba(42,123,155,0.1)',
            border: `1px solid ${notificationsEnabled ? 'rgba(34,197,94,0.3)' : 'rgba(42,123,155,0.25)'}`,
            borderRadius: 8, padding: '4px 8px', color: notificationsEnabled ? t.green : t.accent, fontSize: 11,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
            fontFamily: 'Tajawal, sans-serif',
            WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
          }}>
            {notificationsEnabled ? <Bell size={11} /> : <BellOff size={11} />}
            {notificationsEnabled ? 'إشعارات' : 'تفعيل الإشعارات'}
          </button>
          <button onClick={fetchData} style={{
            background: 'rgba(42,123,155,0.1)', border: '1px solid rgba(42,123,155,0.25)',
            borderRadius: 8, padding: '5px 12px', color: t.accent, fontSize: 11,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            fontFamily: 'Tajawal, sans-serif',
          }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> تحديث
          </button>
        </div>
      </div>

      {/* Date Presets */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {[
          { key: 'today' as const, label: '● اليوم' },
          { key: 'yesterday' as const, label: 'أمس' },
          { key: 'custom' as const, label: '📅 فترة' },
        ].map(p => (
          <button
            key={p.key}
            onClick={() => applyPreset(p.key)}
            style={{
              background: preset === p.key ? t.accent : `${t.accent}15`,
              color: preset === p.key ? 'white' : t.accent,
              border: `1px solid ${preset === p.key ? t.accent : t.accent + '40'}`,
              borderRadius: 20, padding: '4px 14px', fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'Tajawal, sans-serif',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom Date Range */}
      {preset === 'custom' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Calendar size={14} style={{ color: t.textMuted }} />
            <span style={{ fontSize: 11, color: t.textMuted }}>من:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{
                background: t.card, border: `1px solid ${t.border}`, borderRadius: 8,
                padding: '4px 8px', fontSize: 11, color: t.text,
                fontFamily: 'Tajawal, sans-serif',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: t.textMuted }}>إلى:</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{
                background: t.card, border: `1px solid ${t.border}`, borderRadius: 8,
                padding: '4px 8px', fontSize: 11, color: t.text,
                fontFamily: 'Tajawal, sans-serif',
              }}
            />
          </div>
        </div>
      )}

      {/* KPI Cards */}
      {/* "الحاضرون الآن" header + filters */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, marginTop: 4,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: t.green,
            boxShadow: `0 0 6px ${t.green}80`, animation: 'pulse 2s infinite',
          }} />
          <span style={{ fontSize: 14, fontWeight: 800, color: t.text }}>الحاضرون الآن</span>
          <span style={{
            background: `${t.green}15`, color: t.green, padding: '2px 8px',
            borderRadius: 10, fontSize: 11, fontWeight: 700,
          }}>{liveNow}</span>
        </div>
        <span style={{ fontSize: 10, color: t.textMuted }}>
          {filteredEmployees.length} / {employees.length} ظاهر
        </span>
      </div>

      {/* Status filter chips */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 8 }}>
        {([
          { key: 'all' as const, label: 'الكل', color: t.accent },
          { key: 'present' as const, label: 'حاضر', color: t.green },
          { key: 'on_break' as const, label: 'استراحة', color: '#f97316' },
          { key: 'left' as const, label: 'غادر', color: t.amber },
          { key: 'absent' as const, label: 'غائب', color: t.red },
        ]).map(s => {
          const active = statusFilter === s.key;
          return (
            <button key={s.key} onClick={() => setStatusFilter(s.key)} style={{
              padding: '5px 12px', borderRadius: 16, fontSize: 11, fontWeight: active ? 700 : 500,
              border: `1px solid ${active ? s.color : t.border}`,
              background: active ? s.color : `${s.color}10`,
              color: active ? '#fff' : s.color,
              cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'Tajawal, sans-serif',
            }}>{s.label}</button>
          );
        })}
      </div>

      {/* Search + branch filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{
          flex: 1, minWidth: 140, display: 'flex', alignItems: 'center', gap: 6,
          background: t.card, border: `1px solid ${t.border}`, borderRadius: 10, padding: '6px 10px',
        }}>
          <Search size={12} style={{ color: t.textMuted }} />
          <input
            type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="بحث باسم الموظف..."
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontSize: 12, color: t.text, fontFamily: 'Tajawal, sans-serif',
            }}
          />
        </div>
        {branches.length > 1 && (
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} style={{
            background: t.card, border: `1px solid ${t.border}`, borderRadius: 10,
            padding: '6px 10px', fontSize: 11, color: t.text, fontFamily: 'Tajawal, sans-serif',
          }}>
            <option value="all">كل الأقسام</option>
            {branches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
      </div>

      {/* Employee List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: t.textMuted, fontSize: 13 }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
            جاري التحميل...
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: t.textMuted, fontSize: 13 }}>
            {employees.length === 0 ? 'لا يوجد موظفين مسجلين' : 'لا يوجد موظفين مطابقين للفلاتر'}
          </div>
        ) : (
          filteredEmployees.map(emp => {
            const statusColor = emp.status === 'present' ? t.green : emp.status === 'left' ? t.amber : emp.status === 'on_break' ? '#f97316' : t.red;
            const statusLabel = emp.status === 'present' ? 'مداوم ✅' : emp.status === 'left' ? 'غادر 🕐' : emp.status === 'on_break' ? `استراحة ☕ ${emp.current_break_reason || ''}` : 'غائب ❌';
            const isExpanded = expandedId === emp.id;

            return (
              <div key={emp.id} style={{
                background: t.card, border: `1px solid ${t.border}`, borderRadius: 12,
                overflow: 'hidden',
              }}>
                {/* Main Row */}
                <div
                  style={{
                    padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
                    cursor: 'pointer',
                  }}
                  onClick={() => setExpandedId(isExpanded ? null : emp.id)}
                >
                  {/* Status dot */}
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', background: statusColor,
                    boxShadow: emp.status === 'present' ? `0 0 8px ${statusColor}80` : 'none',
                    flexShrink: 0,
                    animation: emp.status === 'present' ? 'pulse 2s infinite' : 'none',
                  }} />

                  {/* Name & position */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{emp.full_name}</div>
                    <div style={{ fontSize: 10, color: t.textMuted }}>
                      {emp.position}
                      {emp.shift_start && emp.shift_end ? (
                        <span style={{ marginRight: 6 }}>
                          • وردية {emp.shift_start?.slice(0, 5)} - {emp.shift_end?.slice(0, 5)}
                        </span>
                      ) : (
                        <span style={{ marginRight: 6 }}>• وردية مفتوحة</span>
                      )}
                    </div>
                  </div>

                  {/* Today times */}
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
                    {emp.today_hours != null && emp.today_hours > 0 && (
                      <div style={{ fontSize: 10, color: t.textMuted }}>
                        {emp.today_hours.toFixed(1)} ساعة
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

                  {/* Expand icon */}
                  {isExpanded ? <ChevronUp size={14} style={{ color: t.textMuted }} /> : <ChevronDown size={14} style={{ color: t.textMuted }} />}
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div style={{ padding: '0 14px 12px', borderTop: `1px solid ${t.border}` }}>
                    {/* Summary stats */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
                      marginTop: 10, marginBottom: 10,
                    }}>
                      <div style={{ textAlign: 'center', padding: 8, background: `${t.accent}08`, borderRadius: 8 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: t.accent }}>{emp.total_days}</div>
                        <div style={{ fontSize: 9, color: t.textMuted }}>أيام دوام</div>
                      </div>
                      <div style={{ textAlign: 'center', padding: 8, background: `${t.green}08`, borderRadius: 8 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: t.green }}>{emp.total_hours}</div>
                        <div style={{ fontSize: 9, color: t.textMuted }}>ساعات عمل</div>
                      </div>
                      <div style={{ textAlign: 'center', padding: 8, background: `${t.amber}08`, borderRadius: 8 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: t.amber }}>{emp.total_overtime}</div>
                        <div style={{ fontSize: 9, color: t.textMuted }}>ساعات إضافية</div>
                      </div>
                      <div style={{ textAlign: 'center', padding: 8, background: '#f9731608', borderRadius: 8 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#f97316' }}>{emp.total_break_minutes || 0}</div>
                        <div style={{ fontSize: 9, color: t.textMuted }}>دقائق استراحة</div>
                      </div>
                    </div>

                    {/* Today's breaks */}
                    {emp.breaks && emp.breaks.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: t.textMuted, marginBottom: 4 }}>
                          ☕ المغادرات المؤقتة ({emp.breaks.length})
                        </div>
                        {emp.breaks.map((b, i) => (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '4px 8px', background: `${t.border}`, borderRadius: 6, marginBottom: 2,
                            fontSize: 10,
                          }}>
                            <span style={{ color: t.text }}>{b.reason || 'استراحة'}</span>
                            <div style={{ display: 'flex', gap: 8, color: t.textMuted }}>
                              <span>{format(new Date(b.break_out), 'hh:mm a')}</span>
                              <span>←</span>
                              <span>{b.break_in ? format(new Date(b.break_in), 'hh:mm a') : '🔴 مفتوح'}</span>
                              {b.duration_minutes != null && (
                                <span style={{ fontWeight: 700, color: '#f97316' }}>{b.duration_minutes} د</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Records table */}
                    {emp.records.length > 0 && (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <thead>
                            <tr style={{ borderBottom: `1px solid ${t.border}` }}>
                              <th style={{ padding: '6px 4px', textAlign: 'right', color: t.textMuted, fontWeight: 600 }}>التاريخ</th>
                              <th style={{ padding: '6px 4px', textAlign: 'center', color: t.textMuted, fontWeight: 600 }}>دخول</th>
                              <th style={{ padding: '6px 4px', textAlign: 'center', color: t.textMuted, fontWeight: 600 }}>خروج</th>
                              <th style={{ padding: '6px 4px', textAlign: 'center', color: t.textMuted, fontWeight: 600 }}>إجمالي</th>
                              <th style={{ padding: '6px 4px', textAlign: 'center', color: t.textMuted, fontWeight: 600 }}>استراحة</th>
                              <th style={{ padding: '6px 4px', textAlign: 'center', color: t.textMuted, fontWeight: 600 }}>صافي</th>
                            </tr>
                          </thead>
                          <tbody>
                            {emp.records.slice(0, 30).map((r, i) => (
                              <tr key={i} style={{ borderBottom: `1px solid ${t.border}` }}>
                                <td style={{ padding: '6px 4px', color: t.text }}>
                                  {format(new Date(r.date), 'dd/MM', { locale: ar })}
                                  <span style={{ fontSize: 9, color: t.textMuted, marginRight: 4 }}>
                                    {format(new Date(r.date), 'EEEE', { locale: ar })}
                                  </span>
                                </td>
                                <td style={{ padding: '6px 4px', textAlign: 'center', color: t.green }}>
                                  {r.check_in ? format(new Date(r.check_in), 'hh:mm a') : '—'}
                                </td>
                                <td style={{ padding: '6px 4px', textAlign: 'center', color: t.amber }}>
                                  {r.check_out ? format(new Date(r.check_out), 'hh:mm a') : '—'}
                                </td>
                                <td style={{ padding: '6px 4px', textAlign: 'center', color: t.text, fontWeight: 600 }}>
                                  {r.hours != null ? r.hours.toFixed(1) : '—'}
                                </td>
                                <td style={{ padding: '6px 4px', textAlign: 'center', color: '#f97316', fontSize: 10 }}>
                                  {r.total_break_minutes > 0 ? `${r.total_break_minutes} د` : '—'}
                                </td>
                                <td style={{ padding: '6px 4px', textAlign: 'center', color: t.accent, fontWeight: 700 }}>
                                  {r.net_work_minutes != null ? (r.net_work_minutes / 60).toFixed(1) : (r.hours != null ? r.hours.toFixed(1) : '—')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {emp.records.length === 0 && (
                      <div style={{ textAlign: 'center', padding: 16, color: t.textMuted, fontSize: 11 }}>
                        لا توجد سجلات حضور في هذه الفترة
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Summary KPI cards — moved to bottom */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 8 }}>
          ملخص الحضور
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { label: 'إجمالي', value: summary.totalEmployees, icon: Users, color: t.accent },
            { label: 'حاضر', value: summary.present, icon: UserCheck, color: t.green },
            { label: 'غائب', value: summary.absent, icon: UserX, color: t.red },
            { label: 'غادر', value: summary.left, icon: Clock, color: t.amber },
          ].map((kpi, i) => (
            <div key={i} style={{
              background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 10,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `${kpi.color}15`,
              }}>
                <kpi.icon size={16} style={{ color: kpi.color }} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
              <div style={{ fontSize: 9, color: t.textMuted }}>{kpi.label}</div>
            </div>
          ))}
        </div>
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
