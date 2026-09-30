import { useEffect, useMemo, useState } from "react";
import { Coffee, Minus, Plus, Search, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getPosBusinessDate } from "@/lib/pos/business-day";
import { toast } from "sonner";

type Employee = { id: string; full_name: string; account_code?: string; job_title?: string };
type Drink = {
  id: string;
  name: string;
  sell_price: number;
  buy_price: number;
  tax_rate: number;
  unit: string;
  kitchen_station_id: string | null;
  image_url: string | null;
};

export type EmployeeHotDrinkSelection = {
  employee: Employee;
  items: Array<{
    product: Drink;
    quantity: number;
    discountedQuantity: number;
    regularQuantity: number;
    chargedAmount: number;
  }>;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataOwnerId: string;
  employees: Employee[];
  drinks: Drink[];
  cutoffHour: number;
  onConfirm: (selection: EmployeeHotDrinkSelection) => void;
}

export default function EmployeeHotDrinksMenu({
  open,
  onOpenChange,
  dataOwnerId,
  employees,
  drinks,
  cutoffHour,
  onConfirm,
}: Props) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [drinkQuery, setDrinkQuery] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [remaining, setRemaining] = useState(2);
  const [loadingStatus, setLoadingStatus] = useState(false);

  useEffect(() => {
    if (!open) {
      setEmployee(null);
      setEmployeeQuery("");
      setDrinkQuery("");
      setQuantities({});
      setRemaining(2);
    }
  }, [open]);

  const filteredEmployees = useMemo(() => {
    const q = employeeQuery.trim().toLocaleLowerCase("ar");
    return q ? employees.filter((item) => item.full_name.toLocaleLowerCase("ar").includes(q)) : employees;
  }, [employeeQuery, employees]);

  const filteredDrinks = useMemo(() => {
    const q = drinkQuery.trim().toLocaleLowerCase("ar");
    return q ? drinks.filter((item) => item.name.toLocaleLowerCase("ar").includes(q)) : drinks;
  }, [drinkQuery, drinks]);

  const chooseEmployee = async (item: Employee) => {
    setEmployee(item);
    setEmployeeQuery("");
    setLoadingStatus(true);
    const businessDate = getPosBusinessDate(new Date(), cutoffHour);
    const { data, error } = await (supabase as any).rpc("get_employee_hot_drink_daily_status", {
      p_user_id: dataOwnerId,
      p_employee_id: item.id,
      p_business_date: businessDate,
    });
    setLoadingStatus(false);
    if (error) {
      setEmployee(null);
      toast.error(error.message || "تعذر قراءة استهلاك الموظف");
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setRemaining(Math.max(0, Number(row?.discounted_remaining ?? 2)));
  };

  const selected = useMemo(() => {
    let discountedLeft = remaining;
    return [...drinks].sort((a, b) => a.id.localeCompare(b.id)).flatMap((product) => {
      const quantity = quantities[product.id] || 0;
      if (!quantity) return [];
      const discountedQuantity = Math.min(discountedLeft, quantity);
      const regularQuantity = quantity - discountedQuantity;
      discountedLeft = Math.max(0, discountedLeft - discountedQuantity);
      return [{
        product,
        quantity,
        discountedQuantity,
        regularQuantity,
        chargedAmount: Math.round((discountedQuantity * product.sell_price * 0.5 + regularQuantity * product.sell_price) * 100) / 100,
      }];
    });
  }, [drinks, quantities, remaining]);

  const totalQuantity = selected.reduce((sum, item) => sum + item.quantity, 0);
  const total = selected.reduce((sum, item) => sum + item.chargedAmount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92dvh] overflow-hidden p-0" dir="rtl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Coffee className="h-5 w-5 text-primary" /> مشروبات الموظفين الساخنة
          </DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[240px_1fr]">
          <aside className="border-b border-border bg-muted/40 p-4 md:border-b-0 md:border-l">
            <label className="mb-2 block text-sm font-semibold">الموظف</label>
            {employee ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md border border-primary/30 bg-background p-3 text-right"
                onClick={() => setEmployee(null)}
              >
                <UserCheck className="h-4 w-4 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{employee.full_name}</span>
                  <span className="block text-xs text-muted-foreground">اضغط لتغيير الموظف</span>
                </span>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={employeeQuery} onChange={(event) => setEmployeeQuery(event.target.value)} placeholder="ابحث عن موظف" className="pr-9" />
                </div>
                <div className="max-h-52 space-y-1 overflow-y-auto">
                  {filteredEmployees.map((item) => (
                    <Button key={item.id} type="button" variant="ghost" className="h-auto w-full justify-start py-2 text-right" onClick={() => chooseEmployee(item)}>
                      <span className="truncate">{item.full_name}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {employee && (
              <div className="mt-4 rounded-md border border-border bg-background p-3">
                <div className="text-xs text-muted-foreground">المتبقي بنصف السعر اليوم</div>
                <div className="mt-1 text-2xl font-black text-primary">{loadingStatus ? "…" : remaining}</div>
                <div className="text-xs text-muted-foreground">بعدها يُحتسب السعر العادي</div>
              </div>
            )}
          </aside>

          <section className="min-h-0 overflow-y-auto p-4">
            <div className="relative mb-4">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={drinkQuery} onChange={(event) => setDrinkQuery(event.target.value)} placeholder="ابحث في المشروبات الساخنة" className="pr-9" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filteredDrinks.map((drink) => {
                const quantity = quantities[drink.id] || 0;
                const selectedBefore = selected
                  .filter((item) => item.product.id.localeCompare(drink.id) < 0)
                  .reduce((sum, item) => sum + item.discountedQuantity, 0);
                const hasDiscountForNext = Math.max(0, remaining - selectedBefore - quantity) > 0;
                return (
                  <div key={drink.id} className="overflow-hidden rounded-md border border-border bg-card">
                    {drink.image_url ? (
                      <img src={drink.image_url} alt={drink.name} className="aspect-[4/3] w-full object-cover" />
                    ) : (
                      <div className="flex aspect-[4/3] items-center justify-center bg-muted/60"><Coffee className="h-9 w-9 text-primary" /></div>
                    )}
                    <div className="p-3">
                      <div className="min-h-10 text-sm font-bold leading-5">{drink.name}</div>
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <span className="font-bold text-primary">₪{(hasDiscountForNext ? drink.sell_price * 0.5 : drink.sell_price).toFixed(2)}</span>
                        {hasDiscountForNext && <span className="text-muted-foreground line-through">₪{drink.sell_price.toFixed(2)}</span>}
                      </div>
                      <div className="mt-3 grid grid-cols-[32px_1fr_32px] items-center gap-2">
                        <Button type="button" size="icon" variant="outline" className="h-8 w-8" disabled={!employee || quantity === 0} onClick={() => setQuantities((prev) => ({ ...prev, [drink.id]: Math.max(0, quantity - 1) }))}><Minus className="h-3.5 w-3.5" /></Button>
                        <span className="text-center text-lg font-black tabular-nums">{quantity}</span>
                        <Button type="button" size="icon" className="h-8 w-8" disabled={!employee || loadingStatus} onClick={() => setQuantities((prev) => ({ ...prev, [drink.id]: quantity + 1 }))}><Plus className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-5 py-4">
          <div>
            <div className="text-xs text-muted-foreground">{totalQuantity} مشروب</div>
            <div className="text-xl font-black">₪{total.toFixed(2)}</div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button
              type="button"
              disabled={!employee || totalQuantity === 0 || loadingStatus}
              onClick={() => employee && onConfirm({ employee, items: selected })}
            >
              متابعة للدفع
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}