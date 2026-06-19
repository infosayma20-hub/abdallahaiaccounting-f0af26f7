import { useState, useEffect } from 'react';
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { MessageCircle, Loader2, Check, Share2, Copy, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';

interface Contact {
  id: string;
  name: string;
  phone: string;
  balance: number;
}

const fmt = (n: number) => '₪' + Math.abs(n).toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const formatPhoneForWhatsApp = (phone: string): string => {
  if (!phone) return '';
  let digits = phone.replace(/[^0-9]/g, '');

  // Case: 00972... → remove leading 00
  if (digits.startsWith('00972')) {
    digits = digits.substring(2);
  }
  // Case: 0599... (local 10-digit) → replace leading 0 with 972
  else if (digits.startsWith('0') && digits.length === 10) {
    digits = '972' + digits.substring(1);
  }
  // Case: 599... (9-digit, no prefix) → add 972
  else if (digits.length === 9 && (digits.startsWith('5') || digits.startsWith('2'))) {
    digits = '972' + digits;
  }
  // Case: already 972XXXXXXXXX → keep as is

  return digits;
};

export default function WhatsAppComposerSheet({
  open, onClose, contact, theme = 'light', onSent, portalCompanyName = '',
}: {
  open: boolean;
  onClose: () => void;
  contact: Contact;
  theme?: 'light' | 'dark';
  onSent?: () => void;
  portalCompanyName?: string;
}) {
  const effectiveCompanyName = portalCompanyName || 'الشركة';
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [generating, setGenerating] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);

  const today = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const todayISO = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!open) return;
    setSent(false);
    setCopied(false);
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

      // Fetch invoice summaries for the message
      const { data: invoices } = await (supabase
        .from('invoices')
        .select('invoice_number, total_amount, status, invoice_items(description)') as any)
        .eq("user_id", dataOwnerId!)
        .eq('contact_id', contact.id)
        .eq('type', 'sale')
        .neq('status', 'cancelled')
        .neq('status', 'paid')
        .gte('issue_date', startOfYear)
        .lte('issue_date', todayISO)
        .order('issue_date', { ascending: true })
        .limit(10);

      const { data, error } = await supabase
        .from('shared_statements')
        .insert({
          user_id: dataOwnerId!,
          company_id: null,
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

        // Build invoice summary lines
        let invoiceSummary = '';
        if (invoices && invoices.length > 0) {
          const lines = invoices.map((inv: any) => {
            const itemNames = (inv.invoice_items || []).map((it: any) => it.description || 'صنف').join('، ');
            return `• فاتورة ${inv.invoice_number} — ${fmt(inv.total_amount)}${itemNames ? ` (${itemNames})` : ''}`;
          });
          invoiceSummary = `\nملخص الحساب:\n${lines.join('\n')}\n`;
        }

        setMessage(
          `السلام عليكم ${contact.name}،\n\n` +
          `نرفق لكم كشف حسابكم لدى ${effectiveCompanyName}\n` +
          `للفترة من 01/01/${new Date().getFullYear()} حتى ${today}.\n` +
          invoiceSummary +
          `\nالرصيد المستحق: ${fmt(contact.balance)}\n\n` +
          `رابط كشف الحساب التفصيلي:\n${url}\n\n` +
          `يرجى التسديد خلال 7 أيام.\nشكراً لتعاملكم معنا 🙏`
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const logSend = async (via: string) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from('statement_send_log').insert({
        user_id: userData?.user?.id,
        contact_id: contact.id,
        contact_name: contact.name,
        contact_phone: phone,
        sent_via: via,
        sent_by: userData?.user?.id,
        balance_at_send: contact.balance,
        company_id: null,
      } as any);
    } catch {}
  };

  const openWhatsApp = async () => {
    const formattedPhone = formatPhoneForWhatsApp(phone);
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${formattedPhone}?text=${encoded}`, '_blank');
    await logSend('whatsapp');
    setSent(true);
    onSent?.();
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `كشف حساب — ${contact.name}`,
          text: message,
        });
        await logSend('share');
        setSent(true);
        onSent?.();
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Share failed:', err);
        }
      }
    } else {
      // Desktop fallback: copy to clipboard
      await handleCopy();
      toast.success('تم نسخ الرسالة — الصقها في أي تطبيق');
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = message;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <div className="space-y-3 pt-2">
            {/* Row 1: Share + WhatsApp */}
            <div className="flex gap-3">
              <button
                onClick={handleShare}
                disabled={generating || !message}
                className="disabled:opacity-50"
                style={{
                  flex: 1,
                  background: 'linear-gradient(135deg, #0D1B2E 0%, #1e3a5f 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 12,
                  padding: '14px 20px',
                  fontSize: 16,
                  fontWeight: 700,
                  fontFamily: 'Cairo, Tajawal, sans-serif',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 15px rgba(13, 27, 46, 0.3)',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  minHeight: 48,
                }}
              >
                <Share2 size={18} />
                مشاركة
              </button>

              <button
                onClick={openWhatsApp}
                disabled={generating || !phone || !message}
                className="disabled:opacity-50"
                style={{
                  flex: 1,
                  background: '#25D366',
                  color: 'white',
                  border: 'none',
                  borderRadius: 12,
                  padding: '14px 20px',
                  fontSize: 16,
                  fontWeight: 700,
                  fontFamily: 'Cairo, Tajawal, sans-serif',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  minHeight: 48,
                }}
              >
                {sent ? <Check size={18} /> : <MessageCircle size={18} />}
                {sent ? 'تم الفتح ✓' : '💬 فتح واتساب'}
              </button>
            </div>

            {/* Row 2: Copy */}
            <button
              onClick={handleCopy}
              disabled={generating || !message}
              className="disabled:opacity-50"
              style={{
                width: '100%',
                background: copied ? '#F0FDF4' : isDark ? '#1F2937' : 'white',
                color: copied ? '#16A34A' : isDark ? '#D1D5DB' : '#0D1B2E',
                border: `1.5px solid ${copied ? '#22C55E' : isDark ? '#374151' : '#E2E8F0'}`,
                borderRadius: 12,
                padding: '12px 20px',
                fontSize: 14,
                fontWeight: 600,
                fontFamily: 'Cairo, Tajawal, sans-serif',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.3s ease',
              }}
            >
              {copied ? <CheckCheck size={16} /> : <Copy size={16} />}
              {copied ? '✅ تم النسخ!' : '📋 نسخ الرسالة'}
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
