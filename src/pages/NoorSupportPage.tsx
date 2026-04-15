import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Paperclip, X, ArrowRight, Phone } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
    "مرحباً! أنا **نور**، مساعدك في برنامج أموالي 👋\n\nكيف أقدر أساعدك اليوم؟ يمكنني مساعدتك في:\n- 📊 المحاسبة والتقارير المالية\n- 🧾 الفواتير والمبيعات\n- ⚙️ إعداد البرنامج\n- 🔧 حل المشكلات التقنية\n- 📱 دليل استخدام أموالي",
};

const QUICK_SUGGESTIONS = [
  "كيف أسجل قيد محاسبي؟",
  "كيف أصدر فاتورة بيع؟",
  "كيف أضيف موظف جديد؟",
  "كيف أستخدم المحاسب الذكي؟",
  "كيف أطبع فاتورة؟",
];

export default function NoorSupportPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [messages, setMessages] = useState<Msg[]>([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showWhatsApp, setShowWhatsApp] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return; // 5MB max
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

    // Build API messages
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

      // Check if Noor suggested human support
      if (assistantContent.includes("واتساب") || assistantContent.includes("دعم البشري") || assistantContent.includes("تدخل مباشر") || assistantContent.includes("فريق الدعم")) {
        setShowWhatsApp(true);
      }
    } catch (e) {
      console.error(e);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: "assistant",
          content: "عذراً، حدث خطأ في الاتصال. يرجى المحاولة مجدداً أو التواصل معنا عبر واتساب.",
        },
      ]);
      setShowWhatsApp(true);
    } finally {
      setLoading(false);
    }
  }, [input, imageFile, imagePreview, loading, messages]);

  return (
    <div className="flex flex-col h-[100dvh] bg-background" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </button>
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-lg">
            🤖
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground">نور — دعم أموالي الذكي</h1>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              متاح الآن للمساعدة
            </p>
          </div>
        </div>
        <button
          onClick={openWhatsApp}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
        >
          <Phone className="h-3.5 w-3.5" />
          واتساب
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"} items-end gap-2`}
          >
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-sm shrink-0">
                🤖
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-bl-md"
                  : "bg-muted text-foreground rounded-br-md"
              }`}
            >
              {msg.image && (
                <img
                  src={`data:${msg.imageMime};base64,${msg.image}`}
                  alt="صورة المستخدم"
                  className="max-w-full rounded-lg mb-2 block"
                />
              )}
              <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-1 [&>ul]:my-1 [&>ol]:my-1 [&>p:last-child]:mb-0">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-sm shrink-0">
                👤
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-end items-end gap-2">
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-sm">
              🤖
            </div>
            <div className="bg-muted rounded-2xl rounded-br-md px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {showWhatsApp && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 text-center space-y-2">
            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">تحويل للدعم البشري 👨‍💻</p>
            <button
              onClick={openWhatsApp}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-bold transition-transform active:scale-95 bg-emerald-600 hover:bg-emerald-700"
            >
              💬 تواصل مع الدعم عبر واتساب
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Suggestions */}
      {messages.length <= 1 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5 shrink-0">
          {QUICK_SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => sendMessage(s)}
              className="px-3 py-1.5 rounded-full border border-border text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Image Preview */}
      {imagePreview && (
        <div className="px-4 pt-2 bg-card border-t border-border shrink-0">
          <div className="relative inline-block">
            <img src={imagePreview} alt="preview" className="h-16 rounded-lg border-2 border-primary" />
            <button
              onClick={removeImage}
              className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center text-xs"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border p-3 bg-card shrink-0">
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors shrink-0"
            title="إرسال صورة"
          >
            <Paperclip className="h-4 w-4 text-muted-foreground" />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="اكتب سؤالك أو وصف مشكلتك..."
            rows={1}
            className="flex-1 bg-muted rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/50 resize-none max-h-24 overflow-y-auto"
            dir="rtl"
            onInput={(e) => {
              const el = e.target as HTMLTextAreaElement;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 96) + "px";
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || (!input.trim() && !imageFile)}
            className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity shrink-0"
          >
            <Send className="h-4 w-4 rotate-180" />
          </button>
        </div>
      </div>
    </div>
  );
}
