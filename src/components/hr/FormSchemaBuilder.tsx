import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, ChevronUp, ChevronDown, GripVertical, Copy as CopyIcon,
  Type, AlignLeft, Hash, Calendar, ListChecks, CircleDot, CheckSquare, Star,
  ThumbsUp, LayoutList, Repeat,
} from "lucide-react";

/**
 * Visual builder for FormSchema used by DynamicFormRenderer.
 * Schema shape:
 *   { sections: [{ key, title, type: "fields"|"repeater", fields: [...], item_label?, min_items? }] }
 * Field shape:
 *   { key, label, type, required?, options?, placeholder?, help? }
 */

type FieldType =
  | "text" | "textarea" | "number" | "date"
  | "select" | "multi_select" | "radio" | "checklist"
  | "checkbox" | "yes_no" | "rating";

type Field = {
  key: string; label: string; type: FieldType;
  required?: boolean; options?: string[]; placeholder?: string; help?: string;
};

type Section = {
  key: string; title: string;
  type: "fields" | "repeater";
  fields: Field[];
  item_label?: string;
  min_items?: number;
};

export type BuilderSchema = { sections: Section[] };

const FIELD_TYPE_META: Record<FieldType, { label: string; icon: any; needsOptions?: boolean }> = {
  text:         { label: "نص قصير",         icon: Type },
  textarea:     { label: "نص طويل",         icon: AlignLeft },
  number:       { label: "رقم",              icon: Hash },
  date:         { label: "تاريخ",            icon: Calendar },
  select:       { label: "قائمة منسدلة",     icon: LayoutList, needsOptions: true },
  multi_select: { label: "اختيار متعدد (نص)",icon: ListChecks, needsOptions: true },
  radio:        { label: "اختيار واحد (أزرار)", icon: CircleDot, needsOptions: true },
  checklist:    { label: "قائمة تشييك",      icon: CheckSquare, needsOptions: true },
  checkbox:     { label: "مربع موافقة",      icon: CheckSquare },
  yes_no:       { label: "نعم / لا / لا ينطبق", icon: ThumbsUp },
  rating:       { label: "تقييم نجوم (1-5)", icon: Star },
};

const slug = (s: string) =>
  s.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 40) ||
  `f_${Math.random().toString(36).slice(2, 7)}`;

function uniqueKey(base: string, used: Set<string>) {
  let k = slug(base); let i = 2;
  while (used.has(k)) { k = `${slug(base)}_${i++}`; }
  return k;
}

interface Props {
  value: BuilderSchema;
  onChange: (v: BuilderSchema) => void;
}

export default function FormSchemaBuilder({ value, onChange }: Props) {
  const schema = value && Array.isArray(value.sections) ? value : { sections: [] };

  const usedSectionKeys = useMemo(
    () => new Set(schema.sections.map((s) => s.key)),
    [schema]
  );

  const update = (s: BuilderSchema) => onChange(s);

  const addSection = (type: "fields" | "repeater" = "fields") => {
    const title = type === "repeater" ? "قسم متكرر" : "قسم جديد";
    const key = uniqueKey(`section_${schema.sections.length + 1}`, usedSectionKeys);
    update({
      sections: [
        ...schema.sections,
        type === "repeater"
          ? { key, title, type, fields: [{ key: "name", label: "اسم", type: "text" }], item_label: "بند", min_items: 1 }
          : { key, title, type, fields: [] },
      ],
    });
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const next = [...schema.sections];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    update({ sections: next });
  };

  const removeSection = (idx: number) => {
    update({ sections: schema.sections.filter((_, i) => i !== idx) });
  };

  const duplicateSection = (idx: number) => {
    const src = schema.sections[idx];
    const key = uniqueKey(`${src.key}_copy`, usedSectionKeys);
    const copy: Section = JSON.parse(JSON.stringify(src));
    copy.key = key;
    copy.title = `${src.title} (نسخة)`;
    const next = [...schema.sections];
    next.splice(idx + 1, 0, copy);
    update({ sections: next });
  };

  const patchSection = (idx: number, patch: Partial<Section>) => {
    const next = [...schema.sections];
    next[idx] = { ...next[idx], ...patch } as Section;
    update({ sections: next });
  };

  const addField = (sIdx: number) => {
    const sec = schema.sections[sIdx];
    const used = new Set(sec.fields.map((f) => f.key));
    const key = uniqueKey(`field_${sec.fields.length + 1}`, used);
    const newField: Field = { key, label: "حقل جديد", type: "text" };
    patchSection(sIdx, { fields: [...sec.fields, newField] });
  };

  const patchField = (sIdx: number, fIdx: number, patch: Partial<Field>) => {
    const sec = schema.sections[sIdx];
    const fields = [...sec.fields];
    fields[fIdx] = { ...fields[fIdx], ...patch };
    patchSection(sIdx, { fields });
  };

  const moveField = (sIdx: number, fIdx: number, dir: -1 | 1) => {
    const sec = schema.sections[sIdx];
    const fields = [...sec.fields];
    const j = fIdx + dir;
    if (j < 0 || j >= fields.length) return;
    [fields[fIdx], fields[j]] = [fields[j], fields[fIdx]];
    patchSection(sIdx, { fields });
  };

  const removeField = (sIdx: number, fIdx: number) => {
    const sec = schema.sections[sIdx];
    patchSection(sIdx, { fields: sec.fields.filter((_, i) => i !== fIdx) });
  };

  const duplicateField = (sIdx: number, fIdx: number) => {
    const sec = schema.sections[sIdx];
    const used = new Set(sec.fields.map((f) => f.key));
    const src = sec.fields[fIdx];
    const copy: Field = { ...JSON.parse(JSON.stringify(src)), key: uniqueKey(`${src.key}_copy`, used), label: `${src.label} (نسخة)` };
    const fields = [...sec.fields];
    fields.splice(fIdx + 1, 0, copy);
    patchSection(sIdx, { fields });
  };

  return (
    <div className="space-y-3" dir="rtl">
      {schema.sections.length === 0 && (
        <div className="border border-dashed rounded-xl p-6 text-center text-xs text-muted-foreground">
          لا توجد أقسام بعد. ابدأ بإضافة قسم لتنظيم الأسئلة.
        </div>
      )}

      {schema.sections.map((section, sIdx) => (
        <div key={sIdx} className="border rounded-xl bg-card overflow-hidden">
          {/* Section header */}
          <div className="flex items-center gap-2 p-3 bg-muted/40 border-b">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <Input
              value={section.title}
              onChange={(e) => patchSection(sIdx, { title: e.target.value })}
              className="h-8 text-sm font-semibold flex-1"
              placeholder="عنوان القسم"
            />
            <Badge variant="outline" className="text-[10px] gap-1">
              {section.type === "repeater" ? (<><Repeat className="h-3 w-3" /> متكرر</>) : "قسم"}
            </Badge>
            <div className="flex items-center gap-0.5">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => moveSection(sIdx, -1)} disabled={sIdx === 0}>
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => moveSection(sIdx, 1)} disabled={sIdx === schema.sections.length - 1}>
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => duplicateSection(sIdx)} title="نسخ">
                <CopyIcon className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => removeSection(sIdx)} title="حذف">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {section.type === "repeater" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3 border-b bg-background">
              <div>
                <Label className="text-[10px]">تسمية البند المتكرر</Label>
                <Input
                  className="h-8 text-xs"
                  value={section.item_label || ""}
                  onChange={(e) => patchSection(sIdx, { item_label: e.target.value })}
                  placeholder="مثلاً: بند، صف، عنصر"
                />
              </div>
              <div>
                <Label className="text-[10px]">حد أدنى للبنود</Label>
                <Input
                  className="h-8 text-xs"
                  type="number"
                  min={0}
                  value={section.min_items ?? 1}
                  onChange={(e) => patchSection(sIdx, { min_items: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
          )}

          {/* Fields */}
          <div className="p-3 space-y-2">
            {section.fields.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-3">
                لا توجد أسئلة. اضغط "إضافة سؤال" لإنشاء أول حقل.
              </p>
            )}

            {section.fields.map((field, fIdx) => {
              const meta = FIELD_TYPE_META[field.type] || FIELD_TYPE_META.text;
              const Icon = meta.icon;
              return (
                <div key={fIdx} className="border rounded-lg p-3 bg-background space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px]">السؤال / التسمية *</Label>
                        <Input
                          className="h-8 text-xs"
                          value={field.label}
                          onChange={(e) => patchField(sIdx, fIdx, { label: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">نوع الإجابة</Label>
                        <Select
                          value={field.type}
                          onValueChange={(v) => patchField(sIdx, fIdx, { type: v as FieldType })}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(FIELD_TYPE_META).map(([k, m]) => (
                              <SelectItem key={k} value={k} className="text-xs">
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => moveField(sIdx, fIdx, -1)} disabled={fIdx === 0}>
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => moveField(sIdx, fIdx, 1)} disabled={fIdx === section.fields.length - 1}>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => duplicateField(sIdx, fIdx)} title="نسخ">
                        <CopyIcon className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => removeField(sIdx, fIdx)} title="حذف">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {meta.needsOptions && (
                    <div>
                      <Label className="text-[10px]">الخيارات (سطر لكل خيار)</Label>
                      <Textarea
                        rows={3}
                        className="text-xs"
                        value={(field.options || []).join("\n")}
                        onChange={(e) =>
                          patchField(sIdx, fIdx, {
                            options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                          })
                        }
                        placeholder={"تم\nلم يتم\nجزئياً"}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px]">تلميح للموظف (اختياري)</Label>
                      <Input
                        className="h-8 text-xs"
                        value={field.help || ""}
                        onChange={(e) => patchField(sIdx, fIdx, { help: e.target.value })}
                        placeholder="ملاحظة تظهر تحت الحقل"
                      />
                    </div>
                    <div className="flex items-end justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!field.required}
                          onCheckedChange={(c) => patchField(sIdx, fIdx, { required: c })}
                        />
                        <Label className="text-[11px]">إلزامي</Label>
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono" title="معرّف الحقل">
                        {field.key}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full border-dashed gap-1"
              onClick={() => addField(sIdx)}
            >
              <Plus className="h-3.5 w-3.5" />
              إضافة سؤال
            </Button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="default" size="sm" className="gap-1" onClick={() => addSection("fields")}>
          <Plus className="h-3.5 w-3.5" />
          إضافة قسم
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => addSection("repeater")}>
          <Repeat className="h-3.5 w-3.5" />
          إضافة قسم متكرر
        </Button>
      </div>
    </div>
  );
}