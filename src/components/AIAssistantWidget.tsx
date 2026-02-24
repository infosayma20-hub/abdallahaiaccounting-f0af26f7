import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MessageCircle, X, Send, VolumeX, Volume2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type Message = { role: "user" | "assistant"; content: string };

const PAGE_SUGGESTIONS: Record<string, string> = {
  "/": "هل تريد تحليل وضعك المالي اليوم؟",
  "/transactions": "هل تريد مساعدة في البحث عن معاملة؟",
  "/invoices": "هل تريد إنشاء فاتورة بسرعة؟",
  "/contacts": "هل تريد إضافة عميل أو مورد جديد؟",
  "/accounts": "هل تريد مراجعة أرصدة حساباتك؟",
  "/inventory": "هل تريد تسجيل حركة مخزون؟",
  "/profit-loss": "هل تريد شرح الأرباح والخسائر؟",
  "/smart-report": "هل تريد تحليل بياناتك المالية؟",
};

const INACTIVITY_TIPS = [
  "لم يتم تسجيل أي عملية اليوم، هل تريد إضافة عملية؟",
  "💡 تلميح: يمكنك كتابة 'بعت @منتج 10 قطع ل@زبون سعر القطعة 50 نقداً' لتسجيل فاتورة بيع",
  "هل تحتاج مساعدة؟ أنا هنا لخدمتك!",
];

const AIAssistantWidget = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem("ai_assistant_muted") === "true");
  const [showGreeting, setShowGreeting] = useState(false);
  const [greetingText, setGreetingText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPulse, setShowPulse] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout>>();
  const greetingShown = useRef(false);

  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "المستخدم";

  // Pulse on first visit
  useEffect(() => {
    const seen = sessionStorage.getItem("ai_assistant_seen");
    if (!seen) setShowPulse(true);
  }, []);

  // Greeting logic
  useEffect(() => {
    if (isMuted || greetingShown.current || isOpen) return;
    const lastGreeting = localStorage.getItem("ai_assistant_last_greeting");
    const now = Date.now();
    const shouldShow = !lastGreeting || now - Number(lastGreeting) > 24 * 60 * 60 * 1000;
    if (!shouldShow) return;

    const timer = setTimeout(() => {
      const pageSuggestion = PAGE_SUGGESTIONS[location.pathname] || "كيف أقدر أساعدك؟";
      setGreetingText(`👋 أهلاً ${userName}!\n${pageSuggestion}`);
      setShowGreeting(true);
      greetingShown.current = true;
      localStorage.setItem("ai_assistant_last_greeting", String(now));

      setTimeout(() => setShowGreeting(false), 8000);
    }, 2000);

    return () => clearTimeout(timer);
  }, [isMuted, isOpen, location.pathname, userName]);

  // Inactivity tip (2 min)
  useEffect(() => {
    if (isMuted || isOpen) return;
    const resetTimer = () => {
      clearTimeout(inactivityTimer.current);
      inactivityTimer.current = setTimeout(() => {
        if (!isOpen && !isMuted && !showGreeting) {
          const tip = INACTIVITY_TIPS[Math.floor(Math.random() * INACTIVITY_TIPS.length)];
          setGreetingText(tip);
          setShowGreeting(true);
          setTimeout(() => setShowGreeting(false), 6000);
        }
      }, 120000);
    };
    resetTimer();
    window.addEventListener("click", resetTimer);
    window.addEventListener("keydown", resetTimer);
    return () => {
      clearTimeout(inactivityTimer.current);
      window.removeEventListener("click", resetTimer);
      window.removeEventListener("keydown", resetTimer);
    };
  }, [isMuted, isOpen, showGreeting]);

  // Auto scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const openChat = useCallback(() => {
    setIsOpen(true);
    setShowGreeting(false);
    setShowPulse(false);
    sessionStorage.setItem("ai_assistant_seen", "true");
    if (messages.length === 0) {
      setMessages([{ role: "assistant", content: `أهلاً ${userName}! 👋\nأنا مساعدك المالي الذكي. كيف أقدر أساعدك اليوم؟` }]);
    }
  }, [messages.length, userName]);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    localStorage.setItem("ai_assistant_muted", String(next));
    if (next) setShowGreeting(false);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");

    const userMsg: Message = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    let assistantContent = "";
    const allMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ messages: allMessages, currentPage: location.pathname, userName }),
        }
      );

      if (!resp.ok || !resp.body) throw new Error("فشل الاتصال");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const upsert = (chunk: string) => {
        assistantContent += chunk;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && prev.length > 1 && prev[prev.length - 2]?.role === "user") {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantContent } : m));
          }
          return [...prev, { role: "assistant", content: assistantContent }];
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsert(content);
          } catch { /* partial */ }
        }
      }
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: "assistant", content: "عذراً، حدث خطأ. حاول مرة أخرى." }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Parse action buttons from assistant messages
  const renderMessage = (content: string) => {
    const parts = content.split(/(\[action:[^\]]+\])/g);
    return parts.map((part, i) => {
      const match = part.match(/\[action:(.+?):(.+?)\]/);
      if (match) {
        return (
          <button
            key={i}
            onClick={() => { navigate(match[2]); setIsOpen(false); }}
            className="inline-block mt-1 mr-1 px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors"
          >
            {match[1]}
          </button>
        );
      }
      return <span key={i} style={{ whiteSpace: "pre-wrap" }}>{part}</span>;
    });
  };

  return (
    <>
      {/* Greeting Bubble */}
      {showGreeting && !isOpen && (
        <div
          className="fixed bottom-24 left-4 z-[60] max-w-[260px] animate-fade-in cursor-pointer"
          onClick={openChat}
        >
          <div className="bg-card border border-border rounded-2xl rounded-bl-md p-3 shadow-xl">
            <p className="text-xs text-foreground leading-relaxed whitespace-pre-line">{greetingText}</p>
          </div>
        </div>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-background max-w-md mx-auto animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <MessageCircle className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">المساعد المالي</h3>
                <p className="text-[10px] text-muted-foreground">متصل الآن</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={toggleMute} className="p-2 rounded-full hover:bg-muted transition-colors">
                {isMuted ? <VolumeX className="h-4 w-4 text-muted-foreground" /> : <Volume2 className="h-4 w-4 text-muted-foreground" />}
              </button>
              <button onClick={() => setIsOpen(false)} className="p-2 rounded-full hover:bg-muted transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-bl-md"
                      : "bg-muted text-foreground rounded-br-md"
                  }`}
                >
                  {renderMessage(msg.content)}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-end">
                <div className="bg-muted rounded-2xl rounded-br-md px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick suggestions based on page */}
          {messages.length <= 1 && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              {(() => {
                const suggestions = [
                  PAGE_SUGGESTIONS[location.pathname],
                  "كيف أسجل فاتورة بيع؟",
                  "ما هي أرصدة حساباتي؟",
                ].filter(Boolean);
                return suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(s!); }}
                    className="px-3 py-1.5 rounded-full border border-border text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    {s}
                  </button>
                ));
              })()}
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border p-3 bg-card">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder="اكتب سؤالك هنا..."
                className="flex-1 bg-muted rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/50"
                dir="rtl"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                <Send className="h-4 w-4 rotate-180" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={openChat}
          className={`fixed bottom-24 left-4 z-[60] w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 ${
            showPulse ? "animate-pulse" : ""
          }`}
          style={{ boxShadow: "0 4px 20px hsl(152 45% 42% / 0.35)" }}
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      )}
    </>
  );
};

export default AIAssistantWidget;
