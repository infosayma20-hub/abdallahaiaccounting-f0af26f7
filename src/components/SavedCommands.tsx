import { useState, useEffect } from "react";
import { Bookmark, Plus, X, Star } from "lucide-react";

interface SavedCommand {
  id: string;
  text: string;
  target: "assistant" | "command";
}

interface SavedCommandsProps {
  onSelect: (text: string, target: "assistant" | "command") => void;
  currentInput?: string;
  currentTarget?: "assistant" | "command";
}

const STORAGE_KEY = "saved_user_commands";

const SavedCommands = ({ onSelect, currentInput, currentTarget }: SavedCommandsProps) => {
  const [commands, setCommands] = useState<SavedCommand[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState("");
  const [newTarget, setNewTarget] = useState<"assistant" | "command">("assistant");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setCommands(JSON.parse(stored)); } catch {}
    }
  }, []);

  const save = (cmds: SavedCommand[]) => {
    setCommands(cmds);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cmds));
  };

  const addCommand = (text: string, target: "assistant" | "command") => {
    if (!text.trim()) return;
    const cmd: SavedCommand = { id: Date.now().toString(), text: text.trim(), target };
    save([...commands, cmd]);
    setNewText("");
    setShowAdd(false);
  };

  const removeCommand = (id: string) => {
    save(commands.filter(c => c.id !== id));
  };

  const handleSaveFromInput = () => {
    if (currentInput?.trim()) {
      addCommand(currentInput, currentTarget || "assistant");
    } else {
      setShowAdd(true);
    }
  };

  if (commands.length === 0 && !showAdd) {
    return (
      <button
        onClick={handleSaveFromInput}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-dashed border-primary/30 text-[10px] text-primary font-medium hover:bg-primary/5 transition-all active:scale-95"
      >
        <Bookmark className="h-3 w-3" />
        حفظ أمر مخصص
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Star className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-bold text-foreground">أوامري المحفوظة</span>
        <button
          onClick={handleSaveFromInput}
          className="mr-auto flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-[10px] text-primary font-medium hover:bg-primary/20 transition-all active:scale-95"
        >
          <Plus className="h-3 w-3" />
          إضافة
        </button>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {commands.map(cmd => (
          <div key={cmd.id} className="group relative">
            <button
              onClick={() => onSelect(cmd.text, cmd.target)}
              className="px-2.5 py-1.5 rounded-full bg-primary/10 text-[10px] font-medium text-primary hover:bg-primary/20 transition-all active:scale-95 border border-primary/20"
            >
              {cmd.target === "command" ? "⚙️ " : "💰 "}
              {cmd.text.split(/(@\S+)/g).map((part, i) =>
                part.startsWith("@") ? <span key={i} className="font-bold">{part}</span> : part
              )}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); removeCommand(cmd.id); }}
              className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <input
            autoFocus
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addCommand(newText, newTarget); if (e.key === "Escape") setShowAdd(false); }}
            placeholder="اكتب الأمر المتكرر..."
            className="flex-1 h-8 px-3 rounded-xl bg-secondary text-xs text-foreground placeholder:text-muted-foreground border border-border/50 outline-none focus:border-primary/50"
            dir="rtl"
          />
          <select
            value={newTarget}
            onChange={e => setNewTarget(e.target.value as "assistant" | "command")}
            className="h-8 px-2 rounded-xl bg-secondary text-[10px] text-foreground border border-border/50 outline-none"
            dir="rtl"
          >
            <option value="assistant">مالي 💰</option>
            <option value="command">تعريفي ⚙️</option>
          </select>
          <button
            onClick={() => addCommand(newText, newTarget)}
            disabled={!newText.trim()}
            className="h-8 px-3 rounded-xl bg-primary text-primary-foreground text-[10px] font-bold disabled:opacity-40 hover:opacity-90 transition-all active:scale-95"
          >
            حفظ
          </button>
          <button onClick={() => setShowAdd(false)} className="h-8 w-8 rounded-xl bg-secondary flex items-center justify-center hover:bg-destructive/10 transition-colors">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      )}
    </div>
  );
};

export default SavedCommands;
