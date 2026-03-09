import { useState, useRef, useCallback, useEffect } from "react";
import { Send, Mic, X, Square, AtSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CommandsSheet from "./CommandsSheet";

type DockState = "idle" | "recording" | "processing";

interface Props {
  onSend: (text: string, isVoice?: boolean) => void;
  sending: boolean;
}

const QUICK_CHIPS = ["قبضت من @", "دفعت إيجار", "بعت لـ@", "+ المزيد"];

const CleanInputDock = ({ onSend, sending }: Props) => {
  const { toast } = useToast();
  const [state, setState] = useState<DockState>("idle");
  const [inputValue, setInputValue] = useState("");
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(40).fill(2));
  const [showCommands, setShowCommands] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasText = inputValue.trim().length > 0;

  useEffect(() => {
    return () => stopRecordingCleanup();
  }, []);

  const stopRecordingCleanup = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
  };

  const startVoiceInput = useCallback(async () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast({ title: "المتصفح لا يدعم التسجيل الصوتي" }); return; }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const visualize = () => {
        analyser.getByteTimeDomainData(dataArray);
        const levels: number[] = [];
        const step = Math.floor(dataArray.length / 40);
        for (let i = 0; i < 40; i++) {
          const val = dataArray[i * step] || 128;
          levels.push(Math.max(2, Math.abs(val - 128) / 128 * 48 + 2));
        }
        setAudioLevels(levels);
        animFrameRef.current = requestAnimationFrame(visualize);
      };
      visualize();

      if (navigator.vibrate) navigator.vibrate(30);
      setState("recording");
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);

      const recognition = new SR();
      recognition.lang = "ar-SA";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = (e: any) => {
        const text = e.results[0][0].transcript;
        stopRecordingCleanup();
        setAudioLevels(new Array(40).fill(2));
        setRecordingTime(0);
        setState("processing");
        setTimeout(() => { setState("idle"); onSend(text, true); }, 500);
      };
      recognition.onerror = () => { stopRecordingCleanup(); setAudioLevels(new Array(40).fill(2)); setRecordingTime(0); setState("idle"); };
      recognition.onend = () => {
        stopRecordingCleanup();
        setAudioLevels(new Array(40).fill(2));
        setRecordingTime(0);
        if (state === "recording") setState("idle");
      };
      recognition.start();
    } catch {
      toast({ title: "لم يتم السماح بالميكروفون" });
    }
  }, [onSend, toast, state]);

  const cancelRecording = useCallback(() => {
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

  const handleChipClick = (chip: string) => {
    if (chip === "+ المزيد") {
      setShowCommands(true);
    } else {
      setInputValue(chip);
      inputRef.current?.focus();
    }
  };

  const handleCommandSelect = (text: string) => {
    setShowCommands(false);
    onSend(text);
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // RECORDING STATE
  if (state === "recording") {
    return (
      <div className="flex-shrink-0" style={{ background: "#050F1E", borderTop: "1px solid rgba(0,180,216,0.2)", paddingBottom: "max(14px, env(safe-area-inset-bottom, 14px))" }}>
        <div className="flex items-center justify-center gap-[2px] h-14 w-full px-4">
          {audioLevels.map((level, i) => (
            <div key={i} className="w-[3px] rounded-full transition-all duration-75"
              style={{ height: `${level}px`, background: "linear-gradient(to top, #006D8F, #00B4D8, #C9A84C)", opacity: 0.8 + (level / 48) * 0.2 }} />
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
          <div className="h-full animate-pulse" style={{ background: "linear-gradient(90deg, transparent, #00B4D8, #C9A84C, transparent)", backgroundSize: "200% 100%" }} />
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
      <div className="flex-shrink-0 bg-white border-t border-[#F1F5F9]" style={{ paddingBottom: "max(14px, env(safe-area-inset-bottom, 14px))" }}>
        {/* Quick chips — 4 only, no headers */}
        <div className="flex gap-2 overflow-x-auto px-3.5 pt-3 pb-2.5" style={{ scrollbarWidth: "none" }}>
          {QUICK_CHIPS.map(chip => (
            <button
              key={chip}
              onClick={() => handleChipClick(chip)}
              className="flex-shrink-0 h-[34px] px-3.5 rounded-[17px] text-[13px] active:scale-95 transition-transform"
              style={{
                background: chip === "+ المزيد" ? "#0A2342" : "#F1F5F9",
                color: chip === "+ المزيد" ? "white" : "#0A2342",
                fontFamily: "Tajawal, sans-serif",
                border: "none",
              }}
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Input row */}
        <div className="flex items-center gap-2.5 px-3.5">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleTextSend(); } }}
            placeholder="اكتب أو تكلم..."
            className="flex-1 h-[50px] rounded-[25px] px-4 text-sm outline-none transition-all"
            style={{
              background: "#F1F5F9", border: "none", fontFamily: "Tajawal, sans-serif", color: "#0A2342",
            }}
            onFocus={(e) => { e.currentTarget.style.background = "white"; e.currentTarget.style.boxShadow = "0 0 0 2px #0A2342"; }}
            onBlur={(e) => { e.currentTarget.style.background = "#F1F5F9"; e.currentTarget.style.boxShadow = "none"; }}
          />

          {hasText ? (
            <button
              onClick={handleTextSend}
              disabled={sending}
              className="w-[54px] h-[54px] rounded-full flex items-center justify-center flex-shrink-0 active:scale-95 transition-all disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #0A2342, #006D8F)", boxShadow: "0 4px 12px rgba(10,35,66,0.35)" }}
            >
              <Send className="h-5 w-5 text-white rotate-180" />
            </button>
          ) : (
            <button
              onTouchStart={startVoiceInput}
              onMouseDown={(e) => { e.preventDefault(); startVoiceInput(); }}
              className="w-[54px] h-[54px] rounded-full flex items-center justify-center flex-shrink-0 active:scale-95 transition-all"
              style={{ background: "linear-gradient(135deg, #0A2342, #006D8F)", boxShadow: "0 4px 12px rgba(10,35,66,0.35)" }}
              aria-label="تسجيل صوتي"
            >
              <Mic className="h-6 w-6 text-white" />
            </button>
          )}
        </div>
      </div>

      <CommandsSheet open={showCommands} onClose={() => setShowCommands(false)} onSelect={handleCommandSelect} />
    </>
  );
};

export default CleanInputDock;
