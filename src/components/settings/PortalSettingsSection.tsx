import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Trash2, KeyRound, UserPlus, Users, Eye, EyeOff, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface PortalUser {
  id: string;
  username: string;
  email: string | null;
  full_name: string;
  role: string;
  can_see_sales: boolean;
  can_see_liquidity: boolean;
  can_see_all_branches: boolean;
  last_login: string | null;
  is_active: boolean;
  created_at: string;
  user_id: string | null;
}

export default function PortalSettingsSection() {
  const { user } = useAuth();
  const [portalEmail, setPortalEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const [members, setMembers] = useState<PortalUser[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  const [deleteTarget, setDeleteTarget] = useState<PortalUser | null>(null);
  const [resetTarget, setResetTarget] = useState<PortalUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const [newCanSeeSales, setNewCanSeeSales] = useState(true);
  const [newCanSeeLiquidity, setNewCanSeeLiquidity] = useState(true);
  const [newCanSeeAllBranches, setNewCanSeeAllBranches] = useState(true);
  const [newRole, setNewRole] = useState('viewer');

  const fetchMembers = useCallback(async () => {
    if (!user?.id) return;
    setLoadingMembers(true);
    try {
      const { data, error } = await supabase.functions.invoke('malaki-auth', {
        body: { action: 'list_users', user_id: user.id },
      });
      if (error) throw error;
      if (data?.users) setMembers(data.users);
    } catch {
      // silent
    } finally {
      setLoadingMembers(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleCreate = async () => {
    if (!portalEmail.trim() || !password.trim() || !fullName.trim()) {
      toast.error('يرجى ملء جميع الحقول');
      return;
    }
    if (password.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (!portalEmail.includes('@')) {
      toast.error('يرجى إدخال بريد إلكتروني صحيح');
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('malaki-auth', {
        body: {
          action: 'create_user',
          email: portalEmail.trim().toLowerCase(),
          username: portalEmail.trim().toLowerCase(),
          password: password.trim(),
          full_name: fullName.trim(),
          role: newRole,
          can_see_sales: newCanSeeSales,
          can_see_liquidity: newCanSeeLiquidity,
          can_see_all_branches: newCanSeeAllBranches,
          user_id: user?.id,
        },
      });

      if (error) throw error;
      if (data?.success) {
        toast.success('تم إنشاء الحساب بنجاح');
        setPortalEmail(''); setPassword(''); setFullName('');
        setNewRole('viewer'); setNewCanSeeSales(true); setNewCanSeeLiquidity(true); setNewCanSeeAllBranches(true);
        setShowAddForm(false);
        fetchMembers();
      } else if (data?.error?.includes('موجود')) {
        toast.info('البريد الإلكتروني موجود مسبقاً');
      } else {
        throw new Error(data?.error || 'خطأ غير معروف');
      }
    } catch (err: any) {
      toast.error(err.message || 'خطأ في إنشاء الحساب');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase.functions.invoke('malaki-auth', {
        body: { action: 'delete_user', user_id: deleteTarget.id },
      });
      if (error) throw error;
      toast.success('تم حذف العضو بنجاح');
      setDeleteTarget(null);
      fetchMembers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget || newPassword.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    setResetting(true);
    try {
      const { error } = await supabase.functions.invoke('malaki-auth', {
        body: { action: 'reset_password', user_id: resetTarget.id, new_password: newPassword },
      });
      if (error) throw error;
      toast.success('تم تغيير كلمة المرور بنجاح');
      setResetTarget(null);
      setNewPassword('');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setResetting(false);
    }
  };

  const togglePermission = async (member: PortalUser, field: string, value: boolean) => {
    try {
      const { error } = await supabase.functions.invoke('malaki-auth', {
        body: { action: 'update_user', user_id: member.id, [field]: value },
      });
      if (error) throw error;
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, [field]: value } : m));
      toast.success('تم التحديث');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const toggleActive = async (member: PortalUser) => {
    try {
      const { error } = await supabase.functions.invoke('malaki-auth', {
        body: { action: 'update_user', user_id: member.id, is_active: !member.is_active },
      });
      if (error) throw error;
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_active: !member.is_active } : m));
      toast.success(member.is_active ? 'تم تعطيل الحساب' : 'تم تفعيل الحساب');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const ROLE_LABELS: Record<string, string> = {
    owner: 'مالك',
    manager: 'مدير',
    viewer: 'مشاهد',
  };

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">بوابة الإدارة</h3>
        <p className="text-sm text-muted-foreground">
          إدارة أعضاء بوابة المتابعة الإدارية وصلاحياتهم — يسجلون الدخول من صفحة تسجيل الدخول الرئيسية
        </p>
      </div>

      {/* Members List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">أعضاء البوابة ({members.length})</h4>
          </div>
          <Button size="sm" onClick={() => setShowAddForm(true)} className="gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            إضافة عضو
          </Button>
        </div>

        {loadingMembers ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
            لا يوجد أعضاء — أضف أول عضو للبوابة
          </div>
        ) : (
          <div className="space-y-2">
            {members.map(member => (
              <div
                key={member.id}
                className={`border rounded-lg p-4 space-y-3 transition-colors ${member.is_active ? 'border-border bg-card' : 'border-destructive/20 bg-destructive/5 opacity-70'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {member.full_name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-semibold leading-tight">{member.full_name}</p>
                      <p className="text-xs text-muted-foreground font-mono" dir="ltr">{member.email || member.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={member.role === 'owner' ? 'default' : 'secondary'} className="text-[10px]">
                      {ROLE_LABELS[member.role] || member.role}
                    </Badge>
                    {!member.is_active && (
                      <Badge variant="destructive" className="text-[10px]">معطل</Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(['can_see_sales', 'can_see_liquidity', 'can_see_all_branches'] as const).map(field => {
                    const labels = { can_see_sales: 'المبيعات', can_see_liquidity: 'السيولة', can_see_all_branches: 'كل الفروع' };
                    const val = member[field];
                    return (
                      <button
                        key={field}
                        onClick={() => togglePermission(member, field, !val)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium border transition-colors ${
                          val ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-muted/50 border-border text-muted-foreground'
                        }`}
                      >
                        {val ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        {labels[field]}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-border/50">
                  <p className="text-[10px] text-muted-foreground">
                    {member.last_login
                      ? `آخر دخول: ${new Date(member.last_login).toLocaleDateString('ar-PS')}`
                      : 'لم يسجل دخول بعد'}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(member)} className="h-7 px-2 text-xs gap-1" title={member.is_active ? 'تعطيل' : 'تفعيل'}>
                      {member.is_active ? <ToggleRight className="h-3.5 w-3.5 text-primary" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setResetTarget(member); setNewPassword(''); }} className="h-7 px-2 text-xs gap-1">
                      <KeyRound className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(member)} className="h-7 px-2 text-xs text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Member Dialog */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة عضو جديد للبوابة</DialogTitle>
            <DialogDescription>سيتمكن العضو من الدخول للبوابة باستخدام بريده الإلكتروني وكلمة المرور</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">الاسم الكامل</Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="أحمد محمد" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">البريد الإلكتروني</Label>
              <Input type="email" value={portalEmail} onChange={e => setPortalEmail(e.target.value)} placeholder="ahmed@example.com" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">كلمة المرور</Label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="6 أحرف على الأقل" dir="ltr" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">الدور</Label>
              <div className="flex gap-2">
                {(['owner', 'manager', 'viewer'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setNewRole(r)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      newRole === r
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">الصلاحيات</Label>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs">مشاهدة المبيعات</span>
                  <Switch checked={newCanSeeSales} onCheckedChange={setNewCanSeeSales} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs">مشاهدة السيولة</span>
                  <Switch checked={newCanSeeLiquidity} onCheckedChange={setNewCanSeeLiquidity} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs">جميع الفروع</span>
                  <Switch checked={newCanSeeAllBranches} onCheckedChange={setNewCanSeeAllBranches} />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowAddForm(false)}>إلغاء</Button>
            <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {creating ? 'جاري الإنشاء...' : 'إنشاء'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>حذف عضو</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف <strong>{deleteTarget?.full_name}</strong>؟ لا يمكن التراجع عن هذا الإجراء.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete}>حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetTarget} onOpenChange={() => setResetTarget(null)}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>إعادة تعيين كلمة المرور</DialogTitle>
            <DialogDescription>
              تعيين كلمة مرور جديدة لـ <strong>{resetTarget?.full_name}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">كلمة المرور الجديدة</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="6 أحرف على الأقل"
              dir="ltr"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setResetTarget(null)}>إلغاء</Button>
            <Button onClick={handleResetPassword} disabled={resetting} className="gap-1.5">
              {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              تغيير
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
