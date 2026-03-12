import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Receipt, Plus, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dataOwnerId: string;
  userId: string;
  sessionId?: string;
  canCreateCategory?: boolean;
  sessionBalance?: number;
  onSuccess?: () => void;
}

interface Category { id: string; name: string; type: string; account_code: string | null; }

const DEFAULT_CATEGORIES = [
  { name: "كهرباء", type: "operational" },
  { name: "ماء", type: "operational" },
  { name: "نظافة", type: "operational" },
  { name: "صيانة", type: "operational" },
  { name: "مكتبية", type: "admin" },
  { name: "هاتف واتصالات", type: "admin" },
  { name: "مصاريف متنوعة", type: "other" },
];

export default function ExpenseModal({ open, onOpenChange, dataOwnerId, userId, sessionId, canCreateCategory, sessionBalance = 0, onSuccess }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);

  // New category
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCat, setNewCat] = useState({ name: "", type: "operational" });
  const [savingCat, setSavingCat] = useState(false);

  useEffect(() => {
    if (!open) return;
    loadCategories();
  }, [open, dataOwnerId]);

  const loadCategories = async () => {
    const { data } = await supabase
      .from("pos_expense_categories")
      .select("id, name, type, account_code")
      .eq("user_id", dataOwnerId)
      .order("name");

    if (data && data.length > 0) {
      setCategories(data);
    } else {
      // Seed default categories
      const toInsert = DEFAULT_CATEGORIES.map(c => ({ ...c, user_id: dataOwnerId }));
      const { data: seeded } = await supabase.from("pos_expense_categories").insert(toInsert).select("id, name, type, account_code");
      setCategories(seeded || []);
    }
  };

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);

  const getAccountCode = (type: string) => {
    switch (type) {
      case "operational": return "5400"; // مصروفات تشغيلية
      case "admin": return "5500"; // مصروفات إدارية
      default: return "5600"; // مصروفات متنوعة
    }
  };

  const handleSave = async () => {
    if (!selectedCategoryId) { toast.error("اختر نوع المصروف"); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error("أدخل مبلغاً صحيحاً"); return; }

    // Check balance
    if (amt > sessionBalance && sessionBalance > 0) {
      toast.error(`المبلغ أكبر من رصيد العهدة (₪${sessionBalance.toFixed(2)})`);
      return;
    }

    setSaving(true);
    try {
      // 1. Create expense record
      await supabase.from("pos_expenses").insert({
        user_id: dataOwnerId,
        category_id: selectedCategoryId,
        amount: amt,
        description,
        shift_id: sessionId || null,
        created_by: userId,
      });

      // 2. Journal entry
      const accountCode = selectedCategory?.account_code || getAccountCode(selectedCategory?.type || "other");
      await supabase.from("transactions").insert({
        user_id: dataOwnerId,
        transaction_date: date,
        description: `مصروف - ${selectedCategory?.name || ""}${description ? ` - ${description}` : ""}`,
        debit_account_code: accountCode,
        credit_account_code: "1110", // الصندوق
        amount: amt,
        currency: "شيكل",
        transaction_type: "expense",
        reference: `EXP-POS-${Date.now()}`,
        payment_method: "نقدي",
        idempotency_key: `POS-EXP-${Date.now()}`,
      });

      const newBalance = sessionBalance - amt;
      toast.success(`تم تسجيل مصروف ₪${amt.toFixed(2)} — رصيدك الحالي: ₪${newBalance.toFixed(2)}`);
      onSuccess?.();
      resetForm();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCat.name.trim()) { toast.error("أدخل اسم التصنيف"); return; }
    setSavingCat(true);
    try {
      const { data, error } = await supabase.from("pos_expense_categories").insert({
        user_id: dataOwnerId,
        name: newCat.name,
        type: newCat.type,
        account_code: getAccountCode(newCat.type),
      }).select("id, name, type, account_code").single();
      if (error) throw error;
      setCategories(prev => [...prev, data]);
      setSelectedCategoryId(data.id);
      setShowNewCategory(false);
      setNewCat({ name: "", type: "operational" });
      toast.success("تم إضافة التصنيف");
    } catch (e: any) {
      toast.error(e.message || "فشل الإنشاء");
    } finally {
      setSavingCat(false);
    }
  };

  const resetForm = () => {
    setSelectedCategoryId(""); setAmount(""); setDescription(""); setDate(new Date().toISOString().split("T")[0]);
    setShowNewCategory(false);
  };

  const typeLabels: Record<string, string> = { operational: "تشغيلية", admin: "إدارية", other: "متنوعة" };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#1B3A5C" }}>
              <Receipt className="w-4 h-4 text-white" />
            </div>
            صرف مصروف
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Category */}
          <div>
            <Label>نوع المصروف *</Label>
            <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
              <SelectTrigger><SelectValue placeholder="اختر نوع المصروف" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    <span className="text-muted-foreground text-xs mr-2">({typeLabels[c.type] || c.type})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canCreateCategory && (
              <button
                className="text-xs text-primary mt-1 flex items-center gap-1 hover:underline"
                onClick={() => setShowNewCategory(true)}
              >
                <Plus className="w-3 h-3" /> تعريف نوع مصروف جديد
              </button>
            )}
          </div>

          {showNewCategory && (
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold">نوع مصروف جديد</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowNewCategory(false)}><X className="w-3 h-3" /></Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="اسم التصنيف *" value={newCat.name} onChange={e => setNewCat(p => ({ ...p, name: e.target.value }))} />
                <Select value={newCat.type} onValueChange={v => setNewCat(p => ({ ...p, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operational">تشغيلية</SelectItem>
                    <SelectItem value="admin">إدارية</SelectItem>
                    <SelectItem value="other">متنوعة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={handleCreateCategory} disabled={savingCat} className="w-full">
                {savingCat ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Plus className="w-4 h-4 ml-1" />}
                حفظ
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>المبلغ *</Label>
              <Input type="number" min="1" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>التاريخ</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>الوصف / الملاحظات</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="وصف اختياري..." rows={2} />
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving} style={{ background: "#1B3A5C" }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Receipt className="w-4 h-4 ml-1" />}
            تسجيل المصروف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
