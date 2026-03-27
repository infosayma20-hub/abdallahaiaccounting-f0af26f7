import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Printer, Wifi, WifiOff, TestTube, Settings2, Building2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Branch {
  id: string;
  name: string;
}

interface PrinterConfig {
  id: string;
  name: string;
  ip_address: string;
  port: number;
  printer_type: string;
  paper_width: number;
  is_default: boolean;
  is_active: boolean;
  station_ids: string[];
  print_categories: string[];
  branch_id: string | null;
}

interface Station {
  id: string;
  name: string;
  station_type: string;
  color: string;
  branch_id: string | null;
}

const PRINTER_TYPES = [
  { value: "escpos", label: "ESC/POS (Epson/Star)" },
  { value: "epson_epos", label: "Epson ePOS (WebSocket)" },
  { value: "star_webprnt", label: "Star WebPRNT" },
];

const PAPER_WIDTHS = [
  { value: 58, label: "58mm" },
  { value: 80, label: "80mm" },
];

const PRINT_CATEGORIES = [
  { value: "receipt", label: "إيصال البيع" },
  { value: "kitchen", label: "تذكرة المطبخ" },
  { value: "bar", label: "تذكرة البار" },
  { value: "report", label: "تقارير الوردية" },
];

export default function NetworkPrintersManager() {
  const { user } = useAuth();
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<PrinterConfig | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [filterBranch, setFilterBranch] = useState<string>("all");

  // Form state
  const [formName, setFormName] = useState("");
  const [formIp, setFormIp] = useState("");
  const [formPort, setFormPort] = useState(9100);
  const [formType, setFormType] = useState("escpos");
  const [formPaperWidth, setFormPaperWidth] = useState(80);
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [formStationIds, setFormStationIds] = useState<string[]>([]);
  const [formCategories, setFormCategories] = useState<string[]>(["receipt"]);
  const [formBranchId, setFormBranchId] = useState<string>("");

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    const [printersRes, stationsRes, branchesRes] = await Promise.all([
      supabase.from("pos_printers").select("*").order("created_at"),
      supabase.from("kitchen_stations" as any).select("id, name, station_type, color, branch_id").order("display_order"),
      supabase.from("branches").select("id, name").eq("is_active", true).order("name"),
    ]);
    setPrinters((printersRes.data as any[]) || []);
    setStations((stationsRes.data as any[]) || []);
    setBranches((branchesRes.data as Branch[]) || []);
    setLoading(false);
  };

  const resetForm = () => {
    setFormName("");
    setFormIp("");
    setFormPort(9100);
    setFormType("escpos");
    setFormPaperWidth(80);
    setFormIsDefault(false);
    setFormStationIds([]);
    setFormCategories(["receipt"]);
    setFormBranchId("");
    setEditingPrinter(null);
  };

  const openAdd = () => {
    resetForm();
    setShowAddDialog(true);
  };

  const openEdit = (p: PrinterConfig) => {
    setEditingPrinter(p);
    setFormName(p.name);
    setFormIp(p.ip_address);
    setFormPort(p.port);
    setFormType(p.printer_type);
    setFormPaperWidth(p.paper_width);
    setFormIsDefault(p.is_default);
    setFormStationIds(p.station_ids || []);
    setFormCategories(p.print_categories || ["receipt"]);
    setFormBranchId(p.branch_id || "");
    setShowAddDialog(true);
  };

  const savePrinter = async () => {
    if (!formName.trim() || !formIp.trim()) {
      toast.error("أدخل اسم الطابعة وعنوان IP");
      return;
    }

    const payload = {
      user_id: user!.id,
      name: formName.trim(),
      ip_address: formIp.trim(),
      port: formPort,
      printer_type: formType,
      paper_width: formPaperWidth,
      is_default: formIsDefault,
      station_ids: formStationIds,
      print_categories: formCategories,
      branch_id: formBranchId && formBranchId !== "__none__" ? formBranchId : null,
    };

    if (editingPrinter) {
      const { error } = await supabase
        .from("pos_printers")
        .update(payload as any)
        .eq("id", editingPrinter.id);
      if (error) return toast.error("خطأ في التحديث");
      toast.success("تم تحديث الطابعة");
    } else {
      const { error } = await supabase
        .from("pos_printers")
        .insert(payload as any);
      if (error) return toast.error("خطأ في الإضافة");
      toast.success("تمت إضافة الطابعة");
    }

    // If setting as default, unset others
    if (formIsDefault) {
      const otherIds = printers.filter(p => p.id !== editingPrinter?.id && p.is_default).map(p => p.id);
      if (otherIds.length > 0) {
        await supabase.from("pos_printers").update({ is_default: false } as any).in("id", otherIds);
      }
    }

    setShowAddDialog(false);
    resetForm();
    loadData();
  };

  const deletePrinter = async (id: string) => {
    await supabase.from("pos_printers").delete().eq("id", id);
    toast.success("تم حذف الطابعة");
    loadData();
  };

  const togglePrinter = async (id: string, isActive: boolean) => {
    await supabase.from("pos_printers").update({ is_active: isActive } as any).eq("id", id);
    loadData();
  };

  const testPrinter = async (printer: PrinterConfig) => {
    setTesting(printer.id);
    try {
      // For Epson ePOS printers, try WebSocket connection
      if (printer.printer_type === "epson_epos") {
        const ws = new WebSocket(`ws://${printer.ip_address}:${printer.port}/cgi-bin/epos/service.cgi`);
        ws.onopen = () => {
          toast.success(`✅ تم الاتصال بـ ${printer.name} بنجاح!`);
          ws.close();
          setTesting(null);
        };
        ws.onerror = () => {
          toast.error(`❌ فشل الاتصال بـ ${printer.name}. تأكد من العنوان والمنفذ.`);
          setTesting(null);
        };
        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CLOSED) {
            ws.close();
            toast.error(`⏱ انتهت مهلة الاتصال بـ ${printer.name}`);
            setTesting(null);
          }
        }, 5000);
      } else {
        // Send test via Print Bridge
        try {
          const res = await fetch("http://192.168.1.65:3001/print", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: printer.printer_type === "receipt" ? "receipt" : "kitchen",
              order: {
                orderNumber: "TEST",
                branchName: "اختبار طباعة",
                items: [{ id: "1", name: `اختبار ${printer.name}`, quantity: 1, price: 0 }],
                total: 0,
              },
            }),
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            toast.success(`✅ تم إرسال اختبار ${printer.name} عبر Bridge`);
          } else {
            toast.error(`❌ فشل اختبار ${printer.name}`);
          }
        } catch {
          toast.error("❌ Print Bridge غير متصل على 192.168.1.65:3001");
        }
        setTesting(null);
      }
    } catch {
      toast.error("حدث خطأ أثناء الاختبار");
      setTesting(null);
    }
  };

  const toggleStationId = (stationId: string) => {
    setFormStationIds(prev =>
      prev.includes(stationId) ? prev.filter(s => s !== stationId) : [...prev, stationId]
    );
  };

  const toggleCategory = (cat: string) => {
    setFormCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          <Printer className="h-4 w-4" />
          طابعات الشبكة
        </h3>
        <Button onClick={openAdd} size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> إضافة طابعة
        </Button>
      </div>

      <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
        <p className="text-xs text-muted-foreground leading-relaxed">
          💡 يمكنك تعريف طابعات الشبكة وربطها بمحطات المطبخ. كل محطة يمكن أن تطبع على طابعة مختلفة.
          لطابعات ESC/POS التقليدية (منفذ 9100) يلزم تثبيت
          <span className="font-bold text-foreground"> QZ Tray </span>
          على الجهاز. لطابعات Epson ePOS، الطباعة تعمل مباشرة عبر المتصفح.
        </p>
      </div>

      {/* Branch Filter */}
      {branches.length > 0 && (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <Select value={filterBranch} onValueChange={setFilterBranch}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder="فلترة حسب الفرع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الأفرع</SelectItem>
              <SelectItem value="none">بدون فرع</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Printers List */}
      <div className="space-y-2">
        {(filterBranch === "all" ? printers : filterBranch === "none" ? printers.filter(p => !p.branch_id) : printers.filter(p => p.branch_id === filterBranch)).map(p => (
          <div key={p.id} className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${p.is_active ? "bg-primary/10" : "bg-muted"}`}>
              {p.is_active ? <Wifi className="h-4 w-4 text-primary" /> : <WifiOff className="h-4 w-4 text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm truncate">{p.name}</p>
                {p.is_default && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">افتراضية</Badge>}
              </div>
              <p className="text-xs text-muted-foreground font-mono">{p.ip_address}:{p.port}</p>
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                {(p.print_categories || []).map(cat => (
                  <Badge key={cat} variant="outline" className="text-[9px] px-1 py-0">
                    {PRINT_CATEGORIES.find(c => c.value === cat)?.label || cat}
                  </Badge>
                ))}
                {(p.station_ids || []).length > 0 && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 border-primary/30 text-primary">
                    {p.station_ids.length} محطة
                  </Badge>
                )}
                {p.branch_id && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/30 text-amber-600">
                    <Building2 className="h-2.5 w-2.5 mr-0.5" />
                    {branches.find(b => b.id === p.branch_id)?.name || "فرع"}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs px-2"
                onClick={() => testPrinter(p)}
                disabled={testing === p.id}
              >
                <TestTube className={`h-3.5 w-3.5 ${testing === p.id ? "animate-spin" : ""}`} />
                {testing === p.id ? "جاري..." : "اختبار"}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
              <Switch checked={p.is_active} onCheckedChange={v => togglePrinter(p.id, v)} />
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deletePrinter(p.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
        {printers.length === 0 && !loading && (
          <div className="text-center py-8 space-y-2">
            <Printer className="h-8 w-8 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">لم تُضف أي طابعات بعد</p>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" />
              {editingPrinter ? "تعديل طابعة" : "إضافة طابعة شبكة"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-xs">اسم الطابعة</Label>
              <Input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="مثال: طابعة المطبخ الرئيسية"
                className="h-9"
              />
            </div>

            {/* IP & Port */}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">عنوان IP</Label>
                <Input
                  value={formIp}
                  onChange={e => setFormIp(e.target.value)}
                  placeholder="192.168.1.100"
                  className="h-9 font-mono text-sm"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">المنفذ</Label>
                <Input
                  type="number"
                  value={formPort}
                  onChange={e => setFormPort(Number(e.target.value))}
                  className="h-9 font-mono text-sm"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Type & Paper */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">نوع الطابعة</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRINTER_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">عرض الورق</Label>
                <Select value={String(formPaperWidth)} onValueChange={v => setFormPaperWidth(Number(v))}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAPER_WIDTHS.map(w => (
                      <SelectItem key={w.value} value={String(w.value)} className="text-xs">{w.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Branch */}
            {branches.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">الفرع</Label>
                <Select value={formBranchId} onValueChange={setFormBranchId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="اختر فرع (اختياري)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">بدون فرع محدد</SelectItem>
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Print Categories */}
            <div className="space-y-1.5">
              <Label className="text-xs">نوع المطبوعات</Label>
              <div className="flex flex-wrap gap-1.5">
                {PRINT_CATEGORIES.map(cat => (
                  <button
                    key={cat.value}
                    onClick={() => toggleCategory(cat.value)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      formCategories.includes(cat.value)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Station Binding - filtered by selected branch */}
            {stations.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">ربط بمحطات المطبخ (اختياري)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {stations.filter(s => !formBranchId || formBranchId === "__none__" || !s.branch_id || s.branch_id === formBranchId).map(s => (
                    <button
                      key={s.id}
                      onClick={() => toggleStationId(s.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                        formStationIds.includes(s.id)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  اربط المحطات لتوجيه تذاكر المطبخ تلقائياً لهذه الطابعة
                </p>
              </div>
            )}

            {/* Default */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/50">
              <div>
                <span className="text-xs font-medium">طابعة افتراضية</span>
                <p className="text-[10px] text-muted-foreground">تُستخدم لطباعة الإيصالات تلقائياً</p>
              </div>
              <Switch checked={formIsDefault} onCheckedChange={setFormIsDefault} />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button onClick={savePrinter} className="flex-1 gap-1.5">
                <Printer className="h-3.5 w-3.5" />
                {editingPrinter ? "حفظ التعديلات" : "إضافة الطابعة"}
              </Button>
              <Button variant="outline" onClick={() => { setShowAddDialog(false); resetForm(); }}>
                إلغاء
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
