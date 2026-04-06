import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { MessageCircle, X, Loader2, ExternalLink, Check } from 'lucide-react';
import { useCompany } from '@/hooks/useCompanyContext';

interface Contact {
  id: string;
  name: string;
  phone: string;
  balance: number;
}

const fmt = (n: number) => '₪' + Math.abs(n).toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function WhatsAppComposerSheet({
  open, onClose, contact, theme = 'light', onSent,
}: {
  open: boolean;
  onClose: () => void;
  contact: Contact;
  theme?: 'light' | 'dark';
  onSent?: () => void;
}) {
  const { company } = useCompany();
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [generating, setGenerating] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [sent, setSent] = useState(false);

  const today = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const todayISO = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!open) return;
    setSent(false);
    setShareUrl('');
    setPhone(contact.phone?.replace(/\D/g, '') || '');
    generateLink();
  }, [open, contact.id]);

  const generateLink = async () => {
    setGenerating(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;

      const { data, error } = await supabase
        .from('shared_statements')
        .insert({
          user_id: userId,
          company_id: company.id || null,
          contact_id: contact.id,
          contact_name: contact.name,
          date_from: startOfYear,
          date_to: todayISO,
          created_by: userId,
          balance_amount: contact.balance,
        } as any)
        .select('token')
        .single();

      if (data?.token) {
        const baseUrl = window.location.origin;
        const url = `${baseUrl}/share/statement/${data.token}`;
        setShareUrl(url);

        setMessage(
          `السلام عليكم ${contact.name}،\n\n` +
          `نرفق لكم كشف حسابكم لدى ${company.name || 'الشركة'}\n` +
          `للفترة من 01/01/${new Date().getFullYear()} حتى ${today}.\n\n` +
          `الرصيد المستحق: ${fmt(contact.balance)}\n\n` +
          `رابط كشف الحساب:\n${url}\n\n` +
          `نرجو التواصل لترتيب السداد.\nمع فائق الاحترام`
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const openWhatsApp = async () => {
    let formattedPhone = phone.replace(/\D/g, '');
    // Remove leading 00 international prefix (e.g. 00972...)
    if (formattedPhone.startsWith('00')) formattedPhone = formattedPhone.slice(2);
    // Convert local number (starts with 0) to international
    else if (formattedPhone.startsWith('0')) formattedPhone = '970' + formattedPhone.slice(1);

    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${formattedPhone}?text=${encoded}`, '_blank');

    // Log the send
    try {
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from('statement_send_log').insert({
        user_id: userData?.user?.id,
        contact_id: contact.id,
        contact_name: contact.name,
        contact_phone: phone,
        sent_via: 'whatsapp',
        sent_by: userData?.user?.id,
        balance_at_send: contact.balance,
        company_id: company.id || null,
      } as any);
    } catch {}

    setSent(true);
    onSent?.();
  };

  const isDark = theme === 'dark';

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className={`${isDark ? 'bg-[#161B22] text-white border-gray-700' : 'bg-white'} rounded-t-2xl max-h-[85dvh] overflow-y-auto`}
        style={{ direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}>
        <SheetHeader className="text-right">
          <SheetTitle className={isDark ? 'text-white' : ''}>
            إرسال كشف الحساب — {contact.name}
          </SheetTitle>
          <SheetDescription>
            سيتم إنشاء رابط مشاركة صالح لمدة 30 يوم
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Phone */}
          <div>
            <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>رقم الجوال</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="0599XXXXXX"
              className={`w-full mt-1 px-3 py-2.5 rounded-lg border text-sm ${isDark ? 'bg-gray-800 border-gray-600 text-white' : 'bg-gray-50 border-gray-200'}`}
              style={{ fontFamily: 'JetBrains Mono, monospace', direction: 'ltr', textAlign: 'left' }}
            />
          </div>

          {/* Message */}
          <div>
            <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>نص الرسالة</label>
            {generating ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={20} className="animate-spin text-[#2A7B9B]" />
                <span className={`mr-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>جاري إنشاء الرابط...</span>
              </div>
            ) : (
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={8}
                className={`w-full mt-1 px-3 py-2.5 rounded-lg border text-sm leading-relaxed ${isDark ? 'bg-gray-800 border-gray-600 text-white' : 'bg-gray-50 border-gray-200'}`}
                style={{ fontFamily: 'Tajawal, sans-serif', resize: 'none' }}
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={openWhatsApp}
              disabled={generating || !phone || !message}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
              style={{ background: '#25D366', fontFamily: 'Tajawal, sans-serif', minHeight: 48 }}
            >
              {sent ? <Check size={18} /> : <MessageCircle size={18} />}
              {sent ? 'تم الفتح ✓' : '💬 فتح واتساب'}
            </button>
            <button
              onClick={onClose}
              className={`px-6 py-3 rounded-xl text-sm font-medium ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}
              style={{ fontFamily: 'Tajawal, sans-serif', minHeight: 48 }}
            >
              إلغاء
            </button>
          </div>

          <p className={`text-xs text-center ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            ✓ الرابط صالح لمدة 30 يوم
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
