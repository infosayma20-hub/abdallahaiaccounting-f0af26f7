import { DYNAMIC_VARIABLES, type DesignElement, type TemplateDesign } from "./types";
import { Trash2, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  design: TemplateDesign;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: 'up' | 'down') => void;
  logoBase64: string | null;
  companyName: string;
}

const ZONE_LABELS: Record<string, string> = { header: 'الترويسة', body: 'المحتوى', footer: 'التذييل' };

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

const renderElement = (el: DesignElement, design: TemplateDesign, logoBase64: string | null, companyName: string) => {
  const s = el.style;

  switch (el.type) {
    case 'text':
    case 'textbox':
      return (
        <div style={{
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
        }}>
          {el.content || 'نص فارغ'}
        </div>
      );

    case 'dynamic': {
      const label = DYNAMIC_VARIABLES.find(v => v.key === el.variable)?.label || el.variable;
      const value = resolveVariable(el.variable || '', companyName);
      return (
        <div style={{
          fontFamily: s.fontFamily || design.theme.fontFamily,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          color: s.color || design.theme.textColor,
          textAlign: s.textAlign,
        }}>
          <span className="text-muted-foreground">{value || `[${label}]`}</span>
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
        <div style={{ fontSize: s.fontSize, fontWeight: s.fontWeight }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${design.theme.primaryColor}`, paddingTop: 4 }}>
            <span>الإجمالي النهائي:</span><span>₪0.00</span>
          </div>
        </div>
      );

    case 'signature':
      return (
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #9CA3AF', width: 200, margin: '0 auto', paddingTop: 6, fontSize: s.fontSize, color: s.color || '#6B7280' }}>
            {el.content || 'التوقيع'}
          </div>
        </div>
      );

    case 'divider':
      return (
        <hr style={{
          border: 'none',
          borderTop: `${s.borderWidth || 1}px ${s.borderStyle || 'solid'} ${s.borderColor || design.theme.primaryColor}`,
          width: s.width || '100%',
        }} />
      );

    case 'image':
      return (
        <div style={{ textAlign: s.textAlign || 'center' }}>
          {logoBase64 ? (
            <img src={logoBase64} alt="logo" style={{ height: s.height || 60, objectFit: 'contain' }} />
          ) : (
            <div style={{ width: 60, height: 60, background: '#E5E7EB', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 10 }}>لوجو</div>
          )}
        </div>
      );

    case 'colorstrip':
      return (
        <div style={{
          background: s.backgroundColor || design.theme.primaryColor,
          color: s.color || '#FFFFFF',
          height: s.height || 40,
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

const DesignerCanvas = ({ design, selectedId, onSelect, onRemove, onMove, logoBase64, companyName }: Props) => {
  const zones: ('header' | 'body' | 'footer')[] = ['header', 'body', 'footer'];

  return (
    <div className="flex-1 overflow-auto bg-muted/50 p-6 flex justify-center" onClick={() => onSelect(null)}>
      {/* A4 Page */}
      <div
        style={{
          width: 595, // A4 at 72dpi-ish scale
          minHeight: 842,
          background: design.theme.pageBackground || '#FFFFFF',
          boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
          fontFamily: `'${design.theme.fontFamily}', sans-serif`,
          direction: design.page.direction,
          position: 'relative',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Watermark */}
        {design.theme.watermark.enabled && logoBase64 && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            opacity: design.theme.watermark.opacity, zIndex: 0, pointerEvents: 'none',
            width: '60%', textAlign: 'center',
          }}>
            <img src={logoBase64} alt="" style={{ width: '100%', objectFit: 'contain' }} />
          </div>
        )}

        <div style={{ position: 'relative', zIndex: 1 }}>
          {zones.map(zone => {
            const zoneElements = design.elements.filter(e => e.zone === zone);
            const isHeaderFooter = zone !== 'body';
            const zoneStyle = zone === 'header' ? design.zones.header : zone === 'footer' ? design.zones.footer : null;
            return (
              <div
                key={zone}
                style={{
                  ...(isHeaderFooter ? {
                    background: zoneStyle?.background || 'transparent',
                    minHeight: zoneStyle?.height || 60,
                    padding: `${design.page.margins.top}px ${design.page.margins.right}px`,
                  } : {
                    padding: `16px ${design.page.margins.right}px`,
                    minHeight: 500,
                  }),
                }}
              >
                {/* Zone label */}
                <div className="text-[9px] text-muted-foreground/50 mb-1 select-none">{ZONE_LABELS[zone]}</div>
                
                {zoneElements.map(el => (
                  <div
                    key={el.id}
                    onClick={e => { e.stopPropagation(); onSelect(el.id); }}
                    className={`relative group transition-all ${
                      selectedId === el.id
                        ? 'ring-2 ring-primary ring-offset-1 rounded'
                        : 'hover:ring-1 hover:ring-primary/30 rounded'
                    }`}
                    style={{
                      marginTop: el.style.marginTop,
                      marginBottom: el.style.marginBottom,
                      cursor: 'pointer',
                    }}
                  >
                    {renderElement(el, design, logoBase64, companyName)}

                    {/* Element controls on selection */}
                    {selectedId === el.id && (
                      <div className="absolute -top-3 left-0 flex gap-0.5 z-10">
                        <button onClick={e => { e.stopPropagation(); onMove(el.id, 'up'); }} className="w-5 h-5 rounded bg-primary text-primary-foreground flex items-center justify-center text-[10px]">
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); onMove(el.id, 'down'); }} className="w-5 h-5 rounded bg-primary text-primary-foreground flex items-center justify-center text-[10px]">
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); onRemove(el.id); }} className="w-5 h-5 rounded bg-destructive text-destructive-foreground flex items-center justify-center text-[10px]">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DesignerCanvas;
