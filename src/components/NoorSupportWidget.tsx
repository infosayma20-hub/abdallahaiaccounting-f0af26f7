import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Paperclip, X, Phone, Minimize2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

const WHATSAPP_NUMBER = "00972599311885";

type Msg = {
  id: number;
  role: "user" | "assistant";
  content: string;
  image?: string;
  imageMime?: string;
};

const WELCOME_MSG: Msg = {
  id: 0,
  role: "assistant",
  content:
    "مرحباً! أنا **نور**، مساعدك في برنامج أموالي 👋\n\nكيف أقدر أساعدك اليوم؟",
};

const QUICK_SUGGESTIONS = [
  "كيف أسجل قيد؟",
  "كيف أصدر فاتورة؟",
  "كيف أضيف موظف؟",
  "دليل الاستخدام",
];

const NoorSupportWidget = () => {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  const [messages, setMessages] = useState<Msg[]>([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showWhatsApp, setShowWhatsApp] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.size > 5 * 1024 * 1024) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openWhatsApp = () => {
    window.open(`https://wa.me/${WHATSAPP_NUMBER}`, "_blank");
  };

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text && !imageFile) return;
    if (loading) return;

    let imageBase64: string | null = null;
    let imageMime: string | null = null;

    if (imageFile && imagePreview) {
      imageBase64 = imagePreview.split(",")[1];
      imageMime = imageFile.type;
    }

    const userMsg: Msg = {
      id: Date.now(),
      role: "user",
      content: text || "فحص هذه الصورة",
      image: imageBase64 || undefined,
      imageMime: imageMime || undefined,
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    removeImage();
    setLoading(true);
    setShowWhatsApp(false);

    let assistantContent = "";

    const apiMessages = newMessages
      .filter((m) => m.id !== 0)
      .map((m) => {
        if (m.image) {
          return { role: m.role, content: m.content, image: m.image, imageMime: m.imageMime };
        }
        return { role: m.role, content: m.content };
      });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/noor-support-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ messages: apiMessages }),
        }
      );

      if (!resp.ok || !resp.body) throw new Error("فشل الاتصال");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const upsert = (chunk: string) => {
        assistantContent += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && prev.length > 1 && prev[prev.length - 2]?.role === "user") {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantContent } : m));
          }
          return [...prev, { id: Date.now(), role: "assistant", content: assistantContent }];
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

      if (assistantContent.includes("واتساب") || assistantContent.includes("دعم البشري") || assistantContent.includes("فريق الدعم")) {
        setShowWhatsApp(true);
      }
    } catch (e) {
      console.error(e);
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), role: "assistant", content: "عذراً، حدث خطأ. يرجى المحاولة مجدداً أو التواصل عبر واتساب." },
      ]);
      setShowWhatsApp(true);
    } finally {
      setLoading(false);
    }
  }, [input, imageFile, imagePreview, loading, messages]);

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 left-4 z-[60] w-12 h-12 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 overflow-hidden border-2 border-primary/30"
          style={{ boxShadow: "0 4px 20px hsl(var(--primary) / 0.35)" }}
          title="نور — الدعم الفني"
        >
          <img
            src="/logos/amwali-mark-white-bg.png"
            alt="نور — دعم أموالي"
            className="w-full h-full object-cover"
          />
        </button>
      )}

      {/* Chat popup */}
      {open && (
        <div
          className="fixed bottom-4 left-4 z-[70] w-[360px] max-w-[calc(100vw-2rem)] h-[500px] max-h-[calc(100dvh-2rem)] rounded-2xl shadow-2xl border border-border bg-card flex flex-col overflow-hidden"
          dir="rtl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-primary/30">
                <img src="/logos/amwali-mark-white-bg.png" alt="نور" className="w-full h-full object-cover" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-foreground">نور — دعم أموالي</h2>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  متاح الآن
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={openWhatsApp}
                className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-500/10 transition-colors"
                title="واتساب"
              >
                <Phone className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                title="إغلاق"
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"} items-end gap-1.5`}
              >
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 border border-primary/30">
                    <img src="/logos/amwali-mark-white-bg.png" alt="نور" className="w-full h-full object-cover" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-xl px-3 py-2 text-[11px] leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-bl-sm"
                      : "bg-muted text-foreground rounded-br-sm"
                  }`}
                >
                  {msg.image && (
                    <img
                      src={`data:${msg.imageMime};base64,${msg.image}`}
                      alt="صورة"
                      className="max-w-full rounded-lg mb-1.5 block"
                    />
                  )}
                  <div className="prose prose-xs dark:prose-invert max-w-none [&>p]:mb-0.5 [&>ul]:my-0.5 [&>p:last-child]:mb-0">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-end items-end gap-1.5">
                <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 border border-primary/30">
                  <img src="/logos/amwali-mark-white-bg.png" alt="نور" className="w-full h-full object-cover" />
                </div>
                <div className="bg-muted rounded-xl rounded-br-sm px-3 py-2.5">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            {showWhatsApp && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-center space-y-1.5">
                <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">تحويل للدعم البشري 👨‍💻</p>
                <button
                  onClick={openWhatsApp}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-white text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all"
                >
                  💬 واتساب
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestions */}
          {messages.length <= 1 && (
            <div className="px-3 pb-1.5 flex flex-wrap gap-1 shrink-0">
              {QUICK_SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  className="px-2.5 py-1 rounded-full border border-border text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Image Preview */}
          {imagePreview && (
            <div className="px-3 pt-1.5 bg-card border-t border-border shrink-0">
              <div className="relative inline-block">
                <img src={imagePreview} alt="preview" className="h-12 rounded-lg border-2 border-primary" />
                <button onClick={removeImage} className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-destructive text-white flex items-center justify-center">
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border p-2.5 bg-card shrink-0">
            <div className="flex items-end gap-1.5">
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors shrink-0"
                title="إرسال صورة"
              >
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="اكتب سؤالك..."
                rows={1}
                className="flex-1 bg-muted rounded-lg px-2.5 py-2 text-[11px] text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/50 resize-none max-h-20 overflow-y-auto"
                dir="rtl"
                onInput={(e) => {
                  const el = e.target as HTMLTextAreaElement;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 80) + "px";
                }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={loading || (!input.trim() && !imageFile)}
                className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default NoorSupportWidget;
