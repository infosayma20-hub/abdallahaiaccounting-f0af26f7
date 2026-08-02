import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, MessagesSquare } from "lucide-react";
import { useHRChatThread } from "@/hooks/useHRChat";
import { toast } from "sonner";

interface Props {
  threadId: string | null;
  /** Which side the current user is on. */
  side: "employee" | "hr";
  title?: string;
  subtitle?: string;
  /** Extra classes for the outer wrapper (height handling). */
  className?: string;
  emptyHint?: string;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today.getTime() - 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "اليوم";
  if (same(d, y)) return "أمس";
  return d.toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatThreadView({ threadId, side, title, subtitle, className, emptyHint }: Props) {
  const { messages, loading, sending, hasMore, send, loadOlder } = useHRChatThread(threadId, side);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, threadId]);

  const grouped = useMemo(() => {
    const out: { day: string; items: typeof messages }[] = [];
    for (const m of messages) {
      const label = dayLabel(m.created_at);
      const last = out[out.length - 1];
      if (last && last.day === label) last.items.push(m);
      else out.push({ day: label, items: [m] });
    }
    return out;
  }, [messages]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setText("");
    const ok = await send(body);
    if (!ok) {
      setText(body);
      toast.error("تعذّر إرسال الرسالة");
    }
  };

  return (
    <div dir="rtl" className={["flex flex-col min-h-0 bg-background", className || "h-full"].join(" ")}>
      {(title || subtitle) && (
        <div className="shrink-0 border-b border-border px-3 py-2">
          <div className="font-semibold text-sm text-foreground">{title}</div>
          {subtitle && <div className="text-[11px] text-muted-foreground">{subtitle}</div>}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {loading && messages.length === 0 && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
            <MessagesSquare className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {emptyHint || "لا توجد رسائل بعد. اكتب رسالتك الأولى."}
            </p>
          </div>
        )}

        {hasMore && messages.length > 0 && (
          <div className="flex justify-center">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={loadOlder}>
              تحميل رسائل أقدم
            </Button>
          </div>
        )}

        {grouped.map((g) => (
          <div key={g.day} className="space-y-2">
            <div className="flex justify-center">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{g.day}</span>
            </div>
            {g.items.map((m) => {
              const mine = m.sender_type === side;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
                  <div
                    className={[
                      "max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words shadow-sm",
                      mine
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted text-foreground rounded-tl-sm",
                    ].join(" ")}
                  >
                    {!mine && m.sender_name && (
                      <div className="text-[10px] font-semibold opacity-70 mb-0.5">{m.sender_name}</div>
                    )}
                    <div>{m.body}</div>
                    <div className={`text-[9px] mt-1 ${mine ? "opacity-70" : "text-muted-foreground"}`}>
                      {timeLabel(m.created_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-border p-2 flex items-end gap-2 bg-card">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="اكتب رسالتك..."
          rows={1}
          maxLength={2000}
          disabled={!threadId}
          className="min-h-[40px] max-h-[120px] resize-none text-sm"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!threadId || sending || !text.trim()}
          className="h-10 w-10 shrink-0"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}