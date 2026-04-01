import { useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyLogo } from "@/hooks/useCompanyLogo";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Save, Undo2, Redo2 } from "lucide-react";
import { DesignElement, TemplateDesign, createDefaultDesign } from "@/components/print-templates/designer/types";
import DesignerSidebar from "@/components/print-templates/designer/DesignerSidebar";
import DesignerCanvas from "@/components/print-templates/designer/DesignerCanvas";
import DesignerProperties from "@/components/print-templates/designer/DesignerProperties";

const TEMPLATE_LABELS: Record<string, string> = {
  QUO: "عرض سعر", CON: "عقد بيع", DEM: "مطالبة مالية", DN: "إشعار دين",
  CN: "إشعار دائن", RCP: "وصل استلام", SUP: "عقد توريد", OD: "إشعار تأخر سداد",
  POA: "تفويض رسمي", CLR: "خطاب إخلاء طرف",
};

const TemplateDesignerPage = () => {
  const { templateType = "QUO" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { logoBase64, companyName } = useCompanyLogo();

  const [design, setDesign] = useState<TemplateDesign>(() => createDefaultDesign(templateType));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<TemplateDesign[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [saving, setSaving] = useState(false);

  const pushHistory = useCallback((d: TemplateDesign) => {
    setHistory(prev => [...prev.slice(0, historyIdx + 1), d]);
    setHistoryIdx(prev => prev + 1);
  }, [historyIdx]);

  const updateDesign = useCallback((updater: (d: TemplateDesign) => TemplateDesign) => {
    setDesign(prev => {
      const next = updater(prev);
      pushHistory(next);
      return next;
    });
  }, [pushHistory]);

  // Direct update without history (for real-time drag)
  const updateDesignDirect = useCallback((updater: (d: TemplateDesign) => TemplateDesign) => {
    setDesign(prev => updater(prev));
  }, []);

  const undo = () => {
    if (historyIdx > 0) {
      setHistoryIdx(historyIdx - 1);
      setDesign(history[historyIdx - 1]);
    }
  };
  const redo = () => {
    if (historyIdx < history.length - 1) {
      setHistoryIdx(historyIdx + 1);
      setDesign(history[historyIdx + 1]);
    }
  };

  const selectedElement = design.elements.find(e => e.id === selectedId) || null;

  const updateElement = (id: string, updates: Partial<DesignElement>) => {
    updateDesign(d => ({
      ...d,
      elements: d.elements.map(e => e.id === id ? { ...e, ...updates } : e),
    }));
  };

  // For drag/resize — no history push until mouseup
  const updateElementDirect = (id: string, updates: Partial<DesignElement>) => {
    updateDesignDirect(d => ({
      ...d,
      elements: d.elements.map(e => e.id === id ? { ...e, ...updates } : e),
    }));
  };

  const updateElementStyle = (id: string, styleUpdates: Partial<DesignElement['style']>) => {
    updateDesign(d => ({
      ...d,
      elements: d.elements.map(e => e.id === id ? { ...e, style: { ...e.style, ...styleUpdates } } : e),
    }));
  };

  const addElement = (el: DesignElement) => {
    updateDesign(d => ({ ...d, elements: [...d.elements, el] }));
    setSelectedId(el.id);
  };

  const removeElement = (id: string) => {
    updateDesign(d => ({ ...d, elements: d.elements.filter(e => e.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  };

  const moveElement = (id: string, direction: 'up' | 'down') => {
    updateDesign(d => {
      const idx = d.elements.findIndex(e => e.id === id);
      if (idx < 0) return d;
      const newElements = [...d.elements];
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= newElements.length) return d;
      [newElements[idx], newElements[swapIdx]] = [newElements[swapIdx], newElements[idx]];
      return { ...d, elements: newElements };
    });
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('print_templates_designs' as any).insert({
        user_id: user.id,
        template_type: templateType,
        name: design.name,
        design_json: design as any,
        is_default: false,
      } as any);
      if (error) throw error;
      toast({ title: "✅ تم حفظ القالب بنجاح" });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top Toolbar */}
      <div className="h-12 border-b border-border bg-card flex items-center gap-2 px-3 shrink-0">
        <Button variant="ghost" size="sm" onClick={() => navigate('/print-templates')}>
          <ArrowRight className="w-4 h-4 ml-1" /> رجوع
        </Button>
        <div className="w-px h-6 bg-border" />
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={undo} disabled={historyIdx <= 0}>
          <Undo2 className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={redo} disabled={historyIdx >= history.length - 1}>
          <Redo2 className="w-4 h-4" />
        </Button>
        <div className="w-px h-6 bg-border" />
        <span className="text-xs text-muted-foreground">
          {TEMPLATE_LABELS[templateType] || templateType}
        </span>
        <Input
          value={design.name}
          onChange={e => setDesign(d => ({ ...d, name: e.target.value }))}
          className="h-7 text-xs w-48"
          placeholder="اسم القالب"
        />
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={handleSave} disabled={saving}>
          <Save className="w-3.5 h-3.5 ml-1" /> {saving ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>

      {/* 3-Panel Layout */}
      <div className="flex-1 flex overflow-hidden">
        <DesignerSidebar
          design={design}
          onAddElement={addElement}
          onUpdateDesign={updateDesign}
        />

        <DesignerCanvas
          design={design}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRemove={removeElement}
          onMove={moveElement}
          onUpdateElement={updateElementDirect}
          logoBase64={logoBase64}
          companyName={companyName}
        />

        <DesignerProperties
          element={selectedElement}
          design={design}
          onUpdateStyle={(updates) => selectedId && updateElementStyle(selectedId, updates)}
          onUpdateElement={(updates) => selectedId && updateElement(selectedId, updates)}
          onUpdateDesign={updateDesign}
        />
      </div>
    </div>
  );
};

export default TemplateDesignerPage;
