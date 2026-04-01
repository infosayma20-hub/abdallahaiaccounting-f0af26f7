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

      // Fetch task_users for this owner (employees in task system)
      const { data: tusers } = await supabase
        .from('task_users')
        .select('*')
        .eq('user_id', ownerId)
        .eq('is_active', true);

      // Fetch employees for this owner
      const { data: emps } = await supabase
        .from('employees')
        .select('id, full_name, department, job_title')
        .eq('user_id', ownerId)
        .eq('is_active', true)
        .order('full_name');

      // Merge: use employees as primary, fallback to task_users
      const empList = (emps || []).map(e => ({ id: e.id, full_name: e.full_name, source: 'employee' }));
      const tuserList = (tusers || []).filter(t => !empList.some(e => e.full_name === t.full_name)).map(t => ({ id: t.id, full_name: t.full_name, source: 'task_user' }));
      const merged = [...empList, ...tuserList];

      setTasks(tasksData || []);
      setTaskUsers(merged);
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
      .channel('portal-tasks')
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

  const handleSubmit = async () => {
    if (!title.trim() || !linkedUserId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('tasks').insert({
        user_id: linkedUserId,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        status: 'open',
        category: category || null,
        due_date: dueDate || null,
        assigned_to: assignedTo || null,
        assigned_at: assignedTo ? new Date().toISOString() : null,
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
    setEditAssignedTo(task.assigned_to || '');
    setEditDueDate(task.due_date || '');
    setEditCategory(task.category || '');
    setEditStatus(task.status || 'open');
    setEditMode(edit);
  };

  const handleUpdateTask = async () => {
    if (!selectedTask || !linkedUserId) return;
    setEditSaving(true);
    try {
      const { error } = await supabase.from('tasks').update({
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        priority: editPriority,
        assigned_to: editAssignedTo || null,
        assigned_at: editAssignedTo ? new Date().toISOString() : null,
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

    if (filter === 'all') return true;
    if (filter === 'done') return task.status === 'done';
    if (filter === 'open') return task.status === 'open' || task.status === 'in_progress';
    if (filter === 'overdue') {
      const today = new Date().toISOString().split('T')[0];
      return task.due_date && task.due_date < today && task.status !== 'done' && task.status !== 'cancelled';
    }
    return true;
  });

  const getEmployeeName = (id: string) => taskUsers.find(u => u.id === id)?.full_name || '—';

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
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }} onClick={() => setShowForm(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: t.card, borderRadius: 12, padding: 24, width: '100%', maxWidth: 480,
              border: `1px solid ${t.border}`, color: t.text,
              fontFamily: 'Tajawal, sans-serif', direction: 'rtl',
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Crown size={16} style={{ color: ACCENT }} /> إسناد مهمة جديدة
            </h3>

            {/* Title */}
            <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>عنوان المهمة *</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="أدخل عنوان المهمة..."
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${t.border}`,
                background: t.inputBg, color: t.text, fontSize: 13, marginBottom: 12,
                fontFamily: 'Tajawal, sans-serif', direction: 'rtl',
              }}
            />

            {/* Description */}
            <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>الوصف / التفاصيل</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="تفاصيل إضافية..."
              rows={3}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${t.border}`,
                background: t.inputBg, color: t.text, fontSize: 13, marginBottom: 12,
                fontFamily: 'Tajawal, sans-serif', direction: 'rtl', resize: 'vertical',
              }}
            />

            {/* Priority + Assignee */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>الأولوية *</label>
                <select
                  value={priority} onChange={e => setPriority(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${t.border}`,
                    background: t.inputBg, color: t.text, fontSize: 13, fontFamily: 'Tajawal, sans-serif',
                  }}
                >
                  {PRIORITY_OPTIONS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>الموظف <span style={{ fontSize: 10, color: '#999', fontWeight: 400 }}>(اختياري)</span></label>
                <select
                  value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${t.border}`,
                    background: t.inputBg, color: t.text, fontSize: 13, fontFamily: 'Tajawal, sans-serif',
                  }}
                >
                  <option value="">اختر موظف...</option>
                  {taskUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.full_name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Due date + Category */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>تاريخ الاستحقاق</label>
                <input
                  type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${t.border}`,
                    background: t.inputBg, color: t.text, fontSize: 13, fontFamily: 'Tajawal, sans-serif',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>الفئة</label>
                <select
                  value={category} onChange={e => setCategory(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${t.border}`,
                    background: t.inputBg, color: t.text, fontSize: 13, fontFamily: 'Tajawal, sans-serif',
                  }}
                >
                  <option value="">بدون فئة</option>
                  {["ضريبية", "محاسبية", "تدقيق", "إدارية", "ورشة", "أخرى"].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start' }}>
              <button
                onClick={handleSubmit}
                disabled={submitting || !title.trim()}
                style={{
                  background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8,
                  padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  opacity: submitting || !title.trim() ? 0.5 : 1,
                  fontFamily: 'Tajawal, sans-serif',
                }}
              >
                {submitting ? 'جاري الإسناد...' : 'إسناد المهمة'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                style={{
                  background: 'transparent', color: t.textMuted, border: `1px solid ${t.border}`,
                  borderRadius: 8, padding: '8px 20px', fontSize: 13, cursor: 'pointer',
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

      {/* Tasks Table */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 40, color: t.textMuted, fontSize: 13,
          background: t.card, borderRadius: 12, border: `1px solid ${t.border}`,
        }}>
          لا توجد مهام مسندة
        </div>
      ) : (
        <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${t.border}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: isDark ? '#1A2332' : '#F1F5F9' }}>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: t.textMuted, fontSize: 11 }}>#</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: t.textMuted, fontSize: 11 }}>عنوان المهمة</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: t.textMuted, fontSize: 11 }}>الموظف</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: t.textMuted, fontSize: 11 }}>المصدر</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: t.textMuted, fontSize: 11 }}>الأولوية</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: t.textMuted, fontSize: 11 }}>الحالة</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: t.textMuted, fontSize: 11 }}>الاستحقاق</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task, i) => {
                const prio = PRIORITY_OPTIONS.find(p => p.value === task.priority);
                const status = STATUS_LABELS[task.status] || STATUS_LABELS.open;
                const today = new Date().toISOString().split('T')[0];
                const isOverdue = task.due_date && task.due_date < today && task.status !== 'done' && task.status !== 'cancelled';
                return (
                  <tr key={task.id} style={{ borderTop: `1px solid ${t.border}`, background: t.card }}>
                    <td style={{ padding: '10px 12px', color: t.textMuted }}>{i + 1}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{task.title}</td>
                    <td style={{ padding: '10px 12px' }}>{getEmployeeName(task.assigned_to)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                        background: task.created_by_portal ? `${PRIMARY}15` : `${ACCENT}15`,
                        color: task.created_by_portal ? PRIMARY : ACCENT,
                      }}>
                        {task.created_by_portal ? '👑 المدير' : '👤 موظف'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 10, fontWeight: 600, color: prio?.color,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: prio?.color }} />
                        {prio?.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                        background: `${status.color}15`, color: status.color,
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                      }}>
                        {task.status === 'done' && <CheckCircle2 size={10} />}
                        {status.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: isOverdue ? '#E24B4A' : t.textMuted, fontSize: 11 }}>
                      {task.due_date || '—'}
                      {isOverdue && ' ⚠️'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
