import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Loader2, Search, ChevronDown, ChevronUp, ExternalLink, X } from 'lucide-react';
import FormStatusBadge from '@/components/employee/forms/FormStatusBadge';
import DynamicTemplateView from '@/components/employee/DynamicTemplateView';
import { getFreshFormPdfUrl } from '@/lib/employee-forms/pdfUrl';

interface Props {
  theme: 'dark' | 'light';
}

interface FormRow {
  id: string;
  title: string | null;
  form_type: string | null;
  form_data: any;
  workflow_status: string;
  pdf_url: string | null;
  pdf_storage_path: string | null;
  submitted_at: string | null;
  created_at: string;
  employee_id: string;
  template_id: string | null;
  employees?: { full_name: string; branch_id: string | null } | null;
  form_templates?: { name: string; category: string | null; schema: any } | null;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'الكل' },
  { value: 'submitted', label: 'مُرسلة' },
  { value: 'under_review', label: 'قيد المراجعة' },
  { value: 'approved', label: 'معتمدة' },
  { value: 'rejected', label: 'مرفوضة' },
];

/**
 * Read-only Forms viewer for Malaki portal owners (Kamal, Musab, …).
 * RLS lets any is_team_member of the data owner select every non-draft
 * employee_form, so we rely on standard supabase client with no extra edge fn.
 */
export default function PortalFormsTab({ theme }: Props) {
  const dark = theme === 'dark';
  const [rows, setRows] = useState<FormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [template, setTemplate] = useState<string>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const colors = dark
    ? { bg: '#0a0a0a', card: '#161616', border: '#262626', text: '#F1F5F9', muted: '#A1A1AA', chip: '#1e1e1e', chipActive: '#FFFFFF', chipActiveText: '#0a0a0a', input: '#1e1e1e' }
    : { bg: '#F8FAFC', card: '#FFFFFF', border: '#E2E8F0', text: '#0D1B2E', muted: '#64748B', chip: '#F1F5F9', chipActive: '#0D1B2E', chipActiveText: '#FFFFFF', input: '#FFFFFF' };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('employee_forms')
        .select('id,title,form_type,form_data,workflow_status,pdf_url,pdf_storage_path,submitted_at,created_at,employee_id,template_id,employees:employee_id(full_name,branch_id),form_templates:template_id(name,category,schema)')
        .neq('workflow_status', 'draft')
        .order('created_at', { ascending: false })
        .limit(300);
      if (cancelled) return;
      if (error) {
        console.error('[PortalFormsTab] load failed', error);
        setRows([]);
      } else {
        setRows((data as any) || []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const templates = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of rows) {
      if (r.template_id && r.form_templates?.name) {
        set.set(r.template_id, r.form_templates.name);
      }
    }
    return Array.from(set.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'all' && r.workflow_status !== status) return false;
      if (template !== 'all' && r.template_id !== template) return false;
      if (!q) return true;
      const name = r.employees?.full_name || '';
      const tpl = r.form_templates?.name || '';
      const title = r.title || '';
      return name.toLowerCase().includes(q) || tpl.toLowerCase().includes(q) || title.toLowerCase().includes(q);
    });
  }, [rows, search, status, template]);

  const openPdf = async (r: FormRow) => {
    try {
      const url = await getFreshFormPdfUrl(r.pdf_storage_path, r.pdf_url);
      if (url) window.open(url, '_blank');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ padding: 16, fontFamily: 'Cairo', color: colors.text, minHeight: '100vh', background: colors.bg }} dir="rtl">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: dark ? '#1e1e1e' : '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FileText size={20} color={dark ? '#F1F5F9' : '#0D1B2E'} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>النماذج المُسندة</div>
          <div style={{ fontSize: 12, color: colors.muted }}>عرض واطّلاع على كل النماذج التي عبّأها الموظفون</div>
        </div>
      </div>

      {/* Search + filters */}
      <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 14, padding: 12, marginBottom: 12 }}>
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={16} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: colors.muted }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم الموظف، النموذج، أو العنوان..."
            style={{ width: '100%', padding: '10px 34px 10px 10px', borderRadius: 10, border: `1px solid ${colors.border}`, background: colors.input, color: colors.text, fontFamily: 'Cairo', fontSize: 13 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              style={{
                padding: '6px 12px', borderRadius: 999, fontSize: 12, fontFamily: 'Cairo', cursor: 'pointer',
                background: status === s.value ? colors.chipActive : colors.chip,
                color: status === s.value ? colors.chipActiveText : colors.muted,
                border: `1px solid ${colors.border}`,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        {templates.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => setTemplate('all')}
              style={{
                padding: '5px 10px', borderRadius: 999, fontSize: 11, fontFamily: 'Cairo', cursor: 'pointer',
                background: template === 'all' ? colors.chipActive : colors.chip,
                color: template === 'all' ? colors.chipActiveText : colors.muted,
                border: `1px solid ${colors.border}`,
              }}
            >
              كل النماذج
            </button>
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                style={{
                  padding: '5px 10px', borderRadius: 999, fontSize: 11, fontFamily: 'Cairo', cursor: 'pointer',
                  background: template === t.id ? colors.chipActive : colors.chip,
                  color: template === t.id ? colors.chipActiveText : colors.muted,
                  border: `1px solid ${colors.border}`,
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: colors.muted }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', display: 'inline-block', verticalAlign: 'middle', marginLeft: 8 }} />
          جاري التحميل...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: colors.muted, background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 14 }}>
          لا يوجد نماذج مطابقة.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((r) => {
            const isOpen = expanded === r.id;
            return (
              <div key={r.id} style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden' }}>
                <button
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  style={{ width: '100%', textAlign: 'right', padding: 12, background: 'transparent', border: 'none', cursor: 'pointer', color: colors.text, fontFamily: 'Cairo' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                        {r.form_templates?.name || r.title || r.form_type || 'نموذج'}
                      </div>
                      <div style={{ fontSize: 11, color: colors.muted, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span>👤 {r.employees?.full_name || '—'}</span>
                        <span>📅 {new Date(r.submitted_at || r.created_at).toLocaleDateString('ar-PS')}</span>
                      </div>
                    </div>
                    <FormStatusBadge status={r.workflow_status as any} />
                    {isOpen ? <ChevronUp size={16} color={colors.muted} /> : <ChevronDown size={16} color={colors.muted} />}
                  </div>
                </button>
                {isOpen && (
                  <div style={{ borderTop: `1px solid ${colors.border}`, padding: 12, background: dark ? '#0f0f0f' : '#F8FAFC' }}>
                    {(r.pdf_url || r.pdf_storage_path) && (
                      <button
                        onClick={() => openPdf(r)}
                        style={{ marginBottom: 10, padding: '6px 12px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.card, color: colors.text, cursor: 'pointer', fontFamily: 'Cairo', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <ExternalLink size={13} /> عرض PDF
                      </button>
                    )}
                    {r.form_templates?.schema ? (
                      <DynamicTemplateView schema={r.form_templates.schema as any} data={r.form_data} />
                    ) : (
                      <pre style={{ fontSize: 11, color: colors.muted, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {JSON.stringify(r.form_data, null, 2)}
                      </pre>
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