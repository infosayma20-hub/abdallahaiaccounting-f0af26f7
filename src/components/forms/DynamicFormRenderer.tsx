import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Plus, Trash2, Save, Send, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export type FieldDef = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select" | "multi_select" | "currency";
  required?: boolean;
  options?: string[];
  placeholder?: string;
};

export type SectionDef =
  | { key: string; title: string; type: "fields"; fields: FieldDef[] }
  | {
      key: string;
      title: string;
      type: "repeater";
      item_label?: string;
      min_items?: number;
      fields: FieldDef[];
    };

export type FormSchema = { sections: SectionDef[] };

interface Props {
  schema: FormSchema;
  initialData?: Record<string, any>;
  readOnly?: boolean;
  submitting?: boolean;
  onSubmit?: (data: Record<string, any>) => void;
  onSaveDraft?: (data: Record<string, any>) => void;
  draftKey?: string;
}

function makeEmptyRow(fields: FieldDef[]): Record<string, any> {
  const row: Record<string, any> = {};
  fields.forEach((f) => (row[f.key] = ""));
  return row;
}

function buildInitialData(schema: FormSchema, initial?: Record<string, any>): Record<string, any> {
  const data: Record<string, any> = {};
  schema.sections.forEach((s) => {
    if (s.type === "fields") {
      data[s.key] = initial?.[s.key] || {};
      s.fields.forEach((f) => {
        if (data[s.key][f.key] === undefined) data[s.key][f.key] = "";
      });
    } else {
      const arr = initial?.[s.key];
      if (Array.isArray(arr) && arr.length) data[s.key] = arr;
      else {
        const min = s.min_items || 1;
        data[s.key] = Array.from({ length: min }, () => makeEmptyRow(s.fields));
      }
    }
  });
  return data;
}

function FieldInput({
  field, value, onChange, disabled,
}: { field: FieldDef; value: any; onChange: (v: any) => void; disabled?: boolean }) {
  const common = "h-10 text-sm";
  switch (field.type) {
    case "textarea":
      return (
        <Textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          rows={3}
          className="text-sm"
        />
      );
    case "number":
    case "currency":
      return (
        <Input
          type="number"
          inputMode="decimal"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          className={common}
        />
      );
    case "date":
      return (
        <Input
          type="date"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={common}
        />
      );
    case "select":
      return (
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`${common} bg-background appearance-none pr-3`}
          dir="rtl"
        >
          <option value="" disabled>اختر...</option>
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    case "multi_select":
      // Simple comma-separated implementation
      return (
        <Input
          value={Array.isArray(value) ? value.join(", ") : (value ?? "")}
          onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
          placeholder="افصل بفاصلة"
          disabled={disabled}
          className={common}
        />
      );
    default:
      return (
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          className={common}
        />
      );
  }
}

export default function DynamicFormRenderer({
  schema, initialData, readOnly, submitting, onSubmit, onSaveDraft, draftKey,
}: Props) {
  const [data, setData] = useState<Record<string, any>>(() =>
    buildInitialData(schema, initialData)
  );

  // Auto-load draft from localStorage on mount
  useEffect(() => {
    if (!draftKey || initialData) return;
    try {
      const raw = localStorage.getItem(`dyn-form-draft:${draftKey}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        setData(buildInitialData(schema, parsed));
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // Debounced auto-save to localStorage
  useEffect(() => {
    if (!draftKey || readOnly) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(`dyn-form-draft:${draftKey}`, JSON.stringify(data)); } catch {}
    }, 800);
    return () => clearTimeout(t);
  }, [data, draftKey, readOnly]);

  const setSectionFieldValue = (sectionKey: string, fieldKey: string, value: any) => {
    setData((prev) => ({
      ...prev,
      [sectionKey]: { ...(prev[sectionKey] || {}), [fieldKey]: value },
    }));
  };

  const setRepeaterValue = (sectionKey: string, idx: number, fieldKey: string, value: any) => {
    setData((prev) => {
      const rows = [...(prev[sectionKey] || [])];
      rows[idx] = { ...(rows[idx] || {}), [fieldKey]: value };
      return { ...prev, [sectionKey]: rows };
    });
  };

  const addRepeaterRow = (section: Extract<SectionDef, { type: "repeater" }>) => {
    setData((prev) => ({
      ...prev,
      [section.key]: [...(prev[section.key] || []), makeEmptyRow(section.fields)],
    }));
  };

  const removeRepeaterRow = (sectionKey: string, idx: number) => {
    setData((prev) => {
      const rows = [...(prev[sectionKey] || [])];
      rows.splice(idx, 1);
      return { ...prev, [sectionKey]: rows };
    });
  };

  const handleSubmit = () => {
    // Validate required fields
    for (const section of schema.sections) {
      if (section.type === "fields") {
        for (const f of section.fields) {
          if (f.required && !data[section.key]?.[f.key]) {
            toast({
              title: "حقل مطلوب",
              description: `${section.title} - ${f.label}`,
              variant: "destructive",
            });
            return;
          }
        }
      }
    }
    onSubmit?.(data);
    if (draftKey) {
      try { localStorage.removeItem(`dyn-form-draft:${draftKey}`); } catch {}
    }
  };

  const defaultOpen = useMemo(() => schema.sections.slice(0, 1).map((s) => s.key), [schema]);

  return (
    <div dir="rtl" className="space-y-4">
      <Accordion type="multiple" defaultValue={defaultOpen} className="space-y-2">
        {schema.sections.map((section) => (
          <AccordionItem
            key={section.key}
            value={section.key}
            className="border rounded-xl bg-card overflow-hidden"
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline text-right">
              <span className="text-sm font-bold flex-1 text-right">{section.title}</span>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3">
              {section.type === "fields" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {section.fields.map((f) => (
                    <div key={f.key} className={f.type === "textarea" ? "md:col-span-2" : ""}>
                      <Label className="text-xs font-semibold mb-1.5 block">
                        {f.label}
                        {f.required && <span className="text-destructive mr-1">*</span>}
                      </Label>
                      <FieldInput
                        field={f}
                        value={data[section.key]?.[f.key]}
                        onChange={(v) => setSectionFieldValue(section.key, f.key, v)}
                        disabled={readOnly}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {(data[section.key] || []).map((row: any, idx: number) => (
                    <Card key={idx} className="border-dashed">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-muted-foreground">
                            {section.item_label || "عنصر"} #{idx + 1}
                          </span>
                          {!readOnly && (data[section.key] || []).length > (section.min_items || 0) && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-destructive"
                              onClick={() => removeRepeaterRow(section.key, idx)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {section.fields.map((f) => (
                            <div
                              key={f.key}
                              className={f.type === "textarea" ? "md:col-span-2" : ""}
                            >
                              <Label className="text-[11px] font-semibold mb-1 block">
                                {f.label}
                                {f.required && <span className="text-destructive mr-1">*</span>}
                              </Label>
                              <FieldInput
                                field={f}
                                value={row?.[f.key]}
                                onChange={(v) => setRepeaterValue(section.key, idx, f.key, v)}
                                disabled={readOnly}
                              />
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {!readOnly && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => addRepeaterRow(section)}
                    >
                      <Plus className="h-4 w-4 ml-1" />
                      إضافة {section.item_label || "عنصر"}
                    </Button>
                  )}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {!readOnly && (
        <div className="sticky bottom-0 z-10 bg-background/95 backdrop-blur border-t -mx-3 px-3 py-3 flex gap-2">
          {onSaveDraft && (
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                onSaveDraft(data);
                toast({ title: "تم حفظ المسودة", description: "تقدر تكمّل بعدين." });
              }}
              disabled={submitting}
            >
              <Save className="h-4 w-4 ml-1" />
              حفظ مسودة
            </Button>
          )}
          <Button
            type="button"
            className="flex-1"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 ml-1 animate-spin" />
            ) : (
              <Send className="h-4 w-4 ml-1" />
            )}
            إرسال النموذج
          </Button>
        </div>
      )}
    </div>
  );
}