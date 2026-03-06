import { SlidersHorizontal, Settings } from "lucide-react";

interface QuickModifier {
  id: string;
  label: string;
  optionId?: string;
  groupId?: string;
}

interface Props {
  quickModifiers: QuickModifier[];
  activeModId: string | null;
  onQuickModifier: (mod: QuickModifier) => void;
  onManage: () => void;
  isAdmin: boolean;
}

export default function QuickModifierBar({ quickModifiers, activeModId, onQuickModifier, onManage, isAdmin }: Props) {
  if (quickModifiers.length === 0 && !isAdmin) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/5 border-b border-amber-500/20 overflow-x-auto scrollbar-thin">
      <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 mr-1 flex-shrink-0">
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span className="text-[11px] font-medium">إضافات</span>
      </div>
      <div className="w-px h-5 bg-amber-500/20 flex-shrink-0" />

      {quickModifiers.map(mod => (
        <button
          key={mod.id}
          onClick={() => onQuickModifier(mod)}
          className={`px-3 py-1 rounded-full text-[11px] font-medium border flex-shrink-0 transition-all ${
            activeModId === mod.id
              ? "bg-amber-500 text-white border-amber-500 scale-105 shadow-sm"
              : "bg-card border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
          }`}
        >
          {mod.label}
        </button>
      ))}

      {isAdmin && (
        <button
          onClick={onManage}
          className="mr-auto flex-shrink-0 text-[11px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
        >
          <Settings className="w-3 h-3" />
          إدارة
        </button>
      )}
    </div>
  );
}
