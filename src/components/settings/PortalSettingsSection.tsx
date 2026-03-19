import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ExternalLink, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function PortalSettingsSection() {
  const { user } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    if (!username.trim() || !password.trim() || !fullName.trim()) {
      toast.error('يرجى ملء جميع الحقول');
      return;
    }
    if (password.length < 3) {
      toast.error('كلمة المرور يجب أن تكون 3 أحرف على الأقل');
      return;
    }

    setCreating(true);
    try {
      // First ensure settings exist with linked user
      await supabase.functions.invoke('malaki-data', {
        body: {
          action: 'update_settings',
          updates: {
            linked_user_id: user?.id,
            rates_updated_at: new Date().toISOString(),
          },
        },
      });

      // Create the portal admin user
      const { data, error } = await supabase.functions.invoke('malaki-auth', {
        body: {
          action: 'create_user',
          username: username.trim(),
          password: password.trim(),
          full_name: fullName.trim(),
          role: 'owner',
        },
      });

      if (error) throw error;
      if (data?.success) {
        setCreated(true);
        toast.success('تم إنشاء حساب بوابة الإدارة بنجاح');
      } else if (data?.error?.includes('موجود')) {
        toast.info('اسم المستخدم موجود مسبقاً — يمكنك الدخول مباشرة');
        setCreated(true);
      } else {
        throw new Error(data?.error || 'خطأ غير معروف');
      }
    } catch (err: any) {
      toast.error(err.message || 'خطأ في إنشاء الحساب');
    } finally {
      setCreating(false);
    }
  };

  const portalUrl = `${window.location.origin}/portal`;

  const copyLink = () => {
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    toast.success('تم نسخ الرابط');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">بوابة الإدارة</h3>
        <p className="text-sm text-muted-foreground">
          أنشئ حساب مسؤول لبوابة المتابعة الإدارية لمراقبة المبيعات والسيولة
        </p>
      </div>

      {/* Portal Link */}
      <div className="bg-muted/50 rounded-lg p-4 border border-border">
        <Label className="text-xs text-muted-foreground mb-2 block">رابط بوابة الإدارة</Label>
        <div className="flex items-center gap-2">
          <Input
            value={portalUrl}
            readOnly
            className="font-mono text-xs bg-background"
            dir="ltr"
          />
          <Button variant="outline" size="sm" onClick={copyLink} className="shrink-0 gap-1">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'تم' : 'نسخ'}
          </Button>
          <Button variant="outline" size="sm" asChild className="shrink-0 gap-1">
            <a href="/portal" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3" />
              فتح
            </a>
          </Button>
        </div>
      </div>

      {/* User ID Info */}
      <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium text-primary">🔗 معرّف حسابك (User ID)</span>
        </div>
        <div className="flex items-center gap-2">
          <code className="text-xs bg-background rounded px-2 py-1 border font-mono flex-1 overflow-hidden text-ellipsis" dir="ltr">
            {user?.id || '—'}
          </code>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (user?.id) {
                navigator.clipboard.writeText(user.id);
                toast.success('تم نسخ معرّف المستخدم');
              }
            }}
            className="shrink-0"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          يتم ربط البوابة تلقائياً بحسابك عند إنشاء مستخدم البوابة
        </p>
      </div>

      {/* Create Account Form */}
      {!created ? (
        <div className="space-y-4 border border-border rounded-lg p-4">
          <h4 className="text-sm font-semibold">إنشاء حساب مسؤول البوابة</h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">الاسم الكامل</Label>
              <Input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="مثال: أحمد محمد"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">اسم المستخدم</Label>
              <Input
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                dir="ltr"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-xs">كلمة المرور</Label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="كلمة مرور قوية (6 أحرف على الأقل)"
                dir="ltr"
              />
            </div>
          </div>

          <Button onClick={handleCreate} disabled={creating} className="w-full gap-2">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {creating ? 'جاري الإنشاء...' : '🚀 إنشاء حساب البوابة'}
          </Button>
        </div>
      ) : (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center space-y-2">
          <div className="text-2xl">✅</div>
          <p className="text-sm font-medium text-green-600 dark:text-green-400">
            تم إنشاء حساب بوابة الإدارة
          </p>
          <p className="text-xs text-muted-foreground">
            يمكنك الآن الدخول من رابط البوابة باستخدام اسم المستخدم وكلمة المرور
          </p>
          <Button variant="outline" size="sm" asChild className="gap-1 mt-2">
            <a href="/portal" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3" />
              الذهاب لبوابة الإدارة
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}
