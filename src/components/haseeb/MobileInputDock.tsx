import { useState, useRef, useCallback, useEffect } from "react";
import { Send, Mic, X, Square, AtSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type DockState = "idle" | "recording" | "processing";

interface Props {
  onSend: (text: string, isVoice?: boolean) => void;
  sending: boolean;
  quickChips: string[];
  userId?: string;
}

const MobileInputDock = ({ onSend, sending, quickChips, userId }: Props) => {
  const { toast } = useToast();
  const [state, setState] = useState<DockState>("idle");
  const [inputValue, setInputValue] = useState("");
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(40).fill(2));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasText = inputValue.trim().length > 0;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecordingCleanup();
    };
  }, []);

  const stopRecordingCleanup = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    mediaRecorderRef.current = null;
    streamRef.current = null;
    analyserRef.current = null;
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      streamRef.current = stream;

      // Web Audio API for visualization
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Start visualization
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const visualize = () => {
        analyser.getByteTimeDomainData(dataArray);
        const levels: number[] = [];
        const step = Math.floor(dataArray.length / 40);
        for (let i = 0; i < 40; i++) {
          const val = dataArray[i * step] || 128;
          levels.push(Math.max(2, ((val - 128) / 128) * 48 + 2));
        }
        setAudioLevels(levels);
        animFrameRef.current = requestAnimationFrame(visualize);
      };
      visualize();

      // MediaRecorder
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm'
      });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start();
      mediaRecorderRef.current = recorder;

      // Timer
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 29) {
            stopAndSend();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

      if (navigator.vibrate) navigator.vibrate(30);
      setState("recording");
    } catch (err) {
      toast({ title: "لم يتم السماح بالميكروفون", description: "يرجى السماح للميكروفون للتسجيل الصوتي" });
    }
  }, [toast]);

  const stopAndSend = useCallback(() => {
    if (!mediaRecorderRef.current) return;

    setState("processing");
    const recorder = mediaRecorderRef.current;

    recorder.onstop = async () => {
      stopRecordingCleanup();
      setAudioLevels(new Array(40).fill(2));

      // Use Web Speech API for transcription
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) {
        toast({ title: "المتصفح لا يدعم التحويل الصوتي" });
        setState("idle");
        return;
      }

      // Since MediaRecorder already captured, we fallback to text input
      // In production, send audio blob to backend for Whisper transcription
      setState("idle");
    };

    recorder.stop();
  }, [toast]);

  const cancelRecording = useCallback(() => {
    stopRecordingCleanup();
    setAudioLevels(new Array(40).fill(2));
    setRecordingTime(0);
    setState("idle");
  }, []);

  // Use SpeechRecognition for real-time voice
  const startVoiceInput = useCallback(async () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast({ title: "المتصفح لا يدعم التسجيل الصوتي" });
      return;
    }

    try {
      // Also start actual recording for waveform
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      streamRef.current = stream;

      // Visualization
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

      // Timer
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

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

        // Brief processing state then send
        setTimeout(() => {
          setState("idle");
          onSend(text, true);
        }, 500);
      };
      recognition.onerror = () => {
        stopRecordingCleanup();
        setAudioLevels(new Array(40).fill(2));
        setRecordingTime(0);
        setState("idle");
      };
      recognition.onend = () => {
        if (state === "recording") {
          stopRecordingCleanup();
          setAudioLevels(new Array(40).fill(2));
          setRecordingTime(0);
          setState("idle");
        }
      };
      recognition.start();
    } catch {
      toast({ title: "لم يتم السماح بالميكروفون" });
    }
  }, [onSend, toast, state]);

  const handleTextSend = () => {
    if (!hasText || sending) return;
    onSend(inputValue.trim());
    setInputValue("");
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // RECORDING STATE
  if (state === "recording") {
    return (
      <div className="zidni-dock zidni-dock-recording">
        {/* Waveform */}
        <div className="flex items-center justify-center gap-[2px] h-14 w-full px-4">
          {audioLevels.map((level, i) => (
            <div
              key={i}
              className="w-[3px] rounded-full transition-all duration-75"
              style={{
                height: `${level}px`,
                background: `linear-gradient(to top, hsl(var(--zidni-teal-dark)), hsl(var(--accent)), hsl(var(--zidni-gold)))`,
                opacity: 0.8 + (level / 48) * 0.2,
              }}
            />
          ))}
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between px-4 pb-2">
          <button onClick={cancelRecording} className="flex items-center gap-1.5 h-11 px-4 text-white/60 text-sm">
            <X className="h-4 w-4" />
            إلغاء
          </button>

          <div className="flex items-center gap-2">
            <span className="zidni-rec-dot" />
            <span className="text-[13px] text-white/80">جاري التسجيل...</span>
          </div>

          <span
            className="text-lg font-semibold text-white"
            style={{ fontFamily: "JetBrains Mono, monospace", color: recordingTime >= 25 ? "hsl(var(--warning))" : "white" }}
          >
            {formatTime(recordingTime)}
          </span>
        </div>
      </div>
    );
  }

  // PROCESSING STATE
  if (state === "processing") {
    return (
      <div className="zidni-dock">
        <div className="zidni-shimmer-bar" />
        <div className="flex items-center justify-center gap-2 py-4">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "hsl(var(--accent))", borderTopColor: "transparent" }} />
          <span className="text-[13px] text-muted-foreground">🤖 يحلل كلامك...</span>
        </div>
      </div>
    );
  }

  // IDLE STATE (default)
  return (
    <div className="zidni-dock">
      {/* Quick chips strip */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-3.5 pt-3 pb-2">
        {quickChips.map(chip => (
          <button
            key={chip}
            onClick={() => setInputValue(chip)}
            className="flex-shrink-0 h-[34px] px-3.5 rounded-full text-[13px] active:scale-95 transition-transform"
            style={{
              background: "hsl(var(--info) / 0.06)",
              border: "1px solid hsl(var(--info) / 0.2)",
              color: "hsl(195 100% 28%)",
              fontFamily: "Tajawal, sans-serif",
            }}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Main input row */}
      <div className="flex items-center gap-2.5 px-3.5 pb-3">
        {/* Text input */}
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSend(); } }}
            placeholder="اكتب أو اضغط 🎤 للتحدث..."
            rows={1}
            className="w-full h-[52px] rounded-[26px] px-4 pr-12 text-[14px] resize-none bg-muted/50 border-2 border-border focus:border-foreground focus:bg-white focus:shadow-sm outline-none transition-all"
            style={{
              fontFamily: "Tajawal, sans-serif",
              color: "hsl(var(--foreground))",
              paddingTop: "14px",
            }}
          />
          {/* @ button inside */}
          <button
            className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ color: "hsl(var(--accent))" }}
          >
            <AtSign className="h-4 w-4" />
          </button>
        </div>

        {/* Voice / Send button */}
        {hasText ? (
          <button
            onClick={handleTextSend}
            disabled={sending}
            className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 active:scale-95 transition-all disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--zidni-teal-dark)))", boxShadow: "0 4px 14px rgba(10,35,66,0.4)" }}
          >
            <Send className="h-5 w-5 text-white" style={{ transform: "scaleX(-1)" }} />
          </button>
        ) : (
          <button
            onTouchStart={startVoiceInput}
            onMouseDown={startVoiceInput}
            className="zidni-mic-btn"
            aria-label="تسجيل صوتي"
          >
            <Mic className="h-6 w-6 text-white" />
          </button>
        )}
      </div>
    </div>
  );
};

export default MobileInputDock;
