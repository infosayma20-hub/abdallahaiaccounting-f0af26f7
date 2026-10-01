import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getJobApplicationStatus } from '@/lib/hr/jobApplicationStatus';
import { BriefcaseBusiness, Loader2, RefreshCw, Search, Users } from 'lucide-react';

function getThemeColors(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? { card: '#161B22', text: '#E6EDF3', textMuted: 'rgba(230,237,243,0.6)', border: 'rgba(230,237,243,0.08)', chipBg: 'rgba(230,237,243,0.06)', chipActive: '#E6EDF3', chipActiveText: '#0D1B2E', headBg: 'rgba(230,237,243,0.04)', rowHover: 'rgba(230,237,243,0.03)', inputBg: '#1e1e1e' }
    : { card: '#FFFFFF', text: '#0D1B2E', textMuted: 'rgba(13,27,46,0.6)', border: 'rgba(13,27,46,0.1)', chipBg: 'rgba(13,27,46,0.04)', chipActive: '#0D1B2E', chipActiveText: '#FFFFFF', headBg: 'rgba(13,27,46,0.04)', rowHover: 'rgba(13,27,46,0.02)', inputBg: '#FFFFFF' };
}

interface Row {
  id: string; full_name: string; phone: string | null; email: string | null;
  national_id: string | null; gender: string | null; birth_date: string | null;
  birth_place: string | null; marital_status: string | null; children_count: number | null;
  address: string | null; desired_position: string | null;
  shift_preference: string | null; job_type: string | null; work_location: string | null;
  preferred_city: string | null;
  smoker: boolean | null; works_friday: boolean | null; works_holidays: boolean | null;
  has_driving_license: boolean | null; driving_license_type: string | null;
  notes: string | null; status: string; created_at: string; source: string;
  education: unknown; experience: unknown;
}

const fmtDate = (v: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB');
};
const fmtDateTime = (v: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};
const yesNo = (v: boolean | null) => (v == null ? '—' : v ? 'نعم' : 'لا');
const dash = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? '—' : String(v));

function eduSummary(edu: unknown): string {
  if (!Array.isArray(edu) || edu.length === 0) return '—';
  const first = edu[0] as Record<string, unknown>;
  return [first?.degree, first?.major, first?.institution].filter(Boolean).join(' - ') || '—';
}
function expSummary(exp: unknown): string {
  if (!Array.isArray(exp) || exp.length === 0) return '—';
  const first = exp[0] as Record<string, unknown>;
  return [first?.job_title, first?.company].filter(Boolean).join(' - ') || '—';
}

const COLUMNS: { key: string; label: string; width: number; get: (r: Row) => string }[] = [
  { key: 'created_at', label: 'تاريخ التقديم', width: 130, get: (r) => fmtDateTime(r.created_at) },
  { key: 'full_name', label: 'الاسم الكامل', width: 170, get: (r) => r.full_name },
  { key: 'phone', label: 'الهاتف', width: 120, get: (r) => dash(r.phone) },
  { key: 'desired_position', label: 'الوظيفة المطلوبة', width: 150, get: (r) => dash(r.desired_position) },
  { key: 'status', label: 'الحالة', width: 150, get: (r) => getJobApplicationStatus(r.status).label },
  { key: 'national_id', label: 'رقم الهوية', width: 120, get: (r) => dash(r.national_id) },
  { key: 'gender', label: 'الجنس', width: 70, get: (r) => dash(r.gender) },
  { key: 'birth_date', label: 'تاريخ الميلاد', width: 105, get: (r) => fmtDate(r.birth_date) },
  { key: 'birth_place', label: 'مكان الميلاد', width: 110, get: (r) => dash(r.birth_place) },
  { key: 'marital_status', label: 'الحالة الاجتماعية', width: 110, get: (r) => dash(r.marital_status) },
  { key: 'children_count', label: 'الأطفال', width: 65, get: (r) => dash(r.children_count) },
  { key: 'address', label: 'العنوان', width: 150, get: (r) => dash(r.address) },
  { key: 'preferred_city', label: 'المدينة المفضلة', width: 110, get: (r) => dash(r.preferred_city) },
  { key: 'work_location', label: 'موقع العمل', width: 120, get: (r) => dash(r.work_location) },
  { key: 'job_type', label: 'نوع الدوام', width: 100, get: (r) => dash(r.job_type) },
  { key: 'shift_preference', label: 'الفترة', width: 100, get: (r) => dash(r.shift_preference) },
  { key: 'works_friday', label: 'يعمل جمعة', width: 85, get: (r) => yesNo(r.works_friday) },
  { key: 'works_holidays', label: 'يعمل أعياد', width: 85, get: (r) => yesNo(r.works_holidays) },
  { key: 'smoker', label: 'مدخّن', width: 70, get: (r) => yesNo(r.smoker) },
  { key: 'has_driving_license', label: 'رخصة قيادة', width: 90, get: (r) => yesNo(r.has_driving_license) },
  { key: 'driving_license_type', label: 'نوع الرخصة', width: 90, get: (r) => dash(r.driving_license_type) },
  { key: 'education', label: 'التعليم', width: 180, get: (r) => eduSummary(r.education) },
  { key: 'experience', label: 'الخبرة', width: 180, get: (r) => expSummary(r.experience) },
  { key: 'email', label: 'البريد', width: 170, get: (r) => dash(r.email) },
  { key: 'notes', label: 'ملاحظات', width: 180, get: (r) => dash(r.notes) },
];

export default function PortalJobApplicationsTab({ theme = 'light', ownerId }: { theme?: 'light' | 'dark'; ownerId?: string }) {
  const t = getThemeColors(theme);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('job_applications')
        .select('id, full_name, phone, email, national_id, gender, birth_date, birth_place, marital_status, children_count, address, desired_position, shift_preference, job_type, work_location, preferred_city, smoker, works_friday, works_holidays, has_driving_license, driving_license_type, notes, status, created_at, source, education, experience')
        .eq('user_id', ownerId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      setRows((data || []) as Row[]);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!ownerId) return;
    const ch = supabase
      .channel(`portal-job-apps-${ownerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_applications', filter: `user_id=eq.${ownerId}` }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [ownerId, load]);

  const statusOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      const s = getJobApplicationStatus(r.status);
      map.set(r.status || 'new', s.label);
    });
    return Array.from(map.entries());
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && (r.status || 'new') !== statusFilter) return false;
      if (!q) return true;
      return [r.full_name, r.phone, r.national_id, r.desired_position, r.email]
        .filter(Boolean)
        .some((v) => String(v).includes(q));
    });
  }, [rows, search, statusFilter]);

  const newCount = rows.filter((r) => (r.status || 'new') === 'new').length;

  const cellStyle: React.CSSProperties = {
    padding: '7px 10px', fontSize: 11.5, color: t.text, whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis', borderLeft: `1px solid ${t.border}`,
  };

  return (
    <div dir="rtl" style={{ fontFamily: 'Cairo', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: 12, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: '#2563EB1A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={16} color="#2563EB" />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: t.text }}>{rows.length}</div>
              <div style={{ fontSize: 10.5, color: t.textMuted }}>إجمالي الطلبات</div>
            </div>
          </div>
        </div>
        <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: 12, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: '#0596691A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BriefcaseBusiness size={16} color="#059669" />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: t.text }}>{newCount}</div>
              <div style={{ fontSize: 10.5, color: t.textMuted }}>طلبات جديدة</div>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={14} color={t.textMuted} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف أو الهوية أو الوظيفة…"
            style={{
              width: '100%', boxSizing: 'border-box', background: t.inputBg, border: `1px solid ${t.border}`,
              borderRadius: 10, padding: '8px 32px 8px 10px', fontSize: 12, color: t.text,
              fontFamily: 'Cairo', outline: 'none',
            }}
          />
        </div>
        <button onClick={() => { void load(); }} style={{
          background: t.chipBg, border: `1px solid ${t.border}`, borderRadius: 10, width: 34, height: 34,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <RefreshCw size={14} color={t.textMuted} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
        </button>
      </div>

      {/* Status chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => setStatusFilter('all')} style={{
          background: statusFilter === 'all' ? t.chipActive : t.chipBg,
          color: statusFilter === 'all' ? t.chipActiveText : t.text,
          border: `1px solid ${t.border}`, borderRadius: 999, padding: '4px 12px',
          fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo',
        }}>الكل ({rows.length})</button>
        {statusOptions.map(([key, label]) => (
          <button key={key} onClick={() => setStatusFilter(key)} style={{
            background: statusFilter === key ? t.chipActive : t.chipBg,
            color: statusFilter === key ? t.chipActiveText : t.text,
            border: `1px solid ${t.border}`, borderRadius: 999, padding: '4px 12px',
            fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo',
          }}>{label}</button>
        ))}
      </div>

      {/* Excel-like table */}
      <div style={{
        background: t.card, border: `1px solid ${t.border}`, borderRadius: 14,
        overflow: 'auto', maxHeight: 'calc(100dvh - 300px)',
      }}>
        {loading && rows.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 40, color: t.textMuted, fontSize: 12 }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> جارِ التحميل…
          </div>
        ) : visible.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: t.textMuted, fontSize: 12 }}>لا توجد طلبات مطابقة</div>
        ) : (
          <table style={{ borderCollapse: 'collapse', direction: 'rtl', minWidth: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <th style={{ ...cellStyle, background: t.headBg, fontWeight: 800, width: 40, textAlign: 'center' }}>#</th>
                {COLUMNS.map((col) => (
                  <th key={col.key} style={{ ...cellStyle, background: t.headBg, fontWeight: 800, minWidth: col.width, maxWidth: col.width, textAlign: 'right' }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${t.border}` }}>
                  <td style={{ ...cellStyle, textAlign: 'center', color: t.textMuted }}>{i + 1}</td>
                  {COLUMNS.map((col) => (
                    <td key={col.key} style={{ ...cellStyle, minWidth: col.width, maxWidth: col.width, fontWeight: col.key === 'full_name' ? 700 : 400 }} title={col.get(r)}>
                      {col.get(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div style={{ fontSize: 10.5, color: t.textMuted, textAlign: 'center' }}>
        يظهر {visible.length} من {rows.length} طلب — مرتّب من الأجدد للأقدم — اسحب الجدول يمينًا ويسارًا لرؤية كل الأعمدة
      </div>
    </div>
  );
}
