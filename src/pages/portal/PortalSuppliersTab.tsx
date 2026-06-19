import { useState, useEffect } from 'react';
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Search, MessageCircle, Phone, ArrowUpDown, Share2 } from 'lucide-react';
import WhatsAppComposerSheet from '@/components/portal/WhatsAppComposerSheet';
import { toast } from 'sonner';

function getThemeColors(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? { card: '#161B22', text: '#E6EDF3', textMuted: 'rgba(230,237,243,0.6)', textFaint: 'rgba(230,237,243,0.4)', border: 'rgba(230,237,243,0.08)', chipBg: 'rgba(230,237,243,0.06)', inputBg: 'rgba(230,237,243,0.07)', inputBorder: 'rgba(230,237,243,0.12)' }
    : { card: '#FFFFFF', text: '#1B3A5C', textMuted: 'rgba(27,58,92,0.6)', textFaint: 'rgba(27,58,92,0.4)', border: 'rgba(27,58,92,0.1)', chipBg: 'rgba(27,58,92,0.04)', inputBg: '#F5F5F5', inputBorder: 'rgba(27,58,92,0.12)' };
}

const fmt = (n: number) => '₪' + Math.abs(n).toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

interface Payable {
  id: string;
  name: string;
  phone: string;
  balance: number;
  maxDays: number;
  lastSent: string | null;
}

export default function PortalSuppliersTab({ theme = 'light', portalCompanyName = '', portalLinkedUserId = '' }: { theme?: 'light' | 'dark'; portalCompanyName?: string; portalLinkedUserId?: string }) {
  const t = getThemeColors(theme);
  const effectiveCompanyName = portalCompanyName || 'الشركة';
  const [payables, setPayables] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'balance' | 'days' | 'name'>('balance');
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Payable | null>(null);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [sharingId, setSharingId] = useState<string | null>(null);

  useEffect(() => { fetchPayables(); }, []);

  const fetchPayables = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('malaki-data', {
        body: { action: 'payables_list' },
      });
      if (data?.payables) {
        setPayables(data.payables);
        setTotalOutstanding(data.payables.reduce((s: number, r: any) => s + r.balance, 0));
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const openWhatsApp = (contact: Payable) => {
    setSelectedContact(contact);
    setComposerOpen(true);
  };

  const handleDirectShare = async (contact: Payable) => {
    setSharingId(contact.id);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;

      const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
      const todayISO = new Date().toISOString().slice(0, 10);
      const todayFmt = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' });

      const { data } = await supabase
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

      if (!data?.token) return;

      const url = `${window.location.origin}/share/statement/${data.token}`;

      const msg = `السلام عليكم ${contact.name}،\n\nنرفق لكم كشف حسابكم لدى ${effectiveCompanyName}\nللفترة من 01/01/${new Date().getFullYear()} حتى ${todayFmt}.\n\nالرصيد المستحق لكم: ₪${Math.abs(contact.balance).toLocaleString('en')}\n\nرابط كشف الحساب التفصيلي:\n${url}\n\nشكراً لتعاونكم 🙏`;

      if (navigator.share) {
        await navigator.share({ title: `كشف حساب — ${contact.name}`, text: msg });
      } else {
        await navigator.clipboard.writeText(msg);
        toast.success('تم نسخ الرسالة — الصقها في أي تطبيق');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') console.error(err);
    } finally {
      setSharingId(null);
    }
  };

  const sorted = [...payables]
    .filter(r => !search || r.name.includes(search))
    .sort((a, b) => {
      if (sortBy === 'balance') return b.balance - a.balance;
      if (sortBy === 'days') return b.maxDays - a.maxDays;
      return a.name.localeCompare(b.name, 'ar');
    });

  return (
    <div>
      {/* Header KPI */}
      <div style={{
        background: t.card, borderRadius: 12, padding: 16, marginBottom: 12,
        border: `1px solid ${t.border}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 12, color: t.textMuted, margin: 0 }}>🔵 إجمالي الذمم الدائنة</p>
            <p style={{ fontSize: 24, fontWeight: 700, color: '#2563EB', margin: '4px 0 0' }}>{fmt(totalOutstanding)}</p>
          </div>
          <div style={{ textAlign: 'left' }}>
            <p style={{ fontSize: 11, color: t.textFaint, margin: 0 }}>{payables.length} مورد</p>
          </div>
        </div>
      </div>

      {/* Search & Sort */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: t.textFaint }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث باسم المورد..."
            style={{
              width: '100%', padding: '8px 32px 8px 10px', borderRadius: 8,
              border: `1px solid ${t.inputBorder}`, background: t.inputBg,
              color: t.text, fontSize: 13, fontFamily: 'Cairo, sans-serif', outline: 'none',
            }}
          />
        </div>
        <button
          onClick={() => setSortBy(s => s === 'balance' ? 'days' : s === 'days' ? 'name' : 'balance')}
          style={{
            background: t.chipBg, border: `1px solid ${t.border}`, borderRadius: 8,
            padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            color: t.textMuted, fontSize: 11, fontFamily: 'Cairo, sans-serif',
          }}
        >
          <ArrowUpDown size={12} />
          {sortBy === 'balance' ? 'أعلى رصيد' : sortBy === 'days' ? 'أقدم فاتورة' : 'الاسم'}
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Loader2 size={24} className="animate-spin" style={{ color: '#2563EB' }} />
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: t.textFaint, fontSize: 13 }}>
          لا توجد ذمم دائنة مستحقة
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map(contact => {
            const daysColor = contact.maxDays > 30 ? '#DC2626' : contact.maxDays > 14 ? '#F59E0B' : '#059669';
            const sentLabel = contact.lastSent
              ? `آخر إرسال: ${Math.round((Date.now() - new Date(contact.lastSent).getTime()) / 86400000)} يوم`
              : 'لم يُرسل بعد';
            const sentColor = !contact.lastSent ? '#9CA3AF' : (Date.now() - new Date(contact.lastSent).getTime() > 30 * 86400000 ? '#F59E0B' : '#059669');

            return (
              <div key={contact.id} style={{
                background: t.card, borderRadius: 12, padding: 14,
                border: `1px solid ${t.border}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: t.text, margin: 0 }}>{contact.name}</p>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: '#2563EB' }}>{fmt(contact.balance)}</span>
                      <span style={{ fontSize: 11, color: t.textFaint }}>مستحقة</span>
                      <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: `${daysColor}15`, color: daysColor, fontWeight: 600 }}>
                        {contact.maxDays} يوم
                      </span>
                    </div>
                    <p style={{ fontSize: 10, color: sentColor, margin: '4px 0 0' }}>{sentLabel}</p>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {contact.phone && (
                    <a
                      href={`tel:${contact.phone}`}
                      style={{
                        width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 10, border: `1.5px solid ${t.border}`,
                        background: t.chipBg, color: t.text, textDecoration: 'none',
                      }}
                    >
                      <Phone size={16} />
                    </a>
                  )}
                  <button
                    onClick={() => handleDirectShare(contact)}
                    disabled={sharingId === contact.id}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '10px 12px', borderRadius: 10, border: 'none',
                      background: 'linear-gradient(135deg, #0D1B2E, #1e3a5f)', color: 'white',
                      fontSize: 12, fontWeight: 600, fontFamily: 'Cairo, sans-serif',
                      cursor: 'pointer', minHeight: 44, opacity: sharingId === contact.id ? 0.6 : 1,
                      boxShadow: '0 2px 8px rgba(13,27,46,0.2)',
                    }}
                  >
                    {sharingId === contact.id ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
                    {sharingId === contact.id ? 'جاري التجهيز...' : 'مشاركة كشف'}
                  </button>
                  <button
                    onClick={() => openWhatsApp(contact)}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '10px 12px', borderRadius: 10, border: 'none',
                      background: '#25D366', color: 'white', fontSize: 12, fontWeight: 600,
                      fontFamily: 'Cairo, sans-serif', cursor: 'pointer', minHeight: 44,
                    }}
                  >
                    <MessageCircle size={14} />
                    واتساب كشف
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* WhatsApp Composer */}
      {selectedContact && (
        <WhatsAppComposerSheet
          open={composerOpen}
          onClose={() => { setComposerOpen(false); setSelectedContact(null); }}
          contact={selectedContact}
          theme={theme}
          onSent={() => fetchPayables()}
          portalCompanyName={portalCompanyName}
        />
      )}
    </div>
  );
}
