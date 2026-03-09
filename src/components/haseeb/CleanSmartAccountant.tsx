import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAuthHeadersJson } from "@/lib/edge-helpers";
import { useToast } from "@/hooks/use-toast";
import CleanTopBar from "./CleanTopBar";
import CleanInputDock from "./CleanInputDock";
import FinancialSummarySheet from "./FinancialSummarySheet";
import NotificationsSheet from "./NotificationsSheet";
import type { HaseebFinancialData } from "@/pages/SmartAccountantPage";
import type { User } from "@supabase/supabase-js";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "transaction" | "success";
  timestamp: Date;
  isVoice?: boolean;
};

interface Props {
  user: User | null;
  userName: string;
  data: HaseebFinancialData;
  cfoMode: boolean;
  onToggleCfo: () => void;
  onCheque: (data: any) => void;
  onJournal: (data: any, accounts?: any[]) => void;
  onTransactionSuccess: () => void;
  onBack: () => void;
}

const fmt = (n: number) => `₪${Math.abs(n).toLocaleString()}`;
const uid = () => Math.random().toString(36).slice(2);
const STATUS_MESSAGES = ["📊 يقرأ بياناتك...", "🧮 يحسب...", "✍️ يصيغ الإجابة..."];

const CleanSmartAccountant = ({ user, userName, data, cfoMode, onToggleCfo, onCheque, onJournal, onTransactionSuccess, onBack }: Props) => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);
  const [showFinancial, setShowFinancial] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  // Auto-scroll
  useEffect(() => {
    if (!showScrollDown) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showScrollDown]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setShowScrollDown(!atBottom && messages.length > 3);
  }, [messages.length]);

  useEffect(() => {
    if (!sending) return;
    const id = setInterval(() => setStatusIdx(i => (i + 1) % STATUS_MESSAGES.length), 2000);
    return () => clearInterval(id);
  }, [sending]);

  const handleSend = async (text: string, isVoice = false) => {
    if (!text.trim() || sending) return;

    const userMsg: Message = { id: uid(), role: "user", content: text.trim(), timestamp: new Date(), isVoice };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);

    try {
      const parseRes = await supabase.functions.invoke("parse-voice-transaction", { body: { text: text.trim() } });
      const parseData = parseRes.data;

      if (parseData?.type === 'cheque') {
        onCheque({ chequeType: parseData.chequeType || 'وارد', partyName: parseData.partyName || '', partyType: parseData.partyType || 'عميل', originalText: text, amount: parseData.amount || 0 });
        setSending(false);
        return;
      }

      if (parseData?.type && !['question', 'unknown'].includes(parseData.type)) {
        const body: any = { text: text.trim(), userId: user?.id, email: user?.email };
        const { error } = await supabase.functions.invoke("process-transaction", { body });
        if (error) throw error;
        if (navigator.vibrate) navigator.vibrate(100);
        onTransactionSuccess();
        setMessages(prev => [...prev, { id: uid(), role: "assistant", type: "success", content: `✅ تم تسجيل العملية بنجاح\n${text.trim()}`, timestamp: new Date() }]);
        setSending(false);
        return;
      }

      // AI chat
      const allMessages = messages.map(m => ({ role: m.role, content: m.content }));
      allMessages.push({ role: 'user', content: text.trim() });

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant-chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: (await getAuthHeadersJson()).Authorization },
          body: JSON.stringify({
            messages: allMessages, currentPage: "/smart-accountant", userName,
            financialContext: { cash: data.cash, bank: data.bank, sales: data.totalSales, expenses: data.totalExpenses, profit: data.netProfit, receivables: data.receivables, payables: data.payables },
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
                if (exists) return prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m);
                return [...prev, { id: assistantId, role: "assistant", content: assistantContent, timestamp: new Date() }];
              });
            }
          } catch { /* partial */ }
        }
      }
      if (navigator.vibrate) navigator.vibrate(40);
    } catch {
      setMessages(prev => [...prev, { id: uid(), role: "assistant", content: "عذراً، حدث خطأ. حاول مرة أخرى.", timestamp: new Date() }]);
    } finally {
      setSending(false);
    }
  };

  const hasAnomalies = data.receivables > data.totalSales * 0.5 || data.cash + data.bank < 0;
  const isWelcome = messages.length === 0;

  return (
    <>
      {/* Top Bar */}
      <CleanTopBar
        healthScore={data.healthScore}
        hasAnomalies={hasAnomalies}
        cfoMode={cfoMode}
        onToggleCfo={onToggleCfo}
        onBack={onBack}
        onShowFinancial={() => setShowFinancial(true)}
        onShowNotifications={() => setShowNotifications(true)}
      />

      {/* Chat Area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ background: "#F8FAFC", WebkitOverflowScrolling: "touch", overscrollBehaviorY: "contain" }}
      >
        <div className="px-4 py-4 max-w-2xl mx-auto">
          {isWelcome ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh]">
              {/* Clean welcome card */}
              <div className="w-full bg-white rounded-[20px] p-6 shadow-[0_2px_10px_rgba(10,35,66,0.06)]">
                <div className="text-center">
                  <span className="text-[32px]">👋</span>
                  <h2 className="text-xl font-extrabold mt-2" style={{ color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}>
                    مرحباً {userName}!
                  </h2>
                  <p className="text-sm mt-2 leading-[1.8]" style={{ color: "#8B9BB4", fontFamily: "Tajawal, sans-serif" }}>
                    سجّل عملياتك المالية بصوتك أو كتابةً — أنا أتولى الباقي
                  </p>
                </div>

                <div className="h-px bg-[#F1F5F9] my-5" />

                {/* 3 key numbers — no colors, no icons, no borders */}
                <div className="flex justify-around">
                  {[
                    { label: "الصندوق", value: fmt(data.cash) },
                    { label: "الربح", value: fmt(data.netProfit) },
                    { label: "الذمم", value: fmt(data.receivables) },
                  ].map(m => (
                    <div key={m.label} className="text-center">
                      <p className="text-base font-bold" style={{ fontFamily: "JetBrains Mono, monospace", color: "#0A2342" }}>
                        {m.value}
                      </p>
                      <p className="text-[11px] mt-1" style={{ color: "#8B9BB4" }}>{m.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"} mb-2`}>
                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ml-2"
                      style={{ background: "#0A2342" }}>
                      {userName.charAt(0)}
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-[1.8] ${msg.role === "user" ? "rounded-bl-sm" : "rounded-br-sm"}`}
                    style={msg.role === "user" ? {
                      background: "linear-gradient(135deg, #0A2342, #006D8F)", color: "white", fontFamily: "Tajawal, sans-serif",
                    } : msg.type === "success" ? {
                      background: "#DCFCE7", border: "1px solid #16A34A", color: "#0A2342", fontFamily: "Tajawal, sans-serif",
                    } : {
                      background: "white", border: "1px solid #E2E8F0", color: "#0A2342",
                      boxShadow: "0 2px 8px rgba(10,35,66,0.06)", fontFamily: "Tajawal, sans-serif",
                    }}
                  >
                    <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
                    <p className="text-[10px] mt-1.5" style={{ color: msg.role === "user" ? "rgba(255,255,255,0.4)" : "#8B9BB4" }}>
                      {msg.timestamp.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  {msg.role === "assistant" && (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mr-2 self-end"
                      style={{ background: "linear-gradient(135deg, #C9A84C, #E8D5A3)" }}>
                      ✦
                    </div>
                  )}
                </div>
              ))}

              {sending && (
                <div className="flex justify-end mb-2">
                  <div className="bg-white rounded-2xl rounded-br-sm px-4 py-3 border border-[#E2E8F0] shadow-sm">
                    <div className="flex gap-1.5 mb-1.5">
                      {[0, 150, 300].map(delay => (
                        <span key={delay} className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#00B4D8", animationDelay: `${delay}ms` }} />
                      ))}
                    </div>
                    <p className="text-[10px]" style={{ color: "#8B9BB4" }}>{STATUS_MESSAGES[statusIdx]}</p>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {showScrollDown && (
          <button
            onClick={() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); setShowScrollDown(false); }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-xs font-bold shadow-lg active:scale-95 transition-transform"
            style={{ background: "#0A2342", color: "white" }}
          >
            ↓ جديد
          </button>
        )}
      </div>

      {/* Bottom Input Dock */}
      <CleanInputDock onSend={handleSend} sending={sending} />

      {/* Sheets */}
      <FinancialSummarySheet open={showFinancial} onClose={() => setShowFinancial(false)} data={data} />
      <NotificationsSheet open={showNotifications} onClose={() => setShowNotifications(false)} data={data} />
    </>
  );
};

export default CleanSmartAccountant;
