import { useState } from "react";
import { Type, Hash, Table, DollarSign, PenTool, Minus, ImageIcon, Square, Palette, Layout, Paintbrush } from "lucide-react";
import { DesignElement, TemplateDesign, DYNAMIC_VARIABLES, PRESET_THEMES } from "./types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  design: TemplateDesign;
  onAddElement: (el: DesignElement) => void;
  onUpdateDesign: (updater: (d: TemplateDesign) => TemplateDesign) => void;
}

const ELEMENT_BLOCKS = [
  { type: 'text' as const, icon: Type, label: 'نص حر', zone: 'body' as const },
  { type: 'dynamic' as const, icon: Hash, label: 'بيانات ديناميكية', zone: 'body' as const },
  { type: 'table' as const, icon: Table, label: 'جدول بنود', zone: 'body' as const },
  { type: 'totals' as const, icon: DollarSign, label: 'مجاميع', zone: 'body' as const },
  { type: 'signature' as const, icon: PenTool, label: 'توقيع', zone: 'body' as const },
  { type: 'divider' as const, icon: Minus, label: 'فاصل', zone: 'body' as const },
  { type: 'image' as const, icon: ImageIcon, label: 'صورة/لوجو', zone: 'body' as const },
  { type: 'textbox' as const, icon: Square, label: 'صندوق نص', zone: 'body' as const },
  { type: 'colorstrip' as const, icon: Palette, label: 'شريط ملون', zone: 'body' as const },
];

let _counter = 100;
const genId = () => `el-${Date.now()}-${_counter++}`;

const DesignerSidebar = ({ design, onAddElement, onUpdateDesign }: Props) => {
  const [tab, setTab] = useState<'elements' | 'layout' | 'style'>('elements');

  const handleAddBlock = (block: typeof ELEMENT_BLOCKS[0]) => {
    const el: DesignElement = {
      id: genId(),
      type: block.type,
      zone: block.zone,
      content: block.type === 'text' ? 'نص جديد' : block.type === 'textbox' ? 'صندوق نص' : block.type === 'signature' ? 'ختم الشركة وتوقيع المدير' : '',
      x: 0, y: 10, w: block.type === 'divider' ? 545 : block.type === 'table' ? 545 : block.type === 'totals' ? 545 : 200, h: block.type === 'table' ? 80 : block.type === 'colorstrip' ? 40 : 24,
      style: {
        fontSize: 13,
        color: design.theme.textColor,
        textAlign: 'right',
        ...(block.type === 'divider' ? { borderColor: design.theme.primaryColor, borderWidth: 1 } : {}),
        ...(block.type === 'colorstrip' ? { backgroundColor: design.theme.primaryColor, height: 40, color: '#FFFFFF' } : {}),
        ...(block.type === 'textbox' ? { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 4, padding: 12 } : {}),
      },
      ...(block.type === 'table' ? { tableColumns: ['#', 'البند', 'الكمية', 'سعر الوحدة', 'الإجمالي'] } : {}),
    };
    onAddElement(el);
  };

  const handleAddVariable = (v: typeof DYNAMIC_VARIABLES[0]) => {
    onAddElement({
      id: genId(),
      type: 'dynamic',
      zone: 'body',
      content: '',
      variable: v.key,
      x: 0, y: 10, w: 200, h: 22,
      style: { fontSize: 13, color: design.theme.textColor, textAlign: 'right' },
    });
  };

  const tabs = [
    { key: 'elements' as const, icon: Type, label: 'عناصر' },
    { key: 'layout' as const, icon: Layout, label: 'تخطيط' },
    { key: 'style' as const, icon: Paintbrush, label: 'النمط' },
  ];

  return (
    <div className="w-[250px] border-l border-border bg-card shrink-0 flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-border">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-xs font-medium flex flex-col items-center gap-0.5 transition-colors ${
              tab === t.key ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {tab === 'elements' && (
            <>
              <div>
                <Label className="text-xs font-semibold mb-2 block">كتل المحتوى</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {ELEMENT_BLOCKS.map(block => (
                    <button
                      key={block.type}
                      onClick={() => handleAddBlock(block)}
                      className="flex items-center gap-1.5 p-2 rounded-md border border-border text-xs hover:bg-muted transition-colors text-right"
                    >
                      <block.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{block.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold mb-2 block">متغيرات ديناميكية</Label>
                <div className="space-y-1">
                  {DYNAMIC_VARIABLES.map(v => (
                    <button
                      key={v.key}
                      onClick={() => handleAddVariable(v)}
                      className="w-full flex items-center justify-between p-1.5 rounded text-xs hover:bg-muted transition-colors"
                    >
                      <span className="text-muted-foreground font-mono text-[10px]">{v.key}</span>
                      <span>{v.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'layout' && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">حجم الصفحة</Label>
                <select
                  className="w-full border rounded-md p-1.5 text-xs mt-1"
                  value={design.page.size}
                  onChange={e => onUpdateDesign(d => ({ ...d, page: { ...d.page, size: e.target.value as any } }))}
                >
                  <option value="A4">A4</option>
                  <option value="A5">A5</option>
                  <option value="Letter">Letter</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">الاتجاه</Label>
                <div className="flex gap-2 mt-1">
                  {['rtl', 'ltr'].map(dir => (
                    <button
                      key={dir}
                      onClick={() => onUpdateDesign(d => ({ ...d, page: { ...d.page, direction: dir as any } }))}
                      className={`px-3 py-1 rounded text-xs border ${design.page.direction === dir ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                    >
                      {dir === 'rtl' ? 'RTL ←' : 'LTR →'}
                    </button>
                  ))}
                </div>
              </div>
              {['top', 'right', 'bottom', 'left'].map(side => (
                <div key={side}>
                  <Label className="text-xs">هامش {side === 'top' ? 'أعلى' : side === 'right' ? 'يمين' : side === 'bottom' ? 'أسفل' : 'يسار'} ({design.page.margins[side as keyof typeof design.page.margins]}mm)</Label>
                  <Slider
                    value={[design.page.margins[side as keyof typeof design.page.margins]]}
                    min={5} max={40} step={1}
                    onValueChange={([v]) => onUpdateDesign(d => ({ ...d, page: { ...d.page, margins: { ...d.page.margins, [side]: v } } }))}
                    className="mt-1"
                  />
                </div>
              ))}
              <div>
                <Label className="text-xs">ارتفاع الهيدر ({design.zones.header.height}px)</Label>
                <Slider
                  value={[design.zones.header.height]}
                  min={60} max={200} step={5}
                  onValueChange={([v]) => onUpdateDesign(d => ({ ...d, zones: { ...d.zones, header: { ...d.zones.header, height: v } } }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">ارتفاع الفوتر ({design.zones.footer.height}px)</Label>
                <Slider
                  value={[design.zones.footer.height]}
                  min={20} max={100} step={5}
                  onValueChange={([v]) => onUpdateDesign(d => ({ ...d, zones: { ...d.zones, footer: { ...d.zones.footer, height: v } } }))}
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {tab === 'style' && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs font-semibold mb-2 block">ثيمات جاهزة</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {PRESET_THEMES.map(pt => (
                    <button
                      key={pt.id}
                      onClick={() => onUpdateDesign(d => ({
                        ...d,
                        theme: { ...d.theme, ...pt.theme },
                        zones: {
                          header: { ...d.zones.header, background: pt.theme.primaryColor || d.zones.header.background },
                          footer: { ...d.zones.footer, background: pt.theme.primaryColor || d.zones.footer.background },
                        },
                      }))}
                      className="p-2 rounded-md border border-border text-xs hover:bg-muted transition-colors text-center"
                    >
                      <div className="w-full h-4 rounded mb-1" style={{ background: pt.theme.primaryColor }} />
                      {pt.label}
                    </button>
                  ))}
                </div>
              </div>
              {[
                { key: 'primaryColor', label: 'لون أساسي' },
                { key: 'secondaryColor', label: 'لون ثانوي' },
                { key: 'textColor', label: 'لون النص' },
                { key: 'pageBackground', label: 'خلفية الصفحة' },
              ].map(c => (
                <div key={c.key} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={(design.theme as any)[c.key]}
                    onChange={e => onUpdateDesign(d => ({ ...d, theme: { ...d.theme, [c.key]: e.target.value } }))}
                    className="w-7 h-7 rounded border cursor-pointer"
                  />
                  <Label className="text-xs">{c.label}</Label>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Label className="text-xs">علامة مائية</Label>
                <Switch
                  checked={design.theme.watermark.enabled}
                  onCheckedChange={v => onUpdateDesign(d => ({ ...d, theme: { ...d.theme, watermark: { ...d.theme.watermark, enabled: v } } }))}
                />
              </div>
              {design.theme.watermark.enabled && (
                <div>
                  <Label className="text-xs">شفافية ({Math.round(design.theme.watermark.opacity * 100)}%)</Label>
                  <Slider
                    value={[design.theme.watermark.opacity * 100]}
                    min={1} max={20} step={1}
                    onValueChange={([v]) => onUpdateDesign(d => ({ ...d, theme: { ...d.theme, watermark: { ...d.theme.watermark, opacity: v / 100 } } }))}
                    className="mt-1"
                  />
                </div>
              )}
              <div>
                <Label className="text-xs">خط الجسم</Label>
                <select
                  className="w-full border rounded-md p-1.5 text-xs mt-1"
                  value={design.theme.fontFamily}
                  onChange={e => onUpdateDesign(d => ({ ...d, theme: { ...d.theme, fontFamily: e.target.value } }))}
                >
                  <option value="Cairo">Cairo</option>
                  <option value="Amiri">Amiri</option>
                  <option value="Tajawal">Tajawal</option>
                  <option value="Arial">Arial</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">خط العنوان</Label>
                <select
                  className="w-full border rounded-md p-1.5 text-xs mt-1"
                  value={design.theme.titleFont}
                  onChange={e => onUpdateDesign(d => ({ ...d, theme: { ...d.theme, titleFont: e.target.value } }))}
                >
                  <option value="Amiri">Amiri (خطي)</option>
                  <option value="Cairo">Cairo</option>
                  <option value="Tajawal">Tajawal</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default DesignerSidebar;
