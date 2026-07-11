import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { format, subDays, addDays } from 'date-fns';
import { RefreshCw, Search, CalendarClock, UserCog, Pencil } from 'lucide-react';

interface Props {
  theme: 'light' | 'dark';
}

interface RosterRow {
  id: string;
  roster_date: string;
  employee_id: string;
  employee_name: string | null;
  branch_id: string | null;
  branch_name: string | null;
  shift_template_id: string | null;
  shift_name: string | null;
  shift_start: string | null;
  shift_end: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  notes: string | null;
  created_by: string | null;
  manager_name: string;
  created_at: string;
  updated_at: string;
  was_edited: boolean;
}

function tokens(dark: boolean) {
  return dark
    ? {
        pageBg: '#0a0a0a',
        cardBg: '#161B22',
        cardBorder: 'rgba(230,237,243,0.08)',
        rowHover: 'rgba(255,255,255,0.03)',
        text: '#E6EDF3',
        textMuted: 'rgba(230,237,243,0.6)',
        textFaint: 'rgba(230,237,243,0.4)',
        inputBg: '#1e1e1e',
        inputBorder: '#333',
        accent: '#8B5CF6',
        accentSoft: 'rgba(139,92,246,0.15)',
        editedTint: 'rgba(245,158,11,0.12)',
        editedText: '#FBBF24',
        headerBg: '#111111',
      }
    : {
        pageBg: '#F8FAFC',
        cardBg: '#FFFFFF',
        cardBorder: '#F1F5F9',
        rowHover: '#F8FAFC',
        text: '#0D1B2E',
        textMuted: '#64748B',
        textFaint: '#94A3B8',
        inputBg: '#FFFFFF',
        inputBorder: '#E2E8F0',
        accent: '#8B5CF6',
        accentSoft: 'rgba(139,92,246,0.10)',
        editedTint: 'rgba(245,158,11,0.10)',
        editedText: '#B45309',
        headerBg: '#0D1B2E',
      };
}

function formatDateShort(iso: string) {
  return format(new Date(iso), 'dd/MM');
}
function formatDateTime(iso: string) {
  return format(new Date(iso), 'dd/MM HH:mm');
}
function formatTime(t: string | null) {
  if (!t) return '—';
  return t.slice(0, 5);
}
function statusLabel(s: string | null) {
  switch (s) {
    case 'scheduled': return 'مجدول';
    case 'off': return 'عطلة';
    case 'leave': return 'إجازة';
    case 'sick': return 'مرضي';
    default: return s || '—';
  }
}
function statusColor(s: string | null) {
  switch (s) {
    case 'off': return '#94A3B8';
    case 'leave': return '#F59E0B';
    case 'sick': return '#EF4444';
    default: return '#22C55E';
  }
}

export default function PortalRosterAssignmentsTab({ theme }: Props) {
  const { user: portalUser } = usePortalAuth();
  const t = tokens(theme === 'dark');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
  const [managerFilter, setManagerFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [onlyEdited, setOnlyEdited] = useState(false);

  useEffect(() => {
    if (!portalUser?.user_id) return;
    (async () => {
      const { data } = await supabase
        .from('companies')
        .select('id')
        .eq('owner_id', portalUser.user_id)
        .maybeSingle();
      if (data?.id) setCompanyId(data.id);
    })();
  }, [portalUser?.user_id]);

  const fetchRows = async (silent = false) => {
    if (!companyId) return;
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('get_portal_roster_assignments', {
        p_company_id: companyId,
        p_date_from: dateFrom,
        p_date_to: dateTo,
      });
      if (error) throw error;
      setRows((data as RosterRow[]) || []);
    } catch (e: any) {
      console.error('[roster-assignments]', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchRows(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [companyId, dateFrom, dateTo]);

  const managers = useMemo(() => {
    const set = new Map<string, string>();
    rows.forEach(r => set.set(r.manager_name, r.manager_name));
    return Array.from(set.values()).sort();
  }, [rows]);

  const branches = useMemo(() => {
    const set = new Map<string, string>();
    rows.forEach(r => { if (r.branch_id && r.branch_name) set.set(r.branch_id, r.branch_name); });
    return Array.from(set.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim();
    return rows.filter(r => {
      if (managerFilter !== 'all' && r.manager_name !== managerFilter) return false;
      if (branchFilter !== 'all' && r.branch_id !== branchFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (onlyEdited && !r.was_edited) return false;
      if (q) {
        const hay = `${r.employee_name || ''} ${r.manager_name} ${r.shift_name || ''} ${r.branch_name || ''}`;
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, managerFilter, branchFilter, statusFilter, onlyEdited, search]);

  const stats = useMemo(() => {
    const editedCount = rows.filter(r => r.was_edited).length;
    return { total: rows.length, edited: editedCount, managers: managers.length };
  }, [rows, managers]);

  return (
    <div dir="rtl" style={{ fontFamily: 'Cairo', background: t.pageBg, minHeight: '100vh', padding: '12px 12px 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: t.accentSoft, color: t.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <CalendarClock size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>جداول الدوام</div>
          <div style={{ fontSize: 10, color: t.textFaint }}>التعيينات من قبل المديرين</div>
        </div>
        <button
          onClick={() => fetchRows(true)}
          disabled={refreshing}
          style={{
            background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 10,
            padding: '6px 10px', color: t.textMuted, cursor: 'pointer', fontFamily: 'Cairo',
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
          }}
        >
          <RefreshCw size={12} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
          تحديث
        </button>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
        <StatPill t={t} label="إجمالي" value={stats.total} />
        <StatPill t={t} label="مُعدَّلة" value={stats.edited} color={t.editedText} />
        <StatPill t={t} label="مديرون" value={stats.managers} color={t.accent} />
      </div>

      {/* Filters */}
      <div style={{
        background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14,
        padding: 10, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <LabeledInput t={t} label="من" type="date" value={dateFrom} onChange={setDateFrom} />
          <LabeledInput t={t} label="إلى" type="date" value={dateTo} onChange={setDateTo} />
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={12} color={t.textMuted} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم، المدير، الفرع، الوردية…"
            style={{
              width: '100%', padding: '8px 30px 8px 10px', borderRadius: 10,
              border: `1px solid ${t.inputBorder}`, background: t.inputBg, color: t.text,
              fontSize: 12, fontFamily: 'Cairo',
            }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <SelectField t={t} value={managerFilter} onChange={setManagerFilter}>
            <option value="all">كل المديرين</option>
            {managers.map(m => <option key={m} value={m}>{m}</option>)}
          </SelectField>
          <SelectField t={t} value={branchFilter} onChange={setBranchFilter}>
            <option value="all">كل الفروع</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </SelectField>
          <SelectField t={t} value={statusFilter} onChange={setStatusFilter}>
            <option value="all">كل الحالات</option>
            <option value="scheduled">مجدول</option>
            <option value="off">عطلة</option>
            <option value="leave">إجازة</option>
            <option value="sick">مرضي</option>
          </SelectField>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: t.textMuted, cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyEdited} onChange={e => setOnlyEdited(e.target.checked)} />
          إظهار المُعدَّلة فقط
        </label>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: t.textMuted, fontSize: 12 }}>جاري التحميل…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: t.textMuted, fontSize: 12,
          background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14 }}>
          لا توجد تعيينات مطابقة
        </div>
      ) : (
        <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, overflow: 'hidden' }}>
          {filtered.map((r, idx) => (
            <div
              key={r.id}
              style={{
                padding: '10px 12px',
                borderBottom: idx === filtered.length - 1 ? 'none' : `1px solid ${t.cardBorder}`,
                background: r.was_edited ? t.editedTint : 'transparent',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 6,
                    background: statusColor(r.status) + '22', color: statusColor(r.status),
                    whiteSpace: 'nowrap',
                  }}>
                    {statusLabel(r.status)}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.employee_name || '—'}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: t.textMuted, whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, monospace' }}>
                  {formatDateShort(r.roster_date)}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: t.textMuted, flexWrap: 'wrap' }}>
                {r.shift_name && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontWeight: 700, color: t.text }}>{r.shift_name}</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', color: t.textFaint }}>
                      {formatTime(r.shift_start)}–{formatTime(r.shift_end)}
                    </span>
                  </span>
                )}
                {r.branch_name && <span>· {r.branch_name}</span>}
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: t.textFaint,
                paddingTop: 6, borderTop: `1px dashed ${t.cardBorder}`,
              }}>
                <UserCog size={11} />
                <span>عيّنها: <span style={{ color: t.text, fontWeight: 600 }}>{r.manager_name}</span></span>
                <span style={{ marginRight: 'auto', fontFamily: 'JetBrains Mono, monospace' }}>
                  {formatDateTime(r.created_at)}
                </span>
                {r.was_edited && (
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 2,
                    color: t.editedText, fontWeight: 700,
                  }}>
                    <Pencil size={9} />
                    عُدِّل {formatDateTime(r.updated_at)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function StatPill({ t, label, value, color }: { t: ReturnType<typeof tokens>; label: string; value: number; color?: string }) {
  return (
    <div style={{
      background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 12,
      padding: 10, textAlign: 'center',
    }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || t.text, fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
      <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function LabeledInput({ t, label, type, value, onChange }: any) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10, color: t.textMuted }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: '6px 8px', borderRadius: 8, border: `1px solid ${t.inputBorder}`,
          background: t.inputBg, color: t.text, fontSize: 12, fontFamily: 'Cairo',
        }}
      />
    </label>
  );
}

function SelectField({ t, value, onChange, children }: any) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: '6px 8px', borderRadius: 8, border: `1px solid ${t.inputBorder}`,
        background: t.inputBg, color: t.text, fontSize: 11, fontFamily: 'Cairo',
      }}
    >
      {children}
    </select>
  );
}