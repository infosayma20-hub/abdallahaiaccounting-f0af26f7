import { type DesignElement, type TemplateDesign, DYNAMIC_VARIABLES } from "./types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bold, Italic, Underline, AlignRight, AlignCenter, AlignLeft } from "lucide-react";

interface Props {
  element: DesignElement | null;
  design: TemplateDesign;
  onUpdateStyle: (updates: Partial<DesignElement['style']>) => void;
  onUpdateElement: (updates: Partial<DesignElement>) => void;
  onUpdateDesign: (updater: (d: TemplateDesign) => TemplateDesign) => void;
}

const DesignerProperties = ({ element, design, onUpdateStyle, onUpdateElement }: Props) => {
  if (!element) {
    return (
      <div className="w-[260px] border-r border-border bg-card shrink-0 flex items-center justify-center">
        <p className="text-xs text-muted-foreground text-center p-4">اختر عنصراً في الصفحة لعرض خصائصه</p>
      </div>
    );
  }

  const s = element.style;

  const renderTextProps = () => (
    <>
      {/* Content */}
      {(element.type === 'text' || element.type === 'textbox' || element.type === 'signature' || element.type === 'colorstrip') && (
        <div>
          <Label className="text-xs">المحتوى</Label>
          <Textarea
            value={element.content}
            onChange={e => onUpdateElement({ content: e.target.value })}
            rows={3}
            className="text-xs mt-1"
          />
        </div>
      )}

      {/* Variable selector for dynamic */}
      {element.type === 'dynamic' && (
        <div>
          <Label className="text-xs">المتغير</Label>
          <select
            className="w-full border rounded-md p-1.5 text-xs mt-1"
            value={element.variable || ''}
            onChange={e => onUpdateElement({ variable: e.target.value })}
          >
            {DYNAMIC_VARIABLES.map(v => (
              <option key={v.key} value={v.key}>{v.label} ({v.key})</option>
            ))}
          </select>
        </div>
      )}

      {/* Font */}
      <div>
        <Label className="text-xs">الخط</Label>
        <div className="flex gap-1 mt-1">
          <select
            className="flex-1 border rounded-md p-1.5 text-xs"
            value={s.fontFamily || design.theme.fontFamily}
            onChange={e => onUpdateStyle({ fontFamily: e.target.value })}
          >
            <option value="Cairo">Cairo</option>
            <option value="Amiri">Amiri</option>
            <option value="Tajawal">Tajawal</option>
            <option value="Arial">Arial</option>
          </select>
          <Input
            type="number"
            value={s.fontSize || 13}
            onChange={e => onUpdateStyle({ fontSize: +e.target.value })}
            className="w-14 text-xs"
          />
        </div>
      </div>

      {/* Bold/Italic/Underline */}
      <div className="flex gap-1">
        <button
          onClick={() => onUpdateStyle({ fontWeight: s.fontWeight === 700 ? 400 : 700 })}
          className={`p-1.5 rounded border text-xs ${s.fontWeight === 700 ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onUpdateStyle({ fontStyle: s.fontStyle === 'italic' ? 'normal' : 'italic' })}
          className={`p-1.5 rounded border text-xs ${s.fontStyle === 'italic' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onUpdateStyle({ textDecoration: s.textDecoration === 'underline' ? 'none' : 'underline' })}
          className={`p-1.5 rounded border text-xs ${s.textDecoration === 'underline' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
        >
          <Underline className="w-3.5 h-3.5" />
        </button>
        <div className="w-px bg-border mx-1" />
        {(['right', 'center', 'left'] as const).map(align => (
          <button
            key={align}
            onClick={() => onUpdateStyle({ textAlign: align })}
            className={`p-1.5 rounded border text-xs ${s.textAlign === align ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
          >
            {align === 'right' ? <AlignRight className="w-3.5 h-3.5" /> :
             align === 'center' ? <AlignCenter className="w-3.5 h-3.5" /> :
             <AlignLeft className="w-3.5 h-3.5" />}
          </button>
        ))}
      </div>

      {/* Color */}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={s.color || '#000000'}
          onChange={e => onUpdateStyle({ color: e.target.value })}
          className="w-7 h-7 rounded border cursor-pointer"
        />
        <Label className="text-xs">اللون</Label>
      </div>
    </>
  );

  const renderPositionProps = () => (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">X</Label>
          <Input type="number" value={Math.round(element.x)} onChange={e => onUpdateElement({ x: +e.target.value })} className="text-xs h-7 mt-1" />
        </div>
        <div>
          <Label className="text-xs">Y</Label>
          <Input type="number" value={Math.round(element.y)} onChange={e => onUpdateElement({ y: +e.target.value })} className="text-xs h-7 mt-1" />
        </div>
        <div>
          <Label className="text-xs">العرض</Label>
          <Input type="number" value={Math.round(element.w)} onChange={e => onUpdateElement({ w: +e.target.value })} className="text-xs h-7 mt-1" />
        </div>
        <div>
          <Label className="text-xs">الارتفاع</Label>
          <Input type="number" value={Math.round(element.h)} onChange={e => onUpdateElement({ h: +e.target.value })} className="text-xs h-7 mt-1" />
        </div>
      </div>
    </>
  );

  const renderSpacingProps = () => (
    <>
      {(element.type === 'textbox' || element.type === 'colorstrip') && (
        <div>
          <Label className="text-xs">الحشو الداخلي ({s.padding || 0}px)</Label>
          <Slider value={[s.padding || 0]} min={0} max={32} step={2} onValueChange={([v]) => onUpdateStyle({ padding: v })} className="mt-1" />
        </div>
      )}
    </>
  );

  const renderZonePicker = () => (
    <div>
      <Label className="text-xs">المنطقة</Label>
      <select
        className="w-full border rounded-md p-1.5 text-xs mt-1"
        value={element.zone}
        onChange={e => onUpdateElement({ zone: e.target.value as any })}
      >
        <option value="header">الترويسة</option>
        <option value="body">المحتوى</option>
        <option value="footer">التذييل</option>
      </select>
    </div>
  );

  const renderDividerProps = () => (
    <>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={s.borderColor || '#1B2B4B'}
          onChange={e => onUpdateStyle({ borderColor: e.target.value })}
          className="w-7 h-7 rounded border cursor-pointer"
        />
        <Label className="text-xs">لون الفاصل</Label>
      </div>
      <div>
        <Label className="text-xs">السُمك ({s.borderWidth || 1}px)</Label>
        <Slider value={[s.borderWidth || 1]} min={1} max={8} step={1} onValueChange={([v]) => onUpdateStyle({ borderWidth: v })} className="mt-1" />
      </div>
      <div>
        <Label className="text-xs">النمط</Label>
        <select
          className="w-full border rounded-md p-1.5 text-xs mt-1"
          value={s.borderStyle || 'solid'}
          onChange={e => onUpdateStyle({ borderStyle: e.target.value })}
        >
          <option value="solid">خط متصل ━━</option>
          <option value="double">مزدوج ═══</option>
          <option value="dotted">منقط ···</option>
          <option value="dashed">متقطع ---</option>
        </select>
      </div>
    </>
  );

  const renderImageProps = () => (
    <>
      <div>
        <Label className="text-xs">الارتفاع ({s.height || 60}px)</Label>
        <Slider value={[s.height || 60]} min={20} max={150} step={5} onValueChange={([v]) => onUpdateStyle({ height: v })} className="mt-1" />
      </div>
    </>
  );

  const renderTableProps = () => (
    <>
      <div>
        <Label className="text-xs">الأعمدة</Label>
        <div className="space-y-1 mt-1">
          {['#', 'البند', 'الكمية', 'سعر الوحدة', 'الإجمالي', 'الملاحظات'].map(col => (
            <label key={col} className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={(element.tableColumns || []).includes(col)}
                onChange={e => {
                  const cols = element.tableColumns || [];
                  onUpdateElement({
                    tableColumns: e.target.checked ? [...cols, col] : cols.filter(c => c !== col),
                  });
                }}
              />
              {col}
            </label>
          ))}
        </div>
      </div>
    </>
  );

  const TYPE_LABELS: Record<string, string> = {
    text: 'نص حر', dynamic: 'بيانات ديناميكية', table: 'جدول بنود', totals: 'مجاميع',
    signature: 'توقيع', divider: 'فاصل', image: 'صورة/لوجو', textbox: 'صندوق نص', colorstrip: 'شريط ملون',
  };

  return (
    <div className="w-[260px] border-r border-border bg-card shrink-0 flex flex-col">
      <div className="p-3 border-b border-border">
        <h3 className="text-xs font-semibold">⚙️ خصائص العنصر</h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">{TYPE_LABELS[element.type] || element.type}</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {renderZonePicker()}
          {renderPositionProps()}
          {renderTextProps()}
          {element.type === 'divider' && renderDividerProps()}
          {element.type === 'image' && renderImageProps()}
          {element.type === 'table' && renderTableProps()}
          {renderSpacingProps()}

          {/* Background for textbox/colorstrip */}
          {(element.type === 'textbox' || element.type === 'colorstrip') && (
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={s.backgroundColor || '#FFFFFF'}
                onChange={e => onUpdateStyle({ backgroundColor: e.target.value })}
                className="w-7 h-7 rounded border cursor-pointer"
              />
              <Label className="text-xs">لون الخلفية</Label>
            </div>
          )}

          {(element.type === 'textbox') && (
            <>
              <div>
                <Label className="text-xs">سمك الإطار ({s.borderWidth || 0}px)</Label>
                <Slider value={[s.borderWidth || 0]} min={0} max={4} step={1} onValueChange={([v]) => onUpdateStyle({ borderWidth: v })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">زوايا مستديرة ({s.borderRadius || 0}px)</Label>
                <Slider value={[s.borderRadius || 0]} min={0} max={16} step={2} onValueChange={([v]) => onUpdateStyle({ borderRadius: v })} className="mt-1" />
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default DesignerProperties;
