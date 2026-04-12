import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAuthHeadersJson } from "@/lib/edge-helpers";
import { useToast } from "@/hooks/use-toast";
import MobileInputDock from "./MobileInputDock";
import type { FinixFinancialData } from "@/pages/SmartAccountantPage";
import type { User } from "@supabase/supabase-js";
import { Loader2, Check, X, Pencil } from "lucide-react";
import { AIMessageRenderer } from "@/components/AIMessageRenderer";
import MultiTransactionCards, { type ParsedTransaction } from "./MultiTransactionCards";
import { splitMultipleCommands, classifyCommand, getCommandTypeLabel, getCommandTypeIcon } from "@/lib/multiCommandParser";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "transaction" | "success" | "anomaly";
  data?: any;
  timestamp: Date;
  isVoice?: boolean;
};

interface Props {
  user: User | null;
  userName: string;
  data: FinixFinancialData;
  cfoMode: boolean;
  onCheque: (data: any) => void;
  onJournal: (data: any, accounts?: any[]) => void;
  onTransactionSuccess: () => void;
}

const fmt = (n: number) => `₪${Math.abs(n).toLocaleString()}`;
const uid = () => Math.random().toString(36).slice(2);

const STATUS_MESSAGES = ["📊 يقرأ بياناتك...", "🧮 يحسب...", "✍️ يصيغ الإجابة..."];

const QUICK_CHIPS_MOBILE = [
  "قبضت من @",
  "دفعت إيجار",
  "بعت لـ@",
  "اشتريت من @",
];

const MobileChatArea = ({ user, userName, data, cfoMode, onCheque, onJournal, onTransactionSuccess }: Props) => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);
  const [postingId, setPostingId] = useState<string | null>(null);
  const [postedIds, setPostedIds] = useState<Set<string>>(new Set());
  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  // Auto-scroll
  useEffect(() => {
    if (!showScrollDown) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, showScrollDown]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setShowScrollDown(!atBottom && messages.length > 3);
  }, [messages.length]);

  // Rotate status messages
  useEffect(() => {
    if (!sending) return;
    const id = setInterval(() => setStatusIdx(i => (i + 1) % STATUS_MESSAGES.length), 2000);
    return () => clearInterval(id);
  }, [sending]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollDown(false);
  };

  const handleSend = async (text: string, isVoice = false) => {
    if (!text.trim() || sending) return;

    const userMsg: Message = { id: uid(), role: "user", content: text.trim(), timestamp: new Date(), isVoice };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);

    try {
      // Split into multiple commands
      const commands = splitMultipleCommands(text.trim());
      
      if (commands.length > 1) {
        // ═══ MULTI-COMMAND PROCESSING ═══
        const results: { command: string; success: boolean; message: string }[] = [];

        for (const command of commands) {
          try {
            const parseRes = await supabase.functions.invoke("parse-voice-transaction", { body: { text: command.trim() } });
            const parseData = parseRes.data;

            if (parseData?.type === 'cheque') {
              onCheque({ chequeType: parseData.chequeType || 'وارد', partyName: parseData.partyName || '', partyType: parseData.partyType || 'عميل', originalText: command, amount: parseData.amount || 0 });
              results.push({ command, success: true, message: `🧾 شيك ${parseData.chequeType || 'وارد'} — ₪${parseData.amount || 0}` });
              continue;
            }

            if (parseData?.type && !['question', 'unknown'].includes(parseData.type)) {
              const body: any = { text: command.trim(), userId: user?.id, email: user?.email };
              const { data: txResult, error } = await supabase.functions.invoke("process-transaction", { body });
              if (error) throw error;
              const cmdType = classifyCommand(command);
              const invoiceInfo = txResult?.transaction?.invoice_number ? ` — ${txResult.transaction.invoice_number}` : '';
              results.push({ command, success: true, message: `✅ ${getCommandTypeIcon(cmdType)} ${getCommandTypeLabel(cmdType)}${invoiceInfo}\n${command.trim()}` });
              continue;
            }
            // Skip question-type commands in multi-command mode
          } catch (err: any) {
            results.push({ command, success: false, message: `❌ ${command.trim()}: ${err.message || 'خطأ'}` });
          }
        }

        if (results.length > 0) {
          if (navigator.vibrate) navigator.vibrate(100);
          onTransactionSuccess();
          const successCount = results.filter(r => r.success).length;
          let summaryMsg = `✅ تم تنفيذ ${successCount} عمليات بنجاح\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
          results.forEach((r, i) => { summaryMsg += `\n${i + 1}️⃣ ${r.message}\n`; });
          setMessages(prev => [...prev, { id: uid(), role: "assistant", type: "success", content: summaryMsg, timestamp: new Date() }]);
          setSending(false);
          return;
        }
      }

      // ═══ SINGLE COMMAND (original flow) ═══
      const parseRes = await supabase.functions.invoke("parse-voice-transaction", { body: { text: text.trim() } });
      const parseData = parseRes.data;

      if (parseData?.type === 'cheque') {
        onCheque({
          chequeType: parseData.chequeType || 'وارد',
          partyName: parseData.partyName || '',
          partyType: parseData.partyType || 'عميل',
          originalText: text,
          amount: parseData.amount || 0,
        });
        setSending(false);
        return;
      }

      if (parseData?.type && !['question', 'unknown'].includes(parseData.type)) {
        const body: any = { text: text.trim(), userId: user?.id, email: user?.email };
        const { data: txResult, error } = await supabase.functions.invoke("process-transaction", { body });
        if (error) throw error;
        
        if (navigator.vibrate) navigator.vibrate(100);
        onTransactionSuccess();
        const invoiceInfo = txResult?.transaction?.invoice_number 
          ? `\n📋 رقم الفاتورة: ${txResult.transaction.invoice_number}` 
          : '';
        setMessages(prev => [...prev, {
          id: uid(), role: "assistant", type: "success",
          content: `✅ تم تسجيل العملية بنجاح${invoiceInfo}\n${text.trim()}`,
          timestamp: new Date(),
        }]);
        setSending(false);
        return;
      }

      // AI chat for questions
      const allMessages = messages.map(m => ({ role: m.role, content: m.content }));
      allMessages.push({ role: 'user', content: text.trim() });

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: (await getAuthHeadersJson()).Authorization,
          },
          body: JSON.stringify({
            messages: allMessages,
            currentPage: "/smart-accountant",
            userName,
            financialContext: {
              cash: data.cash, bank: data.bank, sales: data.totalSales,
              expenses: data.totalExpenses, profit: data.netProfit,
              receivables: data.receivables, payables: data.payables,
            },
          }),
        }
      );

      if (!resp.ok || !resp.body) throw new Error("فشل الاتصال");

      let assistantContent = "";
      const assistantId = uid();

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
            if (content) {
              assistantContent += content;
              setMessages(prev => {
                const exists = prev.find(m => m.id === assistantId);
                if (exists) {
                  return prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m);
                }
                return [...prev, { id: assistantId, role: "assistant", content: assistantContent, timestamp: new Date() }];
              });
            }
          } catch { /* partial */ }
        }
      }
      if (navigator.vibrate) navigator.vibrate(40);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: uid(), role: "assistant",
        content: "عذراً، حدث خطأ. حاول مرة أخرى.",
        timestamp: new Date(),
      }]);
    } finally {
      setSending(false);
    }
  };

  const isWelcome = messages.length === 0;
  const timeGreeting = new Date().getHours() < 12 ? "صباح الخير" : "مساء الخير";

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="finix-chat-scroll"
      >
        {isWelcome ? (
          <div className="px-3.5 py-3 space-y-3">
            {/* Welcome Card */}
            <div className="bg-white rounded-[20px] p-5 shadow-sm" style={{ borderTop: "3px solid hsl(var(--finix-gold))" }}>
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0"
                  style={{ background: "hsl(var(--primary))" }}
                >
                  {userName.charAt(0)}
                </div>
                <div>
                  <h2 className="text-lg font-extrabold" style={{ color: "hsl(var(--foreground))", fontFamily: "Tajawal, sans-serif" }}>
                    مرحباً {userName}! 👋
                  </h2>
                  <p className="text-xs text-muted-foreground">{timeGreeting}</p>
                </div>
              </div>
              <p className="text-[13px] text-muted-foreground leading-[1.8]">
                أنا محاسبك الذكي — اضغط على 🎤 وسجل عمليتك بصوتك مباشرة
              </p>
              {/* Today summary pills */}
              <div className="flex gap-2 mt-4 overflow-x-auto no-scrollbar">
                {[
                  { icon: "📈", label: "مبيعات", value: fmt(data.salesToday) },
                  { icon: "💰", label: "صندوق", value: fmt(data.cash) },
                  { icon: "📋", label: "قيود", value: `${data.transactionCount}` },
                ].map(p => (
                  <div
                    key={p.label}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full flex-shrink-0 text-xs"
                    style={{ background: "hsl(var(--info) / 0.08)", border: "1px solid hsl(var(--info) / 0.2)" }}
                  >
                    <span>{p.icon}</span>
                    <span className="text-muted-foreground">{p.label}</span>
                    <span className="font-semibold" style={{ fontFamily: "JetBrains Mono, monospace", color: "hsl(var(--info))" }}>{p.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CFO Briefing */}
            {cfoMode && (
              <div className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(213 78% 10%))" }}>
                <p className="text-[13px] font-bold mb-3" style={{ color: "hsl(var(--finix-gold))" }}>📋 ملخص اليوم — المدير المالي</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { label: "الإيرادات", value: data.totalSales, color: "hsl(var(--success))" },
                    { label: "المصروفات", value: data.totalExpenses, color: "hsl(var(--destructive))" },
                    { label: "صافي الربح", value: data.netProfit, color: data.netProfit >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))" },
                    { label: "التدفق", value: data.cash + data.bank, color: "hsl(var(--accent))" },
                  ].map(m => (
                    <div key={m.label} className="rounded-xl p-2.5" style={{ background: "rgba(255,255,255,0.05)" }}>
                      <p className="text-[10px] text-white/50">{m.label}</p>
                      <p className="text-base font-bold" style={{ color: m.color, fontFamily: "JetBrains Mono, monospace" }}>{fmt(m.value)}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-xl p-2.5" style={{ background: "rgba(74,158,232,0.15)", border: "1px solid rgba(74,158,232,0.3)" }}>
                  <p className="text-xs" style={{ color: "hsl(var(--finix-gold))" }}>
                    💡 {data.receivables > 0 ? `ذمم مستحقة ${fmt(data.receivables)} — تابع التحصيل` : "أداء مالي ممتاز!"}
                  </p>
                </div>
              </div>
            )}

            {/* Anomaly Alerts */}
            {(data.receivables > data.totalSales * 0.5 || data.cash + data.bank < 0) && (
              <div
                className="bg-white rounded-2xl p-3.5"
                style={{ borderRight: `4px solid hsl(var(--destructive))` }}
              >
                <p className="text-[13px] font-bold" style={{ color: "hsl(var(--foreground))" }}>
                  {data.cash + data.bank < 0 ? "🔴 سيولة سالبة" : "⚠️ ذمم مرتفعة"}
                </p>
                <p className="text-xs text-muted-foreground leading-[1.7] mt-1">
                  {data.cash + data.bank < 0
                    ? "رصيدك النقدي والبنكي سالب — راجع مصروفاتك"
                    : "الذمم المدينة تتجاوز 50% من المبيعات"}
                </p>
              </div>
            )}

            {/* Quick action groups */}
            <div className="space-y-3">
              {[
                { label: "⚡ أوامر مالية", chips: ["قبضت من @محمد 5000 شيكل نقداً", "دفعت إيجار 2500 من البنك", "بعت طحين 50 كيلو نقداً", "سجل فاتورة لـ@سليم 12000 على الحساب"] },
                { label: "📊 تقارير وتحليل", chips: ["شو وضعي المالي اليوم؟", "اعرض أرباح وخسائر الشهر", "اعرض الذمم المتأخرة", "كشف حساب @محمد"] },
                { label: "🔮 تنبؤات ذكية", chips: ["متى ستنتهي سيولتي؟", "ما أكثر منتج مربح؟", "قارن مبيعاتي بالشهر الماضي", "هل أستطيع توظيف موظف جديد؟"] },
              ].map(group => (
                <div key={group.label}>
                  <p className="text-[11px] font-bold text-muted-foreground mb-2 px-1">{group.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.chips.map(chip => (
                      <button
                        key={chip}
                        onClick={() => handleSend(chip)}
                        className="px-3.5 py-2.5 rounded-2xl text-[13px] bg-white border border-border active:scale-95 transition-transform"
                        style={{ color: "hsl(var(--foreground))" }}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Prediction strip */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
              {[
                {
                  icon: "🔴",
                  text: data.cash + data.bank > 0 ? `سيولتك ${fmt(data.cash + data.bank)} — آمنة` : "⚠️ سيولتك سالبة",
                  confidence: 87,
                  timeline: "خلال 18 يوم",
                },
                {
                  icon: "💰",
                  text: `إيرادات متوقعة: ${fmt(data.totalSales * 0.9)}-${fmt(data.totalSales * 1.1)}`,
                  confidence: 74,
                  timeline: "الشهر القادم",
                },
              ].map((p, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 w-[180px] rounded-2xl p-3"
                  style={{ background: "hsl(var(--info) / 0.06)", border: "1px solid hsl(var(--info) / 0.15)" }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span>{p.icon}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "hsl(var(--info) / 0.12)", color: "hsl(var(--info))" }}>
                      دقة {p.confidence}%
                    </span>
                  </div>
                  <p className="text-xs leading-[1.6]" style={{ color: "hsl(var(--foreground))" }}>{p.text}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{p.timeline}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-3.5 py-3 space-y-3">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ml-2" style={{ background: "hsl(var(--primary))" }}>
                    {userName.charAt(0)}
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-3 text-[14px] leading-[1.7] ${
                    msg.role === "user" ? "rounded-bl-sm" : "rounded-br-sm"
                  }`}
                  style={msg.role === "user" ? {
                    background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--finix-navy-dark)))",
                    color: "white",
                    fontFamily: "Tajawal, sans-serif",
                  } : msg.type === "success" ? {
                    background: "hsl(var(--success) / 0.1)",
                    border: "1px solid hsl(var(--success))",
                    color: "hsl(var(--foreground))",
                    fontFamily: "Tajawal, sans-serif",
                  } : {
                    background: "white",
                    border: "1px solid hsl(var(--border))",
                    color: "hsl(var(--foreground))",
                    boxShadow: "0 2px 8px rgba(10,35,66,0.06)",
                    fontFamily: "Tajawal, sans-serif",
                  }}
                >
                  {msg.content.startsWith('__MULTI_TX__') ? (
                    <MultiTransactionCards
                      transactions={JSON.parse(msg.content.replace('__MULTI_TX__', ''))}
                      onConfirm={async (tx) => {
                        const body: any = { text: tx.description || '', userId: user?.id, email: user?.email };
                        const { data: txResult, error } = await supabase.functions.invoke("process-transaction", { body });
                        if (error) return { success: false, message: `❌ ${error.message}` };
                        onTransactionSuccess();
                        return { success: true, message: `✅ تم التسجيل` };
                      }}
                      onConfirmAll={async (txs) => {
                        for (const tx of txs) {
                          const body: any = { text: tx.description || '', userId: user?.id, email: user?.email };
                          await supabase.functions.invoke("process-transaction", { body });
                        }
                        onTransactionSuccess();
                      }}
                      onSkip={() => {}}
                      onDone={() => {}}
                    />
                  ) : (
                    <AIMessageRenderer content={msg.content} />
                  )}
                  <p className="text-[10px] mt-1.5" style={{ color: msg.role === "user" ? "rgba(255,255,255,0.4)" : "hsl(var(--muted-foreground))" }}>
                    {msg.timestamp.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mr-2 self-end" style={{ background: "linear-gradient(135deg, hsl(var(--finix-gold)), hsl(var(--finix-gold-light)))" }}>
                    ✦
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {sending && (
              <div className="flex justify-end">
                <div className="bg-white rounded-2xl rounded-br-sm px-4 py-3 border border-border shadow-sm">
                  <div className="flex gap-1.5 mb-1.5">
                    {[0, 150, 300].map(delay => (
                      <span
                        key={delay}
                        className="w-2 h-2 rounded-full animate-bounce"
                        style={{ background: "hsl(var(--accent))", animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{STATUS_MESSAGES[statusIdx]}</p>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}

        {/* Scroll to bottom button */}
        {showScrollDown && (
          <button
            onClick={scrollToBottom}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-foreground text-background text-xs font-bold shadow-lg active:scale-95 transition-transform"
          >
            ↓ جديد
          </button>
        )}
      </div>

      {/* Input dock at bottom */}
      <MobileInputDock
        onSend={handleSend}
        sending={sending}
        quickChips={QUICK_CHIPS_MOBILE}
        userId={user?.id}
      />
    </>
  );
};

export default MobileChatArea;
