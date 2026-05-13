import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, X } from "lucide-react";

// ───────────── Types ─────────────
export type TriState = "all" | "has" | "none";

export type SummaryFilters = {
  status: "all" | "ready" | "review";
  branch: string;
  department: string;
  absence: TriState;
  incomplete: TriState;
  overtime: TriState;
  late: TriState;
  absentMin?: number; absentMax?: number;
  hoursMin?: number;  hoursMax?: number;
  otMin?: number;     otMax?: number;
};
export const defaultSummaryFilters: SummaryFilters = {
  status: "all", branch: "all", department: "all",
  absence: "all", incomplete: "all", overtime: "all", late: "all",
};

export type IncompleteFilters = {
  issue: "all" | "no_in" | "no_out" | "missing";
  corrStatus: "all" | "none" | "pending" | "approved" | "rejected";
  branch: string;
  department: string;
  employeeId: string;
  dateFrom?: string;
  dateTo?: string;
};
export const defaultIncompleteFilters: IncompleteFilters = {
  issue: "all", corrStatus: "all", branch: "all", department: "all", employeeId: "all",
};

export type ReadinessFilters = {
  status: "all" | "ready" | "review";
  reason: "all" | "incomplete" | "pending" | "absence" | "no_shift" | "other";
  branch: string;
  department: string;
  employeeId: string;
};
export const defaultReadinessFilters: ReadinessFilters = {
  status: "all", reason: "all", branch: "all", department: "all", employeeId: "all",
};

// ───────────── Helpers ─────────────
export const countActive = <T extends Record<string, any>>(cur: T, def: T): number => {
  let n = 0;
  Object.keys(cur).forEach((k) => {
    const cv = cur[k]; const dv = def[k];
    if (cv === undefined || cv === "" || cv === null) return;
    if (cv !== dv) n++;
  });
  return n;
};

type Opt = { value: string; label: string };

function FilterShell({
  count, onClear, children, label = "فلترة",
}: { count: number; onClear: () => void; children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-2" dir="rtl">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button size="sm" variant={count > 0 ? "default" : "outline"} className="h-9 text-xs">
            <Filter className="h-3.5 w-3.5 ml-1" /> {label}
            {count > 0 && <Badge variant="secondary" className="mr-2 h-5 px-1.5 text-[10px]">{count}</Badge>}
          </Button>
        </SheetTrigger>
        <SheetContent side="left" dir="rtl" className="w-full sm:max-w-md p-0 flex flex-col gap-0 max-h-[100dvh]">
          <SheetHeader className="p-4 border-b shrink-0 text-right">
            <SheetTitle className="text-base">{label}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">{children}</div>
          <SheetFooter className="p-3 border-t bg-background shrink-0 flex-row-reverse gap-2 sm:flex-row-reverse">
            <Button size="sm" onClick={() => setOpen(false)} className="h-9 text-xs flex-1">تطبيق ({count})</Button>
            <Button size="sm" variant="outline" onClick={onClear} className="h-9 text-xs"><X className="h-3.5 w-3.5 ml-1" /> مسح</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="h-9 text-xs">إغلاق</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      {count > 0 && (
        <Badge variant="outline" className="text-[11px]">{count} فلاتر مفعلة</Badge>
      )}
      {count > 0 && (
        <Button size="sm" variant="ghost" onClick={onClear} className="h-9 text-xs">
          <X className="h-3.5 w-3.5 ml-1" /> مسح
        </Button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SelectField({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Opt[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

const TRI_OPTS: Opt[] = [
  { value: "all", label: "الكل" },
  { value: "has", label: "نعم — لديه" },
  { value: "none", label: "لا — بدون" },
];

// ───────────── Summary popover ─────────────
export function SummaryFilterBar({
  filters, setFilters, branches, departments,
}: {
  filters: SummaryFilters;
  setFilters: (f: SummaryFilters) => void;
  branches: Opt[];
  departments: Opt[];
}) {
  const count = countActive(filters, defaultSummaryFilters);
  const upd = (p: Partial<SummaryFilters>) => setFilters({ ...filters, ...p });
  const num = (v: string) => (v === "" ? undefined : Number(v));
  return (
    <FilterShell count={count} onClear={() => setFilters(defaultSummaryFilters)}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="الحالة">
            <SelectField value={filters.status} onChange={(v) => upd({ status: v as any })}
              options={[{ value: "all", label: "الكل" }, { value: "ready", label: "مكتمل" }, { value: "review", label: "يحتاج مراجعة" }]} />
          </Field>
          <Field label="الفرع">
            <SelectField value={filters.branch} onChange={(v) => upd({ branch: v })}
              options={[{ value: "all", label: "كل الفروع" }, ...branches]} />
          </Field>
          <Field label="القسم">
            <SelectField value={filters.department} onChange={(v) => upd({ department: v })}
              options={[{ value: "all", label: "كل الأقسام" }, ...departments]} />
          </Field>
          <Field label="الغياب">
            <SelectField value={filters.absence} onChange={(v) => upd({ absence: v as TriState })} options={TRI_OPTS} />
          </Field>
          <Field label="بصمات ناقصة">
            <SelectField value={filters.incomplete} onChange={(v) => upd({ incomplete: v as TriState })} options={TRI_OPTS} />
          </Field>
          <Field label="ساعات إضافية">
            <SelectField value={filters.overtime} onChange={(v) => upd({ overtime: v as TriState })} options={TRI_OPTS} />
          </Field>
          <Field label="تأخير">
            <SelectField value={filters.late} onChange={(v) => upd({ late: v as TriState })} options={TRI_OPTS} />
          </Field>
        </div>
        <Separator />
        <div className="space-y-2">
          <Label className="text-[11px] text-muted-foreground">نطاقات رقمية</Label>
          <div className="grid grid-cols-2 gap-2">
            <Field label="غياب من">
              <Input type="number" min={0} className="h-8 text-xs" value={filters.absentMin ?? ""} onChange={(e) => upd({ absentMin: num(e.target.value) })} />
            </Field>
            <Field label="غياب إلى">
              <Input type="number" min={0} className="h-8 text-xs" value={filters.absentMax ?? ""} onChange={(e) => upd({ absentMax: num(e.target.value) })} />
            </Field>
            <Field label="ساعات من">
              <Input type="number" min={0} className="h-8 text-xs" value={filters.hoursMin ?? ""} onChange={(e) => upd({ hoursMin: num(e.target.value) })} />
            </Field>
            <Field label="ساعات إلى">
              <Input type="number" min={0} className="h-8 text-xs" value={filters.hoursMax ?? ""} onChange={(e) => upd({ hoursMax: num(e.target.value) })} />
            </Field>
            <Field label="إضافي من">
              <Input type="number" min={0} className="h-8 text-xs" value={filters.otMin ?? ""} onChange={(e) => upd({ otMin: num(e.target.value) })} />
            </Field>
            <Field label="إضافي إلى">
              <Input type="number" min={0} className="h-8 text-xs" value={filters.otMax ?? ""} onChange={(e) => upd({ otMax: num(e.target.value) })} />
            </Field>
          </div>
        </div>
      </div>
    </FilterShell>
  );
}

// ───────────── Incomplete popover ─────────────
export function IncompleteFilterBar({
  filters, setFilters, branches, departments, employees,
}: {
  filters: IncompleteFilters;
  setFilters: (f: IncompleteFilters) => void;
  branches: Opt[]; departments: Opt[]; employees: Opt[];
}) {
  const count = countActive(filters, defaultIncompleteFilters);
  const upd = (p: Partial<IncompleteFilters>) => setFilters({ ...filters, ...p });
  return (
    <FilterShell count={count} onClear={() => setFilters(defaultIncompleteFilters)}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="نوع المشكلة">
          <SelectField value={filters.issue} onChange={(v) => upd({ issue: v as any })} options={[
            { value: "all", label: "الكل" },
            { value: "no_in", label: "بدون دخول" },
            { value: "no_out", label: "بدون خروج" },
            { value: "missing", label: "بصمة ناقصة" },
          ]} />
        </Field>
        <Field label="حالة طلب التصحيح">
          <SelectField value={filters.corrStatus} onChange={(v) => upd({ corrStatus: v as any })} options={[
            { value: "all", label: "الكل" },
            { value: "none", label: "لا يوجد طلب" },
            { value: "pending", label: "قيد المراجعة" },
            { value: "approved", label: "مقبول" },
            { value: "rejected", label: "مرفوض" },
          ]} />
        </Field>
        <Field label="الفرع">
          <SelectField value={filters.branch} onChange={(v) => upd({ branch: v })} options={[{ value: "all", label: "كل الفروع" }, ...branches]} />
        </Field>
        <Field label="القسم">
          <SelectField value={filters.department} onChange={(v) => upd({ department: v })} options={[{ value: "all", label: "كل الأقسام" }, ...departments]} />
        </Field>
        <div className="col-span-2">
          <Field label="الموظف">
            <SelectField value={filters.employeeId} onChange={(v) => upd({ employeeId: v })} options={[{ value: "all", label: "كل الموظفين" }, ...employees]} />
          </Field>
        </div>
        <Field label="من تاريخ">
          <Input type="date" className="h-8 text-xs" value={filters.dateFrom ?? ""} onChange={(e) => upd({ dateFrom: e.target.value || undefined })} />
        </Field>
        <Field label="إلى تاريخ">
          <Input type="date" className="h-8 text-xs" value={filters.dateTo ?? ""} onChange={(e) => upd({ dateTo: e.target.value || undefined })} />
        </Field>
      </div>
    </FilterShell>
  );
}

// ───────────── Readiness popover ─────────────
export function ReadinessFilterBar({
  filters, setFilters, branches, departments, employees,
}: {
  filters: ReadinessFilters;
  setFilters: (f: ReadinessFilters) => void;
  branches: Opt[]; departments: Opt[]; employees: Opt[];
}) {
  const count = countActive(filters, defaultReadinessFilters);
  const upd = (p: Partial<ReadinessFilters>) => setFilters({ ...filters, ...p });
  return (
    <FilterShell count={count} onClear={() => setFilters(defaultReadinessFilters)}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="الحالة">
          <SelectField value={filters.status} onChange={(v) => upd({ status: v as any })} options={[
            { value: "all", label: "الكل" },
            { value: "ready", label: "جاهز" },
            { value: "review", label: "يحتاج مراجعة" },
          ]} />
        </Field>
        <Field label="سبب التعليق">
          <SelectField value={filters.reason} onChange={(v) => upd({ reason: v as any })} options={[
            { value: "all", label: "الكل" },
            { value: "incomplete", label: "بصمات ناقصة" },
            { value: "pending", label: "طلبات معلقة" },
            { value: "absence", label: "غياب" },
            { value: "no_shift", label: "لا يوجد وردية" },
            { value: "other", label: "أخرى" },
          ]} />
        </Field>
        <Field label="الفرع">
          <SelectField value={filters.branch} onChange={(v) => upd({ branch: v })} options={[{ value: "all", label: "كل الفروع" }, ...branches]} />
        </Field>
        <Field label="القسم">
          <SelectField value={filters.department} onChange={(v) => upd({ department: v })} options={[{ value: "all", label: "كل الأقسام" }, ...departments]} />
        </Field>
        <div className="col-span-2">
          <Field label="الموظف">
            <SelectField value={filters.employeeId} onChange={(v) => upd({ employeeId: v })} options={[{ value: "all", label: "كل الموظفين" }, ...employees]} />
          </Field>
        </div>
      </div>
    </FilterShell>
  );
}
