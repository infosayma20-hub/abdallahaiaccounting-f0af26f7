import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

type Item = { key: string; label: string; dependsOn?: string };
// فقط الصلاحيات المطبّقة فعليًا في نقطة البيع — نفس مفاتيح وتسميات شاشة إدارة مستخدمي نقطة البيع — مصدر واحد في جدول pos_user_permissions
const GROUPS: { title: string; items: Item[] }[] = [
  { title: "الوردية", items: [
    { key: "can_open_register", label: "فتح الوردية" },
    { key: "can_close_register", label: "إغلاق الوردية" },
    { key: "can_view_profits", label: "مشاهدة الأرباح" },
  ]},
  { title: "البيع", items: [
    { key: "can_apply_discount", label: "تطبيق خصم" },
    { key: "can_edit_prices", label: "تعديل الأسعار" },
    { key: "allow_credit_sale", label: "الدفع المؤجل / الدين" },
    { key: "open_cash_drawer", label: "فتح درج الكاش" },
    { key: "can_remove_cart_items", label: "حذف أصناف من السلة" },
  ]},
  { title: "الفواتير", items: [
    { key: "can_view_invoice_history", label: "رؤية سجل الفواتير" },
    { key: "can_edit_invoices", label: "تعديل الفواتير (استدعاء)", dependsOn: "can_view_invoice_history" },
    { key: "can_cancel_invoices", label: "إلغاء الفواتير", dependsOn: "can_view_invoice_history" },
    { key: "print_invoices", label: "طباعة الفواتير" },
  ]},
  { title: "الأصناف", items: [
    { key: "manage_products_categories", label: "تعريف منتجات وتصنيفات" },
  ]},
  { title: "المخزون والمشتريات والمصاريف", items: [
    { key: "can_add_inventory", label: "إدخال بضاعة للمخزون" },
    { key: "can_create_product", label: "تعريف صنف جديد (من الإدخال والمشتريات)" },
    { key: "can_record_purchases", label: "تسجيل مشتريات" },
    { key: "can_pay_purchases_cash", label: "دفع مشتريات نقداً من الصندوق", dependsOn: "can_record_purchases" },
    { key: "can_create_supplier", label: "تعريف مورد جديد", dependsOn: "can_record_purchases" },
    { key: "can_affect_inventory_on_purchase", label: "ربط المشتريات بالمخزون", dependsOn: "can_record_purchases" },
    { key: "can_record_expenses", label: "صرف مصاريف" },
    { key: "can_create_expense_category", label: "تعريف نوع مصروف جديد", dependsOn: "can_record_expenses" },
  ]},
];
const ALL_KEYS = GROUPS.flatMap(g => g.items.map(i => i.key));
// ما تطبّقه نقطة البيع فعليًا عند عدم وجود صلاحيات محفوظة للكاشير (POSPage) — نعرضه كما هو حتى لا تُضلّل الشاشة
const POS_FALLBACK: Record<string, boolean> = {
  can_open_register: true, can_close_register: true, can_view_profits: false,
  can_apply_discount: true, can_edit_prices: true, allow_credit_sale: true, open_cash_drawer: false, can_remove_cart_items: true,
  can_view_invoice_history: true, can_edit_invoices: true, can_cancel_invoices: true, print_invoices: true,
  manage_products_categories: false, can_add_inventory: false, can_create_product: false, can_record_purchases: false,
  can_pay_purchases_cash: false, can_create_supplier: false, can_affect_inventory_on_purchase: false,
  can_record_expenses: false, can_create_expense_category: false,
};

export default function CashierPermissionsDialog({
  open, onOpenChange, posUserId, employeeName,
}: { open: boolean; onOpenChange: (v: boolean) => void; posUserId: string; employeeName: string }) {
  const [vals, setVals] = useState<Record<string, boolean>>({});
  const [maxDisc, setMaxDisc] = useState("0");
  const [rowExists, setRowExists] = useState(false);
  const [owner, setOwner] = useState<{ user_id: string; company_id: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const [{ data: pu }, { data: perm }] = await Promise.all([
        (supabase as any).from("pos_users").select("user_id, company_id").eq("id", posUserId).maybeSingle(),
        (supabase as any).from("pos_user_permissions").select("*").eq("pos_user_id", posUserId).maybeSingle(),
      ]);
      setOwner(pu || null);
      setRowExists(!!perm);
      const v: Record<string, boolean> = {};
      ALL_KEYS.forEach(k => { v[k] = perm ? !!(perm as any)[k] : !!POS_FALLBACK[k]; });
      setVals(v);
      setMaxDisc(String(perm ? ((perm as any).max_discount_percent ?? 0) : 100));
      setLoading(false);
    })();
  }, [open, posUserId]);

  const toggle = (k: string, on: boolean) => {
    setVals(prev => {
      const n = { ...prev, [k]: on };
      // إيقاف صلاحية أساسية يوقف الصلاحيات التابعة لها
      if (!on) GROUPS.forEach(g => g.items.forEach(i => { if (i.dependsOn === k) n[i.key] = false; }));
      return n;
    });
  };

  const save = async () => {
    if (!owner) { toast.error("تعذر تحديد حساب الكاشير"); return; }
    setSaving(true);
    const payload: Record<string, any> = { ...vals, max_discount_percent: Math.min(100, Math.max(0, Number(maxDisc) || 0)) };
    const q = rowExists
      ? (supabase as any).from("pos_user_permissions").update(payload).eq("pos_user_id", posUserId)
      : (supabase as any).from("pos_user_permissions").insert({ ...payload, pos_user_id: posUserId, user_id: owner.user_id, company_id: owner.company_id });
    const { error } = await q;
    setSaving(false);
    if (error) { toast.error(error.message.includes("row-level") ? "تعديل صلاحيات الكاشير متاح لمالك الشركة فقط" : error.message); return; }
    toast.success(`تم حفظ صلاحيات ${employeeName}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>صلاحيات الكاشير — {employeeName}</DialogTitle></DialogHeader>
        {!loading && !rowExists && (
          <p className="text-xs rounded-md border border-border bg-muted/40 p-2">لا توجد صلاحيات محفوظة لهذا الكاشير؛ المعروض هو ما يعمل به حاليًا افتراضيًا. اضبطها واحفظ لتثبيتها.</p>
        )}
        {loading ? <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div> : (
          <div className="grid sm:grid-cols-2 gap-3">
            {GROUPS.map(g => (
              <div key={g.title} className="rounded-lg border border-border p-3">
                <p className="text-sm font-semibold mb-2">{g.title}</p>
                <div className="space-y-2">
                  {g.items.map(i => {
                    const blocked = !!i.dependsOn && !vals[i.dependsOn];
                    return (
                      <label key={i.key} className={`flex items-center justify-between gap-2 text-xs ${blocked ? "opacity-50" : ""}`}>
                        <span>{i.label}</span>
                        <Switch checked={!!vals[i.key]} disabled={blocked} onCheckedChange={(c) => toggle(i.key, c)} />
                      </label>
                    );
                  })}
                  {g.title === "البيع" && vals.can_apply_discount && (
                    <label className="flex items-center justify-between gap-2 text-xs">
                      <span>أقصى نسبة خصم %</span>
                      <Input dir="ltr" className="h-7 w-20 text-xs" inputMode="decimal" value={maxDisc} onChange={e => setMaxDisc(e.target.value)} />
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button onClick={save} disabled={saving || loading}>{saving ? "جاري الحفظ…" : "حفظ الصلاحيات"}</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
