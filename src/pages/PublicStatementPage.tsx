import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Download, Phone, Loader2, AlertTriangle, Share2 } from 'lucide-react';

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

  const generatePDFBlob = async (): Promise<Blob | null> => {
    if (!contentRef.current) return null;
    const el = contentRef.current;
    
    // Temporarily expand for full capture
    const origMaxW = el.style.maxWidth;
    const origW = el.style.width;
    el.style.maxWidth = '800px';
    el.style.width = '800px';

    const canvas = await html2canvas(el, {
      scale: 2.5,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 800,
    });

    el.style.maxWidth = origMaxW;
    el.style.width = origW;

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const margin = 5;
    const usableW = pdfW - margin * 2;
    const imgH = (canvas.height * usableW) / canvas.width;

    // Multi-page support
    if (imgH <= pdfH - margin * 2) {
      pdf.addImage(imgData, 'PNG', margin, margin, usableW, imgH);
    } else {
      let y = 0;
      const pageImgH = pdfH - margin * 2;
      const srcPageH = (pageImgH / usableW) * canvas.width;
      let page = 0;
      while (y < canvas.height) {
        if (page > 0) pdf.addPage();
        const sliceH = Math.min(srcPageH, canvas.height - y);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceH;
        const ctx = sliceCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          const sliceData = sliceCanvas.toDataURL('image/png');
          const drawH = (sliceH * usableW) / canvas.width;
          pdf.addImage(sliceData, 'PNG', margin, margin, usableW, drawH);
        }
        y += srcPageH;
        page++;
      }
    }

    return pdf.output('blob');
  };

  const downloadPDF = async () => {
    setDownloading(true);
    try {
      const blob = await generatePDFBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `كشف-حساب-${statement?.contactName || 'عميل'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { }
    finally { setDownloading(false); }
  };

  const sharePDF = async () => {
    setDownloading(true);
    try {
      const blob = await generatePDFBlob();
      if (!blob) return;
      const file = new File([blob], `كشف-حساب-${statement?.contactName || 'عميل'}.pdf`, { type: 'application/pdf' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `كشف حساب - ${statement?.contactName}`,
          text: `كشف حساب ${statement?.contactName} من ${company?.name}`,
          files: [file],
        });
      } else {
        // Fallback: just download
        downloadPDF();
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') downloadPDF();
    } finally {
      setDownloading(false);
    }
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
      <div ref={contentRef} id="statement-content" style={{ maxWidth: 800, margin: '0 auto', background: '#fff', padding: '20px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '3px solid #1B3A5C', paddingBottom: 12, gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1B3A5C', margin: 0 }}>كشف حساب</h1>
            <p style={{ fontSize: 12, color: '#6B7280', margin: '2px 0 0' }}>Account Statement</p>
          </div>
          {company.logo && (
            <img src={company.logo} alt={company.name} style={{ height: 44, maxWidth: 100, objectFit: 'contain', flexShrink: 0 }} crossOrigin="anonymous" />
          )}
        </div>

        {/* Company & Contact info */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>صادر من</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#1B3A5C', margin: '2px 0' }}>{company.name}</p>
            {company.phone && <p style={{ fontSize: 11, color: '#6B7280', margin: 0 }}>{company.phone}</p>}
          </div>
          <div>
            <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>صادر إلى</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#1B3A5C', margin: '2px 0' }}>{statement.contactName}</p>
            <p style={{ fontSize: 11, color: '#6B7280', margin: 0 }}>
              من {statement.dateFrom} إلى {statement.dateTo}
            </p>
          </div>
        </div>

        {/* Summary - 2x2 grid on mobile */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 16 }}>
          {[
            { label: 'رصيد افتتاحي', value: fmt(statement.openingBalance), color: '#1B3A5C' },
            { label: 'إجمالي مدين (عليه)', value: fmt(statement.totalDebit), color: '#DC2626' },
            { label: 'إجمالي دائن (له)', value: fmt(statement.totalCredit), color: '#059669' },
            { label: 'الرصيد المستحق', value: fmt(statement.closingBalance), color: balColor },
          ].map((item, i) => (
            <div key={i} style={{ background: '#F9FAFB', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <p style={{ fontSize: 9, color: '#9CA3AF', margin: 0 }}>{item.label}</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: item.color, margin: '2px 0 0' }}>{item.value}</p>
            </div>
          ))}
        </div>

        {/* Transactions - card layout for mobile */}
        <div style={{ marginBottom: 16 }}>
          {/* Table header */}
          <div style={{ background: '#1B3A5C', color: 'white', borderRadius: '8px 8px 0 0', padding: '8px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, fontSize: 10, fontWeight: 600, textAlign: 'center' }}>
            <span style={{ textAlign: 'right' }}>البيان</span>
            <span>مدين</span>
            <span>دائن</span>
          </div>

          {/* Opening balance */}
          <div style={{ padding: '8px 10px', background: '#F9FAFB', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, fontSize: 11, borderBottom: '1px solid #F3F4F6' }}>
            <span style={{ color: '#9CA3AF', fontStyle: 'italic', fontSize: 10 }}>رصيد أول المدة</span>
            <span style={{ textAlign: 'center' }}>-</span>
            <span style={{ textAlign: 'center' }}>-</span>
          </div>

          {/* Transaction rows */}
          {statement.rows.map((row, i) => (
            <div key={i} style={{ padding: '10px', borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#1B3A5C', margin: 0, lineHeight: 1.4 }}>{row.description}</p>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                    <span style={{ fontSize: 10, color: '#6B7280' }}>{row.date}</span>
                    {row.reference && <span style={{ fontSize: 10, color: '#2563EB' }}>{row.reference}</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginTop: 6 }}>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: 9, color: '#9CA3AF' }}>مدين</span>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: row.debit > 0 ? '#DC2626' : '#D1D5DB' }}>
                    {row.debit > 0 ? fmt(row.debit) : '-'}
                  </p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: 9, color: '#9CA3AF' }}>دائن</span>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: row.credit > 0 ? '#059669' : '#D1D5DB' }}>
                    {row.credit > 0 ? fmt(row.credit) : '-'}
                  </p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: 9, color: '#9CA3AF' }}>الرصيد</span>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: row.balance > 0 ? '#DC2626' : row.balance === 0 ? '#059669' : '#2563EB' }}>
                    {fmt(row.balance)}
                  </p>
                </div>
              </div>
              {row.notes && <p style={{ fontSize: 9, color: '#9CA3AF', margin: '4px 0 0' }}>{row.notes}</p>}
            </div>
          ))}

          {/* Closing balance */}
          <div style={{ background: '#1B3A5C', color: 'white', borderRadius: '0 0 8px 8px', padding: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, fontWeight: 700, fontSize: 12, textAlign: 'center' }}>
            <span style={{ textAlign: 'right' }}>رصيد ختامي</span>
            <span>{fmt(statement.totalDebit)}</span>
            <span>{fmt(statement.totalCredit)}</span>
          </div>
        </div>

        {/* Bottom summary */}
        <div style={{
          background: '#FEF2F2', border: '2px solid #FECACA', borderRadius: 12, padding: 16,
          textAlign: 'center', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 10, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 10, color: '#6B7280', margin: 0 }}>إجمالي ما عليك</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#DC2626', margin: '2px 0 0' }}>{fmt(statement.totalDebit)}</p>
            </div>
            <div>
              <p style={{ fontSize: 10, color: '#6B7280', margin: 0 }}>إجمالي ما دفعته</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#059669', margin: '2px 0 0' }}>{fmt(statement.totalCredit)}</p>
            </div>
          </div>
          <div style={{ borderTop: '1px solid #FECACA', paddingTop: 10 }}>
            <p style={{ fontSize: 11, color: '#6B7280', margin: 0 }}>الرصيد المستحق</p>
            <p style={{ fontSize: 24, fontWeight: 700, color: balColor, margin: '4px 0' }}>
              {fmt(statement.closingBalance)} <span style={{ fontSize: 12 }}>{balLabel}</span>
            </p>
            {statement.closingBalance > 0 && (
              <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>يرجى التواصل لترتيب السداد</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: 9, color: '#9CA3AF', borderTop: '1px solid #E5E7EB', paddingTop: 10 }}>
          <p style={{ margin: 0 }}>تم إصدار هذا الكشف من نظام أموالي AMWALI</p>
          <p style={{ margin: '2px 0 0' }}>{company.name} — {new Date().toLocaleDateString('ar')}</p>
        </div>
      </div>

      {/* Action buttons - sticky bottom */}
      <div style={{
        position: 'sticky', bottom: 0, background: 'white',
        borderTop: '1px solid #E5E7EB', padding: '10px 16px',
        display: 'flex', gap: 8, justifyContent: 'center', maxWidth: 800, margin: '0 auto',
      }}>
        <button
          onClick={sharePDF}
          disabled={downloading}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '12px 14px', borderRadius: 10, border: 'none',
            background: '#25D366', color: 'white', fontSize: 13, fontWeight: 600,
            fontFamily: 'Tajawal, sans-serif', cursor: 'pointer', minHeight: 48,
          }}
        >
          <Share2 size={18} />
          مشاركة
        </button>
        <button
          onClick={downloadPDF}
          disabled={downloading}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '12px 14px', borderRadius: 10, border: 'none',
            background: '#1B3A5C', color: 'white', fontSize: 13, fontWeight: 600,
            fontFamily: 'Tajawal, sans-serif', cursor: 'pointer', minHeight: 48,
          }}
        >
          {downloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
          تحميل PDF
        </button>
        {company.phone && (
          <a
            href={`tel:${company.phone}`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '12px 14px', borderRadius: 10, border: '1px solid #E5E7EB',
              background: 'white', color: '#1B3A5C', textDecoration: 'none', minHeight: 48,
            }}
          >
            <Phone size={18} />
          </a>
        )}
      </div>
    </div>
  );
}
