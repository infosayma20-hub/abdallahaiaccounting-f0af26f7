import { useState, useEffect, useCallback } from "react";
import { X, Search, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { multiWordMatchAny } from "@/lib/utils";

interface Conversation {
  id: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string | undefined;
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
}

const ChatHistorySidebar = ({ open, onClose, userId, activeConversationId, onSelectConversation, onNewConversation }: Props) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteConversation = async (convId: string) => {
    if (!confirm("هل تريد حذف هذه المحادثة؟")) return;
    setDeletingId(convId);
    await supabase.from("ai_messages").delete().eq("conversation_id", convId);
    await supabase.from("ai_conversations").delete().eq("id", convId);
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (activeConversationId === convId) onNewConversation();
    setDeletingId(null);
  };

  const fetchConversations = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from("ai_conversations")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(50);
    setConversations((data as Conversation[]) || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (open) fetchConversations();
  }, [open, fetchConversations]);

  const filtered = search.trim()
    ? conversations.filter(c => multiWordMatchAny(search, c.title))
    : conversations;

  const groupByDate = (convs: Conversation[]) => {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const yesterday = new Date(now.getTime() - 86400000).toISOString().split("T")[0];
    const weekAgo = new Date(now.getTime() - 7 * 86400000);

    const groups: { label: string; items: Conversation[] }[] = [
      { label: "اليوم", items: [] },
      { label: "أمس", items: [] },
      { label: "هذا الأسبوع", items: [] },
      { label: "أقدم", items: [] },
    ];

    convs.forEach(c => {
      const d = c.updated_at.split("T")[0];
      if (d === today) groups[0].items.push(c);
      else if (d === yesterday) groups[1].items.push(c);
      else if (new Date(c.updated_at) >= weekAgo) groups[2].items.push(c);
      else groups[3].items.push(c);
    });

    return groups.filter(g => g.items.length > 0);
  };

  const groups = groupByDate(filtered);

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 bg-black/30 z-[60]" onClick={onClose} />
      )}

      {/* Sidebar */}
      <div
        className="fixed top-[52px] right-0 z-[61] bg-white flex flex-col"
        style={{
          width: "min(320px, 85vw)",
          height: "calc(100vh - 52px - 140px)",
          borderLeft: "1px solid #E2E8F0",
          borderRadius: "0 0 0 16px",
          boxShadow: open ? "-4px 0 20px rgba(0,0,0,0.1)" : "none",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.25s ease",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#F1F5F9]">
          <span className="text-[15px] font-bold" style={{ color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}>
            سجل المحادثات
          </span>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F8FAFC]">
            <X className="h-4 w-4" style={{ color: "#8B9BB4" }} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2.5">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#8B9BB4" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث في المحادثات..."
              className="w-full h-10 rounded-lg pr-9 pl-3 text-[13px] outline-none"
              style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", fontFamily: "Tajawal, sans-serif", color: "#0A2342" }}
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#0A2342", borderTopColor: "transparent" }} />
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-[13px]" style={{ color: "#8B9BB4" }}>لا توجد محادثات بعد</p>
            </div>
          ) : (
            groups.map(group => (
              <div key={group.label}>
                <div className="px-4 py-2">
                  <span className="text-[11px] font-bold uppercase" style={{ color: "#8B9BB4" }}>
                    {group.label}
                  </span>
                </div>
                {group.items.map(conv => (
                  <div
                    key={conv.id}
                    className="relative group flex items-center transition-colors hover:bg-[#F8FAFC]"
                    style={{
                      borderBottom: "1px solid #F8FAFC",
                      background: activeConversationId === conv.id ? "#EFF6FF" : "transparent",
                      borderRight: activeConversationId === conv.id ? "3px solid #0A2342" : "3px solid transparent",
                    }}
                  >
                    <button
                      onClick={() => onSelectConversation(conv.id)}
                      className="flex-1 text-right h-16 px-4 flex flex-col justify-center min-w-0"
                    >
                      <p
                        className="text-[13px] font-bold truncate w-full"
                        style={{ color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}
                      >
                        {conv.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px]" style={{ color: "#8B9BB4" }}>
                          {formatTime(conv.updated_at)}
                        </span>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{ background: "#F1F5F9", color: "#8B9BB4" }}
                        >
                          {conv.message_count} رسالة
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity w-9 h-9 flex items-center justify-center rounded-full hover:bg-red-50 ml-2 flex-shrink-0"
                      title="حذف المحادثة"
                    >
                      {deletingId === conv.id ? (
                        <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* New conversation button */}
        <div className="p-4" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
          <button
            onClick={onNewConversation}
            className="w-full h-12 rounded-xl flex items-center justify-center gap-2 text-[14px] font-bold active:scale-[0.97] transition-transform"
            style={{ background: "#0A2342", color: "white", fontFamily: "Tajawal, sans-serif" }}
          >
            <Plus className="h-4 w-4" />
            محادثة جديدة
          </button>
        </div>
      </div>
    </>
  );
};

export default ChatHistorySidebar;
