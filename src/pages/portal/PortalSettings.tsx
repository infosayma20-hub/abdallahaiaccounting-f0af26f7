import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRight, Plus, Trash2, KeyRound, Loader2, Save } from 'lucide-react';

const GOLD = '#D4A017';

interface PortalUser {
  id: string;
  username: string;
  full_name: string;
  role: string;
  last_login: string | null;
  is_active: boolean;
}

export default function PortalSettings() {
  const { user, loading: authLoading } = usePortalAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rateJod, setRateJod] = useState('3.55');
  const [rateUsd, setRateUsd] = useState('3.65');
  const [linkedUserId, setLinkedUserId] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', full_name: '', role: 'viewer', email: '' });
  const [createdCredentials, setCreatedCredentials] = useState<{ username: string; password: string; full_name: string; role: string; email: string } | null>(null);
  const [settingsId, setSettingsId] = useState('');

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'owner')) {
      navigate('/portal/dashboard', { replace: true });
    }
  }, [authLoading, user, navigate]);

  useEffect(() => { if (user) loadData(); }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, settingsRes] = await Promise.all([
        supabase.functions.invoke('malaki-auth', { body: { action: 'list_users', user_id: user?.user_id } }),
        supabase.functions.invoke('malaki-data', { body: { action: 'get_settings' } }),
      ]);
      if (usersRes.data?.users) setUsers(usersRes.data.users);
      if (settingsRes.data?.settings) {
        const s = settingsRes.data.settings;
        setSettingsId(s.id);
        setRateJod(String(s.exchange_rate_jod || 3.55));
        setRateUsd(String(s.exchange_rate_usd || 3.65));
        setLinkedUserId(s.linked_user_id || '');
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await supabase.functions.invoke('malaki-data', {
        body: {
          action: 'update_settings',
          updates: {
            exchange_rate_jod: parseFloat(rateJod) || 3.55,
            exchange_rate_usd: parseFloat(rateUsd) || 3.65,
            linked_user_id: linkedUserId || null,
            rates_updated_by: user?.full_name,
            rates_updated_at: new Date().toISOString(),
          },
        },
      });
      alert('تم حفظ الإعدادات');
    } catch { alert('خطأ في الحفظ'); }
    finally { setSaving(false); }
  };

  const createUser = async () => {
    if (!newUser.username || !newUser.password || !newUser.full_name) return;
    try {
      const { data } = await supabase.functions.invoke('malaki-auth', {
        body: { action: 'create_user', ...newUser, user_id: user?.user_id },
      });
      if (data?.success) {
        setCreatedCredentials({ ...newUser });
        setNewUser({ username: '', password: '', full_name: '', role: 'viewer', email: '' });
        loadData();
      } else { alert(data?.error || 'خطأ'); }
    } catch { alert('خطأ في الإنشاء'); }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('هل تريد حذف هذا المستخدم؟')) return;
    await supabase.functions.invoke('malaki-auth', { body: { action: 'delete_user', user_id: userId } });
    loadData();
  };

  const resetPassword = async (userId: string) => {
    const newPass = prompt('كلمة المرور الجديدة:');
    if (!newPass) return;
    await supabase.functions.invoke('malaki-auth', {
      body: { action: 'reset_password', user_id: userId, new_password: newPass },
    });
    alert('تم تغيير كلمة المرور');
  };

  if (authLoading || loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#F5F5F5', color: '#333',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Loader2 size={32} className="animate-spin" style={{ color: GOLD }} />
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 44,
    background: '#fff',
    border: '1px solid #ddd',
    borderRadius: 10, padding: '0 14px',
    color: '#333', fontSize: 14,
    fontFamily: 'Tajawal, sans-serif', outline: 'none',
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#F5F5F5', color: '#333',
      fontFamily: 'Tajawal, sans-serif', direction: 'rtl',
    }}>
      {/* Header */}
      <div style={{
        height: 56, background: '#fff',
        borderBottom: '1px solid #e0e0e0',
        padding: '0 20px', display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        <button onClick={() => navigate('/portal/dashboard')} style={{
          background: 'none', border: 'none', color: GOLD, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4, fontSize: 14,
          fontFamily: 'Tajawal, sans-serif',
        }}>
          <ArrowRight size={18} /> رجوع
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>⚙️ إعدادات بوابة الإدارة</span>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
        {/* Link account */}
        <div style={{
          background: '#fff', borderRadius: 14, padding: 20,
          border: '1px solid #e0c97a', marginBottom: 20,
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginBottom: 12 }}>🔗 ربط حساب AMWALI</div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
            أدخل معرف المستخدم (User ID) لحساب AMWALI الذي ترغب في عرض بياناته
          </div>
          <input value={linkedUserId} onChange={e => setLinkedUserId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            style={{ ...inputStyle, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
          />
        </div>

        {/* Exchange rates */}
        <div style={{
          background: '#fff', borderRadius: 14, padding: 20,
          border: '1px solid #e8e8e8', marginBottom: 20,
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', marginBottom: 12 }}>💱 أسعار الصرف</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: '#888', marginBottom: 4, display: 'block' }}>
                🇯🇴 سعر الدينار (بالشيكل)
              </label>
              <input value={rateJod} onChange={e => setRateJod(e.target.value)} type="number" step="0.01" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#888', marginBottom: 4, display: 'block' }}>
                🇺🇸 سعر الدولار (بالشيكل)
              </label>
              <input value={rateUsd} onChange={e => setRateUsd(e.target.value)} type="number" step="0.01" style={inputStyle} />
            </div>
          </div>
        </div>

        <button onClick={saveSettings} disabled={saving} style={{
          width: '100%', height: 48,
          background: `linear-gradient(135deg, ${GOLD}, #8B5E00)`,
          borderRadius: 12, border: 'none', color: 'white',
          fontSize: 15, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'Tajawal, sans-serif',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginBottom: 24,
        }}>
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          حفظ الإعدادات
        </button>

        {/* User management */}
        <div style={{
          background: '#fff', borderRadius: 14, padding: 20,
          border: '1px solid #e8e8e8',
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>👥 إدارة المستخدمين</div>
            <button onClick={() => setShowAddUser(true)} style={{
              background: 'rgba(212,160,23,0.12)', border: '1px solid rgba(212,160,23,0.3)',
              borderRadius: 8, padding: '6px 14px', color: GOLD, fontSize: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Tajawal, sans-serif',
            }}>
              <Plus size={14} /> إضافة مستخدم
            </button>
          </div>

          {showAddUser && (
            <div style={{
              background: '#fafafa', borderRadius: 10,
              padding: 16, marginBottom: 16, border: '1px solid #e0c97a',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <input value={newUser.full_name} onChange={e => setNewUser({ ...newUser, full_name: e.target.value })}
                  placeholder="الاسم الكامل" style={inputStyle} />
                <input value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="البريد الإلكتروني" type="email" dir="ltr" style={{ ...inputStyle, textAlign: 'left' }} />
                <input value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                  placeholder="اسم المستخدم" style={inputStyle} />
                <input value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="كلمة المرور" type="password" style={inputStyle} />
                <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                  style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="viewer">مشاهد</option>
                  <option value="manager">مدير</option>
                  <option value="owner">مالك</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={createUser} style={{
                  padding: '8px 20px', borderRadius: 8, background: GOLD,
                  border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13,
                }}>إنشاء</button>
                <button onClick={() => setShowAddUser(false)} style={{
                  padding: '8px 20px', borderRadius: 8, background: '#eee',
                  border: 'none', color: '#666', cursor: 'pointer', fontSize: 13,
                }}>إلغاء</button>
              </div>
            </div>
          )}

          {createdCredentials && (
            <div style={{
              background: '#f0fdf4', borderRadius: 12,
              padding: 18, marginBottom: 16,
              border: '1px solid #86efac',
              position: 'relative',
            }}>
              <button onClick={() => setCreatedCredentials(null)} style={{
                position: 'absolute', top: 8, left: 8, background: 'none', border: 'none',
                color: '#999', cursor: 'pointer', fontSize: 18, lineHeight: 1,
              }}>✕</button>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a', marginBottom: 12 }}>
                ✅ تم إنشاء الحساب بنجاح — احفظ هذه البيانات
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {[
                    { label: 'الاسم الكامل', value: createdCredentials.full_name },
                    { label: 'البريد الإلكتروني', value: createdCredentials.email || '—', mono: true },
                    { label: 'اسم المستخدم', value: createdCredentials.username, mono: true },
                    { label: 'كلمة المرور', value: createdCredentials.password, mono: true },
                    { label: 'الدور', value: createdCredentials.role === 'owner' ? 'مالك' : createdCredentials.role === 'manager' ? 'مدير' : 'مشاهد' },
                  ].map(row => (
                    <tr key={row.label} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '8px 12px', fontSize: 12, color: '#888', width: 120 }}>{row.label}</td>
                      <td style={{
                        padding: '8px 12px', fontSize: 14, fontWeight: 600,
                        fontFamily: row.mono ? 'JetBrains Mono, monospace' : 'Tajawal, sans-serif',
                        color: '#1a1a1a', letterSpacing: row.mono ? 1 : 0,
                        userSelect: 'all',
                      }}>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 10, fontSize: 11, color: '#aaa' }}>
                💡 انسخ هذه البيانات الآن — لن تظهر كلمة المرور مرة أخرى
              </div>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e8e8e8', background: '#fafafa' }}>
                  {['المستخدم', 'الاسم', 'الدور', 'آخر دخول', 'نشط', 'إجراءات'].map(h => (
                    <th key={h} style={{
                      padding: '10px 12px', fontSize: 11,
                      color: '#888', fontWeight: 600, textAlign: 'right',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: '#333' }}>{u.username}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: '#333' }}>{u.full_name}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        padding: '2px 10px', borderRadius: 10, fontSize: 11,
                        background: u.role === 'owner' ? 'rgba(212,160,23,0.15)' : '#f0f0f0',
                        color: u.role === 'owner' ? GOLD : '#666',
                      }}>
                        {u.role === 'owner' ? 'مالك' : u.role === 'manager' ? 'مدير' : 'مشاهد'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 11, color: '#999', fontFamily: 'JetBrains Mono, monospace' }}>
                      {u.last_login ? new Date(u.last_login).toLocaleDateString('ar') : '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ color: u.is_active ? '#22C55E' : '#EF4444' }}>
                        {u.is_active ? '🟢' : '🔴'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => resetPassword(u.id)} title="إعادة تعيين كلمة المرور" style={{
                          background: '#f0f0f0', border: 'none',
                          borderRadius: 6, padding: 6, cursor: 'pointer', color: '#666',
                        }}><KeyRound size={14} /></button>
                        <button onClick={() => deleteUser(u.id)} title="حذف" style={{
                          background: '#fef2f2', border: 'none',
                          borderRadius: 6, padding: 6, cursor: 'pointer', color: '#EF4444',
                        }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style>{`
        select option { background: #fff; color: #333; }
        input:focus { border-color: #D4A017 !important; box-shadow: 0 0 0 3px rgba(212,160,23,0.15) !important; }
      `}</style>
    </div>
  );
}
