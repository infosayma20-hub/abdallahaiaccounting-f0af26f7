import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Building, Plus, Search, Package, TrendingDown, BarChart3,
  Pencil, Trash2, Eye, MoreHorizontal, Download, Wrench, ArrowRightLeft,
  RefreshCw, Calendar, DollarSign, Landmark
} from "lucide-react";
import BackButton from "@/components/BackButton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { multiWordMatchAny } from "@/lib/utils";

interface AssetCategory {
  id: string;
  code: string;
  name_ar: string;
  default_useful_life_years: number | null;
  default_depreciation_method: string;
  default_salvage_rate: number;
  asset_account_code: string | null;
  accumulated_depreciation_account_code: string | null;
  depreciation_expense_account_code: string | null;
}

interface Asset {
  id: string;
  asset_number: string;
  name_ar: string;
  description: string | null;
  category_id: string | null;
  department: string | null;
  location: string | null;
  custodian_name: string | null;
  acquisition_date: string;
  acquisition_cost: number;
  additional_costs: number;
  total_cost: number;
  salvage_value: number;
  useful_life_years: number | null;
  depreciation_method: string;
  accumulated_depreciation: number;
  net_book_value: number;
  status: string;
  serial_number: string | null;
  model: string | null;
  manufacturer: string | null;
  in_service_date: string | null;
  notes: string | null;
  created_at: string;
}

const DEFAULT_CATEGORIES = [
  { code: "CAT-001", name_ar: "أراضي", default_useful_life_years: null, default_depreciation_method: "none", default_salvage_rate: 0, asset_account_code: "1250", accumulated_depreciation_account_code: null, depreciation_expense_account_code: null },
  { code: "CAT-002", name_ar: "مباني وإنشاءات", default_useful_life_years: 25, default_depreciation_method: "straight_line", default_salvage_rate: 10, asset_account_code: "1230", accumulated_depreciation_account_code: "1293", depreciation_expense_account_code: "5710" },
  { code: "CAT-003", name_ar: "آلات ومعدات", default_useful_life_years: 10, default_depreciation_method: "straight_line", default_salvage_rate: 5, asset_account_code: "1220", accumulated_depreciation_account_code: "1292", depreciation_expense_account_code: "5720" },
  { code: "CAT-004", name_ar: "أجهزة حاسوب وتقنية", default_useful_life_years: 4, default_depreciation_method: "straight_line", default_salvage_rate: 0, asset_account_code: "1220", accumulated_depreciation_account_code: "1292", depreciation_expense_account_code: "5720" },
  { code: "CAT-005", name_ar: "أثاث ومفروشات", default_useful_life_years: 7, default_depreciation_method: "straight_line", default_salvage_rate: 5, asset_account_code: "1240", accumulated_depreciation_account_code: "1294", depreciation_expense_account_code: "5740" },
  { code: "CAT-006", name_ar: "مركبات وسيارات", default_useful_life_years: 5, default_depreciation_method: "straight_line", default_salvage_rate: 15, asset_account_code: "1210", accumulated_depreciation_account_code: "1291", depreciation_expense_account_code: "5750" },
  { code: "CAT-007", name_ar: "تحسينات على مبانٍ مستأجرة", default_useful_life_years: 5, default_depreciation_method: "straight_line", default_salvage_rate: 0, asset_account_code: "1255", accumulated_depreciation_account_code: "1295", depreciation_expense_account_code: "5760" },
  { code: "CAT-008", name_ar: "معدات مطبخ ومطاعم", default_useful_life_years: 6, default_depreciation_method: "straight_line", default_salvage_rate: 5, asset_account_code: "1260", accumulated_depreciation_account_code: "1296", depreciation_expense_account_code: "5770" },
  { code: "CAT-009", name_ar: "أجهزة كهربائية", default_useful_life_years: 5, default_depreciation_method: "straight_line", default_salvage_rate: 5, asset_account_code: "1270", accumulated_depreciation_account_code: "1297", depreciation_expense_account_code: "5780" },
  { code: "CAT-010", name_ar: "أصول غير ملموسة", default_useful_life_years: 5, default_depreciation_method: "straight_line", default_salvage_rate: 0, asset_account_code: "1280", accumulated_depreciation_account_code: "1298", depreciation_expense_account_code: "5790" },
];

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "مسودة", variant: "outline" },
  active: { label: "نشط", variant: "default" },
  fully_depreciated: { label: "مُهلك بالكامل", variant: "secondary" },
  disposed: { label: "تم الاستبعاد", variant: "destructive" },
  sold: { label: "تم البيع", variant: "secondary" },
  written_off: { label: "مشطوب", variant: "destructive" },
  inactive: { label: "غير نشط", variant: "outline" },
};

const METHOD_LABELS: Record<string, string> = {
  straight_line: "القسط الثابت",
  declining_balance: "القسط المتناقص",
  units_of_production: "وحدات الإنتاج",
  none: "بدون استهلاك",
};

const fmt = (n: number) => `₪${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const FixedAssetsPage = () => {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [editMode, setEditMode] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name_ar: "", description: "", category_id: "", department: "", location: "",
    custodian_name: "", acquisition_date: new Date().toISOString().split("T")[0],
    in_service_date: "", acquisition_cost: "", additional_costs: "0",
    salvage_value: "", useful_life_years: "", depreciation_method: "straight_line",
    serial_number: "", model: "", manufacturer: "", notes: "",
  });

  useEffect(() => {
    if (user) {
      loadCategories();
      loadAssets();
    }
  }, [user]);

  const loadCategories = async () => {
    const { data } = await supabase.from("asset_categories").select("*").eq("user_id", user!.id).order("code");
    if (data && data.length > 0) {
      setCategories(data as AssetCategory[]);
    } else {
      await seedCategories();
    }
  };

  const seedCategories = async () => {
    const rows = DEFAULT_CATEGORIES.map((c) => ({ ...c, user_id: user!.id }));
    const { data, error } = await supabase.from("asset_categories").insert(rows).select();
    if (error) { toast.error("خطأ في إنشاء التصنيفات"); return; }
    setCategories((data || []) as AssetCategory[]);
  };

  const loadAssets = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("assets").select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
    if (error) toast.error("خطأ في تحميل الأصول");
    setAssets((data || []) as Asset[]);
    setLoading(false);
  };

  const getNextAssetNumber = () => {
    if (assets.length === 0) return "AST-0001";
    const nums = assets.map((a) => parseInt(a.asset_number.replace("AST-", "")) || 0);
    return `AST-${String(Math.max(...nums) + 1).padStart(4, "0")}`;
  };

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      if (search && !a.name_ar.includes(search) && !a.asset_number.includes(search) && !(a.serial_number || "").includes(search)) return false;
      if (filterStatus !== "all" && a.status !== filterStatus) return false;
      if (filterCategory !== "all" && a.category_id !== filterCategory) return false;
      return true;
    });
  }, [assets, search, filterStatus, filterCategory]);

  const stats = useMemo(() => {
    const active = assets.filter((a) => a.status !== "disposed" && a.status !== "sold" && a.status !== "written_off");
    return {
      count: active.length,
      totalCost: active.reduce((s, a) => s + (a.total_cost || 0), 0),
      totalDep: active.reduce((s, a) => s + (a.accumulated_depreciation || 0), 0),
      nbv: active.reduce((s, a) => s + (a.net_book_value || 0), 0),
    };
  }, [assets]);

  const resetForm = () => {
    setForm({
      name_ar: "", description: "", category_id: "", department: "", location: "",
      custodian_name: "", acquisition_date: new Date().toISOString().split("T")[0],
      in_service_date: "", acquisition_cost: "", additional_costs: "0",
      salvage_value: "", useful_life_years: "", depreciation_method: "straight_line",
      serial_number: "", model: "", manufacturer: "", notes: "",
    });
    setEditMode(false);
    setSelectedAsset(null);
  };

  const handleCategoryChange = (catId: string) => {
    setForm((f) => ({ ...f, category_id: catId }));
    const cat = categories.find((c) => c.id === catId);
    if (cat) {
      setForm((f) => ({
        ...f, category_id: catId,
        useful_life_years: cat.default_useful_life_years?.toString() || "",
        depreciation_method: cat.default_depreciation_method || "straight_line",
        salvage_value: cat.default_salvage_rate > 0 ? "" : "0",
      }));
    }
  };

  const handleSave = async () => {
    if (!form.name_ar || !form.acquisition_cost) { toast.error("يرجى ملء الحقول المطلوبة"); return; }
    const acqCost = parseFloat(form.acquisition_cost) || 0;
    const addCosts = parseFloat(form.additional_costs) || 0;
    const salvage = parseFloat(form.salvage_value) || 0;
    const lifeYears = parseInt(form.useful_life_years) || 0;
    const totalCostCalc = acqCost + addCosts;
    const nbv = totalCostCalc - 0; // new asset, no depreciation yet

    const record: any = {
      user_id: user!.id,
      name_ar: form.name_ar,
      description: form.description || null,
      category_id: form.category_id || null,
      department: form.department || null,
      location: form.location || null,
      custodian_name: form.custodian_name || null,
      acquisition_date: form.acquisition_date,
      in_service_date: form.in_service_date || form.acquisition_date,
      acquisition_cost: acqCost,
      additional_costs: addCosts,
      salvage_value: salvage,
      useful_life_years: lifeYears || null,
      useful_life_months: lifeYears ? lifeYears * 12 : null,
      depreciation_method: form.depreciation_method,
      depreciation_start_date: form.in_service_date || form.acquisition_date,
      net_book_value: editMode ? undefined : totalCostCalc,
      accumulated_depreciation: editMode ? undefined : 0,
      cost_ils: totalCostCalc,
      serial_number: form.serial_number || null,
      model: form.model || null,
      manufacturer: form.manufacturer || null,
      notes: form.notes || null,
      status: "active",
    };

    if (editMode && selectedAsset) {
      delete record.net_book_value;
      delete record.accumulated_depreciation;
      delete record.user_id;
      const { error } = await supabase.from("assets").update(record).eq("id", selectedAsset.id);
      if (error) { toast.error("خطأ في التحديث: " + error.message); return; }
      toast.success("تم تحديث الأصل بنجاح");
    } else {
      record.asset_number = getNextAssetNumber();
      const { error } = await supabase.from("assets").insert(record);
      if (error) { toast.error("خطأ في الإضافة: " + error.message); return; }
      toast.success("تم إضافة الأصل بنجاح");
    }

    setShowAddDialog(false);
    resetForm();
    loadAssets();
  };

  const handleEdit = (asset: Asset) => {
    setEditMode(true);
    setSelectedAsset(asset);
    setForm({
      name_ar: asset.name_ar,
      description: asset.description || "",
      category_id: asset.category_id || "",
      department: asset.department || "",
      location: asset.location || "",
      custodian_name: asset.custodian_name || "",
      acquisition_date: asset.acquisition_date,
      in_service_date: asset.in_service_date || "",
      acquisition_cost: asset.acquisition_cost.toString(),
      additional_costs: (asset.additional_costs || 0).toString(),
      salvage_value: (asset.salvage_value || 0).toString(),
      useful_life_years: asset.useful_life_years?.toString() || "",
      depreciation_method: asset.depreciation_method,
      serial_number: asset.serial_number || "",
      model: asset.model || "",
      manufacturer: asset.manufacturer || "",
      notes: asset.notes || "",
    });
    setShowAddDialog(true);
  };

  const handleDelete = async (asset: Asset) => {
    if (asset.status !== "draft") { toast.error("لا يمكن حذف أصل نشط — يجب أن يكون في حالة مسودة"); return; }
    const { error } = await supabase.from("assets").delete().eq("id", asset.id);
    if (error) { toast.error("خطأ في الحذف"); return; }
    toast.success("تم حذف الأصل");
    loadAssets();
  };

  const getCategoryName = (catId: string | null) => categories.find((c) => c.id === catId)?.name_ar || "—";

  const depPercent = (asset: Asset) => {
    if (!asset.total_cost || asset.total_cost === 0) return 0;
    return Math.min(100, Math.round((asset.accumulated_depreciation / asset.total_cost) * 100));
  };

  return (
    <div className="px-4 lg:px-8 pt-6 pb-8 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Landmark className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">الأصول الثابتة</h1>
            <p className="text-xs text-muted-foreground">إدارة سجل الأصول والاستهلاك</p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setShowAddDialog(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> إضافة أصل
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center">
          <Package className="h-5 w-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-bold text-foreground">{stats.count}</p>
          <p className="text-[10px] text-muted-foreground">إجمالي الأصول</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <DollarSign className="h-5 w-5 mx-auto text-emerald-500 mb-1" />
          <p className="text-lg font-bold text-foreground">{fmt(stats.totalCost)}</p>
          <p className="text-[10px] text-muted-foreground">التكلفة الإجمالية</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <TrendingDown className="h-5 w-5 mx-auto text-orange-500 mb-1" />
          <p className="text-lg font-bold text-foreground">{fmt(stats.totalDep)}</p>
          <p className="text-[10px] text-muted-foreground">مجمع الاستهلاك</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <BarChart3 className="h-5 w-5 mx-auto text-blue-500 mb-1" />
          <p className="text-lg font-bold text-foreground">{fmt(stats.nbv)}</p>
          <p className="text-[10px] text-muted-foreground">صافي القيمة الدفترية</p>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث بالاسم أو الرقم..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحالات</SelectItem>
            {Object.entries(STATUS_MAP).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="التصنيف" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع التصنيفات</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name_ar}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">رقم الأصل</TableHead>
                  <TableHead className="text-right">اسم الأصل</TableHead>
                  <TableHead className="text-right">التصنيف</TableHead>
                  <TableHead className="text-right">تاريخ الاقتناء</TableHead>
                  <TableHead className="text-right">التكلفة</TableHead>
                  <TableHead className="text-right">مجمع الاستهلاك</TableHead>
                  <TableHead className="text-right">القيمة الدفترية</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-center w-[60px]">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">لا توجد أصول</TableCell></TableRow>
                ) : filtered.map((asset) => {
                  const pct = depPercent(asset);
                  const st = STATUS_MAP[asset.status] || STATUS_MAP.active;
                  return (
                    <TableRow key={asset.id} className="cursor-pointer hover:bg-muted/30" onClick={() => { setSelectedAsset(asset); setShowDetailDialog(true); }}>
                      <TableCell className="font-mono text-xs">{asset.asset_number}</TableCell>
                      <TableCell className="font-medium">{asset.name_ar}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{getCategoryName(asset.category_id)}</TableCell>
                      <TableCell className="text-xs">{asset.acquisition_date}</TableCell>
                      <TableCell className="text-xs font-medium">{fmt(asset.total_cost)}</TableCell>
                      <TableCell className="text-xs text-orange-600">{fmt(asset.accumulated_depreciation)}</TableCell>
                      <TableCell className="text-xs font-bold text-primary">{fmt(asset.net_book_value)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{pct}%</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant={st.variant} className="text-[10px]">{st.label}</Badge></TableCell>
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setSelectedAsset(asset); setShowDetailDialog(true); }}><Eye className="h-3.5 w-3.5 ml-2" />عرض التفاصيل</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEdit(asset)}><Pencil className="h-3.5 w-3.5 ml-2" />تعديل</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(asset)}><Trash2 className="h-3.5 w-3.5 ml-2" />حذف</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(o) => { if (!o) resetForm(); setShowAddDialog(o); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editMode ? "تعديل أصل" : "إضافة أصل جديد"}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="basic" className="mt-2">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="basic">البيانات الأساسية</TabsTrigger>
              <TabsTrigger value="acquisition">بيانات الاقتناء</TabsTrigger>
              <TabsTrigger value="depreciation">الاستهلاك</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>اسم الأصل *</Label>
                  <Input value={form.name_ar} onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))} placeholder="مثال: لابتوب Dell Latitude" />
                </div>
                <div>
                  <Label>التصنيف</Label>
                  <Select value={form.category_id} onValueChange={handleCategoryChange}>
                    <SelectTrigger><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
                    <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_ar}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>القسم</Label>
                  <Input value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} placeholder="المحاسبة، الإدارة..." />
                </div>
                <div>
                  <Label>الموقع</Label>
                  <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="الطابق الثاني، المخزن..." />
                </div>
                <div>
                  <Label>أمين العهدة</Label>
                  <Input value={form.custodian_name} onChange={(e) => setForm((f) => ({ ...f, custodian_name: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <Label>الوصف</Label>
                  <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="acquisition" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>تاريخ الاقتناء *</Label>
                  <Input type="date" value={form.acquisition_date} onChange={(e) => setForm((f) => ({ ...f, acquisition_date: e.target.value }))} />
                </div>
                <div>
                  <Label>تاريخ بدء الاستخدام</Label>
                  <Input type="date" value={form.in_service_date} onChange={(e) => setForm((f) => ({ ...f, in_service_date: e.target.value }))} />
                </div>
                <div>
                  <Label>تكلفة الاقتناء (₪) *</Label>
                  <Input type="number" value={form.acquisition_cost} onChange={(e) => setForm((f) => ({ ...f, acquisition_cost: e.target.value }))} placeholder="0.00" />
                </div>
                <div>
                  <Label>تكاليف إضافية (₪)</Label>
                  <Input type="number" value={form.additional_costs} onChange={(e) => setForm((f) => ({ ...f, additional_costs: e.target.value }))} placeholder="0.00" />
                </div>
                {(parseFloat(form.acquisition_cost) || 0) > 0 && (
                  <div className="col-span-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
                    <p className="text-sm font-bold text-foreground">
                      التكلفة الإجمالية: {fmt((parseFloat(form.acquisition_cost) || 0) + (parseFloat(form.additional_costs) || 0))}
                    </p>
                  </div>
                )}
                <div>
                  <Label>الرقم التسلسلي</Label>
                  <Input value={form.serial_number} onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))} />
                </div>
                <div>
                  <Label>الموديل</Label>
                  <Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <Label>الشركة المصنعة</Label>
                  <Input value={form.manufacturer} onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="depreciation" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>طريقة الاستهلاك</Label>
                  <Select value={form.depreciation_method} onValueChange={(v) => setForm((f) => ({ ...f, depreciation_method: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>العمر الإنتاجي (سنوات)</Label>
                  <Input type="number" value={form.useful_life_years} onChange={(e) => setForm((f) => ({ ...f, useful_life_years: e.target.value }))} disabled={form.depreciation_method === "none"} />
                </div>
                <div>
                  <Label>القيمة التخريدية (₪)</Label>
                  <Input type="number" value={form.salvage_value} onChange={(e) => setForm((f) => ({ ...f, salvage_value: e.target.value }))} disabled={form.depreciation_method === "none"} />
                </div>
                {form.depreciation_method !== "none" && (parseFloat(form.acquisition_cost) || 0) > 0 && (parseFloat(form.useful_life_years) || 0) > 0 && (
                  <div className="col-span-2 p-4 rounded-xl bg-muted/50 border border-border space-y-2">
                    <p className="text-xs font-bold text-foreground">معاينة الاستهلاك</p>
                    {(() => {
                      const cost = (parseFloat(form.acquisition_cost) || 0) + (parseFloat(form.additional_costs) || 0);
                      const salvage = parseFloat(form.salvage_value) || 0;
                      const years = parseInt(form.useful_life_years) || 1;
                      const annual = (cost - salvage) / years;
                      const monthly = annual / 12;
                      return (
                        <>
                          <div className="flex justify-between text-xs"><span>الاستهلاك السنوي:</span><span className="font-bold">{fmt(annual)}</span></div>
                          <div className="flex justify-between text-xs"><span>الاستهلاك الشهري:</span><span className="font-bold">{fmt(monthly)}</span></div>
                          <div className="flex justify-between text-xs"><span>القيمة التخريدية:</span><span>{fmt(salvage)}</span></div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
              <div>
                <Label>ملاحظات</Label>
                <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </TabsContent>
          </Tabs>
          <div className="flex gap-3 mt-4">
            <Button onClick={handleSave} className="flex-1">{editMode ? "حفظ التعديلات" : "إضافة الأصل"}</Button>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); resetForm(); }}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          {selectedAsset && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge variant={STATUS_MAP[selectedAsset.status]?.variant || "default"} className="text-[10px]">
                    {STATUS_MAP[selectedAsset.status]?.label || selectedAsset.status}
                  </Badge>
                  {selectedAsset.name_ar}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="p-4 rounded-xl bg-muted/50 border border-border grid grid-cols-2 gap-3">
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">التكلفة</p>
                    <p className="text-sm font-bold">{fmt(selectedAsset.total_cost)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">مجمع الاستهلاك</p>
                    <p className="text-sm font-bold text-orange-600">{fmt(selectedAsset.accumulated_depreciation)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">القيمة الدفترية</p>
                    <p className="text-sm font-bold text-primary">{fmt(selectedAsset.net_book_value)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">نسبة الاستهلاك</p>
                    <p className="text-sm font-bold">{depPercent(selectedAsset)}%</p>
                  </div>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${depPercent(selectedAsset)}%` }} />
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">رقم الأصل:</span><span className="font-mono">{selectedAsset.asset_number}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">التصنيف:</span><span>{getCategoryName(selectedAsset.category_id)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">تاريخ الاقتناء:</span><span>{selectedAsset.acquisition_date}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">طريقة الاستهلاك:</span><span>{METHOD_LABELS[selectedAsset.depreciation_method] || selectedAsset.depreciation_method}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">العمر الإنتاجي:</span><span>{selectedAsset.useful_life_years ? `${selectedAsset.useful_life_years} سنة` : "—"}</span></div>
                  {selectedAsset.department && <div className="flex justify-between"><span className="text-muted-foreground">القسم:</span><span>{selectedAsset.department}</span></div>}
                  {selectedAsset.location && <div className="flex justify-between"><span className="text-muted-foreground">الموقع:</span><span>{selectedAsset.location}</span></div>}
                  {selectedAsset.custodian_name && <div className="flex justify-between"><span className="text-muted-foreground">أمين العهدة:</span><span>{selectedAsset.custodian_name}</span></div>}
                  {selectedAsset.serial_number && <div className="flex justify-between"><span className="text-muted-foreground">الرقم التسلسلي:</span><span className="font-mono">{selectedAsset.serial_number}</span></div>}
                  {selectedAsset.model && <div className="flex justify-between"><span className="text-muted-foreground">الموديل:</span><span>{selectedAsset.model}</span></div>}
                  {selectedAsset.manufacturer && <div className="flex justify-between"><span className="text-muted-foreground">الشركة المصنعة:</span><span>{selectedAsset.manufacturer}</span></div>}
                  {selectedAsset.notes && <div><span className="text-muted-foreground">ملاحظات:</span><p className="mt-1 text-xs">{selectedAsset.notes}</p></div>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => { setShowDetailDialog(false); handleEdit(selectedAsset); }}>
                    <Pencil className="h-3.5 w-3.5 ml-1" /> تعديل
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FixedAssetsPage;
