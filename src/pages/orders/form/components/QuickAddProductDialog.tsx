import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CategoryCombobox } from "./CategoryCombobox";

export interface QuickAddForm {
  name: string;
  category: string;
  unit: string;
  sell_price: number;
  buy_price: number;
  quantity: number;
  min_quantity: number;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  form: QuickAddForm;
  setForm: (updater: (f: QuickAddForm) => QuickAddForm) => void;
  saving: boolean;
  onSave: () => void;
  categorySuggestions: string[];
}

export function QuickAddProductDialog({ open, onOpenChange, form, setForm, saving, onSave, categorySuggestions }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>إضافة سريعة لمنتج جديد</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs text-muted-foreground">اسم المنتج *</label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="اسم المنتج" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">التصنيف</label>
              <CategoryCombobox
                value={form.category}
                onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                suggestions={categorySuggestions}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">الوحدة</label>
              <Input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} placeholder="قطعة" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">سعر البيع</label>
              <Input type="number" step="any" value={form.sell_price} onChange={(e) => setForm((f) => ({ ...f, sell_price: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">سعر الشراء</label>
              <Input type="number" step="any" value={form.buy_price} onChange={(e) => setForm((f) => ({ ...f, buy_price: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">الكمية الابتدائية</label>
              <Input type="number" step="any" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">الحد الأدنى</label>
              <Input type="number" step="any" value={form.min_quantity} onChange={(e) => setForm((f) => ({ ...f, min_quantity: Number(e.target.value) }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button onClick={onSave} disabled={saving || !form.name.trim()}>
            {saving ? "جاري الحفظ..." : "حفظ وإضافة إلى البند"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}