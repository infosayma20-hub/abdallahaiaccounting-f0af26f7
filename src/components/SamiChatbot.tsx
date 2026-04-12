import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, User } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  quickReplies?: string[];
  showLeadForm?: boolean;
  showCtaButton?: boolean;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sami-chat`;

function getQuickReplies(content: string, isFirst: boolean): string[] {
  if (isFirst) return ["شو البرنامج بالزبط؟", "عندي مطعم", "عندي محل", "الأسعار والباقات"];

  // Price/plan context
  if (/سعر|باقة|₪|شهر|Starter|Professional|Enterprise|غالي|كم|تكلف/i.test(content))
    return ["جرب مجاناً 14 يوم", "شو الفرق بين الباقات؟", "تواصلوا معي"];

  // Trial/start context
  if (/تجربة|ابدأ|سجل|مجان|14 يوم/i.test(content))
    return ["ابدأ الآن", "عندي أسئلة ثانية"];

  // POS/restaurant context
  if (/مطعم|كافيه|POS|نقطة بيع|طباعة|مطبخ/i.test(content))
    return ["شو يميز الـ POS؟", "بدعم طابعة حرارية؟", "الأسعار"];

  // Inventory/retail context
  if (/محل|مخزون|باركود|بضاعة|سوبرماركت/i.test(content))
    return ["كيف المخزون بشتغل؟", "بدعم باركود؟", "جرب مجاناً"];

  // Accounting context
  if (/محاسب|قيد|فاتورة|ميزان|كشف حساب|ذمم/i.test(content))
    return ["المحاسب الذكي AI", "تقارير مالية", "جرب مجاناً"];

  // HR context
  if (/موظف|رواتب|حضور|إجاز|بصمة/i.test(content))
    return ["كيف نظام الحضور؟", "الرواتب التلقائية", "الأسعار"];

  // Contact request
  if (/تواصل|اتصل|رقم|واتساب/i.test(content))
    return [];

  // Generic follow-up
  if (/شكر|ممتاز|حلو|تمام/i.test(content))
    return ["عندي سؤال ثاني", "ابدأ التجربة", "تواصلوا معي"];

  return ["عندي سؤال ثاني", "الأسعار والباقات", "تواصلوا معي"];
}

function shouldShowLeadForm(content: string): boolean {
  return /تواصل|اسم.*رقم|رقم.*جوال|بيانات|أربطك.*فريق|نتواصل/i.test(content);
}

function shouldShowCta(content: string): boolean {
  return /amwali\.app|ابدأ.*تجرب|تجربت.*مجان|14 يوم/i.test(content);
}

export default function SamiChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
  }, []);

  useEffect(() => {
    if (open && !initialized) {
      setInitialized(true);
      setTimeout(() => {
        setMessages([{
          role: "assistant",
          content: "هلا وغلا! أنا سامي من أموالي 👋\nكيف بقدر أساعدك اليوم؟",
          quickReplies: ["شو البرنامج بالزبط؟", "عندي مطعم", "عندي محل", "الأسعار والباقات"],
        }]);
      }, 400);
    }
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [open, initialized]);

  useEffect(scrollToBottom, [messages, scrollToBottom]);

  const streamResponse = async (allMessages: { role: string; content: string }[]) => {
    setIsLoading(true);
    let assistantContent = "";

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: allMessages }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) {
          setMessages(prev => [...prev, { role: "assistant", content: "الخط مشغول شوي — جرب بعد ثواني 😅" }]);
          return;
        }
        throw new Error(`HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nlIdx: number;
        while ((nlIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nlIdx);
          buffer = buffer.slice(nlIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant" && !last.quickReplies) {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
                }
                return [...prev, { role: "assistant", content: assistantContent }];
              });
            }
          } catch { /* partial json */ }
        }
      }

      const qr = getQuickReplies(assistantContent, false);
      const showLead = shouldShowLeadForm(assistantContent);
      const showCta = shouldShowCta(assistantContent);
      setMessages(prev =>
        prev.map((m, i) =>
          i === prev.length - 1 && m.role === "assistant"
            ? { ...m, quickReplies: qr.length > 0 ? qr : undefined, showLeadForm: showLead || undefined, showCtaButton: showCta || undefined }
            : m
        )
      );
    } catch (err) {
      console.error("Sami chat error:", err);
      setMessages(prev => [...prev, { role: "assistant", content: "عذراً صار خطأ تقني — جرب مرة ثانية 🙏" }]);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "38px";
    streamResponse(newMessages.map(m => ({ role: m.role, content: m.content })));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const chatWindowStyle: React.CSSProperties = isMobile
    ? { bottom: 80, left: 8, width: "calc(100vw - 16px)", height: "75vh" }
    : { bottom: 90, left: 24, width: 370, height: 520 };

  return (
    <>
      {/* Chat Window */}
      {open && (
        <div
          className="fixed z-[9998] flex flex-col overflow-hidden"
          style={{
            ...chatWindowStyle,
            background: "#FFFFFF", borderRadius: 16,
            boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
            border: "1px solid rgba(0,0,0,0.08)",
            fontFamily: "'Cairo', sans-serif", direction: "rtl",
          }}
        >
          {/* Header */}
          <div style={{ background: "#0D1B2E", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <User size={18} color="white" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "white", fontSize: 13, fontWeight: 500 }}>سامي — مستشار أموالي</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E" }} />
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>متاح الآن</span>
              </div>
            </div>
            <span style={{ color: "white", fontSize: 12, letterSpacing: 1, fontWeight: 600, opacity: 0.7 }}>AMWALI</span>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", background: "#F5F7FA", padding: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {messages.map((msg, i) => (
                <div key={i}>
                  {msg.role === "assistant" ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#0D1B2E", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                        <User size={14} color="white" />
                      </div>
                      <div style={{ maxWidth: "calc(100% - 44px)" }}>
                        <div style={{
                          background: "white", border: "0.5px solid rgba(0,0,0,0.08)",
                          borderRadius: "16px 16px 16px 4px", padding: "10px 13px",
                          fontSize: 13.5, lineHeight: 1.7, whiteSpace: "pre-wrap",
                        }}>
                          {msg.content}
                        </div>
                        {msg.showCtaButton && (
                          <button
                            onClick={() => window.open("https://amwali.app/auth", "_blank")}
                            style={{
                              marginTop: 8, background: "#0D1B2E", color: "white",
                              border: "none", borderRadius: 10, padding: "9px 18px",
                              fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                              fontFamily: "'Cairo', sans-serif", display: "flex", alignItems: "center", gap: 6,
                            }}
                          >
                            🚀 ابدأ مجاناً — 14 يوم تجربة
                          </button>
                        )}
                        {msg.showLeadForm && <LeadForm onSubmit={(data) => {
                          sendMessage(`اسمي ${data.name}، رقمي ${data.phone}، نوع عملي: ${data.business}`);
                          setMessages(prev => prev.map((m, idx) => idx === i ? { ...m, showLeadForm: false } : m));
                        }} />}
                        {msg.quickReplies && msg.quickReplies.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                            {msg.quickReplies.map((qr) => (
                              <button
                                key={qr}
                                onClick={() => {
                                  // Clear quick replies from this message so they disappear
                                  setMessages(prev => prev.map((m, idx) => idx === i ? { ...m, quickReplies: undefined } : m));
                                  sendMessage(qr);
                                }}
                                className="sami-qr-btn"
                                style={{
                                  background: "white", border: "1px solid #0D1B2E", color: "#0D1B2E",
                                  borderRadius: 20, fontSize: 12, padding: "5px 11px", cursor: "pointer",
                                  fontFamily: "'Cairo', sans-serif", transition: "all 0.15s",
                                }}
                              >
                                {qr}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <div style={{
                        background: "#0D1B2E", color: "white",
                        borderRadius: "16px 16px 4px 16px", padding: "10px 13px",
                        fontSize: 13.5, lineHeight: 1.7, maxWidth: "calc(100% - 44px)", whiteSpace: "pre-wrap",
                      }}>
                        {msg.content}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#0D1B2E", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <User size={14} color="white" />
                  </div>
                  <div style={{ background: "white", border: "0.5px solid rgba(0,0,0,0.08)", borderRadius: "16px 16px 16px 4px", padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 5 }}>
                      {[0, 1, 2].map(d => (
                        <div key={d} style={{
                          width: 7, height: 7, borderRadius: "50%", background: "#0D1B2E",
                          animation: "samiBounce 1.2s infinite", animationDelay: `${d * 0.15}s`, opacity: 0.4,
                        }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Input */}
          <div style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)", padding: "10px 12px", background: "white", display: "flex", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = "38px";
                e.target.style.height = Math.min(e.target.scrollHeight, 80) + "px";
              }}
              onKeyDown={handleKeyDown}
              placeholder="اكتب سؤالك هون..."
              style={{
                flex: 1, border: "0.5px solid rgba(0,0,0,0.1)", borderRadius: 20,
                padding: "9px 14px", fontSize: 13.5, direction: "rtl",
                fontFamily: "'Cairo', sans-serif", resize: "none", maxHeight: 80,
                minHeight: 38, background: "#F5F7FA", outline: "none",
              }}
              rows={1}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              style={{
                width: 38, height: 38, borderRadius: "50%", background: "#0D1B2E",
                border: "none", cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", flexShrink: 0,
                opacity: !input.trim() || isLoading ? 0.5 : 1,
                transition: "opacity 0.15s",
              }}
            >
              <Send size={16} color="white" style={{ transform: "scaleX(-1)" }} />
            </button>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? "إغلاق المحادثة" : "فتح المحادثة مع سامي"}
        style={{
          position: "fixed", bottom: 24, left: 24, zIndex: 9999,
          width: 54, height: 54, borderRadius: "50%", background: "#0D1B2E",
          border: "none", cursor: "pointer",
          boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "transform 0.2s",
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.08)")}
        onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
      >
        {open ? <X size={22} color="white" /> : <MessageCircle size={22} color="white" />}
      </button>

      {/* Pulse animation for unread hint */}
      {!open && !initialized && (
        <div style={{
          position: "fixed", bottom: 82, left: 20, zIndex: 9999,
          background: "#0D1B2E", color: "white", borderRadius: 12,
          padding: "6px 12px", fontSize: 11.5, fontFamily: "'Cairo', sans-serif",
          boxShadow: "0 2px 12px rgba(0,0,0,0.2)", direction: "rtl",
          animation: "samiPulse 3s ease-in-out infinite",
        }}>
          💬 محتاج مساعدة؟
        </div>
      )}

      <style>{`
        @keyframes samiBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes samiPulse {
          0%, 100% { opacity: 1; transform: translateY(0); }
          50% { opacity: 0.7; transform: translateY(-3px); }
        }
        .sami-qr-btn:hover {
          background: #0D1B2E !important;
          color: white !important;
        }
      `}</style>
    </>
  );
}

function LeadForm({ onSubmit }: { onSubmit: (data: { name: string; phone: string; business: string }) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [business, setBusiness] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div style={{
        marginTop: 8, background: "#ECFDF5", border: "1px solid #A7F3D0",
        borderRadius: 12, padding: "10px 12px", fontSize: 12.5, color: "#065F46",
        fontFamily: "'Cairo', sans-serif", direction: "rtl",
      }}>
        ✅ تم الإرسال — فريقنا رح يتواصل معك قريباً
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", border: "0.5px solid rgba(0,0,0,0.12)", borderRadius: 8,
    padding: "8px 10px", fontSize: 12.5, marginBottom: 6, direction: "rtl",
    fontFamily: "'Cairo', sans-serif", outline: "none", background: "#F9FAFB",
  };

  return (
    <div style={{
      marginTop: 8, background: "white", border: "0.5px solid rgba(0,0,0,0.1)",
      borderRadius: 12, padding: 12, fontFamily: "'Cairo', sans-serif", direction: "rtl",
    }}>
      <div style={{ fontSize: 11.5, color: "#6B7280", marginBottom: 8, fontWeight: 500 }}>
        📋 حتى نتواصل معك:
      </div>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="اسمك الكامل" required style={inputStyle} />
      <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="رقم الجوال / واتساب" type="tel" required style={inputStyle} />
      <input value={business} onChange={e => setBusiness(e.target.value)} placeholder="نوع عملك (مطعم، محل، شركة...)" style={inputStyle} />
      <button
        onClick={() => { if (name && phone) { setSubmitted(true); onSubmit({ name, phone, business }); } }}
        style={{
          width: "100%", background: "#0D1B2E", color: "white", border: "none",
          borderRadius: 8, padding: "9px 0", fontSize: 12.5, fontWeight: 600,
          cursor: "pointer", fontFamily: "'Cairo', sans-serif", marginTop: 2,
        }}
      >
        إرسال ←
      </button>
    </div>
  );
}
