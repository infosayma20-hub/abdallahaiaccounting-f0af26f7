import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Search, ChevronDown, FileDown, MessageCircle, ChevronRight } from 'lucide-react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { multiWordMatchAny } from "@/lib/utils";
import DynamicTemplateView, { type TemplateSchema } from "@/components/employee/DynamicTemplateView";
import { getDetailGroups, sanitizeHumanText } from "@/lib/employeeRequestDisplay";
import { openEmployeeFormsStorageFile } from "@/lib/employeeStorageFiles";
import { displayReason } from "@/lib/hrMessages";
import { downloadEmployeeFormWord, shareEmployeeFormViaWhatsApp } from "@/lib/employee-forms/exportFormWord";

const ACCENT = '#2A7B9B';

function getThemeColors(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? { card: '#161B22', text: '#E6EDF3', textMuted: 'rgba(230,237,243,0.6)', textFaint: 'rgba(230,237,243,0.4)', border: 'rgba(230,237,243,0.08)', chipBg: 'rgba(230,237,243,0.06)', inputBg: 'rgba(230,237,243,0.06)', inputBorder: 'rgba(230,237,243,0.1)', expandBg: 'rgba(230,237,243,0.02)' }
    : { card: '#FFFFFF', text: '#1B3A5C', textMuted: 'rgba(27,58,92,0.6)', textFaint: 'rgba(27,58,92,0.4)', border: 'rgba(27,58,92,0.1)', chipBg: 'rgba(27,58,92,0.04)', inputBg: '#F5F5F5', inputBorder: 'rgba(27,58,92,0.12)', expandBg: 'rgba(27,58,92,0.02)' };
}

interface EmployeeRequest {
  id: string;
  /** 'form' = employee_forms row, 'penalty' = correction_requests penalty */
  source?: 'form' | 'penalty';
  employeeName: string;
  formType: string;
  status: string;
  amount: number | null;
  createdAt: string;
  details: any;
  templateId?: string | null;
  templateName?: string | null;
  templateCategory?: string | null;
  templateSchema?: TemplateSchema | null;
  title?: string | null;
  reviewNotes?: string | null;
  hrRecommendation?: 'approve' | 'reject' | null;
  hrRecommendationNotes?: string | null;
  hrReviewedAt?: string | null;
  finalDecidedAt?: string | null;
  finalDecisionNotes?: string | null;
}

const isDisciplinary = (formType: string) =>
  formType === 'disciplinary' || formType === 'disciplinary_action';

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
  correction_request: '📋 تصحيح بصمة',
  complaint: '📝 شكوى',
  complaints: '📝 شكوى وملاحظات',
  employee_voice: '💬 صوت الموظف',
  facility_quality: '🏢 جودة مرافق',
  equipment_issue: '🔧 أعطال معدات',
  equipment_fault: '🔧 أعطال معدات',
  disciplinary: '⚠️ إجراء عقابي',
  disciplinary_action: '⚠️ إجراء عقابي',
  stock_balance: '📦 رصيد أصناف',
  inventory_balance: '📦 رصيد أصناف',
  hr_message: '💬 رسالة لـ HR',
  employee_info: '👤 معلومات الموظف',
  birthday_whatsapp: '🎂 ميلاد وواتساب',
  dynamic_template: '📑 نموذج مخصص',
  permission: '🕐 استئذان',
  permission_request: '🕐 استئذان',
  suggestion: '💡 اقتراح',
  suggestions: '💡 اقتراح',
  resignation: '📤 استقالة',
  document_request: '📄 طلب مستند',
  general: '📋 طلب عام',
};

// Category chips
type CategoryKey = 'all' | 'leaves' | 'loans' | 'attendance' | 'penalties' | 'messages' | 'complaints' | 'voice' | 'custom' | 'info';
const CATEGORY_CHIPS: { key: CategoryKey; label: string; icon: string; types: string[] }[] = [
  { key: 'all',        label: 'الكل',              icon: '📋', types: [] },
  { key: 'leaves',     label: 'إجازات',            icon: '🏖️', types: ['leave', 'leave_request'] },
  { key: 'loans',      label: 'سلف وقروض',         icon: '💰', types: ['advance', 'advance_request', 'loan', 'loan_request'] },
  { key: 'attendance', label: 'حضور واستئذان',     icon: '📋', types: ['attendance_correction', 'correction_request', 'overtime', 'overtime_request', 'permission', 'permission_request'] },
  { key: 'penalties',  label: 'إجراءات عقابية',    icon: '⚠️', types: ['disciplinary', 'disciplinary_action'] },
  { key: 'messages',   label: 'رسائل',             icon: '💬', types: ['hr_message', 'suggestion', 'suggestions'] },
  { key: 'voice',      label: 'صوت الموظف',        icon: '🗣️', types: ['employee_voice'] },
  { key: 'complaints', label: 'الشكاوى 🔒',        icon: '🚨', types: ['complaint', 'complaints'] },
  { key: 'custom',     label: 'نماذج مخصصة',       icon: '📑', types: ['dynamic_template', 'facility_quality', 'equipment_issue', 'equipment_fault', 'inventory_balance', 'stock_balance'] },
  { key: 'info',       label: 'معلومات شخصية',     icon: '👤', types: ['employee_info', 'birthday_whatsapp'] },
];

/** Sub-filters inside «نماذج مخصصة» so quality / operations / ISO forms are separable. */
const TEMPLATE_CATEGORY_LABELS: Record<string, string> = {
  quality: '🧪 جودة',
  operations: '⚙️ عمليات',
  hr: '👥 موارد بشرية',
  finance: '💵 مالية',
  marketing: '📣 تسويق',
  iso22000: '🥗 ISO 22000',
  general: '📄 عام',
};

/** Legacy built-in "custom" form types have no template row — map them to a category. */
const BUILTIN_CUSTOM_CATEGORY: Record<string, string> = {
  facility_quality: 'quality',
  equipment_issue: 'operations',
  equipment_fault: 'operations',
  inventory_balance: 'operations',
  stock_balance: 'operations',
};

const customCategoryOf = (r: { formType: string; templateCategory?: string | null }) =>
  r.templateCategory || BUILTIN_CUSTOM_CATEGORY[r.formType] || 'general';

const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'قيد المراجعة', color: '#FBBF24', bg: 'rgba(251,191,36,0.15)' },
  approved: { label: 'موافق', color: '#22C55E', bg: 'rgba(34,197,94,0.15)' },
  rejected: { label: 'مرفوض', color: '#EF4444', bg: 'rgba(239,68,68,0.15)' },
};

export default function PortalEmployeeRequestsTab({ theme = 'light', focusFormId = null, onBackToNotifications }: { theme?: 'light' | 'dark'; focusFormId?: string | null; onBackToNotifications?: () => void }) {
  const [requests, setRequests] = useState<EmployeeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [category, setCategory] = useState<CategoryKey>('all');
  const [customCat, setCustomCat] = useState<string>('all');
  const [customTemplate, setCustomTemplate] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const t = getThemeColors(theme);

  useEffect(() => { fetchData(); }, []);

  // Opened from a notification deep-link (?form=<id>): drop the status filter so
  // the request is visible regardless of state, expand it, and scroll to it.
  useEffect(() => {
    if (!focusFormId || loading) return;
    if (!requests.some(r => r.id === focusFormId)) return;
    setFilter('all');
    setCategory('all');
    setCustomCat('all');
    setCustomTemplate('all');
    setExpandedId(focusFormId);
    const timer = setTimeout(() => {
      document.getElementById(`req-${focusFormId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => clearTimeout(timer);
  }, [focusFormId, loading, requests]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [formsRes, penaltiesRes] = await Promise.all([
        supabase.functions.invoke('malaki-data', { body: { action: 'employee_requests' } }),
        supabase.functions.invoke('malaki-data', { body: { action: 'employee_penalties' } }),
      ]);
      const forms: EmployeeRequest[] = (formsRes.data?.requests || []).map((r: any) => ({
        ...r,
        source: 'form' as const,
        // A disciplinary action is only "approved" once management issued the
        // final decision. HR recommendations must never look like an approval.
        // (Rejections stay rejected — nothing is applied to the employee.)
        status:
          isDisciplinary(r.formType) && r.status === 'approved' && !r.finalDecidedAt
            ? 'pending'
            : r.status,
      }));
      // HR/branch-manager penalties come from the actions inbox and need the
      // same two-stage flow: HR recommendation -> management final decision.
      const penalties: EmployeeRequest[] = (penaltiesRes.data?.penalties || []).map((p: any) => ({
        id: p.id,
        source: 'penalty' as const,
        employeeName: p.employeeName,
        formType: 'disciplinary_action',
        status: p.finalDecision || 'pending',
        amount: null,
        createdAt: p.createdAt,
        details: {
          subject: p.subject,
          description: p.body,
          violation_date: p.violationDate,
          effective_date: p.effectiveDate,
          issued_by: p.issuedByName,
          penalty_kind: p.penaltyKind,
        },
        title: p.subject,
        reviewNotes: null,
        hrRecommendation: p.hrRecommendation,
        hrRecommendationNotes: p.hrRecommendationNotes,
        hrReviewedAt: p.hrReviewedAt,
        finalDecidedAt: p.finalDecidedAt,
        finalDecisionNotes: p.finalDecisionNotes,
      }));
      setRequests([...forms, ...penalties].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  /** Stage 2 of the disciplinary workflow — management's binding decision. */
  const decide = async (r: EmployeeRequest, decision: 'approved' | 'rejected') => {
    const entered = window.prompt(
      decision === 'approved' ? 'ملاحظة الاعتماد (اختياري):' : 'سبب عدم الاعتماد (اختياري):',
      '',
    );
    if (entered === null) return;
    setDeciding(r.id + decision);
    try {
      const body = r.source === 'penalty'
        ? { action: 'decide_penalty', penaltyId: r.id, decision, notes: entered.trim() || null }
        : { action: 'decide_employee_form', formId: r.id, decision, notes: entered.trim() || null };
      const { data, error } = await supabase.functions.invoke('malaki-data', { body });
      if (error || !data?.success) {
        // functions.invoke returns data=null on non-2xx — read the JSON body.
        let code: string | null = data?.error || null;
        try {
          const res = (error as any)?.context;
          if (!code && res && typeof res.json === 'function') {
            code = (await res.json())?.error || null;
          }
        } catch { /* body already consumed or not JSON */ }
        const messages: Record<string, string> = {
          already_decided: 'تم اتخاذ القرار على هذا الطلب مسبقاً — حدّث الصفحة.',
          not_found: 'الطلب غير موجود أو لا يتبع هذه الشركة.',
          not_linked: 'حسابك غير مرتبط بالشركة.',
          forbidden_tenant: 'لا تملك صلاحية اتخاذ القرار.',
          invalid_payload: 'بيانات القرار غير صالحة.',
        };
        alert(code ? (messages[code] || `تعذّر حفظ القرار: ${code}`) : 'تعذّر حفظ القرار');
        return;
      }
      setRequests(prev => prev.map(x => x.id === r.id
        ? { ...x, status: decision, finalDecisionNotes: entered.trim() || null, finalDecidedAt: new Date().toISOString() }
        : x));
    } finally {
      setDeciding(null);
    }
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
    if (category !== 'all') {
      const cat = CATEGORY_CHIPS.find(c => c.key === category);
      if (cat && !cat.types.includes(r.formType)) return false;
      if (category === 'custom') {
        if (customCat !== 'all' && customCategoryOf(r) !== customCat) return false;
        if (customTemplate !== 'all' && (r.templateName || r.formType) !== customTemplate) return false;
      }
    }
    if (search && !r.employeeName.includes(search) && !formTypeLabels[r.formType]?.includes(search)) return false;
    return true;
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const approvedCount = requests.filter(r => r.status === 'approved').length;
  const rejectedCount = requests.filter(r => r.status === 'rejected').length;

  const labelFor = (r: EmployeeRequest) =>
    r.formType === 'dynamic_template' && (r.templateName || r.title)
      ? `📑 ${r.templateName || r.title}`
      : (formTypeLabels[r.formType] || `📋 ${r.formType}`);

  const downloadWord = (r: EmployeeRequest) => {
    downloadEmployeeFormWord({
      title: r.templateName || r.title || labelFor(r),
      employeeName: r.employeeName,
      createdAt: r.createdAt,
      schema: r.templateSchema || undefined,
      data: r.details,
    });
  };

  const shareWhatsApp = async (r: EmployeeRequest) => {
    try {
      await shareEmployeeFormViaWhatsApp({
        title: r.templateName || r.title || labelFor(r),
        employeeName: r.employeeName,
        createdAt: r.createdAt,
        schema: r.templateSchema || undefined,
        data: r.details,
      });
    } catch {}
  };

  return (
    <div style={{ paddingBottom: 'calc(100px + env(safe-area-inset-bottom, 0px))' }}>
      {focusFormId && onBackToNotifications && (
        <button
          onClick={onBackToNotifications}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
            background: 'rgba(42,123,155,0.12)', border: '1px solid rgba(42,123,155,0.3)',
            borderRadius: 10, padding: '7px 12px', color: ACCENT, fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'Cairo',
          }}
        >
          <ChevronRight size={14} />
          رجوع للإشعارات
        </button>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
        {(() => {
          // KPIs respect the active category so totals match the visible chips/list
          const catCfg = CATEGORY_CHIPS.find(c => c.key === category);
          const scope = !catCfg || catCfg.key === 'all'
            ? requests
            : requests.filter(r => catCfg.types.includes(r.formType));
          const kPending = scope.filter(r => r.status === 'pending').length;
          const kApproved = scope.filter(r => r.status === 'approved').length;
          const kRejected = scope.filter(r => r.status === 'rejected').length;
          return [
            { label: 'إجمالي', value: scope.length, color: t.text },
            { label: 'قيد المراجعة', value: kPending, color: '#FBBF24' },
            { label: 'موافق', value: kApproved, color: '#22C55E' },
            { label: 'مرفوض', value: kRejected, color: '#EF4444' },
          ];
        })().map(k => (
          <div key={k.label} style={{
            background: t.card, borderRadius: 10, padding: '10px 12px',
            border: `1px solid ${t.border}`,
          }}>
            <div style={{ fontSize: 9, color: t.textMuted, marginBottom: 2 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.color, fontFamily: 'JetBrains Mono, monospace' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Category chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {CATEGORY_CHIPS.map(c => {
          const active = category === c.key;
          // Respect current status filter so the chip count matches the visible list
          const statusScoped = filter === 'all' ? requests : requests.filter(r => r.status === filter);
          const count = c.key === 'all'
            ? statusScoped.length
            : statusScoped.filter(r => c.types.includes(r.formType)).length;
          return (
            <button key={c.key} onClick={() => { setCategory(c.key); setCustomCat('all'); setCustomTemplate('all'); }} style={{
              padding: '7px 12px', borderRadius: 18, fontSize: 11, fontWeight: 600,
              background: active ? ACCENT : t.chipBg,
              border: `1px solid ${active ? ACCENT : t.border}`,
              color: active ? '#fff' : t.textMuted,
              cursor: 'pointer', fontFamily: 'Tajawal, sans-serif',
              whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <span>{c.icon}</span>
              <span>{c.label}</span>
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 10,
                background: active ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.06)',
              }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Sub-filters for custom templates: category then specific template */}
      {category === 'custom' && (() => {
        const statusScoped = (filter === 'all' ? requests : requests.filter(r => r.status === filter))
          .filter(r => CATEGORY_CHIPS.find(c => c.key === 'custom')!.types.includes(r.formType));
        const catCounts = new Map<string, number>();
        statusScoped.forEach(r => {
          const k = customCategoryOf(r);
          catCounts.set(k, (catCounts.get(k) || 0) + 1);
        });
        // Keep the active chip visible even when the status filter empties it,
        // otherwise the list looks empty with no way to see which filter is on.
        if (customCat !== 'all' && !catCounts.has(customCat)) catCounts.set(customCat, 0);
        const catKeys = Array.from(catCounts.keys()).sort((a, b) => (catCounts.get(b)! - catCounts.get(a)!));
        const inCat = customCat === 'all' ? statusScoped : statusScoped.filter(r => customCategoryOf(r) === customCat);
        const tplCounts = new Map<string, number>();
        inCat.forEach(r => {
          const k = r.templateName || r.formType;
          tplCounts.set(k, (tplCounts.get(k) || 0) + 1);
        });
        if (customTemplate !== 'all' && !tplCounts.has(customTemplate)) tplCounts.set(customTemplate, 0);
        const tplKeys = Array.from(tplCounts.keys()).sort((a, b) => (tplCounts.get(b)! - tplCounts.get(a)!));
        return (
          <div style={{
            marginBottom: 10, padding: 8, borderRadius: 12,
            background: t.expandBg, border: `1px dashed ${t.border}`,
          }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[{ k: 'all', label: 'كل التصنيفات', n: statusScoped.length },
                ...catKeys.map(k => ({ k, label: TEMPLATE_CATEGORY_LABELS[k] || k, n: catCounts.get(k)! }))
              ].map(c => {
                const active = customCat === c.k;
                return (
                  <button key={c.k} onClick={() => { setCustomCat(c.k); setCustomTemplate('all'); }} style={{
                    padding: '6px 10px', borderRadius: 16, fontSize: 10.5, fontWeight: 600,
                    background: active ? ACCENT : t.chipBg,
                    border: `1px solid ${active ? ACCENT : t.border}`,
                    color: active ? '#fff' : t.textMuted, cursor: 'pointer',
                    fontFamily: 'Tajawal, sans-serif', whiteSpace: 'nowrap',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}>
                    <span>{c.label}</span>
                    <span style={{ fontSize: 9.5, padding: '1px 5px', borderRadius: 9, background: active ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.06)' }}>{c.n}</span>
                  </button>
                );
              })}
            </div>
            {tplKeys.length > 1 && (
              <select
                value={customTemplate}
                onChange={e => setCustomTemplate(e.target.value)}
                style={{
                  marginTop: 8, width: '100%', padding: '8px 10px', borderRadius: 10,
                  background: t.inputBg, border: `1px solid ${t.inputBorder}`,
                  color: t.text, fontSize: 11.5, fontFamily: 'Tajawal, sans-serif',
                }}
              >
                <option value="all">كل النماذج ({inCat.length})</option>
                {tplKeys.map(k => (
                  <option key={k} value={k}>{(formTypeLabels[k] || k)} ({tplCounts.get(k)})</option>
                ))}
              </select>
            )}
          </div>
        );
      })()}

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
            if (isDisciplinary(r.formType) && r.status === 'pending') {
              detailParts.push(r.hrRecommendation
                ? `🏷️ توصية HR: ${r.hrRecommendation === 'approve' ? 'اعتماد' : 'رفض'} — بانتظار قرارك`
                : '🏷️ بانتظار رأي الموارد البشرية');
            }
            
            // Always show reason/notes if present
            if (details.reason) detailParts.push(`📝 ${displayReason(details.reason)}`);
            if (details.notes && details.notes !== details.reason) detailParts.push(`📝 ${sanitizeHumanText(String(details.notes))}`);
            if (details.description && details.description !== details.reason) detailParts.push(sanitizeHumanText(String(details.description)));
            if (details.items) detailParts.push(`📦 ${sanitizeHumanText(String(details.items))}`);
            if (details.employee_name) detailParts.push(`👤 ${sanitizeHumanText(String(details.employee_name))}`);
            
            const detailText = detailParts.filter(Boolean).map(s => s.replace(/\s*\n\s*/g, ' ')).join(' • ');

            const isExpanded = expandedId === r.id;

            return (
              <div
                key={r.id}
                id={`req-${r.id}`}
                onClick={() => setExpandedId(isExpanded ? null : r.id)}
                style={{
                  background: t.card, borderRadius: 12, overflow: 'hidden',
                  border: `1px solid ${focusFormId === r.id ? ACCENT : t.border}`,
                  boxShadow: focusFormId === r.id ? `0 0 0 2px ${ACCENT}55` : undefined,
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
                      {labelFor(r)}
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
                {/* Expanded body — full professional content */}
                {isExpanded && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      borderTop: `1px solid ${t.border}`,
                      background: t.expandBg,
                      padding: '14px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => downloadWord(r)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '7px 10px', borderRadius: 8, marginBottom: 10,
                        border: `1px solid ${t.border}`, background: t.card,
                        color: t.text, fontSize: 11, fontFamily: 'Tajawal, sans-serif',
                      }}
                    >
                      <FileDown size={14} /> تنزيل Word
                    </button>
                    <button
                      type="button"
                      onClick={() => shareWhatsApp(r)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '7px 10px', borderRadius: 8, marginBottom: 10, marginInlineStart: 8,
                        border: '1px solid #6EE7B7', background: '#ECFDF5',
                        color: '#047857', fontSize: 11, fontFamily: 'Tajawal, sans-serif',
                      }}
                    >
                      <MessageCircle size={14} /> مشاركة واتساب
                    </button>
                    {r.formType === 'dynamic_template' ? (
                      <DynamicTemplateView
                        schema={r.templateSchema || undefined}
                        data={r.details}
                        title={r.templateName || r.title || undefined}
                      />
                    ) : (
                      <GenericDetailView request={r} theme={t} />
                    )}
                    {isDisciplinary(r.formType) && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{
                          background: t.card, borderRadius: 10, border: `1px solid ${t.border}`,
                          padding: '10px 12px', fontSize: 12, color: t.text, lineHeight: 1.7,
                        }}>
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>رأي الموارد البشرية</div>
                          {r.hrRecommendation ? (
                            <>
                              <div style={{ color: r.hrRecommendation === 'approve' ? '#22C55E' : '#EF4444', fontWeight: 600 }}>
                                {r.hrRecommendation === 'approve' ? '✔ توصية بالاعتماد' : '✖ توصية بعدم الاعتماد'}
                              </div>
                              {r.hrRecommendationNotes && (
                                <div style={{ color: t.textMuted, whiteSpace: 'pre-wrap' }}>{sanitizeHumanText(r.hrRecommendationNotes)}</div>
                              )}
                            </>
                          ) : (
                            <div style={{ color: t.textMuted }}>لم تُسجَّل توصية الموارد البشرية بعد</div>
                          )}
                          {r.finalDecisionNotes && (
                            <div style={{ marginTop: 6, color: t.text }}>
                              <b>قرار الإدارة:</b> {sanitizeHumanText(r.finalDecisionNotes)}
                            </div>
                          )}
                        </div>
                        {r.status === 'pending' && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                            <button
                              type="button"
                              disabled={!!deciding}
                              onClick={() => decide(r, 'approved')}
                              style={{
                                flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                padding: '10px 12px', borderRadius: 10, border: '1px solid #22C55E',
                                background: 'rgba(34,197,94,0.12)', color: '#16A34A',
                                fontSize: 12, fontWeight: 700, fontFamily: 'Tajawal, sans-serif',
                                opacity: deciding ? 0.6 : 1,
                              }}
                            >
                              <ThumbsUp size={14} /> اعتماد الإجراء
                            </button>
                            <button
                              type="button"
                              disabled={!!deciding}
                              onClick={() => decide(r, 'rejected')}
                              style={{
                                flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                padding: '10px 12px', borderRadius: 10, border: '1px solid #EF4444',
                                background: 'rgba(239,68,68,0.12)', color: '#DC2626',
                                fontSize: 12, fontWeight: 700, fontFamily: 'Tajawal, sans-serif',
                                opacity: deciding ? 0.6 : 1,
                              }}
                            >
                              <ThumbsDown size={14} /> عدم الاعتماد
                            </button>
                          </div>
                        )}
                      </div>
                    )}
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

/** Generic field-by-field renderer for non-dynamic-template forms. */
function GenericDetailView({ request, theme }: { request: EmployeeRequest; theme: ReturnType<typeof getThemeColors> }) {
  const r: any = {
    form_type: request.formType,
    form_data: request.details,
    status: request.status,
    created_at: request.createdAt,
    reason: request.details?.reason,
  };
  const groups = getDetailGroups(r);
  // Drop "معلومات الطلب" — already visible in the card header.
  const useful = groups.filter(g => g.title !== 'معلومات الطلب' && g.fields.length > 0);

  if (!useful.length) {
    return (
      <div style={{ fontSize: 12, color: theme.textMuted, textAlign: 'center', padding: 12 }}>
        لا توجد تفاصيل إضافية
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} dir="rtl">
      {useful.map(g => (
        <div key={g.title} style={{
          background: theme.card, borderRadius: 10,
          border: `1px solid ${theme.border}`, overflow: 'hidden',
        }}>
          <div style={{
            padding: '6px 10px', fontSize: 11, fontWeight: 700,
            color: theme.text, background: theme.chipBg,
            borderBottom: `1px solid ${theme.border}`,
          }}>{g.title}</div>
          <div>
            {g.fields.map((f, i) => {
              const v = f.value;
              const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
              return (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8,
                  padding: '7px 10px', fontSize: 12,
                  borderTop: i === 0 ? 'none' : `1px solid ${theme.border}`,
                }}>
                  <div style={{ color: theme.textMuted }}>{f.label}</div>
                  <div style={{ color: theme.text, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                    {f.isUrl ? (
                      <button
                        type="button"
                        onClick={() => openEmployeeFormsStorageFile(valStr)}
                        style={{ color: ACCENT, textDecoration: 'underline', background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}
                      >
                        فتح المرفق
                      </button>
                    ) : valStr}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
