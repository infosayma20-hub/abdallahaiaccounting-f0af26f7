import { useMemo, useState } from "react";
import { Plus, Pencil, Power, Trash2, Search, ChevronRight, ChevronDown, Tag, Filter } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import AccountingShell from "@/components/layout/AccountingShell";
import BackButton from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CostCenter,
  COST_CENTER_TYPES,
  costCenterTypeLabel,
  useCostCenters,
  useCostCenterMutations,
} from "@/hooks/useCostCenters";
import CostCenterFormDialog from "@/components/cost-centers/CostCenterFormDialog";

/** صفحة إدارة مراكز التكلفة — شجرة + جدول + بحث + فلاتر */
export default function CostCentersPage() {
  const { data: centers = [], isLoading } = useCostCenters({ includeInactive: true });
  const { setActive, remove } = useCostCenterMutations();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dlgOpen, setDlgOpen] = useState(false);
  const [editing, setEditing] = useState<CostCenter | null>(null);

  const branchesQ = useQuery({
    queryKey: ["branches-min"],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name").order("name");
      return data || [];
    },
  });
  const branchName = (id: string | null) =>
    id ? (branchesQ.data || []).find((b: any) => b.id === id)?.name || "—" : "—";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return centers.filter((c) => {
      if (typeFilter !== "all" && c.center_type !== typeFilter) return false;
      if (statusFilter === "active" && !c.is_active) return false;
      if (statusFilter === "inactive" && c.is_active) return false;
      if (branchFilter !== "all") {
        if (branchFilter === "none" && c.branch_id) return false;
        if (branchFilter !== "none" && c.branch_id !== branchFilter) return false;
      }
      if (!q) return true;
      return (
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        (c.name_ar || "").toLowerCase().includes(q)
      );
    });
  }, [centers, search, typeFilter, statusFilter, branchFilter]);

  // Build tree from filtered list
  const tree = useMemo(() => {
    const byParent = new Map<string | null, CostCenter[]>();
    for (const c of filtered) {
      const key = c.parent_id || null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(c);
    }
    return byParent;
  }, [filtered]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleEdit = (c: CostCenter) => {
    setEditing(c);
    setDlgOpen(true);
  };

  const handleNew = () => {
    setEditing(null);
    setDlgOpen(true);
  };

  const handleToggleActive = async (c: CostCenter) => {
    try {
      await setActive.mutateAsync({ id: c.id, active: !c.is_active });
      toast.success(c.is_active ? "تم الإيقاف" : "تم التفعيل");
    } catch (e: any) {
      toast.error(e?.message || "فشل");
    }
  };

  const handleDelete = async (c: CostCenter) => {
    if (!confirm(`هل تريد حذف مركز التكلفة "${c.name}"؟`)) return;
    try {
      await remove.mutateAsync(c.id);
      toast.success("تم الحذف");
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الحذف");
    }
  };

  const renderTreeNode = (node: CostCenter, depth: number): JSX.Element => {
    const children = tree.get(node.id) || [];
    const hasChildren = children.length > 0;
    const isOpen = expanded.has(node.id);
    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted/40 rounded text-xs"
          style={{ paddingRight: 8 + depth * 16 }}
        >
          <button
            type="button"
            onClick={() => hasChildren && toggleExpand(node.id)}
            className={`shrink-0 ${hasChildren ? "text-foreground" : "text-transparent"}`}
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded shrink-0">{node.code}</span>
          <span className="flex-1 truncate font-medium">{node.name_ar || node.name}</span>
          {!node.is_active && (
            <Badge variant="secondary" className="text-[9px] h-4">موقوف</Badge>
          )}
          <span className="text-[10px] text-muted-foreground">{costCenterTypeLabel(node.center_type)}</span>
        </div>
        {isOpen && hasChildren && children.map((c) => renderTreeNode(c, depth + 1))}
      </div>
    );
  };

  const roots = tree.get(null) || [];

  return (
    <AccountingShell>
      <div dir="rtl" className="space-y-4">
        <div className="flex items-center justify-between">
          <PageHeader title="مراكز التكلفة" breadcrumb={["الرئيسية", "المحاسبة", "مراكز التكلفة"]} />
          <BackButton />
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          إدارة مراكز التكلفة كأبعاد مالية تنتقل تلقائياً إلى القيود والتقارير
        </p>

        {/* Filters + Actions */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-4">
                <label className="text-xs mb-1.5 block text-muted-foreground">بحث</label>
                <div className="relative">
                  <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="بحث بالكود أو الاسم..."
                    className="pr-8 h-9 text-xs"
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs mb-1.5 block text-muted-foreground">النوع</label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {COST_CENTER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs mb-1.5 block text-muted-foreground">الحالة</label>
                <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="active">نشط</SelectItem>
                    <SelectItem value="inactive">موقوف</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs mb-1.5 block text-muted-foreground">الفرع</label>
                <Select value={branchFilter} onValueChange={setBranchFilter}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="none">بدون فرع</SelectItem>
                    {(branchesQ.data || []).map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Button onClick={handleNew} className="w-full gap-1.5 h-9">
                  <Plus className="h-4 w-4" />
                  مركز جديد
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Tree */}
          <Card className="lg:col-span-4">
            <CardContent className="p-4">
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                الشجرة الهرمية
              </h3>
              {isLoading ? (
                <div className="text-xs text-muted-foreground py-6 text-center">جاري التحميل...</div>
              ) : roots.length === 0 ? (
                <div className="text-xs text-muted-foreground py-6 text-center">
                  لا توجد مراكز تكلفة مطابقة
                </div>
              ) : (
                <div className="max-h-[520px] overflow-y-auto">
                  {roots.map((r) => renderTreeNode(r, 0))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="lg:col-span-8">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-primary text-primary-foreground">
                    <tr>
                      <th className="p-2.5 text-right font-medium w-24">الكود</th>
                      <th className="p-2.5 text-right font-medium">الاسم</th>
                      <th className="p-2.5 text-right font-medium w-24">النوع</th>
                      <th className="p-2.5 text-right font-medium w-28">الفرع</th>
                      <th className="p-2.5 text-right font-medium w-20">الحالة</th>
                      <th className="p-2.5 text-center font-medium w-36">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-muted-foreground">
                          لا توجد بيانات
                        </td>
                      </tr>
                    )}
                    {filtered.map((c) => (
                      <tr key={c.id} className="border-b hover:bg-muted/30">
                        <td className="p-2.5 font-mono text-[11px]">{c.code}</td>
                        <td className="p-2.5 font-medium">{c.name_ar || c.name}</td>
                        <td className="p-2.5 text-muted-foreground">{costCenterTypeLabel(c.center_type)}</td>
                        <td className="p-2.5 text-muted-foreground">{branchName(c.branch_id)}</td>
                        <td className="p-2.5">
                          {c.is_active ? (
                            <Badge variant="default" className="text-[10px]">نشط</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">موقوف</Badge>
                          )}
                        </td>
                        <td className="p-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(c)} title="تعديل">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => handleToggleActive(c)}
                              title={c.is_active ? "إيقاف" : "تفعيل"}
                            >
                              <Power className={`h-3.5 w-3.5 ${c.is_active ? "text-emerald-600" : "text-muted-foreground"}`} />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              onClick={() => handleDelete(c)}
                              title="حذف"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <CostCenterFormDialog open={dlgOpen} onOpenChange={setDlgOpen} editing={editing} />
      </div>
    </AccountingShell>
  );
}