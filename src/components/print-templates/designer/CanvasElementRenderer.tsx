import { DYNAMIC_VARIABLES, type DesignElement, type TemplateDesign } from "./types";

const resolveVariable = (variable: string, companyName: string): string => {
  const map: Record<string, string> = {
    '{{company_name}}': companyName || 'اسم الشركة',
    '{{client_name}}': 'اسم العميل',
    '{{client_address}}': 'عنوان العميل',
    '{{doc_number}}': 'QUO-2026-0001',
    '{{doc_date}}': new Date().toLocaleDateString('en-GB'),
    '{{doc_total}}': '₪0.00',
    '{{doc_total_words}}': 'صفر شيكل',
    '{{validity_days}}': '30',
    '{{payment_terms}}': 'نقداً عند التسليم',
    '{{notes}}': '',
    '{{signatory_name}}': 'المدير',
  };
  return map[variable] || variable;
};

export const renderElementContent = (
  el: DesignElement,
  design: TemplateDesign,
  logoBase64: string | null,
  companyName: string
) => {
  const s = el.style;

  switch (el.type) {
    case 'text':
    case 'textbox':
      return (
        <div style={{
          width: '100%', height: '100%',
          fontFamily: s.fontFamily || design.theme.fontFamily,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          fontStyle: s.fontStyle,
          color: s.color || design.theme.textColor,
          textAlign: s.textAlign,
          lineHeight: s.lineHeight,
          backgroundColor: s.backgroundColor,
          border: s.borderWidth ? `${s.borderWidth}px ${s.borderStyle || 'solid'} ${s.borderColor || '#E5E7EB'}` : undefined,
          borderRadius: s.borderRadius,
          padding: s.padding,
          overflow: 'hidden',
        }}>
          {el.content || 'نص فارغ'}
        </div>
      );

    case 'dynamic': {
      const label = DYNAMIC_VARIABLES.find(v => v.key === el.variable)?.label || el.variable;
      const value = resolveVariable(el.variable || '', companyName);
      return (
        <div style={{
          width: '100%', height: '100%',
          fontFamily: s.fontFamily || design.theme.fontFamily,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          color: s.color || design.theme.textColor,
          textAlign: s.textAlign,
          overflow: 'hidden',
        }}>
          <span style={{ opacity: 0.7 }}>{value || `[${label}]`}</span>
        </div>
      );
    }

    case 'table':
      return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: s.fontSize }}>
          <thead>
            <tr style={{ borderTop: `1px solid ${design.theme.primaryColor}`, borderBottom: `1px solid ${design.theme.primaryColor}` }}>
              {(el.tableColumns || []).map((col, i) => (
                <th key={i} style={{ padding: '6px 8px', textAlign: 'right', fontSize: 10, fontWeight: 600 }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
              {(el.tableColumns || []).map((_, i) => (
                <td key={i} style={{ padding: '6px 8px', color: '#9CA3AF', fontSize: 10 }}>—</td>
              ))}
            </tr>
          </tbody>
        </table>
      );

    case 'totals':
      return (
        <div style={{ width: '100%', fontSize: s.fontSize, fontWeight: s.fontWeight }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${design.theme.primaryColor}`, paddingTop: 4 }}>
            <span>الإجمالي النهائي:</span><span>₪0.00</span>
          </div>
        </div>
      );

    case 'signature':
      return (
        <div style={{ textAlign: 'center', width: '100%' }}>
          <div style={{ borderTop: '1px solid #9CA3AF', paddingTop: 6, fontSize: s.fontSize, color: s.color || '#6B7280' }}>
            {el.content || 'التوقيع'}
          </div>
        </div>
      );

    case 'divider':
      return (
        <hr style={{
          border: 'none',
          borderTop: `${s.borderWidth || 1}px ${s.borderStyle || 'solid'} ${s.borderColor || design.theme.primaryColor}`,
          width: '100%', margin: 0,
        }} />
      );

    case 'image':
      return (
        <div style={{ textAlign: s.textAlign || 'center', width: '100%', height: '100%' }}>
          {logoBase64 ? (
            <img src={logoBase64} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: '#E5E7EB', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 10 }}>لوجو</div>
          )}
        </div>
      );

    case 'colorstrip':
      return (
        <div style={{
          width: '100%', height: '100%',
          background: s.backgroundColor || design.theme.primaryColor,
          color: s.color || '#FFFFFF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          borderRadius: s.borderRadius,
        }}>
          {el.content}
        </div>
      );

    default:
      return <div>—</div>;
  }
};
