import { useState, useEffect, useRef, useCallback } from "react";
import { getAuthHeadersJson, getAuthHeaders } from "@/lib/edge-helpers";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import MentionInput, { MentionItem } from "@/components/MentionInput";
import { Send, Mic, Loader2, AtSign, Paperclip, MicOff } from "lucide-react";
import type { FinixFinancialData } from "@/pages/SmartAccountantPage";
import type { User } from "@supabase/supabase-js";
import { AIMessageRenderer } from "@/components/AIMessageRenderer";
import { splitMultipleCommands, classifyCommand, getCommandTypeLabel, getCommandTypeIcon } from "@/lib/multiCommandParser";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "transaction" | "success" | "report" | "anomaly";
  data?: any;
  timestamp: Date;
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

const QUICK_CHIPS = {
  financial: {
    label: "⚡ أوامر مالية",
    chips: [
      "قبضت من @محمد 5000 شيكل نقداً",
      "دفعت إيجار 2500 من البنك",
      "بعت طحين 50 كيلو نقداً",
      "سجل فاتورة لـ@سليم 12000 على الحساب",
    ],
  },
  reports: {
    label: "📊 تقارير وتحليل",
    chips: [
      "شو وضعي المالي اليوم؟",
      "اعرض أرباح وخسائر الشهر",
      "اعرض الذمم المتأخرة",
      "كشف حساب @محمد",
    ],
  },
  predictions: {
    label: "🔮 تنبؤات ذكية",
    chips: [
      "متى ستنتهي سيولتي؟",
      "ما أكثر منتج مربح؟",
      "قارن مبيعاتي بالشهر الماضي",
      "هل أستطيع توظيف موظف جديد؟",
    ],
  },
};

const STATUS_MESSAGES = ["📊 يقرأ بياناتك...", "🧮 يحسب...", "✍️ يصيغ الإجابة..."];

const ZidniChatPanel = ({ user, userName, data, cfoMode, onCheque, onJournal, onTransactionSuccess }: Props) => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<MentionItem[]>([]);
  const [sending, setSending] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Rotate status messages while sending
  useEffect(() => {
    if (!sending) return;
    const id = setInterval(() => setStatusIdx(i => (i + 1) % STATUS_MESSAGES.length), 2000);
    return () => clearInterval(id);
  }, [sending]);

  // Voice input
  const toggleVoice = useCallback(() => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast({ title: "المتصفح لا يدعم التسجيل الصوتي" }); return; }
    const recognition = new SR();
    recognition.lang = "ar-SA";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      setInputValue(prev => prev + " " + text);
      setIsRecording(false);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [isRecording, toast]);

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || sending) return;

    const userMsg: Message = { id: uid(), role: "user", content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInputValue("");
    setSelectedMentions([]);
    setSending(true);

    const contactMention = selectedMentions.find(m => m.category === "contact");

    try {
      // First try parse-voice-transaction for financial ops
      const parseRes = await supabase.functions.invoke("parse-voice-transaction", { body: { text } });
      const parseData = parseRes.data;

      if (parseData?.type === 'cheque') {
        onCheque({
          chequeType: parseData.chequeType || 'وارد',
          partyName: contactMention?.name || parseData.partyName || '',
          partyType: parseData.partyType || 'عميل',
          originalText: text,
          amount: parseData.amount || 0,
          currency: parseData.currency || 'شيكل',
          chequeDate: parseData.chequeDate || '',
          chequeNumber: parseData.chequeNumber || '',
          bankName: parseData.bankName || '',
        });
        setSending(false);
        return;
      }

      if (parseData?.type === 'invoice' && parseData.status === 'complete') {
        const body: any = { text, userId: user?.id, email: user?.email };
        if (contactMention) { body.mentionedContactName = contactMention.name; body.mentionedContactId = contactMention.id; }
        const { data: txResult, error } = await supabase.functions.invoke("process-transaction", { body });
        if (error) throw error;
        onTransactionSuccess();
        const invoiceInfo = txResult?.transaction?.invoice_number 
          ? `\n📋 رقم الفاتورة: ${txResult.transaction.invoice_number}` 
          : '';
        setMessages(prev => [...prev, {
          id: uid(), role: "assistant", type: "success",
          content: `✅ تم تسجيل العملية بنجاح${invoiceInfo}\n${text}`,
          timestamp: new Date(),
        }]);
        setSending(false);
        return;
      }

      // If parseable as a transaction
      if (parseData?.type && !['question', 'unknown'].includes(parseData.type)) {
        const body: any = { text, userId: user?.id, email: user?.email };
        if (contactMention) { body.mentionedContactName = contactMention.name; body.mentionedContactId = contactMention.id; }
        const { data: txResult, error } = await supabase.functions.invoke("process-transaction", { body });
        if (error) throw error;
        onTransactionSuccess();
        const invoiceInfo = txResult?.transaction?.invoice_number 
          ? `\n📋 رقم الفاتورة: ${txResult.transaction.invoice_number}` 
          : '';
        setMessages(prev => [...prev, {
          id: uid(), role: "assistant", type: "success",
          content: `✅ تم تسجيل العملية بنجاح${invoiceInfo}\n${text}`,
          timestamp: new Date(),
        }]);
        setSending(false);
        return;
      }

      // Otherwise, use AI chat for questions
      const allMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content }));
      allMessages.push({ role: 'user', content: text });

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

  return (
    <div className="flex flex-col h-full" style={{ background: "#F4F7FA" }}>
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 zidni-scrollbar">
        {isWelcome ? (
          <div className="flex items-center justify-center h-full">
            <div className="max-w-lg w-full">
              {/* Welcome card */}
              <div className="bg-white rounded-2xl p-8 shadow-lg" style={{ borderTop: "4px solid #4A9EE8" }}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ background: "#0A2342" }}>
                    {userName.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold" style={{ color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}>
                      مرحباً {userName}! 👋
                    </h2>
                    <p className="text-sm text-gray-500">أنا محاسبك الذكي — اسألني أي شيء أو سجل عملياتك بكلامك</p>
                  </div>
                </div>

                {/* Quick metrics */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {[
                    { label: "الصندوق", value: fmt(data.cash), color: "#00B4D8" },
                    { label: "صافي الربح", value: fmt(data.netProfit), color: data.netProfit >= 0 ? "#16A34A" : "#DC2626" },
                    { label: "الذمم", value: fmt(data.receivables), color: "#D97706" },
                  ].map(m => (
                    <div key={m.label} className="text-center p-3 rounded-xl" style={{ background: `${m.color}10` }}>
                      <p className="text-lg font-bold" style={{ color: m.color, fontFamily: "JetBrains Mono, monospace" }}>{m.value}</p>
                      <p className="text-[11px] text-gray-500">{m.label}</p>
                    </div>
                  ))}
                </div>

                {/* CFO Briefing */}
                {cfoMode && (
                  <div className="rounded-xl p-4 mb-6" style={{ background: "linear-gradient(135deg, #0A2342, #006D8F)" }}>
                    <p className="text-xs font-bold text-white mb-2">📋 ملخص اليوم</p>
                    <p className="text-[11px] text-white/80">
                      مبيعات اليوم: {fmt(data.salesToday)} • الصندوق: {fmt(data.cash)} • البنك: {fmt(data.bank)}
                    </p>
                  </div>
                )}
              </div>

              {/* Quick action chips */}
              <div className="mt-5 space-y-3">
                {Object.values(QUICK_CHIPS).map(group => (
                  <div key={group.label}>
                    <p className="text-[11px] font-bold text-gray-500 mb-1.5">{group.label}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.chips.map(chip => (
                        <button
                          key={chip}
                          onClick={() => setInputValue(chip)}
                          className="px-3 py-2 rounded-xl text-[12px] transition-all hover:shadow-md"
                          style={{
                            background: "white",
                            color: "#0A2342",
                            border: "1px solid #E2E8F0",
                          }}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ml-2" style={{ background: "#0A2342" }}>
                    {userName.charAt(0)}
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
                    msg.role === "user" ? "rounded-bl-sm" : "rounded-br-sm"
                  }`}
                  style={msg.role === "user" ? {
                    background: "linear-gradient(135deg, #0A2342, #006D8F)",
                    color: "white",
                    fontFamily: "Tajawal, sans-serif",
                  } : msg.type === "success" ? {
                    background: "#DCFCE7",
                    border: "1px solid #16A34A",
                    color: "#0A2342",
                    fontFamily: "Tajawal, sans-serif",
                  } : {
                    background: "white",
                    border: "1px solid #E2E8F0",
                    color: "#0A2342",
                    boxShadow: "0 2px 8px rgba(10,35,66,0.06)",
                    fontFamily: "Tajawal, sans-serif",
                  }}
                >
                  <AIMessageRenderer content={msg.content} />
                  <p className="text-[9px] mt-1.5" style={{ color: msg.role === "user" ? "rgba(255,255,255,0.5)" : "#8B9BB4" }}>
                    {msg.timestamp.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 mr-2" style={{ background: "linear-gradient(135deg, #4A9EE8, #7BB8F0)" }}>
                    ✦
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {sending && (
              <div className="flex justify-end">
                <div className="bg-white rounded-2xl rounded-br-sm px-4 py-3 border border-gray-200 shadow-sm">
                  <div className="flex gap-1 mb-1">
                    {[0, 150, 300].map(delay => (
                      <span key={delay} className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#8B9BB4", animationDelay: `${delay}ms` }} />
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400">{STATUS_MESSAGES[statusIdx]}</p>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 bg-white border-t px-5 py-4" style={{ borderColor: "#E2E8F0", boxShadow: "0 -4px 16px rgba(10,35,66,0.06)" }}>
        <div
          className="flex items-end gap-2 rounded-2xl px-4 py-3 transition-all"
          style={{ background: "#F8FAFC", border: "2px solid #E2E8F0" }}
        >
          {/* Left buttons */}
          <button
            onClick={toggleVoice}
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
            style={{
              background: isRecording ? "#DC262620" : "transparent",
              color: isRecording ? "#DC2626" : "#8B9BB4",
            }}
          >
            {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          {/* Input */}
          <div className="flex-1 min-w-0">
            <MentionInput
              value={inputValue}
              onChange={setInputValue}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              onMentionSelect={(item) => setSelectedMentions(prev => [...prev, item])}
              placeholder="شو صار معك اليوم مالياً؟ سجل عملياتك بكلامك..."
              className="w-full bg-transparent border-0 outline-none text-sm resize-none"
              userId={user?.id}
            />
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={sending || !inputValue.trim()}
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #0A2342, #006D8F)" }}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 text-white animate-spin" />
            ) : (
              <Send className="h-4 w-4 text-white rotate-180" />
            )}
          </button>
        </div>

        {/* Recording indicator */}
        {isRecording && (
          <div className="flex items-center gap-2 mt-2 px-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#DC2626" }} />
              <span className="relative inline-flex rounded-full h-3 w-3" style={{ background: "#DC2626" }} />
            </span>
            <span className="text-xs font-medium" style={{ color: "#DC2626" }}>جاري الاستماع...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ZidniChatPanel;
