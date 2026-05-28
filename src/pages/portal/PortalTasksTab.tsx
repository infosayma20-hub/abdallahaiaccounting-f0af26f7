import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Crown, CheckCircle2, Clock, AlertTriangle, Search, X, Eye, Pencil, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const PRIMARY = '#1B3A5C';
const ACCENT = '#2A7B9B';

const PRIORITY_OPTIONS = [
  { value: 'urgent_important', label: 'مهم ومستعجل', color: '#E24B4A' },
  { value: 'important', label: 'مهم', color: '#378ADD' },
  { value: 'urgent', label: 'مستعجل', color: '#EF9F27' },
  { value: 'normal', label: 'عادي', color: '#888780' },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: 'مفتوحة', color: '#EF9F27' },
  in_progress: { label: 'قيد الإنجاز', color: '#378ADD' },
  done: { label: 'منجزة', color: '#22C55E' },
  cancelled: { label: 'ملغاة', color: '#888' },
};

interface Props {
  theme: 'dark' | 'light';
}

export default function PortalTasksTab({ theme }: Props) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [taskUsers, setTaskUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('all');
  const [linkedUserId, setLinkedUserId] = useState<string | null>(null);
  const [adminName, setAdminName] = useState('المدير');

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('urgent_important');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // View/Edit state
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState('normal');
  const [editAssignedTo, setEditAssignedTo] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editStatus, setEditStatus] = useState('open');
  const [editSaving, setEditSaving] = useState(false);

  const isDark = theme === 'dark';
  const t = isDark
    ? { card: '#161B22', text: '#E6EDF3', textMuted: 'rgba(230,237,243,0.6)', border: 'rgba(230,237,243,0.08)', inputBg: '#0D1117' }
    : { card: '#FFFFFF', text: '#1B3A5C', textMuted: 'rgba(27,58,92,0.6)', border: 'rgba(27,58,92,0.1)', inputBg: '#F8F9FA' };

  const fetchData = useCallback(async () => {
    try {
      // Get linked user ID from portal settings
      const { data: settingsData } = await supabase.functions.invoke('malaki-data', {
        body: { action: 'get_settings' },
      });
      const settings = settingsData?.settings;
      const ownerId = settings?.linked_user_id;
      if (!ownerId) { setLoading(false); return; }
      setLinkedUserId(ownerId);
      if (settings?.company_name) setAdminName(settings.company_name);

      // Fetch ALL tasks for this owner (both portal-created and employee-created)
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', ownerId)
        .order('created_at', { ascending: false });

      // Fetch company employees for this owner
      const { data: emps } = await supabase
        .from('employees')
        .select('id, full_name, email')
        .eq('user_id', ownerId)
        .eq('is_active', true);

      // Fetch existing task_users to map employee assignments
      const { data: tusers } = await supabase
        .from('task_users')
        .select('id, full_name')
        .eq('user_id', ownerId)
        .eq('is_active', true);

      // Build employee list with their task_user_id if exists
      const empList = (emps || []).map((emp: any) => {
        const matched = (tusers || []).find((tu: any) =>
          tu.full_name?.trim() === emp.full_name?.trim()
        );
        return { employee_id: emp.id, full_name: emp.full_name, email: emp.email, task_user_id: matched?.id || null };
      });

      setTasks(tasksData || []);
      setEmployees(empList);
      setTaskUsers(tusers || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription
  useEffect(() => {
    if (!linkedUserId) return;
    const channel = supabase
      .channel(`portal-tasks-${linkedUserId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `user_id=eq.${linkedUserId}`,
      }, () => {
        fetchData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [linkedUserId, fetchData]);

  // Resolve or create task_user for an employee
  const resolveTaskUserId = async (employeeId: string): Promise<string | null> => {
    if (!employeeId || !linkedUserId) return null;
    const emp = employees.find(e => e.employee_id === employeeId);
    if (!emp) return null;
    if (emp.task_user_id) return emp.task_user_id;

    // Auto-create task_user for this employee
    const colors = ['#E24B4A','#378ADD','#EF9F27','#22C55E','#7C3AED','#0891B2'];
    const { data, error } = await supabase.from('task_users').insert({
      full_name: emp.full_name,
      user_id: linkedUserId,
      password_hash: 'portal-managed',
      avatar_color: colors[Math.floor(Math.random() * colors.length)],
      role: 'employee',
      is_active: true,
    } as any).select('id').single();
    if (error || !data) return null;
    return data.id;
  };

  const handleSubmit = async () => {
    if (!title.trim() || !linkedUserId) return;
    setSubmitting(true);
    try {
      let taskUserId: string | null = null;
      if (assignedTo) {
        taskUserId = await resolveTaskUserId(assignedTo);
      }

      const { error } = await supabase.from('tasks').insert({
        user_id: linkedUserId,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        status: 'open',
        category: category || null,
        due_date: dueDate || null,
        assigned_to: taskUserId,
        assigned_at: taskUserId ? new Date().toISOString() : null,
        created_by_portal: true,
        assigned_by_name: adminName,
        is_visible_to_all: true,
      } as any);

      if (error) throw error;
      toast({ title: 'تم إسناد المهمة بنجاح ✅' });
      setShowForm(false);
      setTitle(''); setDescription(''); setPriority('urgent_important'); setAssignedTo(''); setDueDate(''); setCategory('');
      fetchData();
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const openTaskDetail = (task: any, edit = false) => {
    setSelectedTask(task);
    setEditTitle(task.title || '');
    setEditDescription(task.description || '');
    setEditPriority(task.priority || 'normal');
    const matchedEmp = employees.find(e => e.task_user_id === task.assigned_to);
    setEditAssignedTo(matchedEmp?.employee_id || '');
    setEditDueDate(task.due_date || '');
    setEditCategory(task.category || '');
    setEditStatus(task.status || 'open');
    setEditMode(edit);
  };

  const handleUpdateTask = async () => {
    if (!selectedTask || !linkedUserId) return;
    setEditSaving(true);
    try {
      let taskUserId: string | null = null;
      if (editAssignedTo) {
        taskUserId = await resolveTaskUserId(editAssignedTo);
      }
      const { error } = await supabase.from('tasks').update({
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        priority: editPriority,
        assigned_to: taskUserId,
        assigned_at: taskUserId ? new Date().toISOString() : null,
        due_date: editDueDate || null,
        category: editCategory || null,
        status: editStatus,
      }).eq('id', selectedTask.id).eq('user_id', linkedUserId);
      if (error) throw error;
      toast({ title: 'تم تحديث المهمة ✅' });
      setSelectedTask(null);
      fetchData();
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!linkedUserId || !confirm('هل تريد حذف هذه المهمة نهائياً؟')) return;
    try {
      await supabase.from('tasks').delete().eq('id', taskId).eq('user_id', linkedUserId);
      toast({ title: 'تم حذف المهمة' });
      setSelectedTask(null);
      fetchData();
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    }
  };

    const filtered = tasks.filter(task => {
    if (filter === 'done') return task.status === 'done';
    if (filter === 'open') return task.status === 'open' || task.status === 'in_progress';
    if (filter === 'overdue') {
      const today = new Date().toISOString().split('T')[0];
      return task.due_date && task.due_date < today && task.status !== 'done' && task.status !== 'cancelled';
    }
    return true;
  });

  const getEmployeeName = (id: string) => {
    const tu = taskUsers.find((u: any) => u.id === id);
    if (tu) return tu.full_name;
    const emp = employees.find(e => e.task_user_id === id);
    if (emp) return emp.full_name;
    return '—';
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <div style={{ width: 24, height: 24, border: '2px solid transparent', borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Crown size={18} style={{ color: ACCENT }} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>المهام المسندة</span>
          <span style={{ fontSize: 11, color: t.textMuted, background: t.inputBg, borderRadius: 12, padding: '2px 8px' }}>
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{
            background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8,
            padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Tajawal, sans-serif',
          }}
        >
          <Plus size={14} /> إسناد مهمة جديدة
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 0,
        }} onClick={() => setShowForm(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: t.card, borderRadius: '16px 16px 0 0', padding: '20px 16px', width: '100%', maxWidth: 520,
              border: `1px solid ${t.border}`, borderBottom: 'none', color: t.text,
              fontFamily: 'Tajawal, sans-serif', direction: 'rtl',
              maxHeight: '90vh', overflowY: 'auto',
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
              <Crown size={16} style={{ color: ACCENT }} /> إسناد مهمة جديدة
            </h3>

            <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>عنوان المهمة *</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="أدخل عنوان المهمة..."
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${t.border}`,
                background: t.inputBg, color: t.text, fontSize: 14, marginBottom: 12,
                fontFamily: 'Tajawal, sans-serif', direction: 'rtl', boxSizing: 'border-box',
              }}
            />

            <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>الوصف / التفاصيل</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="تفاصيل إضافية..."
              rows={3}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${t.border}`,
                background: t.inputBg, color: t.text, fontSize: 14, marginBottom: 12,
                fontFamily: 'Tajawal, sans-serif', direction: 'rtl', resize: 'vertical', boxSizing: 'border-box',
              }}
            />

            {/* Priority */}
            <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>الأولوية *</label>
            <select
              value={priority} onChange={e => setPriority(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${t.border}`,
                background: t.inputBg, color: t.text, fontSize: 14, fontFamily: 'Tajawal, sans-serif',
                marginBottom: 12, boxSizing: 'border-box',
              }}
            >
              {PRIORITY_OPTIONS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>

            {/* Employee */}
            <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>الموظف <span style={{ fontSize: 10, color: '#999', fontWeight: 400 }}>(اختياري)</span></label>
            <select
              value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${t.border}`,
                background: t.inputBg, color: t.text, fontSize: 14, fontFamily: 'Tajawal, sans-serif',
                marginBottom: 12, boxSizing: 'border-box',
              }}
            >
              <option value="">اختر موظف...</option>
              {employees.map(emp => (
                <option key={emp.employee_id} value={emp.employee_id}>{emp.full_name}</option>
              ))}
            </select>

            {/* Date + Category */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>تاريخ الاستحقاق</label>
                <input
                  type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 8px', borderRadius: 8, border: `1px solid ${t.border}`,
                    background: t.inputBg, color: t.text, fontSize: 13, fontFamily: 'Tajawal, sans-serif',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>الفئة</label>
                <select
                  value={category} onChange={e => setCategory(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 8px', borderRadius: 8, border: `1px solid ${t.border}`,
                    background: t.inputBg, color: t.text, fontSize: 13, fontFamily: 'Tajawal, sans-serif',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">بدون فئة</option>
                  {["كرستا ونواقص", "ضريبية", "محاسبية", "تدقيق", "إدارية", "ورشة", "أخرى"].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleSubmit}
                disabled={submitting || !title.trim()}
                style={{
                  flex: 1, background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8,
                  padding: '12px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  opacity: submitting || !title.trim() ? 0.5 : 1,
                  fontFamily: 'Tajawal, sans-serif',
                }}
              >
                {submitting ? 'جاري الإسناد...' : 'إسناد المهمة'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                style={{
                  flex: 1, background: 'transparent', color: t.textMuted, border: `1px solid ${t.border}`,
                  borderRadius: 8, padding: '12px 20px', fontSize: 14, cursor: 'pointer',
                  fontFamily: 'Tajawal, sans-serif',
                }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: 'الكل' },
          { key: 'open', label: 'مفتوحة' },
          { key: 'done', label: 'منجزة' },
          { key: 'overdue', label: 'متأخرة' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '4px 14px', borderRadius: 16, fontSize: 11, fontWeight: 600,
              border: `1px solid ${filter === f.key ? ACCENT : t.border}`,
              background: filter === f.key ? `${ACCENT}15` : 'transparent',
              color: filter === f.key ? ACCENT : t.textMuted,
              cursor: 'pointer', fontFamily: 'Tajawal, sans-serif',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Tasks Cards */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 40, color: t.textMuted, fontSize: 13,
          background: t.card, borderRadius: 12, border: `1px solid ${t.border}`,
        }}>
          لا توجد مهام مسندة
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((task, i) => {
            const prio = PRIORITY_OPTIONS.find(p => p.value === task.priority);
            const status = STATUS_LABELS[task.status] || STATUS_LABELS.open;
            const today = new Date().toISOString().split('T')[0];
            const isOverdue = task.due_date && task.due_date < today && task.status !== 'done' && task.status !== 'cancelled';
            return (
              <div key={task.id} style={{
                background: t.card, borderRadius: 12, padding: 14,
                border: `1px solid ${t.border}`, borderRight: `4px solid ${prio?.color || '#888'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, flex: 1, wordBreak: 'break-word' as const }}>{task.title}</div>
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0, marginRight: 8 }}>
                    <button onClick={() => openTaskDetail(task, false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ACCENT, padding: 4 }}><Eye size={16} /></button>
                    <button onClick={() => openTaskDetail(task, true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF9F27', padding: 4 }}><Pencil size={16} /></button>
                    <button onClick={() => handleDeleteTask(task.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#E24B4A', padding: 4 }}><Trash2 size={16} /></button>
                  </div>
                </div>
                {task.description && (
                  <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 8, lineHeight: 1.6, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const }}>
                    {task.description}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, alignItems: 'center', fontSize: 10 }}>
                  <span style={{ fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: `${status.color}15`, color: status.color, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    {task.status === 'done' && <CheckCircle2 size={10} />}{status.label}
                  </span>
                  <span style={{ fontWeight: 600, color: prio?.color, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: prio?.color }} />{prio?.label}
                  </span>
                  {task.category === 'كرستا ونواقص' && (
                    <span style={{ padding: '2px 8px', borderRadius: 12, background: '#7C3AED15', color: '#7C3AED', fontWeight: 600 }}>
                      🔧 كرستا ونواقص
                    </span>
                  )}
                  {task.category === 'ورشة' && (
                    <span style={{ padding: '2px 8px', borderRadius: 12, background: '#0891B215', color: '#0891B2', fontWeight: 600 }}>
                      🏭 ورشة
                    </span>
                  )}
                  {task.category && !['كرستا ونواقص', 'ورشة'].includes(task.category) && (
                    <span style={{ padding: '2px 8px', borderRadius: 12, background: `${t.inputBg}`, color: t.textMuted, fontWeight: 600 }}>
                      {task.category}
                    </span>
                  )}
                  <span style={{ padding: '2px 8px', borderRadius: 12, background: task.created_by_portal ? `${PRIMARY}15` : `${ACCENT}15`, color: task.created_by_portal ? PRIMARY : ACCENT, fontWeight: 600 }}>
                    {task.created_by_portal ? '👑 المدير' : '👤 موظف'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: t.textMuted }}>
                  <span>👤 {getEmployeeName(task.assigned_to)}</span>
                  {task.due_date && (
                    <span style={{ color: isOverdue ? '#E24B4A' : t.textMuted }}>
                      📅 {task.due_date}{isOverdue && ' ⚠️'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* View/Edit Modal */}
      {selectedTask && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 0,
        }} onClick={() => setSelectedTask(null)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: t.card, borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 520,
              padding: '20px 16px', direction: 'rtl', fontFamily: 'Tajawal, sans-serif',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.2)', color: t.text,
              maxHeight: '90vh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                {editMode ? <><Pencil size={16} style={{ color: '#EF9F27' }} /> تعديل المهمة</> : <><Eye size={16} style={{ color: ACCENT }} /> تفاصيل المهمة</>}
              </h3>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {!editMode && (
                  <button onClick={() => setEditMode(true)} style={{ background: `${ACCENT}15`, color: ACCENT, border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                    <Pencil size={12} /> تعديل
                  </button>
                )}
                <button onClick={() => setSelectedTask(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, padding: 4 }}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {editMode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>عنوان المهمة *</label>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text, fontSize: 13, fontFamily: 'Tajawal, sans-serif', direction: 'rtl' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>الوصف</label>
                  <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text, fontSize: 13, fontFamily: 'Tajawal, sans-serif', direction: 'rtl', resize: 'vertical' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>الحالة</label>
                    <select value={editStatus} onChange={e => setEditStatus(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text, fontSize: 13, fontFamily: 'Tajawal, sans-serif' }}>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>الأولوية</label>
                    <select value={editPriority} onChange={e => setEditPriority(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text, fontSize: 13, fontFamily: 'Tajawal, sans-serif' }}>
                      {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>الموظف</label>
                    <select value={editAssignedTo} onChange={e => setEditAssignedTo(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text, fontSize: 13, fontFamily: 'Tajawal, sans-serif' }}>
                      <option value="">بدون تعيين</option>
                      {employees.map(emp => <option key={emp.employee_id} value={emp.employee_id}>{emp.full_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>تاريخ الاستحقاق</label>
                    <input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text, fontSize: 13, fontFamily: 'Tajawal, sans-serif' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start', marginTop: 8 }}>
                  <button onClick={handleUpdateTask} disabled={editSaving || !editTitle.trim()} style={{ background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: editSaving || !editTitle.trim() ? 0.5 : 1, fontFamily: 'Tajawal, sans-serif' }}>
                    {editSaving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                  </button>
                  <button onClick={() => setEditMode(false)} style={{ background: 'transparent', color: t.textMuted, border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 20px', fontSize: 13, cursor: 'pointer', fontFamily: 'Tajawal, sans-serif' }}>
                    إلغاء
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{selectedTask.title}</div>
                {selectedTask.description && (
                  <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.8, background: t.inputBg, padding: 12, borderRadius: 8 }}>
                    {selectedTask.description}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                  <div><span style={{ color: t.textMuted }}>الحالة:</span> <span style={{ fontWeight: 600, color: STATUS_LABELS[selectedTask.status]?.color }}>{STATUS_LABELS[selectedTask.status]?.label || selectedTask.status}</span></div>
                  <div><span style={{ color: t.textMuted }}>الأولوية:</span> <span style={{ fontWeight: 600, color: PRIORITY_OPTIONS.find(p => p.value === selectedTask.priority)?.color }}>{PRIORITY_OPTIONS.find(p => p.value === selectedTask.priority)?.label || 'عادي'}</span></div>
                  <div><span style={{ color: t.textMuted }}>الموظف:</span> <span style={{ fontWeight: 600 }}>{getEmployeeName(selectedTask.assigned_to)}</span></div>
                  <div><span style={{ color: t.textMuted }}>الاستحقاق:</span> <span style={{ fontWeight: 600 }}>{selectedTask.due_date || '—'}</span></div>
                  <div><span style={{ color: t.textMuted }}>المصدر:</span> <span style={{ fontWeight: 600 }}>{selectedTask.created_by_portal ? '👑 المدير' : '👤 موظف'}</span></div>
                  <div><span style={{ color: t.textMuted }}>تاريخ الإنشاء:</span> <span style={{ fontWeight: 600 }}>{selectedTask.created_at?.split('T')[0]}</span></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
