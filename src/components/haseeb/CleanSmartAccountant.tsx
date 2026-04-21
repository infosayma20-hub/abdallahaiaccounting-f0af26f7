import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAuthHeadersJson } from "@/lib/edge-helpers";
import { useToast } from "@/hooks/use-toast";
import { buildAIContext, type AIFinancialContext } from "@/lib/buildAIContext";
import CleanTopBar from "./CleanTopBar";
import CleanInputDock from "./CleanInputDock";
import FinancialSummarySheet from "./FinancialSummarySheet";
import NotificationsSheet from "./NotificationsSheet";
import ChatHistorySidebar from "./ChatHistorySidebar";
import MultiTransactionCards, { type ParsedTransaction } from "./MultiTransactionCards";
import { buildTxText, isTxResultSuccess } from "./buildTxText";
import type { FinixFinancialData } from "@/pages/SmartAccountantPage";
import { AIMessageRenderer } from "@/components/AIMessageRenderer";
import type { User } from "@supabase/supabase-js";
import { classifyCommand, getCommandTypeLabel, getCommandTypeIcon } from "@/lib/multiCommandParser";

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
  data: FinixFinancialData;
  cfoMode: boolean;
  onToggleCfo: () => void;
  onCheque: (data: any) => void;
  onJournal: (data: any, accounts?: any[]) => void;
  onTransactionSuccess: () => void;
  onBack: () => void;
  onShowHelp?: () => void;
  onReplayOnboarding?: () => void;
}

const fmt = (n: number) => `₪${Math.abs(n).toLocaleString()}`;
const uid = () => Math.random().toString(36).slice(2);
const STATUS_MESSAGES = ["📊 يقرأ بياناتك...", "🧮 يحسب...", "✍️ يصيغ الإجابة..."];

const CleanSmartAccountant = ({ user, userName, data, cfoMode, onToggleCfo, onCheque, onJournal, onTransactionSuccess, onBack, onShowHelp, onReplayOnboarding }: Props) => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);
  const [showFinancial, setShowFinancial] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [todayConvCount, setTodayConvCount] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [lastTransactionId, setLastTransactionId] = useState<string | null>(null);

  // Conversation persistence
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [aiContext, setAiContext] = useState<AIFinancialContext | null>(null);

  // Load AI context on mount
  useEffect(() => {
    if (!user?.id) return;
    buildAIContext(user.id).then(setAiContext);
  }, [user?.id]);

  // Count today's conversations
  useEffect(() => {
    if (!user?.id) return;
    const today = new Date().toISOString().split("T")[0];
    supabase.from("ai_conversations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", today)
      .then(({ count }) => setTodayConvCount(count || 0));
  }, [user?.id, conversationId]);

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

  // Save message to DB
  const saveMessage = async (convId: string, role: "user" | "assistant", content: string) => {
    await supabase.from("ai_messages").insert({
      conversation_id: convId,
      role,
      content,
    });
  };

  // Create or get conversation
  const ensureConversation = async (firstMessage: string): Promise<string> => {
    if (conversationId) return conversationId;
    if (!user?.id) return "";

    const title = firstMessage.slice(0, 60) || "محادثة جديدة";
    const { data: conv } = await supabase.from("ai_conversations").insert({
      user_id: user.id,
      title,
    }).select("id").single();

    const newId = conv?.id || "";
    setConversationId(newId);
    return newId;
  };

  // Load conversation from history
  const loadConversation = async (convId: string) => {
    const { data: msgs } = await supabase
      .from("ai_messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });

    setMessages((msgs || []).map((m: any) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      timestamp: new Date(m.created_at),
    })));
    setConversationId(convId);
    setShowHistory(false);
  };

  // New conversation
  const handleNewConversation = () => {
    setMessages([]);
    setConversationId(null);
    setShowHistory(false);
  };

  // Refresh data
  const handleRefreshData = async () => {
    if (!user?.id || refreshing) return;
    setRefreshing(true);
    try {
      const ctx = await buildAIContext(user.id);
      setAiContext(ctx);
      toast({ title: "✓ تم تحديث البيانات" });
    } catch { /* ignore */ }
    setRefreshing(false);
  };

  // Execute a single parsed transaction (entity, cheque, invoice, etc.)
  const executeTransaction = async (tx: ParsedTransaction, originalText: string): Promise<{ success: boolean; message: string; type?: string }> => {
    if (tx.type === 'cheque') {
      onCheque({ chequeType: tx.chequeType || 'وارد', partyName: tx.partyName || '', partyType: (tx as any).partyType || 'عميل', originalText, amount: tx.amount || 0 });
      return { success: true, message: `🧾 شيك ${tx.chequeType || 'وارد'} — ${tx.partyName || ''} — ₪${tx.amount || 0}`, type: 'cheque' };
    }

    if (tx.type === 'add_entity') {
      try {
        let successMsg = '';
        if (tx.entityType === 'contact') {
          const contactData: any = {
            contact_name: tx.name || '',
            contact_type: (tx as any).contactType === 'مورد' ? 'مورد' : 'عميل',
            user_id: user?.id, is_active: true, current_balance: 0,
          };
          if ((tx as any).phone) contactData.phone = (tx as any).phone;
          if ((tx as any).email) contactData.email = (tx as any).email;
          if ((tx as any).address) contactData.address = (tx as any).address;

          const { data: existing } = await supabase.from('contacts')
            .select('id, contact_name').eq('user_id', user?.id).eq('contact_name', contactData.contact_name).maybeSingle();

          if (existing) {
            const updateFields: any = {};
            if ((tx as any).phone) updateFields.phone = (tx as any).phone;
            if ((tx as any).email) updateFields.email = (tx as any).email;
            if ((tx as any).address) updateFields.address = (tx as any).address;
            if (Object.keys(updateFields).length > 0) await supabase.from('contacts').update(updateFields).eq('id', existing.id);
            successMsg = `⚠️ الجهة "${tx.name}" موجودة مسبقاً${Object.keys(updateFields).length > 0 ? ' — تم تحديث بياناتها' : ''}`;
          } else {
            const { error: insertError } = await supabase.from('contacts').insert(contactData);
            if (insertError) throw insertError;
            successMsg = `✅ تمت إضافة "${tx.name}" بنجاح`;
          }
        } else if (tx.entityType === 'employee') {
          const empData: any = { full_name: tx.name || '', user_id: user?.id, status: 'active', start_date: new Date().toISOString().split('T')[0] };
          if ((tx as any).jobTitle) empData.job_title = (tx as any).jobTitle;
          if ((tx as any).basicSalary) empData.basic_salary = (tx as any).basicSalary;
          const { error: insertError } = await supabase.from('employees').insert(empData);
          if (insertError) throw insertError;
          successMsg = `✅ تمت إضافة الموظف "${tx.name}" بنجاح`;
        } else if (tx.entityType === 'product') {
          const prodData: any = { name: tx.name || '', user_id: user?.id, is_active: true, quantity: tx.quantity || 0 };
          if ((tx as any).buyPrice) prodData.buy_price = (tx as any).buyPrice;
          if ((tx as any).sellPrice) prodData.sell_price = (tx as any).sellPrice;
          const { error: insertError } = await supabase.from('products').insert(prodData);
          if (insertError) throw insertError;
          successMsg = `✅ تمت إضافة المنتج "${tx.name}" بنجاح`;
        } else if (tx.entityType === 'account') {
          const accData: any = { account_name: tx.name || '', account_code: (tx as any).accountCode || '', account_type: (tx as any).accountType || 'أصول', user_id: user?.id, is_active: true };
          const { error: insertError } = await supabase.from('accounts').insert(accData);
          if (insertError) throw insertError;
          successMsg = `✅ تمت إضافة الحساب "${tx.name}" بنجاح`;
        }
        return { success: true, message: successMsg || '✅ تمت الإضافة', type: 'add_entity' };
      } catch (err: any) {
        return { success: false, message: `❌ فشل في الإضافة: ${err.message || 'خطأ غير معروف'}` };
      }
    }

    // Transaction / Invoice — send text to process-transaction
    if (tx.type && !['question', 'unknown', 'add_entity', 'inventory_report'].includes(tx.type)) {
      // نبني نصاً موسعاً يحوي المبلغ والزبون وطريقة الدفع (وإلا قد يُرفض الطلب لعدم وجود مبلغ)
      const expandedText = buildTxText(tx) || originalText.trim();
      const body: any = { text: expandedText, userId: user?.id, email: user?.email };
      const { data: txResult, error } = await supabase.functions.invoke("process-transaction", { body });
      if (error) throw error;
      const verdict = isTxResultSuccess(txResult);
      if (!verdict.success) {
        return { success: false, message: verdict.message, type: tx.type };
      }
      if (txResult?.transaction?.id) setLastTransactionId(txResult.transaction.id);
      const invoiceInfo = txResult?.transaction?.invoice_number ? `\n📋 ${txResult.transaction.invoice_number}` : '';
      const cmdType = classifyCommand(originalText);
      return { success: true, message: `✅ ${getCommandTypeIcon(cmdType)} ${getCommandTypeLabel(cmdType)}${invoiceInfo}`, type: tx.type };
    }

    return { success: false, message: '', type: 'question' };
  };

  const handleSend = async (text: string, isVoice = false) => {
    if (!text.trim() || sending) return;

    const userMsg: Message = { id: uid(), role: "user", content: text.trim(), timestamp: new Date(), isVoice };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);

    try {
      const convId = await ensureConversation(text.trim());
      if (convId) saveMessage(convId, "user", text.trim());

      // ═══ Call parse-voice-transaction (returns array now) ═══
      const parseRes = await supabase.functions.invoke("parse-voice-transaction", { body: { text: text.trim() } });
      const parseData = parseRes.data;

      // New format: { transactions: [...], count: N }
      const transactions: ParsedTransaction[] = parseData?.transactions || [];
      
      // Check for clarification requests first
      const clarifications = transactions.filter(t => t.type === 'clarification' || t.status === 'needs_clarification');
      if (clarifications.length > 0) {
        const cl = clarifications[0];
        const question = (cl as any).question || (cl as any).clarificationQuestion || 'هل يمكنك التوضيح أكثر؟';
        const options: string[] = (cl as any).options || (cl as any).clarificationOptions || [];
        
        let clarificationMsg = question;
        if (options.length > 0) {
          clarificationMsg += '\n\n' + options.map((opt: string) => `[action:${opt}:@${opt}]`).join('  ');
        }
        
        setMessages(prev => [...prev, { id: uid(), role: "assistant", content: clarificationMsg, timestamp: new Date() }]);
        if (convId) saveMessage(convId, "assistant", clarificationMsg);
        setSending(false);
        return;
      }

      // ═══ EDIT/DELETE INTENT ═══
      const editTx = transactions.find(t => t.type === 'edit_transaction');
      if (editTx) {
        const { data: editResult, error: editErr } = await supabase.functions.invoke("process-transaction", {
          body: {
            text: text.trim(),
            userId: user?.id,
            email: user?.email,
            editIntent: editTx,
            lastTransactionId,
          },
        });

        if (editErr) {
          setMessages(prev => [...prev, { id: uid(), role: "assistant", content: `❌ خطأ: ${editErr.message}`, timestamp: new Date() }]);
          setSending(false);
          return;
        }

        const editResponse = editResult?.edit_response;
        if (editResponse) {
          let msg = editResponse.message || '';
          if (editResponse.reason) msg += `\n${editResponse.reason}`;
          if (editResponse.hint) msg += `\n💡 ${editResponse.hint}`;
          if (editResponse.suggestion?.title) msg += `\n\n${editResponse.suggestion.title}`;
          if (editResponse.suggestion?.explanation) msg += `\n${editResponse.suggestion.explanation}`;
          if (editResponse.alternatives?.length) {
            msg += '\n\n' + editResponse.alternatives.map((a: string) => `• ${a}`).join('\n');
          }
          if (editResponse.buttons?.length) {
            msg += '\n\n' + editResponse.buttons.map((b: any) => {
              if (b.action === 'navigate' && b.url) return `[action:${b.label}:${b.url}]`;
              if (b.action === 'cancel') return `[action:${b.label}:@cancel]`;
              return `[action:${b.label}:@${b.action}]`;
            }).join('  ');
          }

          const msgType = editResponse.type === 'success' ? 'success' as const : undefined;
          setMessages(prev => [...prev, { id: uid(), role: "assistant", content: msg, type: msgType, timestamp: new Date() }]);
          if (convId) saveMessage(convId, "assistant", msg);
          if (editResponse.type === 'success') {
            if (navigator.vibrate) navigator.vibrate(100);
            onTransactionSuccess();
          }
          setSending(false);
          return;
        }
      }

      // Filter out unknowns/questions
      const actionable = transactions.filter(t => t.type && !['unknown', 'question', 'clarification', 'edit_transaction'].includes(t.type));

      if (actionable.length > 1) {
        // ═══ MULTI-TRANSACTION → Show cards UI ═══
        const multiCardMsg: Message = {
          id: uid(), role: "assistant", type: "transaction",
          content: `__MULTI_TX__${JSON.stringify(actionable)}`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, multiCardMsg]);
        setSending(false);
        return;
      }

      if (actionable.length === 1) {
        // ═══ SINGLE TRANSACTION ═══
        const tx = actionable[0];

        // Check if this single tx also needs clarification
        if ((tx as any).clarificationQuestion && tx.status !== 'complete') {
          const question = (tx as any).clarificationQuestion;
          const options: string[] = (tx as any).clarificationOptions || [];
          let clarificationMsg = question;
          if (options.length > 0) {
            clarificationMsg += '\n\n' + options.map((opt: string) => `[action:${opt}:@${opt}]`).join('  ');
          }
          setMessages(prev => [...prev, { id: uid(), role: "assistant", content: clarificationMsg, timestamp: new Date() }]);
          if (convId) saveMessage(convId, "assistant", clarificationMsg);
          setSending(false);
          return;
        }

        if (tx.type === 'cheque') {
          await executeTransaction(tx, text.trim());
          setSending(false);
          return;
        }

        if (tx.type === 'add_entity') {
          const result = await executeTransaction(tx, text.trim());
          if (navigator.vibrate) navigator.vibrate(100);
          setMessages(prev => [...prev, { id: uid(), role: "assistant", type: "success", content: result.message, timestamp: new Date() }]);
          if (convId) saveMessage(convId, "assistant", result.message);
          if (user?.id) buildAIContext(user.id).then(setAiContext);
          setSending(false);
          return;
        }

        if (tx.type === 'inventory_report') {
          // Pass through to AI chat for now
        } else if (tx.type && !['question', 'unknown'].includes(tx.type)) {
          const result = await executeTransaction(tx, text.trim());
          if (result.success) {
            if (navigator.vibrate) navigator.vibrate(100);
            onTransactionSuccess();
            setMessages(prev => [...prev, { id: uid(), role: "assistant", type: "success", content: result.message, timestamp: new Date() }]);
            if (convId) saveMessage(convId, "assistant", result.message);
            if (user?.id) buildAIContext(user.id).then(setAiContext);
            setSending(false);
            return;
          }
        }
      }
      // AI chat with full context
      const allMessages = messages.map(m => ({ role: m.role, content: m.content }));
      allMessages.push({ role: 'user', content: text.trim() });

      const financialContext: any = {
        cash: data.cash, bank: data.bank,
        sales: data.totalSales, expenses: data.totalExpenses,
        profit: data.netProfit, receivables: data.receivables,
        payables: data.payables,
      };

      if (aiContext) {
        financialContext.recentTransactions = aiContext.recentTransactions.slice(0, 10);
        financialContext.topContacts = aiContext.topContacts.slice(0, 10);
        financialContext.inventory = aiContext.inventory.slice(0, 10);
        financialContext.dueCheques = aiContext.dueCheques;
        financialContext.employees = aiContext.employees;
      }

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant-chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: (await getAuthHeadersJson()).Authorization },
          body: JSON.stringify({
            messages: allMessages, currentPage: "/smart-accountant", userName,
            financialContext,
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

      if (convId && assistantContent) saveMessage(convId, "assistant", assistantContent);
    } catch {
      setMessages(prev => [...prev, { id: uid(), role: "assistant", content: "عذراً، حدث خطأ. حاول مرة أخرى.", timestamp: new Date() }]);
    } finally {
      setSending(false);
    }
  };

  const hasAnomalies = data.receivables > data.totalSales * 0.5 || data.cash + data.bank < 0;
  const isWelcome = messages.length === 0;

  // Color coding for welcome numbers
  const cashColor = "#006D8F"; // teal
  const profitColor = data.netProfit >= 0 ? "#16A34A" : "#DC2626";
  const receivablesColor = data.receivables >= 0 ? "#16A34A" : "#DC2626";

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
        onToggleHistory={() => setShowHistory(!showHistory)}
        onRefreshData={handleRefreshData}
        onShowHelp={onShowHelp}
        onReplayOnboarding={onReplayOnboarding}
        todayConversationCount={todayConvCount}
        refreshing={refreshing}
      />

      {/* Chat Area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto overflow-x-hidden ${isWelcome ? "flex flex-col" : ""}`}
        style={{ background: "#F8FAFC", WebkitOverflowScrolling: "touch", overscrollBehaviorY: "contain" }}
      >
        <div className={`px-4 max-w-2xl mx-auto w-full ${isWelcome ? "flex-1 flex flex-col justify-center py-8" : "py-4"}`}>
          {isWelcome ? (
            <div className="flex flex-col items-center">
              {/* Greeting */}
              <span className="text-[40px] mb-3">👋</span>
              <h2 className="text-2xl font-extrabold mb-2" style={{ color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}>
                مرحباً {userName}!
              </h2>
              <p className="text-sm mb-8" style={{ color: "#8B9BB4", fontFamily: "Tajawal, sans-serif" }}>
                سجّل عملياتك المالية بصوتك أو كتابةً — أنا أتولى الباقي
              </p>

              {/* Centered Input */}
              <div className="w-full max-w-xl">
                <CleanInputDock onSend={handleSend} sending={sending} centered />
              </div>

              {/* 3 key numbers */}
              <div className="flex justify-center gap-10 mt-8">
                {[
                  { label: "الصندوق", value: fmt(data.cash), color: cashColor },
                  { label: "الربح", value: fmt(data.netProfit), color: profitColor },
                  { label: "الذمم", value: fmt(data.receivables), color: receivablesColor },
                ].map(m => (
                  <div key={m.label} className="text-center">
                    <p className="text-lg font-bold" style={{ fontFamily: "JetBrains Mono, monospace", color: m.color }}>
                      {m.value}
                    </p>
                    <p className="text-[11px] mt-1" style={{ color: "#8B9BB4" }}>{m.label}</p>
                  </div>
                ))}
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
                    {msg.content.startsWith('__MULTI_TX__') ? (
                      <MultiTransactionCards
                        transactions={JSON.parse(msg.content.replace('__MULTI_TX__', ''))}
                        onConfirm={async (tx, idx) => {
                          // 🛡️ نلتقط أي استثناء هنا حتى لا يُسقط لوب "تأكيد الكل"
                          try {
                            const result = await executeTransaction(tx, tx.description || '');
                            if (result.success) onTransactionSuccess();
                            return { success: result.success, message: result.message };
                          } catch (err: any) {
                            return { success: false, message: `❌ ${err?.message || 'فشل التسجيل'}` };
                          }
                        }}
                        onConfirmAll={async (txs) => {
                          // كل بطاقة تم تأكيدها مسبقاً عبر onConfirm — فقط نُحدّث المؤشرات
                          if (txs.length > 0) onTransactionSuccess();
                        }}
                        onSkip={() => {}}
                        onDone={() => {}}
                      />
                    ) : (
                      <AIMessageRenderer content={msg.content} />
                    )}
                    {sending && msg.id === messages[messages.length - 1]?.id && msg.role === "assistant" && (
                      <span className="inline-block w-[2px] h-4 ml-0.5 align-middle" style={{ background: "#0A2342", animation: "blink 1s infinite" }} />
                    )}
                    <p className="text-[10px] mt-1.5" style={{ color: msg.role === "user" ? "rgba(255,255,255,0.4)" : "#8B9BB4" }}>
                      {msg.timestamp.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  {msg.role === "assistant" && (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mr-2 self-end"
                      style={{ background: "linear-gradient(135deg, #4A9EE8, #7BB8F0)" }}>
                      ✦
                    </div>
                  )}
                </div>
              ))}

              {sending && !messages.some(m => m.role === "assistant" && m.id === messages[messages.length - 1]?.id) && (
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
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-lg active:scale-95 transition-transform"
            style={{ background: "#0A2342", color: "white" }}
          >
            ↓
          </button>
        )}
      </div>

      {/* Blink keyframe */}
      <style>{`@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>

      {/* Bottom Input Dock - only when there are messages */}
      {!isWelcome && <CleanInputDock onSend={handleSend} sending={sending} />}

      {/* Sheets */}
      <FinancialSummarySheet open={showFinancial} onClose={() => setShowFinancial(false)} data={data} />
      <NotificationsSheet open={showNotifications} onClose={() => setShowNotifications(false)} data={data} />

      {/* Chat History Sidebar */}
      <ChatHistorySidebar
        open={showHistory}
        onClose={() => setShowHistory(false)}
        userId={user?.id}
        activeConversationId={conversationId}
        onSelectConversation={loadConversation}
        onNewConversation={handleNewConversation}
      />
    </>
  );
};

export default CleanSmartAccountant;
