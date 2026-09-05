import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { Plus, Trash2, Save, Send, Loader2, FileDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export type FieldDef = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select" | "multi_select" | "currency" | "checkbox" | "radio" | "rating" | "yes_no" | "checklist";
  required?: boolean;
  options?: string[];
  placeholder?: string;
  help?: string;
};

export type SectionDef =
  | { key: string; title: string; description?: string; type: "fields"; fields: FieldDef[] }
  | {
      key: string;
      title: string;
      description?: string;
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
  /** Optional renderer for extra controls inside each section header (e.g. assignment chip). */
  renderSectionExtras?: (section: SectionDef) => ReactNode;
  /** When provided, shows a "تنزيل Word" button in the action bar that hands back the current data. */
  onPreviewWord?: (data: Record<string, any>) => void;
}

function makeEmptyRow(fields: FieldDef[]): Record<string, any> {
  const row: Record<string, any> = {};
  fields.forEach((f) => (row[f.key] = ""));
  return row;
}

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDMY(iso: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function buildInitialData(schema: FormSchema, initial?: Record<string, any>): Record<string, any> {
  const data: Record<string, any> = {};
  schema.sections.forEach((s) => {
    if (s.type === "fields") {
      data[s.key] = initial?.[s.key] || {};
      s.fields.forEach((f) => {
        if (data[s.key][f.key] === undefined) {
          data[s.key][f.key] = "";
        }
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

function draftSignature(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return `${value.length}:${(hash >>> 0).toString(36)}`;
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
          value={value || ""}
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
    case "checkbox":
      return (
        <label className="flex items-center gap-2 h-10 px-3 rounded-md border bg-background text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className="h-4 w-4 accent-primary"
          />
          <span>{field.placeholder || "نعم"}</span>
        </label>
      );
    case "yes_no":
      return (
        <div className="flex gap-2">
          {[
            { v: "yes", label: "نعم", cls: "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100" },
            { v: "no", label: "لا", cls: "bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100" },
            { v: "na", label: "لا ينطبق", cls: "bg-muted border-border text-muted-foreground hover:bg-muted/70" },
          ].map((opt) => (
            <button
              key={opt.v}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.v)}
              className={`flex-1 h-10 text-xs rounded-md border transition ${opt.cls} ${value === opt.v ? "ring-2 ring-primary ring-offset-1" : "opacity-70"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      );
    case "radio":
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options || []).map((opt) => (
            <label
              key={opt}
              className={`flex items-center gap-1.5 h-9 px-3 rounded-md border text-xs cursor-pointer transition ${value === opt ? "border-primary bg-primary/10 text-primary font-semibold" : "bg-background hover:bg-muted"}`}
            >
              <input
                type="radio"
                checked={value === opt}
                onChange={() => onChange(opt)}
                disabled={disabled}
                className="h-3.5 w-3.5 accent-primary"
              />
              {opt}
            </label>
          ))}
        </div>
      );
    case "rating": {
      const max = 5;
      const cur = Number(value) || 0;
      return (
        <div className="flex items-center gap-1 h-10">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onChange(n)}
              className={`text-2xl leading-none transition ${n <= cur ? "text-amber-500" : "text-muted-foreground/40"}`}
              aria-label={`${n}`}
            >
              ★
            </button>
          ))}
          {cur > 0 && (
            <span className="text-xs text-muted-foreground mr-2">{cur}/{max}</span>
          )}
        </div>
      );
    }
    case "checklist": {
      const arr: string[] = Array.isArray(value) ? value : [];
      const toggle = (opt: string) => {
        if (arr.includes(opt)) onChange(arr.filter((x) => x !== opt));
        else onChange([...arr, opt]);
      };
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {(field.options || []).map((opt) => {
            const checked = arr.includes(opt);
            return (
              <label
                key={opt}
                className={`flex items-center gap-2 px-3 py-2 rounded-md border text-xs cursor-pointer transition ${checked ? "border-primary bg-primary/10" : "bg-background hover:bg-muted"}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(opt)}
                  disabled={disabled}
                  className="h-4 w-4 accent-primary"
                />
                <span className={checked ? "font-semibold text-primary" : ""}>{opt}</span>
              </label>
            );
          })}
        </div>
      );
    }
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
  renderSectionExtras, onPreviewWord,
}: Props) {
  const [data, setData] = useState<Record<string, any>>(() =>
    buildInitialData(schema, initialData)
  );
  // Track whether the user has actually edited the form. Auto-save must NOT
  // run until then, otherwise opening the form would silently overwrite a
  // previously-saved local draft with the server snapshot.
  const dirtyRef = useRef(false);
  const restoreDecidedRef = useRef(false);

  // Auto-load draft from localStorage on mount
  useEffect(() => {
    if (!draftKey) return;
    try {
      const primaryKey = `dyn-form-draft:${draftKey}`;
      const backupKey = `dyn-form-draft-backup:${draftKey}`;
      const decisionKey = `dyn-form-draft-decision:${draftKey}`;
      const serverSaveKey = `dyn-form-draft-server-save:${draftKey}`;
      let raw = localStorage.getItem(primaryKey);
      let fromBackup = false;
      if (!raw) {
        // Fall back to the safety backup (kept when the user previously
        // dismissed the restore prompt).
        raw = localStorage.getItem(backupKey);
        fromBackup = !!raw;
      }
      if (!raw) { restoreDecidedRef.current = true; return; }
      const parsed = JSON.parse(raw);
      if (initialData) {
        // We already loaded a draft from the server. Offer to restore unsaved
        // local edits (e.g. user clicked "Save" but it never reached the DB).
        try {
          const serverStr = JSON.stringify(initialData);
          const localStr = JSON.stringify(parsed);
          if (localStr && localStr !== serverStr && localStr.length > 5) {
            // Always preserve a safety copy before showing any prompt. This is
            // the user's only copy if the server draft is stale.
            const signature = draftSignature(localStr);
            try { localStorage.setItem(backupKey, localStr); } catch {}

            const previousDecision = localStorage.getItem(decisionKey);
            if (previousDecision === `restore:${signature}`) {
              const restored = buildInitialData(schema, parsed);
              setData(restored);
              dirtyRef.current = true;
              try { localStorage.setItem(primaryKey, JSON.stringify(restored)); } catch {}
              restoreDecidedRef.current = true;
              return;
            }
            if (previousDecision === `server:${signature}`) {
              restoreDecidedRef.current = true;
              return;
            }

            const ok = window.confirm(
              (fromBackup
                ? "تم العثور على نسخة احتياطية من تعديلاتك المحلية السابقة.\n"
                : "في تعديلات محلية غير محفوظة على السيرفر لهذا النموذج.\n") +
              "هل تريد استرجاعها؟\n(اضغط إلغاء لاستخدام النسخة المحفوظة على السيرفر — وسيتم الاحتفاظ بنسخة احتياطية)"
            );
            if (ok) {
              const restored = buildInitialData(schema, parsed);
              setData(restored);
              dirtyRef.current = true; // keep it persisted
              // Remember this exact local draft was accepted so React remounts
              // or StrictMode cannot show the same browser dialog repeatedly.
              try {
                localStorage.setItem(decisionKey, `restore:${signature}`);
                localStorage.setItem(primaryKey, JSON.stringify(restored));
                localStorage.setItem(backupKey, JSON.stringify(restored));
              } catch {}
              // Push the recovered local copy to the server immediately. The
              // backup remains locally even if the network save fails.
              const previousServerSave = localStorage.getItem(serverSaveKey);
              if (previousServerSave !== signature) {
                try { localStorage.setItem(serverSaveKey, signature); } catch {}
                onSaveDraft?.(restored);
              }
            } else {
              // SAFETY: don't lose the draft. Move it to a backup slot so the
              // user (or support) can still recover it later.
              try {
                localStorage.setItem(decisionKey, `server:${signature}`);
                localStorage.setItem(backupKey, localStr);
                localStorage.removeItem(primaryKey);
              } catch {}
            }
          }
        } catch {}
      } else {
        setData(buildInitialData(schema, parsed));
        dirtyRef.current = true;
      }
    } catch {}
    finally { restoreDecidedRef.current = true; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // Debounced auto-save to localStorage
  useEffect(() => {
    if (!draftKey || readOnly) return;
    // Don't write until the user has actually interacted AND the restore
    // prompt has been resolved — otherwise we'd clobber the existing draft.
    if (!dirtyRef.current || !restoreDecidedRef.current) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(`dyn-form-draft:${draftKey}`, JSON.stringify(data)); } catch {}
    }, 800);
    return () => clearTimeout(t);
  }, [data, draftKey, readOnly]);

  const setSectionFieldValue = (sectionKey: string, fieldKey: string, value: any) => {
    dirtyRef.current = true;
    setData((prev) => ({
      ...prev,
      [sectionKey]: { ...(prev[sectionKey] || {}), [fieldKey]: value },
    }));
  };

  const setRepeaterValue = (sectionKey: string, idx: number, fieldKey: string, value: any) => {
    dirtyRef.current = true;
    setData((prev) => {
      const rows = [...(prev[sectionKey] || [])];
      rows[idx] = { ...(rows[idx] || {}), [fieldKey]: value };
      return { ...prev, [sectionKey]: rows };
    });
  };

  const addRepeaterRow = (section: Extract<SectionDef, { type: "repeater" }>) => {
    dirtyRef.current = true;
    setData((prev) => ({
      ...prev,
      [section.key]: [...(prev[section.key] || []), makeEmptyRow(section.fields)],
    }));
  };

  const removeRepeaterRow = (sectionKey: string, idx: number) => {
    dirtyRef.current = true;
    setData((prev) => {
      const rows = [...(prev[sectionKey] || [])];
      rows.splice(idx, 1);
      return { ...prev, [sectionKey]: rows };
    });
  };

  const handleSubmit = () => {
    // Manager-driven dates: no auto-overwrite — submit data as entered.
    const sanitized: Record<string, any> = { ...data };
    // Validate required fields
    for (const section of schema.sections) {
      if (section.type === "fields") {
        for (const f of section.fields) {
          if (f.required && !sanitized[section.key]?.[f.key]) {
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
    onSubmit?.(sanitized);
    if (draftKey) {
      try {
        localStorage.removeItem(`dyn-form-draft:${draftKey}`);
        localStorage.removeItem(`dyn-form-draft-backup:${draftKey}`);
        localStorage.removeItem(`dyn-form-draft-decision:${draftKey}`);
        localStorage.removeItem(`dyn-form-draft-server-save:${draftKey}`);
      } catch {}
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
              <div className="flex items-center justify-between gap-2 flex-1 min-w-0">
                <span className="text-sm font-bold text-right truncate">{section.title}</span>
                {renderSectionExtras && (
                  <span
                    className="shrink-0"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                  >
                    {renderSectionExtras(section)}
                  </span>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3">
              {section.type === "fields" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {section.fields.map((f) => (
                    <div key={f.key} className={(f.type === "textarea" || f.type === "checklist") ? "md:col-span-2" : ""}>
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
                      {f.help && (
                        <p className="text-[10px] text-muted-foreground mt-1">{f.help}</p>
                      )}
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
        <div className="sticky bottom-0 z-10 bg-background/95 backdrop-blur border-t -mx-3 px-2 py-2 flex flex-wrap gap-2">
          {onSaveDraft && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 min-w-0 basis-[30%] px-2 text-xs sm:text-sm"
              onClick={() => {
                onSaveDraft(data);
                toast({ title: "تم حفظ المسودة", description: "تقدر تكمّل بعدين." });
              }}
              disabled={submitting}
            >
              <Save className="h-4 w-4 ml-1 shrink-0" />
              <span className="truncate">حفظ مسودة</span>
            </Button>
          )}
          {onPreviewWord && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="flex-1 min-w-0 basis-[30%] px-2 text-xs sm:text-sm"
              onClick={() => onPreviewWord(data)}
              disabled={submitting}
              title="عاين النموذج كملف Word قبل الإرسال"
            >
              <FileDown className="h-4 w-4 ml-1 shrink-0" />
              <span className="truncate">Word</span>
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className="flex-1 min-w-0 basis-[30%] px-2 text-xs sm:text-sm"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 ml-1 animate-spin shrink-0" />
            ) : (
              <Send className="h-4 w-4 ml-1 shrink-0" />
            )}
            <span className="truncate">إرسال</span>
          </Button>
        </div>
      )}
    </div>
  );
}