import { useState } from "react";
import { GripVertical, Eye, EyeOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldDef } from "@/lib/report-builder/data-sources";

interface Props {
  allFields: FieldDef[];
  selectedKeys: string[];
  onChange: (keys: string[]) => void;
}

/**
 * Column picker with drag-and-drop reordering (HTML5 native DnD)
 */
export default function ColumnPicker({ allFields, selectedKeys, onChange }: Props) {
  const [dragKey, setDragKey] = useState<string | null>(null);

  const toggle = (key: string) => {
    if (selectedKeys.includes(key)) {
      onChange(selectedKeys.filter(k => k !== key));
    } else {
      onChange([...selectedKeys, key]);
    }
  };

  const onDragStart = (key: string) => setDragKey(key);
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (targetKey: string) => {
    if (!dragKey || dragKey === targetKey) return;
    const ordered = [...selectedKeys];
    const fromIdx = ordered.indexOf(dragKey);
    const toIdx = ordered.indexOf(targetKey);
    if (fromIdx === -1 || toIdx === -1) return;
    ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, dragKey);
    onChange(ordered);
    setDragKey(null);
  };

  // Selected fields ordered + unselected appended
  const orderedSelected = selectedKeys
    .map(k => allFields.find(f => f.key === k))
    .filter(Boolean) as FieldDef[];
  const unselected = allFields.filter(f => !selectedKeys.includes(f.key));

  return (
    <div className="space-y-2" dir="rtl">
      <p className="text-xs font-medium text-muted-foreground">الأعمدة المختارة (اسحب لإعادة الترتيب)</p>
      <div className="space-y-1">
        {orderedSelected.map(field => (
          <div
            key={field.key}
            draggable
            onDragStart={() => onDragStart(field.key)}
            onDragOver={onDragOver}
            onDrop={() => onDrop(field.key)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-primary/5 border border-primary/10 cursor-move hover:bg-primary/10 transition-all"
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60" />
            <Checkbox checked onCheckedChange={() => toggle(field.key)} className="h-4 w-4" />
            <span className="text-xs flex-1 truncate">{field.label}</span>
            <Eye className="h-3 w-3 text-primary/60" />
          </div>
        ))}
      </div>

      {unselected.length > 0 && (
        <>
          <p className="text-xs font-medium text-muted-foreground pt-2">أعمدة متاحة</p>
          <div className="space-y-1">
            {unselected.map(field => (
              <div
                key={field.key}
                onClick={() => toggle(field.key)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/60 cursor-pointer transition-all"
              >
                <div className="w-3.5" />
                <Checkbox checked={false} onCheckedChange={() => toggle(field.key)} className="h-4 w-4" />
                <span className="text-xs flex-1 truncate text-muted-foreground">{field.label}</span>
                <EyeOff className="h-3 w-3 text-muted-foreground/40" />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
