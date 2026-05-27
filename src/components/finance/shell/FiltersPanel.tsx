import { useMemo, useState } from "react";
import { Plus, X, Search, Save, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type {
  FilterCondition,
  FilterField,
  FilterOperator,
  SavedView,
} from "./types";

const OPERATORS_BY_TYPE: Record<string, { value: FilterOperator; label: string }[]> = {
  text: [
    { value: "begins_with", label: "يبدأ بـ" },
    { value: "contains", label: "يحتوي" },
    { value: "equals", label: "يساوي" },
    { value: "not_equals", label: "لا يساوي" },
    { value: "is_empty", label: "فارغ" },
    { value: "is_not_empty", label: "غير فارغ" },
  ],
  number: [
    { value: "equals", label: "يساوي" },
    { value: "greater_than", label: "أكبر من" },
    { value: "less_than", label: "أصغر من" },
    { value: "between", label: "بين" },
  ],
  date: [
    { value: "equals", label: "بتاريخ" },
    { value: "greater_than", label: "بعد" },
    { value: "less_than", label: "قبل" },
    { value: "between", label: "بين" },
  ],
  option: [
    { value: "equals", label: "يساوي" },
    { value: "not_equals", label: "لا يساوي" },
  ],
};

interface FiltersPanelProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fields: FilterField[];
  conditions: FilterCondition[];
  onChange: (c: FilterCondition[]) => void;
  views?: SavedView[];
  activeViewId?: string | null;
  onActivateView?: (id: string | null) => void;
  onSaveView?: (name: string, conditions: FilterCondition[]) => void;
  onDeleteView?: (id: string) => void;
}

/**
 * D365-style right-side Filters panel.
 * - Add filter field via popover (with search)
 * - Per-condition operator + value editors
 * - Save current state as a named "My View" (per page, localStorage)
 */
export function FiltersPanel({
  open,
  onOpenChange,
  fields,
  conditions,
  onChange,
  views = [],
  activeViewId,
  onActivateView,
  onSaveView,
  onDeleteView,
}: FiltersPanelProps) {
  const [fieldSearch, setFieldSearch] = useState("");
  const [viewName, setViewName] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const filteredFields = useMemo(
    () =>
      fields.filter((f) => f.label.toLowerCase().includes(fieldSearch.toLowerCase())),
    [fields, fieldSearch]
  );

  const addCondition = (f: FilterField) => {
    const op = OPERATORS_BY_TYPE[f.type]?.[0]?.value || "equals";
    onChange([
      ...conditions,
      { id: crypto.randomUUID(), fieldKey: f.key, operator: op, value: "" },
    ]);
    setAddOpen(false);
    setFieldSearch("");
  };

  const updateCondition = (id: string, patch: Partial<FilterCondition>) =>
    onChange(conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCondition = (id: string) =>
    onChange(conditions.filter((c) => c.id !== id));
  const resetAll = () => onChange([]);

  if (!open) return null;

  return (
    <aside
      dir="rtl"
      className="w-[340px] shrink-0 border-l border-border bg-card flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-[14px] font-semibold flex items-center gap-2">
          الفلاتر
          {conditions.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
              {conditions.length}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-1">
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-[12px]">
                <Plus className="h-3.5 w-3.5" /> إضافة
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-2" dir="rtl">
              <div className="relative mb-2">
                <Search className="absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="ابحث عن حقل..."
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  className="h-8 pr-7 text-[12.5px]"
                />
              </div>
              <ScrollArea className="h-64">
                <div className="flex flex-col">
                  {filteredFields.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => addCondition(f)}
                      className="text-right text-[12.5px] px-2 py-1.5 hover:bg-muted rounded"
                    >
                      <span>{f.label}</span>
                      <span className="text-muted-foreground text-[10.5px] mr-2">{f.type}</span>
                    </button>
                  ))}
                  {filteredFields.length === 0 && (
                    <div className="text-center text-[12px] text-muted-foreground p-4">
                      لا توجد حقول مطابقة
                    </div>
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* My Views */}
      {views.length > 0 && (
        <div className="px-3 py-2 border-b border-border/60 bg-muted/30">
          <div className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1">
            <Star className="h-3 w-3" /> العروض المحفوظة
          </div>
          <div className="flex flex-wrap gap-1">
            {views.map((v) => (
              <button
                key={v.id}
                onClick={() => onActivateView?.(v.id)}
                className={cn(
                  "text-[11.5px] px-2 py-1 rounded-md border transition-colors",
                  activeViewId === v.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card hover:bg-muted border-border"
                )}
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conditions */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {conditions.length === 0 && (
            <div className="text-center text-[12.5px] text-muted-foreground py-8">
              لا توجد فلاتر مطبّقة.
              <br />
              اضغط <strong>إضافة</strong> لإنشاء فلتر جديد.
            </div>
          )}
          {conditions.map((c) => {
            const field = fields.find((f) => f.key === c.fieldKey);
            if (!field) return null;
            const ops = OPERATORS_BY_TYPE[field.type] || OPERATORS_BY_TYPE.text;
            return (
              <div key={c.id} className="border border-border rounded-md p-2.5 space-y-2 bg-background">
                <div className="flex items-center justify-between">
                  <Label className="text-[12px] font-medium">{field.label}</Label>
                  <button
                    onClick={() => removeCondition(c.id)}
                    className="text-muted-foreground hover:text-destructive p-0.5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Select
                  value={c.operator}
                  onValueChange={(v) => updateCondition(c.id, { operator: v as FilterOperator })}
                >
                  <SelectTrigger className="h-7 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ops.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-[12px]">
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {c.operator !== "is_empty" && c.operator !== "is_not_empty" && (
                  <>
                    {field.type === "option" && field.options ? (
                      <Select
                        value={c.value}
                        onValueChange={(v) => updateCondition(c.id, { value: v })}
                      >
                        <SelectTrigger className="h-7 text-[12px]">
                          <SelectValue placeholder="اختر..." />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options.map((o) => (
                            <SelectItem key={o.value} value={o.value} className="text-[12px]">
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                        value={c.value}
                        onChange={(e) => updateCondition(c.id, { value: e.target.value })}
                        className="h-7 text-[12px]"
                        placeholder="القيمة..."
                      />
                    )}
                    {c.operator === "between" && (
                      <Input
                        type={field.type === "number" ? "number" : "date"}
                        value={c.valueTo || ""}
                        onChange={(e) => updateCondition(c.id, { valueTo: e.target.value })}
                        className="h-7 text-[12px]"
                        placeholder="إلى..."
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-border p-3 space-y-2 bg-muted/20">
        {onSaveView && (
          <div className="flex gap-1">
            <Input
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              placeholder="اسم العرض..."
              className="h-7 text-[12px]"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!viewName.trim() || conditions.length === 0}
              onClick={() => {
                onSaveView(viewName.trim(), conditions);
                setViewName("");
              }}
              className="h-7 gap-1 text-[12px] shrink-0"
            >
              <Save className="h-3.5 w-3.5" /> حفظ
            </Button>
          </div>
        )}
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={resetAll}
            disabled={conditions.length === 0}
            className="h-7 flex-1 text-[12px]"
          >
            مسح الكل
          </Button>
          {activeViewId && onDeleteView && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDeleteView(activeViewId)}
              className="h-7 text-destructive hover:text-destructive text-[12px]"
            >
              حذف العرض
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}

/** Applies in-memory filter conditions to a row array. Best-effort generic. */
export function applyFilters<T extends Record<string, any>>(
  rows: T[],
  conditions: FilterCondition[],
  fieldAccessor?: (row: T, key: string) => any
): T[] {
  if (!conditions.length) return rows;
  const getValue = fieldAccessor || ((r: T, k: string) => r[k]);
  const isDateLike = (s: any) =>
    typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s);
  return rows.filter((row) =>
    conditions.every((c) => {
      const raw = getValue(row, c.fieldKey);
      const strVal = raw == null ? "" : String(raw).toLowerCase();
      const cmp = (c.value || "").toLowerCase();
      switch (c.operator) {
        case "begins_with":
          return strVal.startsWith(cmp);
        case "contains":
          return strVal.includes(cmp);
        case "equals":
          return isDateLike(c.value) ? String(raw).slice(0, 10) === c.value : strVal === cmp;
        case "not_equals":
          return isDateLike(c.value) ? String(raw).slice(0, 10) !== c.value : strVal !== cmp;
        case "greater_than":
          return isDateLike(c.value) ? String(raw) > c.value : Number(raw) > Number(c.value);
        case "less_than":
          return isDateLike(c.value) ? String(raw) < c.value : Number(raw) < Number(c.value);
        case "between":
          if (isDateLike(c.value) || isDateLike(c.valueTo)) {
            const s = String(raw);
            return s >= (c.value || "") && s <= (c.valueTo || "9999-12-31");
          }
          return Number(raw) >= Number(c.value) && Number(raw) <= Number(c.valueTo);
        case "is_empty":
          return raw == null || raw === "";
        case "is_not_empty":
          return raw != null && raw !== "";
        default:
          return true;
      }
    })
  );
}