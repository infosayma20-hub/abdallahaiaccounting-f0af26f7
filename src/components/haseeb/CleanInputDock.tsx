import { useState, useRef, useCallback, useEffect } from "react";
import { ArrowUp, Mic, X, Square, Users, Package, Briefcase, BookOpen, PlusCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import SmartCommandBar from "./SmartCommandBar";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

type DockState = "idle" | "recording" | "processing";

interface MentionItem {
  id: string;
  name: string;
  type: string;
  category: "contact" | "product" | "employee" | "account";
}

interface Props {
  onSend: (text: string, isVoice?: boolean) => void;
  sending: boolean;
  centered?: boolean;
}



const CleanInputDock = ({ onSend, sending, centered }: Props) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [state, setState] = useState<DockState>("idle");
  const [inputValue, setInputValue] = useState("");
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(40).fill(2));
  
  const [showMentions, setShowMentions] = useState(false);
  const [mentionItems, setMentionItems] = useState<MentionItem[]>([]);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionLoaded, setMentionLoaded] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mentionRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const stateRef = useRef<DockState>("idle");
  const startingRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const fakeWaveRef = useRef<number>(0);

  useEffect(() => { stateRef.current = state; }, [state]);

  const hasText = inputValue.trim().length > 0;

  // Fetch mention items
  useEffect(() => {
    if (!user?.id || mentionLoaded) return;
    const fetchMentionData = async () => {
      try {
        const [contactsRes, productsRes, employeesRes, accountsRes] = await Promise.all([
          supabase.from('contacts').select('id, contact_name, contact_type').eq('user_id', user.id).eq('is_active', true).neq('is_archived', true),
          supabase.from('products').select('id, name, unit').eq('user_id', user.id),
          supabase.from('employees').select('id, full_name, job_title').eq('user_id', user.id),
          supabase.from('accounts').select('id, account_name, account_code, account_type').eq('user_id', user.id).eq('is_active', true),
        ]);

        const items: MentionItem[] = [
          ...(contactsRes.data || []).map(c => ({ id: c.id, name: c.contact_name, type: c.contact_type || 'جهة', category: 'contact' as const })),
          ...(productsRes.data || []).map(p => ({ id: p.id, name: p.name, type: `صنف · ${p.unit || 'وحدة'}`, category: 'product' as const })),
          ...(employeesRes.data || []).map(e => ({ id: e.id, name: e.full_name, type: e.job_title || 'موظف', category: 'employee' as const })),
          ...(accountsRes.data || []).map(a => ({ id: a.id, name: `${a.account_code} - ${a.account_name}`, type: a.account_type, category: 'account' as const })),
        ];
        setMentionItems(items);
        setMentionLoaded(true);
      } catch (err) {
        console.error('Failed to fetch mention data:', err);
      }
    };
    fetchMentionData();
  }, [user?.id, mentionLoaded]);

  // Close mention dropdown on outside click
  useEffect(() => {
    if (!showMentions) return;
    const handler = (e: MouseEvent) => {
      if (mentionRef.current && !mentionRef.current.contains(e.target as Node)) {
        setShowMentions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMentions]);

  useEffect(() => {
    return () => stopRecordingCleanup();
  }, []);

  const stopRecordingCleanup = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (fakeWaveRef.current) {
      cancelAnimationFrame(fakeWaveRef.current);
      fakeWaveRef.current = 0;
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
  };

  const startVoiceInput = useCallback(async () => {
    // Prevent double-trigger from onMouseDown + onTouchStart on touch devices
    if (startingRef.current || stateRef.current !== "idle") return;
    startingRef.current = true;

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      startingRef.current = false;
      toast({ title: "المتصفح لا يدعم التسجيل الصوتي", description: "جرّب Chrome على أندرويد أو Safari الحديث على آيفون" });
      return;
    }

    try {
      // IMPORTANT: SpeechRecognition opens its own mic stream — do NOT also call
      // getUserMedia (causes "NotReadableError" / hangs on iOS & some Android Chromes).
      // We render an animated pseudo-waveform instead.
      const recognition = new SR();
      recognition.lang = "ar-SA";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      let resultText = "";
      let finished = false;

      const finish = (text: string | null, errored = false) => {
        if (finished) return;
        finished = true;
        stopRecordingCleanup();
        setAudioLevels(new Array(40).fill(2));
        setRecordingTime(0);
        if (text && text.trim()) {
          setState("processing");
          setTimeout(() => {
            setState("idle");
            onSend(text.trim(), true);
          }, 350);
        } else {
          setState("idle");
          if (errored) {
            toast({ title: "تعذّر التسجيل", description: "تأكد من السماح بالميكروفون وحاول مرة أخرى" });
          }
        }
      };

      recognition.onresult = (e: any) => {
        try { resultText = e.results[0][0].transcript || ""; } catch { resultText = ""; }
      };
      recognition.onerror = (e: any) => {
        const code = e?.error || "";
        // "no-speech" / "aborted" shouldn't show a scary error
        const benign = code === "no-speech" || code === "aborted";
        finish(resultText || null, !benign);
      };
      recognition.onend = () => finish(resultText || null, false);

      try {
        recognition.start();
      } catch (err) {
        // already started or invalid state
        startingRef.current = false;
        finish(null, true);
        return;
      }

      recognitionRef.current = recognition;
      if (navigator.vibrate) navigator.vibrate(30);
      setState("recording");
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(prev => {
        const next = prev + 1;
        if (next >= 60) { // safety: hard stop after 60s
          try { recognition.stop(); } catch {}
        }
        return next;
      }), 1000);

      // Pseudo waveform animation (no mic stream required)
      const animate = () => {
        const levels = new Array(40).fill(0).map(() => 4 + Math.random() * 36);
        setAudioLevels(levels);
        fakeWaveRef.current = requestAnimationFrame(() => {
          // throttle to ~12fps
          setTimeout(animate, 80);
        });
      };
      animate();
    } catch (err) {
      stopRecordingCleanup();
      setState("idle");
      toast({ title: "تعذّر بدء التسجيل", description: "حاول مرة أخرى" });
    } finally {
      startingRef.current = false;
    }
  }, [onSend, toast]);

  const cancelRecording = useCallback(() => {
    try { recognitionRef.current?.abort?.(); } catch {}
    stopRecordingCleanup();
    setAudioLevels(new Array(40).fill(2));
    setRecordingTime(0);
    setState("idle");
  }, []);

  const handleTextSend = () => {
    if (!hasText || sending) return;
    onSend(inputValue.trim());
    setInputValue("");
  };

  const handleCommandInsert = (text: string) => {
    setInputValue(text);
    inputRef.current?.focus();
  };

  const handleCommandAction = (action: string) => {
    // Handle special actions
    if (action === "مسح المحادثة") {
      if (confirm("هل تريد مسح المحادثة الحالية؟")) {
        onSend("مسح المحادثة");
      }
      return;
    }
    onSend(action);
  };

  const toggleMentions = () => {
    setShowMentions(!showMentions);
    setMentionSearch("");
  };

  const handleMentionSelect = (item: MentionItem) => {
    const name = item.category === 'account' ? item.name.split(' - ')[1] || item.name : item.name;
    setInputValue(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + '@' + name + ' ');
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const handleQuickAdd = async (category: 'contact' | 'product' | 'employee', type?: string) => {
    const name = mentionSearch.trim();
    if (!name || !user?.id) return;

    try {
      if (category === 'contact') {
        const { data, error } = await supabase.from('contacts').insert({
          contact_name: name, user_id: user.id, contact_type: type || 'عميل',
        }).select('id, contact_name, contact_type').single();
        if (!error && data) {
          const newItem: MentionItem = { id: data.id, name: data.contact_name, type: data.contact_type, category: 'contact' };
          setMentionItems(prev => [...prev, newItem]);
          handleMentionSelect(newItem);
          toast({ title: `تمت إضافة "${name}" ✅` });
        }
      } else if (category === 'product') {
        const { data, error } = await supabase.from('products').insert({
          name, user_id: user.id, unit: 'قطعة', buy_price: 0, sell_price: 0, quantity: 0, min_quantity: 0,
        }).select('id, name, unit').single();
        if (!error && data) {
          const newItem: MentionItem = { id: data.id, name: data.name, type: `صنف · ${data.unit}`, category: 'product' };
          setMentionItems(prev => [...prev, newItem]);
          handleMentionSelect(newItem);
          toast({ title: `تمت إضافة "${name}" ✅` });
        }
      } else if (category === 'employee') {
        // Resolve user's company_id (required for multi-tenant isolation)
        const { data: company } = await supabase
          .from('companies')
          .select('id')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (!company?.id) {
          toast({ title: "خطأ", description: "لا توجد شركة مرتبطة بالمستخدم", variant: "destructive" });
          return;
        }
        const { data, error } = await supabase.from('employees').insert({
          full_name: name,
          user_id: user.id,
          company_id: company.id,
          job_title: 'موظف',
          base_salary: 0,
          hourly_rate: 0,
          start_date: new Date().toISOString().split('T')[0],
          annual_leave_days: 14,
        }).select('id, full_name, job_title').single();
        if (!error && data) {
          const newItem: MentionItem = { id: data.id, name: data.full_name, type: data.job_title || 'موظف', category: 'employee' };
          setMentionItems(prev => [...prev, newItem]);
          handleMentionSelect(newItem);
          toast({ title: `تمت إضافة "${name}" ✅` });
        }
      }
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    }
  };

  const filteredMentions = mentionSearch
    ? mentionItems.filter(i => i.name.toLowerCase().includes(mentionSearch.toLowerCase()))
    : mentionItems;

  const mentionContacts = filteredMentions.filter(i => i.category === 'contact');
  const mentionProducts = filteredMentions.filter(i => i.category === 'product');
  const mentionEmployees = filteredMentions.filter(i => i.category === 'employee');
  const mentionAccounts = filteredMentions.filter(i => i.category === 'account');

  const noResults = mentionSearch.trim() && filteredMentions.length === 0;

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // RECORDING STATE
  if (state === "recording") {
    return (
      <div className="flex-shrink-0" style={{ background: "#050F1E", borderTop: "1px solid rgba(0,180,216,0.2)", paddingBottom: "max(14px, env(safe-area-inset-bottom, 14px))" }}>
        <div className="flex items-center justify-center gap-[2px] h-14 w-full px-4">
          {audioLevels.map((level, i) => (
            <div key={i} className="w-[3px] rounded-full transition-all duration-75"
              style={{ height: `${level}px`, background: "linear-gradient(to top, #006D8F, #00B4D8, #4A9EE8)", opacity: 0.8 + (level / 48) * 0.2 }} />
          ))}
        </div>
        <div className="flex items-center justify-between px-4 pb-1">
          <button onClick={cancelRecording} className="flex items-center gap-1.5 h-11 px-4 text-white/60 text-sm">
            <X className="h-4 w-4" /> إلغاء
          </button>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#DC2626" }} />
            <span className="text-[13px] text-white/80">جاري التسجيل...</span>
          </div>
          <span className="text-lg font-semibold" style={{ fontFamily: "JetBrains Mono, monospace", color: recordingTime >= 25 ? "#D97706" : "white" }}>
            {formatTime(recordingTime)}
          </span>
        </div>
      </div>
    );
  }

  // PROCESSING STATE
  if (state === "processing") {
    return (
      <div className="flex-shrink-0 bg-white border-t border-[#F1F5F9]" style={{ paddingBottom: "max(14px, env(safe-area-inset-bottom, 14px))" }}>
        <div className="h-1 w-full overflow-hidden">
          <div className="h-full animate-pulse" style={{ background: "linear-gradient(90deg, transparent, #00B4D8, #4A9EE8, transparent)", backgroundSize: "200% 100%" }} />
        </div>
        <div className="flex items-center justify-center gap-2 py-4">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#00B4D8", borderTopColor: "transparent" }} />
          <span className="text-[13px]" style={{ color: "#8B9BB4" }}>🤖 يحلل كلامك...</span>
        </div>
      </div>
    );
  }

  // IDLE STATE
  return (
    <>
      <div className={`flex-shrink-0 relative ${centered ? "bg-transparent border-none" : "bg-white border-t border-[#F1F5F9]"}`} style={centered ? {} : { paddingBottom: "max(14px, env(safe-area-inset-bottom, 14px))" }}>
        {/* Mention dropdown */}
        {showMentions && (
          <div
            ref={mentionRef}
            className="absolute bottom-full left-3.5 right-3.5 mb-1 bg-white border border-[#E2E8F0] rounded-2xl shadow-xl max-h-[340px] overflow-hidden flex flex-col z-50"
            style={{ animation: "slideUp 200ms ease-out" }}
          >
            {/* Search inside mentions */}
            <div className="p-2.5 border-b border-[#F1F5F9]">
              <input
                value={mentionSearch}
                onChange={e => setMentionSearch(e.target.value)}
                placeholder="ابحث عن اسم..."
                autoFocus
                className="w-full h-9 rounded-lg px-3 text-[13px] outline-none"
                style={{ background: "#F8FAFC", fontFamily: "Tajawal, sans-serif", color: "#0A2342" }}
              />
            </div>

            <div className="overflow-y-auto flex-1" style={{ WebkitOverflowScrolling: 'touch' }}>
              {/* Contacts */}
              {mentionContacts.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-bold flex items-center gap-1.5 sticky top-0 bg-white/95 backdrop-blur-sm" style={{ color: "#006D8F" }}>
                    <Users className="h-3 w-3" /> زبائن وموردين
                  </div>
                  {mentionContacts.map(item => (
                    <button key={item.id} onClick={() => handleMentionSelect(item)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-right hover:bg-[#F0F9FF] transition-colors"
                      style={{ fontFamily: "Tajawal, sans-serif", color: "#0A2342" }}>
                      <Users className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#8B9BB4" }} />
                      <span className="flex-1 truncate">{item.name}</span>
                      <span className="text-[10px] flex-shrink-0" style={{ color: "#8B9BB4" }}>{item.type}</span>
                    </button>
                  ))}
                </>
              )}

              {/* Products */}
              {mentionProducts.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-bold flex items-center gap-1.5 sticky top-0 bg-white/95 backdrop-blur-sm" style={{ color: "#4A9EE8" }}>
                    <Package className="h-3 w-3" /> أصناف ومنتجات
                  </div>
                  {mentionProducts.map(item => (
                    <button key={item.id} onClick={() => handleMentionSelect(item)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-right hover:bg-[#FFFBEB] transition-colors"
                      style={{ fontFamily: "Tajawal, sans-serif", color: "#0A2342" }}>
                      <Package className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#8B9BB4" }} />
                      <span className="flex-1 truncate">{item.name}</span>
                      <span className="text-[10px] flex-shrink-0" style={{ color: "#8B9BB4" }}>{item.type}</span>
                    </button>
                  ))}
                </>
              )}

              {/* Employees */}
              {mentionEmployees.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-bold flex items-center gap-1.5 sticky top-0 bg-white/95 backdrop-blur-sm" style={{ color: "#7C3AED" }}>
                    <Briefcase className="h-3 w-3" /> موظفين
                  </div>
                  {mentionEmployees.map(item => (
                    <button key={item.id} onClick={() => handleMentionSelect(item)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-right hover:bg-[#F5F3FF] transition-colors"
                      style={{ fontFamily: "Tajawal, sans-serif", color: "#0A2342" }}>
                      <Briefcase className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#8B9BB4" }} />
                      <span className="flex-1 truncate">{item.name}</span>
                      <span className="text-[10px] flex-shrink-0" style={{ color: "#8B9BB4" }}>{item.type}</span>
                    </button>
                  ))}
                </>
              )}

              {/* Accounts */}
              {mentionAccounts.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-bold flex items-center gap-1.5 sticky top-0 bg-white/95 backdrop-blur-sm" style={{ color: "#0A2342" }}>
                    <BookOpen className="h-3 w-3" /> حسابات
                  </div>
                  {mentionAccounts.slice(0, 10).map(item => (
                    <button key={item.id} onClick={() => handleMentionSelect(item)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-right hover:bg-[#F1F5F9] transition-colors"
                      style={{ fontFamily: "Tajawal, sans-serif", color: "#0A2342" }}>
                      <BookOpen className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#8B9BB4" }} />
                      <span className="flex-1 truncate">{item.name}</span>
                      <span className="text-[10px] flex-shrink-0" style={{ color: "#8B9BB4" }}>{item.type}</span>
                    </button>
                  ))}
                </>
              )}

              {/* Quick add options */}
              {mentionSearch.trim() && (
                <>
                  <div className="border-t border-[#F1F5F9] mt-1" />
                  <div className="px-3 py-1.5 text-[10px] font-bold flex items-center gap-1.5" style={{ color: "#22C55E" }}>
                    <PlusCircle className="h-3 w-3" /> إضافة سريعة
                  </div>
                  <button onClick={() => handleQuickAdd('contact', 'عميل')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-right hover:bg-[#F0FDF4] transition-colors"
                    style={{ fontFamily: "Tajawal, sans-serif", color: "#16A34A" }}>
                    <PlusCircle className="h-3.5 w-3.5" /> أضف "{mentionSearch}" كزبون
                  </button>
                  <button onClick={() => handleQuickAdd('contact', 'مورد')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-right hover:bg-[#F0FDF4] transition-colors"
                    style={{ fontFamily: "Tajawal, sans-serif", color: "#16A34A" }}>
                    <PlusCircle className="h-3.5 w-3.5" /> أضف "{mentionSearch}" كمورد
                  </button>
                  <button onClick={() => handleQuickAdd('product')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-right hover:bg-[#FFFBEB] transition-colors"
                    style={{ fontFamily: "Tajawal, sans-serif", color: "#D97706" }}>
                    <PlusCircle className="h-3.5 w-3.5" /> أضف "{mentionSearch}" كمنتج
                  </button>
                  <button onClick={() => handleQuickAdd('employee')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-right hover:bg-[#F5F3FF] transition-colors"
                    style={{ fontFamily: "Tajawal, sans-serif", color: "#7C3AED" }}>
                    <PlusCircle className="h-3.5 w-3.5" /> أضف "{mentionSearch}" كموظف
                  </button>
                </>
              )}

              {/* No results */}
              {noResults && !mentionSearch.trim() && (
                <div className="text-center py-4 text-[12px]" style={{ color: "#8B9BB4" }}>لا توجد نتائج</div>
              )}
            </div>
          </div>
        )}

        {/* Smart Command Bar - hide in centered/welcome mode */}
        {!centered && <SmartCommandBar onInsert={handleCommandInsert} onAction={handleCommandAction} />}

        {/* Input row */}
        <div className={`flex items-end gap-2 ${centered ? "px-0" : "px-3.5"}`}>
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSend(); }
            }}
            placeholder={centered ? "كيف أقدر أساعدك اليوم؟" : "اكتب أو تكلم..."}
            rows={1}
            className={`flex-1 outline-none transition-all resize-none overflow-y-auto ${centered ? "rounded-2xl px-5 py-4 text-base" : "rounded-[25px] px-4 py-3 text-sm"}`}
            style={{
              background: centered ? "white" : "#F1F5F9",
              border: centered ? "1px solid #E2E8F0" : "none",
              fontFamily: "Tajawal, sans-serif",
              color: "#0A2342",
              minHeight: centered ? 56 : 50,
              maxHeight: 120,
              boxShadow: centered ? "0 4px 20px rgba(10,35,66,0.08)" : "none",
            }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, 120) + 'px';
            }}
            onFocus={(e) => {
              e.currentTarget.style.background = "white";
              e.currentTarget.style.boxShadow = centered ? "0 4px 24px rgba(10,35,66,0.12), 0 0 0 2px #0A2342" : "0 0 0 2px #0A2342";
            }}
            onBlur={(e) => {
              e.currentTarget.style.background = centered ? "white" : "#F1F5F9";
              e.currentTarget.style.boxShadow = centered ? "0 4px 20px rgba(10,35,66,0.08)" : "none";
            }}
          />

          {hasText ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleTextSend}
                  disabled={sending}
                  className="rounded-full flex items-center justify-center active:scale-95 transition-all disabled:opacity-40"
                  style={{ width: 48, height: 48, minWidth: 48, minHeight: 48, flexShrink: 0, padding: 0, border: "none", background: "linear-gradient(135deg, #0A2342, #006D8F)", boxShadow: "0 4px 12px rgba(10,35,66,0.35)", boxSizing: "border-box" }}
                >
                  <ArrowUp className="h-5 w-5 text-white" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top"><p>إرسال الرسالة</p></TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onTouchStart={startVoiceInput}
                  onMouseDown={(e) => { e.preventDefault(); startVoiceInput(); }}
                  className="rounded-full flex items-center justify-center active:scale-95 transition-all"
                  style={{ width: 48, height: 48, minWidth: 48, minHeight: 48, flexShrink: 0, padding: 0, border: "none", background: "linear-gradient(135deg, #0A2342, #006D8F)", boxShadow: "0 4px 12px rgba(10,35,66,0.35)", boxSizing: "border-box" }}
                  aria-label="تسجيل صوتي"
                >
                  <Mic className="h-6 w-6 text-white" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top"><p>تسجيل صوتي</p></TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </>
  );
};

export default CleanInputDock;
