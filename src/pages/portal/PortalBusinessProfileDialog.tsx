import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { X, Check } from 'lucide-react';
import { PORTAL_PROFILE_OPTIONS, type PortalProfile } from '@/lib/portal/profile';
import { resetPortalProfileCache } from '@/hooks/usePortalProfile';

interface Props {
  theme: 'light' | 'dark';
  onClose: () => void;
}

/**
 * Lets the tenant owner pick the business profile that drives portal
 * terminology. Leaving it unset keeps the original (legacy) wording.
 */
export default function PortalBusinessProfileDialog({ theme, onClose }: Props) {
  const dark = theme === 'dark';
  const bg = dark ? '#161616' : '#FFFFFF';
  const border = dark ? '#262626' : '#E2E8F0';
  const text = dark ? '#F1F5F9' : '#0D1B2E';
  const muted = dark ? '#A1A1AA' : '#64748B';

  const [current, setCurrent] = useState<PortalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.functions.invoke('malaki-data', {
          body: { action: 'get_settings' },
        });
        const raw = data?.settings?.portal_profile;
        if (raw === 'restaurant' || raw === 'retail' || raw === 'general') setCurrent(raw);
      } catch { /* keep legacy default */ }
      setLoading(false);
    })();
  }, []);

  const save = async (value: PortalProfile) => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('malaki-data', {
        body: { action: 'update_settings', updates: { portal_profile: value } },
      });
      if (error || data?.error) throw error || new Error(data.error);
      setCurrent(value);
      resetPortalProfileCache();
      toast.success('تم حفظ نوع النشاط — أعد تحميل الصفحة لرؤية التغييرات');
    } catch {
      toast.error('تعذر حفظ نوع النشاط');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      dir="rtl"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontFamily: 'Cairo',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: bg, width: '100%', maxWidth: 520, borderRadius: '20px 20px 0 0',
          padding: '16px 16px calc(24px + env(safe-area-inset-bottom))', border: `1px solid ${border}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: text }}>نوع النشاط</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: 11, color: muted, marginBottom: 12, lineHeight: 1.7 }}>
          يحدد المصطلحات المعروضة في البوابة (كاشير / بائع، دعم الوجبات…). اتركه دون تحديد للإبقاء على الشكل الحالي.
        </p>

        {loading ? (
          <div style={{ fontSize: 12, color: muted, padding: '12px 0' }}>جاري التحميل...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PORTAL_PROFILE_OPTIONS.map((opt) => {
              const active = current === opt.value;
              return (
                <button
                  key={opt.value}
                  disabled={saving}
                  onClick={() => save(opt.value)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', borderRadius: 12, cursor: saving ? 'wait' : 'pointer',
                    border: `1px solid ${active ? '#0EA5E9' : border}`,
                    background: active ? 'rgba(14,165,233,0.08)' : 'transparent',
                    color: text, fontFamily: 'Cairo', fontSize: 13, fontWeight: active ? 700 : 500,
                  }}
                >
                  <span>{opt.label}</span>
                  {active && <Check size={16} color="#0EA5E9" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}