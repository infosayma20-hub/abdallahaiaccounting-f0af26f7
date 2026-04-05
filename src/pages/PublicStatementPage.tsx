import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Download, Phone, Loader2, AlertTriangle, FileText } from 'lucide-react';

interface StatementRow {
  date: string;
  reference: string;
  description: string;
  notes: string;
  debit: number;
  credit: number;
  balance: number;
}

interface StatementData {
  contactName: string;
  contactPhone: string;
  dateFrom: string;
  dateTo: string;
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  rows: StatementRow[];
}

interface CompanyData {
  name: string;
  logo: string;
  phone: string;
  email: string;
}

const fmt = (n: number) => '₪' + Math.abs(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PublicStatementPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [statement, setStatement] = useState<StatementData | null>(null);
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [downloading, setDownloading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('public-statement', {
          body: { token },
        });
        if (fnErr || data?.error) {
          if (data?.expired) setExpired(true);
          setError(data?.error || 'حدث خطأ');
          return;
        }
        setStatement(data.statement);
        setCompany(data.company);
      } catch {
        setError('تعذر تحميل كشف الحساب');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const downloadPDF = async () => {
    if (!contentRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`كشف-حساب-${statement?.contactName || 'عميل'}.pdf`);
    } catch { }
    finally { setDownloading(false); }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Tajawal, Cairo, sans-serif', direction: 'rtl' }}>
        <Loader2 className="animate-spin" size={32} style={{ color: '#1B3A5C' }} />
      </div>
    );
  }

  if (error || expired) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'Tajawal, Cairo, sans-serif', direction: 'rtl', padding: 24, textAlign: 'center' }}>
        <AlertTriangle size={48} style={{ color: expired ? '#F59E0B' : '#EF4444', marginBottom: 16 }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1B3A5C', marginBottom: 8 }}>
          {expired ? 'رابط منتهي الصلاحية' : 'رابط غير صالح'}
        </h2>
        <p style={{ color: '#6B7280', fontSize: 14 }}>
          {expired ? 'هذا الرابط لم يعد صالحاً. يرجى التواصل مع الشركة للحصول على رابط جديد.' : error}
        </p>
      </div>
    );
  }

  if (!statement || !company) return null;

  const balColor = statement.closingBalance > 0 ? '#DC2626' : statement.closingBalance === 0 ? '#059669' : '#2563EB';
  const balLabel = statement.closingBalance > 0 ? '(مدين - عليك)' : statement.closingBalance === 0 ? 'مسوّى ✓' : '(دائن - لك)';

  return (
    <div style={{ minHeight: '100dvh', background: '#F3F4F6', fontFamily: 'Tajawal, Cairo, sans-serif', direction: 'rtl' }}>
      {/* PDF content */}
      <div ref={contentRef} id="statement-content" style={{ maxWidth: 800, margin: '0 auto', background: '#fff', padding: '24px 20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '3px solid #1B3A5C', paddingBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1B3A5C', margin: 0 }}>كشف حساب</h1>
            <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0' }}>Account Statement</p>
          </div>
          {company.logo && (
            <img src={company.logo} alt={company.name} style={{ height: 50, maxWidth: 120, objectFit: 'contain' }} crossOrigin="anonymous" />
          )}
        </div>

        {/* Company & Contact info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>صادر من</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#1B3A5C', margin: '2px 0' }}>{company.name}</p>
            {company.phone && <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>{company.phone}</p>}
          </div>
          <div style={{ flex: 1, minWidth: 200, textAlign: 'left' }}>
            <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>صادر إلى</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#1B3A5C', margin: '2px 0' }}>{statement.contactName}</p>
            <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>
              من {statement.dateFrom} إلى {statement.dateTo}
            </p>
          </div>
        </div>

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { label: 'رصيد افتتاحي', value: fmt(statement.openingBalance), color: '#1B3A5C' },
            { label: 'إجمالي مدين (عليه)', value: fmt(statement.totalDebit), color: '#DC2626' },
            { label: 'إجمالي دائن (له)', value: fmt(statement.totalCredit), color: '#059669' },
            { label: 'الرصيد المستحق', value: fmt(statement.closingBalance), color: balColor },
          ].map((item, i) => (
            <div key={i} style={{ background: '#F9FAFB', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
              <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>{item.label}</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: item.color, margin: '4px 0 0' }}>{item.value}</p>
            </div>
          ))}
        </div>

        {/* Transactions table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 20 }}>
          <thead>
            <tr style={{ background: '#1B3A5C', color: 'white' }}>
              {['التاريخ', 'المرجع', 'البيان', 'ملاحظات', 'مدين (عليه)', 'دائن (له)', 'الرصيد'].map((h, i) => (
                <th key={i} style={{ padding: '8px 6px', textAlign: i >= 4 ? 'center' : 'right', fontWeight: 600, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Opening balance row */}
            <tr style={{ background: '#F9FAFB' }}>
              <td colSpan={4} style={{ padding: '6px 8px', fontStyle: 'italic', color: '#9CA3AF', fontSize: 11 }}>رصيد أول المدة</td>
              <td style={{ textAlign: 'center' }}>-</td>
              <td style={{ textAlign: 'center' }}>-</td>
              <td style={{ textAlign: 'center', fontWeight: 600, color: statement.openingBalance > 0 ? '#DC2626' : '#059669' }}>
                {fmt(statement.openingBalance)}
              </td>
            </tr>
            {statement.rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '6px 8px', fontSize: 11 }}>{row.date}</td>
                <td style={{ padding: '6px 8px', fontSize: 11, color: '#2563EB' }}>{row.reference}</td>
                <td style={{ padding: '6px 8px', fontSize: 11 }}>{row.description}</td>
                <td style={{ padding: '6px 8px', fontSize: 10, color: '#9CA3AF' }}>{row.notes}</td>
                <td style={{ textAlign: 'center', color: row.debit > 0 ? '#DC2626' : '#D1D5DB', fontWeight: row.debit > 0 ? 600 : 400 }}>
                  {row.debit > 0 ? fmt(row.debit) : '-'}
                </td>
                <td style={{ textAlign: 'center', color: row.credit > 0 ? '#059669' : '#D1D5DB', fontWeight: row.credit > 0 ? 600 : 400 }}>
                  {row.credit > 0 ? fmt(row.credit) : '-'}
                </td>
                <td style={{
                  textAlign: 'center', fontWeight: 600,
                  color: row.balance > 0 ? '#DC2626' : row.balance === 0 ? '#059669' : '#2563EB',
                }}>
                  {fmt(row.balance)}
                </td>
              </tr>
            ))}
            {/* Closing balance row */}
            <tr style={{ background: '#1B3A5C', color: 'white', fontWeight: 700 }}>
              <td colSpan={4} style={{ padding: '8px', fontSize: 12 }}>رصيد ختامي</td>
              <td style={{ textAlign: 'center', fontSize: 12 }}>{fmt(statement.totalDebit)}</td>
              <td style={{ textAlign: 'center', fontSize: 12 }}>{fmt(statement.totalCredit)}</td>
              <td style={{ textAlign: 'center', fontSize: 14 }}>{fmt(statement.closingBalance)}</td>
            </tr>
          </tbody>
        </table>

        {/* Bottom summary */}
        <div style={{
          background: '#FEF2F2', border: '2px solid #FECACA', borderRadius: 12, padding: 20,
          textAlign: 'center', marginBottom: 20,
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 11, color: '#6B7280', margin: 0 }}>إجمالي ما عليك</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: '#DC2626', margin: '2px 0 0' }}>{fmt(statement.totalDebit)}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: '#6B7280', margin: 0 }}>إجمالي ما دفعته</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: '#059669', margin: '2px 0 0' }}>{fmt(statement.totalCredit)}</p>
            </div>
          </div>
          <div style={{ borderTop: '1px solid #FECACA', paddingTop: 12 }}>
            <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>الرصيد المستحق</p>
            <p style={{ fontSize: 28, fontWeight: 700, color: balColor, margin: '4px 0' }}>
              {fmt(statement.closingBalance)} <span style={{ fontSize: 14 }}>{balLabel}</span>
            </p>
            {statement.closingBalance > 0 && (
              <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>يرجى التواصل لترتيب السداد</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: 10, color: '#9CA3AF', borderTop: '1px solid #E5E7EB', paddingTop: 12 }}>
          <p style={{ margin: 0 }}>تم إصدار هذا الكشف من نظام أموالي AMWALI</p>
          <p style={{ margin: '4px 0 0' }}>{company.name} — {new Date().toLocaleDateString('ar')}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{
        position: 'sticky', bottom: 0, background: 'white',
        borderTop: '1px solid #E5E7EB', padding: '12px 20px',
        display: 'flex', gap: 10, justifyContent: 'center', maxWidth: 800, margin: '0 auto',
      }}>
        <button
          onClick={downloadPDF}
          disabled={downloading}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '12px 16px', borderRadius: 10, border: 'none',
            background: '#1B3A5C', color: 'white', fontSize: 14, fontWeight: 600,
            fontFamily: 'Tajawal, sans-serif', cursor: 'pointer',
          }}
        >
          {downloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
          تحميل PDF
        </button>
        {company.phone && (
          <a
            href={`tel:${company.phone}`}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 16px', borderRadius: 10, border: '1px solid #E5E7EB',
              background: 'white', color: '#1B3A5C', fontSize: 14, fontWeight: 600,
              fontFamily: 'Tajawal, sans-serif', textDecoration: 'none',
            }}
          >
            <Phone size={18} />
            تواصل مع الشركة
          </a>
        )}
      </div>
    </div>
  );
}
