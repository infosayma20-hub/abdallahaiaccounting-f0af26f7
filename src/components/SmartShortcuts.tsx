import { useState, useEffect, useMemo } from "react";
import { Zap, Clock, Star, StarOff, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

interface Shortcut {
  id: string;
  text: string;
  target: "assistant" | "command";
  frequency: number;
  isPinned: boolean;
  lastUsed: string;
}

interface SmartShortcutsProps {
  onSendToAssistant: (text: string) => void;
  onSendToCommand: (text: string) => void;
}

const STORAGE_KEY = "smart-shortcuts";

const SmartShortcuts = ({ onSendToAssistant, onSendToCommand }: SmartShortcutsProps) => {
  const { user } = useAuth();
  const [shortcuts, setShortcuts] = useState<Shortcut[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState("");
  const [newTarget, setNewTarget] = useState<"assistant" | "command">("assistant");
  const [transactions, setTransactions] = useState<any[]>([]);

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
  }, [shortcuts]);

  // Fetch recent transactions to suggest shortcuts
  useEffect(() => {
    if (!user) return;
    supabase
      .from("transactions")
      .select("description, transaction_type")
      .eq("user_id", user.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setTransactions(data || []));
  }, [user]);

  // Auto-suggest shortcuts from frequent transaction patterns
  const suggestions = useMemo(() => {
    if (!transactions.length) return [];

    const descCount: Record<string, number> = {};
    transactions.forEach((tx) => {
      const desc = (tx.description || "").trim();
      const short = desc.split(" ").slice(0, 4).join(" ");
      if (short.length > 5) {
        descCount[short] = (descCount[short] || 0) + 1;
      }
    });

    const existingTexts = new Set(shortcuts.map((s) => s.text));

    return Object.entries(descCount)
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .filter(([text]) => !existingTexts.has(text))
      .map(([text, count]) => ({ text, count }));
  }, [transactions, shortcuts]);

  const handleUse = (shortcut: Shortcut) => {
    // Update frequency
    setShortcuts((prev) =>
      prev.map((s) =>
        s.id === shortcut.id
          ? { ...s, frequency: s.frequency + 1, lastUsed: new Date().toISOString() }
          : s
      )
    );

    if (shortcut.target === "assistant") {
      onSendToAssistant(shortcut.text);
    } else {
      onSendToCommand(shortcut.text);
    }
  };

  const handleAdd = () => {
    if (!newText.trim()) return;
    const newShortcut: Shortcut = {
      id: Date.now().toString(),
      text: newText.trim(),
      target: newTarget,
      frequency: 0,
      isPinned: false,
      lastUsed: new Date().toISOString(),
    };
    setShortcuts((prev) => [newShortcut, ...prev]);
    setNewText("");
    setShowAdd(false);
  };

  const handleAddSuggestion = (text: string) => {
    const newShortcut: Shortcut = {
      id: Date.now().toString(),
      text,
      target: "assistant",
      frequency: 0,
      isPinned: false,
      lastUsed: new Date().toISOString(),
    };
    setShortcuts((prev) => [newShortcut, ...prev]);
  };

  const togglePin = (id: string) => {
    setShortcuts((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isPinned: !s.isPinned } : s))
    );
  };

  const removeShortcut = (id: string) => {
    setShortcuts((prev) => prev.filter((s) => s.id !== id));
  };

  // Sort: pinned first, then by frequency
  const sorted = useMemo(
    () => [...shortcuts].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return b.frequency - a.frequency;
    }),
    [shortcuts]
  );

  return (
    <div className="bg-card rounded-2xl p-6 space-y-4 shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <Zap className="h-4 w-4 text-orange-500" />
          </div>
          <div>
            <span className="text-sm font-bold text-foreground">اختصارات ذكية</span>
            <Badge className="mr-2 bg-orange-500/10 text-orange-500 border-0 text-[9px] px-1.5">⚡ سريع</Badge>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Add new shortcut */}
      {showAdd && (
        <div className="bg-secondary/40 rounded-xl p-3 space-y-2 animate-fade-in">
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="اكتب نص الاختصار..."
            className="w-full bg-card rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 border-0 outline-none"
          />
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              {(["assistant", "command"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setNewTarget(t)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] transition-all ${
                    newTarget === t ? "bg-primary/15 text-primary" : "bg-secondary/60 text-muted-foreground"
                  }`}
                >
                  {t === "assistant" ? "🤖 المساعد" : "⚙️ الأوامر"}
                </button>
              ))}
            </div>
            <button
              onClick={handleAdd}
              disabled={!newText.trim()}
              className="mr-auto px-3 py-1 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold disabled:opacity-40"
            >
              إضافة
            </button>
          </div>
        </div>
      )}

      {/* Shortcuts list */}
      {sorted.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {sorted.slice(0, 8).map((s) => (
            <div key={s.id} className="group relative">
              <button
                onClick={() => handleUse(s)}
                className={`px-3 py-2 rounded-xl text-[11px] transition-all flex items-center gap-1.5 ${
                  s.isPinned
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "bg-secondary/50 text-foreground hover:bg-secondary/80"
                }`}
              >
                <span className="text-xs">{s.target === "assistant" ? "🤖" : "⚙️"}</span>
                <span className="max-w-[140px] truncate">{s.text}</span>
                {s.frequency > 0 && (
                  <span className="text-[9px] text-muted-foreground/60">{s.frequency}×</span>
                )}
              </button>

              {/* Hover actions */}
              <div className="absolute -top-1 -left-1 hidden group-hover:flex gap-0.5 animate-fade-in">
                <button
                  onClick={() => togglePin(s.id)}
                  className="w-5 h-5 rounded-full bg-card shadow-sm flex items-center justify-center hover:bg-secondary"
                >
                  {s.isPinned ? (
                    <StarOff className="h-2.5 w-2.5 text-amber-500" />
                  ) : (
                    <Star className="h-2.5 w-2.5 text-muted-foreground" />
                  )}
                </button>
                <button
                  onClick={() => removeShortcut(s.id)}
                  className="w-5 h-5 rounded-full bg-card shadow-sm flex items-center justify-center hover:bg-red-500/10"
                >
                  <Trash2 className="h-2.5 w-2.5 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground text-center py-2">
          أضف اختصاراتك الأولى أو انتظر الاقتراحات الذكية 👇
        </p>
      )}

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
            <Clock className="h-3 w-3" /> اقتراحات بناءً على نشاطك:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s.text}
                onClick={() => handleAddSuggestion(s.text)}
                className="px-2.5 py-1.5 rounded-lg bg-orange-500/5 border border-orange-500/15 text-[10px] text-muted-foreground hover:bg-orange-500/10 hover:text-foreground transition-all flex items-center gap-1"
              >
                <Plus className="h-2.5 w-2.5" />
                {s.text}
                <span className="text-[8px] text-muted-foreground/50">({s.count}×)</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartShortcuts;
