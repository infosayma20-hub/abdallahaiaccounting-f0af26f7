import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Plus, Save, ArrowRight, Trash2, Square, Circle,
  RectangleHorizontal, Settings, GripVertical, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";

interface Section {
  id: string;
  name: string;
  sort_order: number;
  is_new?: boolean;
}

interface Table {
  id: string;
  section_id: string;
  name: string;
  seats: number;
  shape: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  rotation: number;
  is_active: boolean;
  is_new?: boolean;
}

function DraggableTable({ table, isSelected, onClick }: {
  table: Table; isSelected: boolean; onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: table.id });
  const style: React.CSSProperties = {
    position: "absolute",
    left: table.pos_x + (transform?.x || 0),
    top: table.pos_y + (transform?.y || 0),
    width: table.width,
    height: table.height,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.8 : 1,
    transform: `rotate(${table.rotation}deg)`,
  };

  const shapeClass = table.shape === "round" ? "rounded-full" : table.shape === "rectangle" ? "rounded-xl" : "rounded-xl";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`
        ${shapeClass} border-2 border-dashed cursor-grab active:cursor-grabbing
        flex flex-col items-center justify-center gap-1 select-none transition-colors
        ${isSelected
          ? "border-primary bg-primary/10"
          : "border-muted-foreground/30 bg-card hover:border-primary/50"
        }
      `}
    >
      <GripVertical className="w-3 h-3 text-muted-foreground/50" />
      <span className="text-xs font-bold text-foreground">{table.name}</span>
      <span className="text-[10px] text-muted-foreground">{table.seats} كرسي</span>
    </div>
  );
}

export default function FloorPlanEditorPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sections, setSections] = useState<Section[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [showNewSection, setShowNewSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [showNewTable, setShowNewTable] = useState(false);
  const [newTableForm, setNewTableForm] = useState({ name: "", seats: 4, shape: "square" as string });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const userId = user?.id;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const loadData = useCallback(async () => {
    if (!userId) return;
    const ownerId = (await supabase.rpc("get_team_owner_id", { _user_id: userId })).data || userId;

    const [secRes, tabRes] = await Promise.all([
      supabase.from("restaurant_sections").select("*").eq("user_id", ownerId).order("sort_order"),
      supabase.from("restaurant_tables").select("*").eq("user_id", ownerId).eq("is_active", true),
    ]);

    const secs = (secRes.data || []) as Section[];
    const tabs = (tabRes.data || []) as Table[];
    setSections(secs);
    setTables(tabs);
    if (secs.length > 0 && !activeSection) setActiveSection(secs[0].id);
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredTables = activeSection ? tables.filter(t => t.section_id === activeSection) : [];

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event;
    setTables(prev => prev.map(t =>
      t.id === active.id
        ? { ...t, pos_x: Math.max(0, t.pos_x + delta.x), pos_y: Math.max(0, t.pos_y + delta.y) }
        : t
    ));
  };

  const handleAddSection = async () => {
    if (!newSectionName.trim() || !userId) return;
    const ownerId = (await supabase.rpc("get_team_owner_id", { _user_id: userId })).data || userId;

    const { data, error } = await supabase.from("restaurant_sections").insert({
      user_id: ownerId,
      name: newSectionName.trim(),
      sort_order: sections.length,
    }).select().single();

    if (error) { toast.error("خطأ في إنشاء القاعة"); return; }
    setSections(prev => [...prev, data as Section]);
    setActiveSection((data as Section).id);
    setNewSectionName("");
    setShowNewSection(false);
    toast.success("تم إنشاء القاعة");
  };

  const handleAddTable = async () => {
    if (!newTableForm.name.trim() || !activeSection || !userId) return;
    const ownerId = (await supabase.rpc("get_team_owner_id", { _user_id: userId })).data || userId;

    const { data, error } = await supabase.from("restaurant_tables").insert({
      user_id: ownerId,
      section_id: activeSection,
      name: newTableForm.name.trim(),
      seats: newTableForm.seats,
      shape: newTableForm.shape,
      pos_x: 50 + Math.random() * 200,
      pos_y: 50 + Math.random() * 200,
    }).select().single();

    if (error) { toast.error("خطأ في إنشاء الطاولة"); return; }
    setTables(prev => [...prev, data as Table]);
    setNewTableForm({ name: "", seats: 4, shape: "square" });
    setShowNewTable(false);
    toast.success("تم إنشاء الطاولة");
  };

  const handleDeleteTable = async (tableId: string) => {
    await supabase.from("restaurant_tables").update({ is_active: false }).eq("id", tableId);
    setTables(prev => prev.filter(t => t.id !== tableId));
    setSelectedTable(null);
    toast.success("تم حذف الطاولة");
  };

  const handleSavePositions = async () => {
    setSaving(true);
    try {
      const updates = tables.map(t =>
        supabase.from("restaurant_tables").update({
          pos_x: t.pos_x, pos_y: t.pos_y, width: t.width, height: t.height, rotation: t.rotation,
        }).eq("id", t.id)
      );
      await Promise.all(updates);
      toast.success("تم حفظ الخريطة");
    } catch {
      toast.error("خطأ في الحفظ");
    }
    setSaving(false);
  };

  const updateSelectedTable = (field: string, value: any) => {
    if (!selectedTable) return;
    setTables(prev => prev.map(t => t.id === selectedTable ? { ...t, [field]: value } : t));
  };

  const saveTableProps = async () => {
    if (!selectedTable) return;
    const t = tables.find(x => x.id === selectedTable);
    if (!t) return;
    await supabase.from("restaurant_tables").update({
      name: t.name, seats: t.seats, shape: t.shape,
      width: t.width, height: t.height, rotation: t.rotation,
    }).eq("id", t.id);
    toast.success("تم حفظ خصائص الطاولة");
  };

  const selectedT = tables.find(t => t.id === selectedTable);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-muted/30 overflow-hidden" dir="rtl">
      {/* Header */}
      <header className="bg-card border-b px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/apps")}>
            <ArrowRight className="w-5 h-5" />
          </Button>
          <h1 className="text-base font-bold text-foreground">تصميم خريطة الطاولات</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/pos/floor-plan")}>
            <Eye className="w-4 h-4 ml-1" />
            معاينة
          </Button>
          <Button size="sm" onClick={handleSavePositions} disabled={saving}>
            <Save className="w-4 h-4 ml-1" />
            {saving ? "جاري الحفظ..." : "حفظ الخريطة"}
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-card border-l shrink-0 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              {/* Sections */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground">القاعات</h3>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowNewSection(true)}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {sections.map(sec => (
                  <button
                    key={sec.id}
                    onClick={() => { setActiveSection(sec.id); setSelectedTable(null); }}
                    className={`w-full text-right px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeSection === sec.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-foreground"
                    }`}
                  >
                    {sec.name}
                  </button>
                ))}
              </div>

              {/* Add tables */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground">الطاولات</h3>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => setShowNewTable(true)}
                    disabled={!activeSection}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { shape: "square", icon: Square, label: "مربعة" },
                    { shape: "round", icon: Circle, label: "دائرية" },
                    { shape: "rectangle", icon: RectangleHorizontal, label: "مستطيلة" },
                  ].map(s => (
                    <button
                      key={s.shape}
                      onClick={() => { setNewTableForm(f => ({ ...f, shape: s.shape })); setShowNewTable(true); }}
                      disabled={!activeSection}
                      className="p-2 rounded-lg border border-dashed border-muted-foreground/30 hover:border-primary/50 flex flex-col items-center gap-1 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                    >
                      <s.icon className="w-5 h-5" />
                      <span className="text-[10px]">{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected table properties */}
              {selectedT && (
                <div className="space-y-3 border-t pt-4">
                  <h3 className="text-sm font-bold text-foreground">خصائص الطاولة</h3>
                  <div className="space-y-2">
                    <Label className="text-xs">الاسم</Label>
                    <Input
                      value={selectedT.name}
                      onChange={e => updateSelectedTable("name", e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">الكراسي</Label>
                    <Input
                      type="number" min={1} max={20}
                      value={selectedT.seats}
                      onChange={e => updateSelectedTable("seats", parseInt(e.target.value) || 1)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">الشكل</Label>
                    <div className="flex gap-1">
                      {["square", "round", "rectangle"].map(sh => (
                        <button
                          key={sh}
                          onClick={() => updateSelectedTable("shape", sh)}
                          className={`flex-1 py-1 rounded text-xs border ${
                            selectedT.shape === sh ? "bg-primary text-primary-foreground border-primary" : "border-border"
                          }`}
                        >
                          {sh === "square" ? "مربع" : sh === "round" ? "دائري" : "مستطيل"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">العرض</Label>
                      <Input
                        type="number" min={60} max={300}
                        value={selectedT.width}
                        onChange={e => updateSelectedTable("width", parseInt(e.target.value) || 110)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">الارتفاع</Label>
                      <Input
                        type="number" min={60} max={300}
                        value={selectedT.height}
                        onChange={e => updateSelectedTable("height", parseInt(e.target.value) || 110)}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={saveTableProps}>حفظ</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteTable(selectedT.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* Canvas */}
        <main className="flex-1 overflow-auto relative bg-[repeating-linear-gradient(0deg,transparent,transparent_19px,hsl(var(--border)/0.3)_19px,hsl(var(--border)/0.3)_20px),repeating-linear-gradient(90deg,transparent,transparent_19px,hsl(var(--border)/0.3)_19px,hsl(var(--border)/0.3)_20px)]">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div
              className="relative min-h-full min-w-full"
              style={{ minHeight: 600, minWidth: 800 }}
              onClick={() => setSelectedTable(null)}
            >
              {filteredTables.map(table => (
                <DraggableTable
                  key={table.id}
                  table={table}
                  isSelected={selectedTable === table.id}
                  onClick={() => setSelectedTable(table.id)}
                />
              ))}
              {filteredTables.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50">
                  <p className="text-sm">اسحب وأفلت الطاولات هنا</p>
                </div>
              )}
            </div>
          </DndContext>
        </main>
      </div>

      {/* New section dialog */}
      <Dialog open={showNewSection} onOpenChange={setShowNewSection}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة قاعة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>اسم القاعة</Label>
            <Input
              value={newSectionName}
              onChange={e => setNewSectionName(e.target.value)}
              placeholder="مثال: القاعة الرئيسية، تراس، VIP"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewSection(false)}>إلغاء</Button>
            <Button onClick={handleAddSection} disabled={!newSectionName.trim()}>إنشاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New table dialog */}
      <Dialog open={showNewTable} onOpenChange={setShowNewTable}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة طاولة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>اسم الطاولة</Label>
              <Input
                value={newTableForm.name}
                onChange={e => setNewTableForm(f => ({ ...f, name: e.target.value }))}
                placeholder="مثال: T1, VIP-1, BAR-1"
              />
            </div>
            <div className="space-y-1">
              <Label>عدد الكراسي</Label>
              <Input
                type="number" min={1} max={20}
                value={newTableForm.seats}
                onChange={e => setNewTableForm(f => ({ ...f, seats: parseInt(e.target.value) || 4 }))}
              />
            </div>
            <div className="space-y-1">
              <Label>الشكل</Label>
              <div className="flex gap-2">
                {[
                  { v: "square", l: "مربعة", I: Square },
                  { v: "round", l: "دائرية", I: Circle },
                  { v: "rectangle", l: "مستطيلة", I: RectangleHorizontal },
                ].map(s => (
                  <button
                    key={s.v}
                    onClick={() => setNewTableForm(f => ({ ...f, shape: s.v }))}
                    className={`flex-1 py-2 rounded-lg border flex flex-col items-center gap-1 text-sm ${
                      newTableForm.shape === s.v
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <s.I className="w-5 h-5" />
                    {s.l}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTable(false)}>إلغاء</Button>
            <Button onClick={handleAddTable} disabled={!newTableForm.name.trim()}>إضافة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
