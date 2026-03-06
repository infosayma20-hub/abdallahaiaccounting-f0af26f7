import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowRight, Plus, Trash2, GripVertical, Check, X,
  SlidersHorizontal, Package, ChevronDown, ChevronUp, Save,
} from "lucide-react";

interface ModifierOption {
  id: string;
  name: string;
  extra_price: number;
  is_default: boolean;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  isNew?: boolean;
}

interface ModifierGroup {
  id: string;
  name: string;
  selection_type: "single" | "multiple";
  is_required: boolean;
  min_select: number;
  max_select: number;
  sort_order: number;
  is_active: boolean;
  options: ModifierOption[];
  expanded?: boolean;
}

const PRESET_COLORS = [
  "#22C55E", "#F59E0B", "#EF4444", "#DC2626",
  "#3B82F6", "#8B5CF6", "#EC4899", "#6B7280",
];

export default function ModifierManagerPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);

  // Product linking
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkGroupId, setLinkGroupId] = useState<string | null>(null);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [linkedProductIds, setLinkedProductIds] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    supabase.rpc("get_team_owner_id", { _user_id: user.id }).then(({ data }) => {
      setDataOwnerId(data || user.id);
    });
  }, [user?.id]);

  const loadGroups = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    const { data: groupsData } = await supabase
      .from("modifier_groups")
      .select("*")
      .eq("user_id", dataOwnerId)
      .order("sort_order");

    if (!groupsData) { setLoading(false); return; }

    const groupIds = groupsData.map(g => g.id);
    const { data: optionsData } = groupIds.length > 0
      ? await supabase.from("modifier_options").select("*").in("group_id", groupIds).order("sort_order")
      : { data: [] };

    setGroups(groupsData.map(g => ({
      ...g,
      selection_type: g.selection_type as "single" | "multiple",
      options: (optionsData || []).filter(o => o.group_id === g.id).map(o => ({
        ...o,
        extra_price: Number(o.extra_price),
      })),
      expanded: false,
    })));
    setLoading(false);
  }, [dataOwnerId]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const loadProducts = async () => {
    if (!dataOwnerId) return;
    const { data } = await supabase
      .from("products")
      .select("id, name")
      .eq("user_id", dataOwnerId)
      .eq("is_pos_available", true)
      .order("name");
    setProducts(data || []);
  };

  const addGroup = async () => {
    if (!dataOwnerId) return;
    const { data, error } = await supabase.from("modifier_groups").insert({
      user_id: dataOwnerId,
      name: "مجموعة جديدة",
      sort_order: groups.length,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setGroups(prev => [...prev, { ...data, selection_type: data.selection_type as "single" | "multiple", options: [], expanded: true }]);
    toast.success("تم إضافة مجموعة جديدة");
  };

  const updateGroup = async (groupId: string, updates: Partial<ModifierGroup>) => {
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, ...updates } : g));
    const dbUpdates: any = { ...updates };
    delete dbUpdates.options;
    delete dbUpdates.expanded;
    await supabase.from("modifier_groups").update(dbUpdates).eq("id", groupId);
  };

  const deleteGroup = async (groupId: string) => {
    await supabase.from("modifier_groups").delete().eq("id", groupId);
    setGroups(prev => prev.filter(g => g.id !== groupId));
    toast.success("تم حذف المجموعة");
  };

  const addOption = async (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    const { data, error } = await supabase.from("modifier_options").insert({
      group_id: groupId,
      name: "خيار جديد",
      sort_order: group.options.length,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setGroups(prev => prev.map(g => g.id === groupId ? {
      ...g,
      options: [...g.options, { ...data, extra_price: Number(data.extra_price) }],
    } : g));
  };

  const updateOption = async (optId: string, groupId: string, updates: Partial<ModifierOption>) => {
    setGroups(prev => prev.map(g => g.id === groupId ? {
      ...g,
      options: g.options.map(o => o.id === optId ? { ...o, ...updates } : o),
    } : g));
    const dbUpdates: any = { ...updates };
    delete dbUpdates.isNew;
    await supabase.from("modifier_options").update(dbUpdates).eq("id", optId);
  };

  const deleteOption = async (optId: string, groupId: string) => {
    await supabase.from("modifier_options").delete().eq("id", optId);
    setGroups(prev => prev.map(g => g.id === groupId ? {
      ...g,
      options: g.options.filter(o => o.id !== optId),
    } : g));
  };

  const openLinkDialog = async (groupId: string) => {
    setLinkGroupId(groupId);
    await loadProducts();
    const { data } = await supabase
      .from("product_modifier_groups")
      .select("product_id")
      .eq("group_id", groupId);
    setLinkedProductIds((data || []).map(d => d.product_id));
    setShowLinkDialog(true);
  };

  const toggleProductLink = async (productId: string) => {
    if (!linkGroupId) return;
    if (linkedProductIds.includes(productId)) {
      await supabase.from("product_modifier_groups").delete()
        .eq("product_id", productId).eq("group_id", linkGroupId);
      setLinkedProductIds(prev => prev.filter(id => id !== productId));
    } else {
      await supabase.from("product_modifier_groups").insert({
        product_id: productId,
        group_id: linkGroupId,
      });
      setLinkedProductIds(prev => [...prev, productId]);
    }
  };

  const filteredProducts = productSearch
    ? products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()))
    : products;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background" dir="rtl">
      {/* Header */}
      <header className="h-14 bg-card border-b border-border flex items-center px-4 gap-3 shrink-0">
        <button onClick={() => navigate("/pos")} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors">
          <ArrowRight className="h-4 w-4" />
        </button>
        <SlidersHorizontal className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">إدارة الإضافات والمعدّلات</h1>
        <div className="flex-1" />
        <Button onClick={addGroup} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          مجموعة جديدة
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto p-4 space-y-4">
          {groups.length === 0 && (
            <div className="text-center py-20 space-y-3">
              <SlidersHorizontal className="h-12 w-12 mx-auto text-muted-foreground/20" />
              <p className="text-muted-foreground">لا توجد مجموعات إضافات بعد</p>
              <Button onClick={addGroup} variant="outline" className="gap-1.5">
                <Plus className="h-4 w-4" />
                إنشاء أول مجموعة
              </Button>
            </div>
          )}

          {groups.map(group => (
            <div key={group.id} className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Group Header */}
              <div className="flex items-center gap-3 p-4">
                <button
                  onClick={() => setGroups(prev => prev.map(g => g.id === group.id ? { ...g, expanded: !g.expanded } : g))}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {group.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                <Input
                  value={group.name}
                  onChange={e => updateGroup(group.id, { name: e.target.value })}
                  className="h-8 text-sm font-bold flex-1 max-w-[200px]"
                />

                <select
                  value={group.selection_type}
                  onChange={e => updateGroup(group.id, { selection_type: e.target.value as "single" | "multiple" })}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="single">اختيار واحد</option>
                  <option value="multiple">اختيار متعدد</option>
                </select>

                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">إلزامي</span>
                  <Switch
                    checked={group.is_required}
                    onCheckedChange={v => updateGroup(group.id, { is_required: v })}
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => openLinkDialog(group.id)}
                >
                  <Package className="h-3 w-3" />
                  ربط بمنتجات
                </Button>

                <button
                  onClick={() => deleteGroup(group.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Options */}
              {group.expanded && (
                <div className="border-t border-border px-4 pb-4 pt-3 space-y-2">
                  {group.options.map(opt => (
                    <div key={opt.id} className="flex items-center gap-2 bg-muted/30 rounded-lg p-2">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />

                      <Input
                        value={opt.name}
                        onChange={e => updateOption(opt.id, group.id, { name: e.target.value })}
                        className="h-7 text-xs flex-1 max-w-[180px]"
                        placeholder="اسم الخيار"
                      />

                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">₪</span>
                        <Input
                          type="number"
                          value={opt.extra_price}
                          onChange={e => updateOption(opt.id, group.id, { extra_price: Number(e.target.value) })}
                          className="h-7 w-16 text-xs text-center"
                          step="0.5"
                        />
                      </div>

                      <select
                        value={opt.color || ""}
                        onChange={e => updateOption(opt.id, group.id, { color: e.target.value || null })}
                        className="h-7 w-8 rounded border border-input bg-background text-xs p-0"
                        style={{ backgroundColor: opt.color || undefined }}
                      >
                        <option value="">—</option>
                        {PRESET_COLORS.map(c => (
                          <option key={c} value={c} style={{ backgroundColor: c }}>●</option>
                        ))}
                      </select>

                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">افتراضي</span>
                        <Switch
                          checked={opt.is_default}
                          onCheckedChange={v => updateOption(opt.id, group.id, { is_default: v })}
                        />
                      </div>

                      <button
                        onClick={() => deleteOption(opt.id, group.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs gap-1 border-dashed"
                    onClick={() => addOption(group.id)}
                  >
                    <Plus className="h-3 w-3" />
                    إضافة خيار
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Link Products Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              ربط المجموعة بالمنتجات
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              placeholder="ابحث عن منتج..."
              className="h-9 text-sm"
            />
            <ScrollArea className="h-60">
              <div className="space-y-1">
                {filteredProducts.map(p => {
                  const isLinked = linkedProductIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleProductLink(p.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-right ${
                        isLinked ? "bg-primary/10 text-primary" : "hover:bg-muted"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        isLinked ? "border-primary bg-primary" : "border-border"
                      }`}>
                        {isLinked && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                      </div>
                      <span>{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
            <p className="text-xs text-muted-foreground text-center">
              {linkedProductIds.length} منتج مرتبط
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
