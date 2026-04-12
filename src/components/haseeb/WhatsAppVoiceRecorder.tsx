import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, X, Check, Lock } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onTranscription: (text: string) => void;
  disabled?: boolean;
}

type RecordingState = "idle" | "recording" | "locked" | "processing";

const SWIPE_LEFT_THRESHOLD = 60;
const SWIPE_UP_THRESHOLD = 80;
const MAX_DURATION = 120;

export default function WhatsAppVoiceRecorder({ onTranscription, disabled }: Props) {
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [waveformBars, setWaveformBars] = useState<number[]>(new Array(18).fill(4));
  const [swipeOffset, setSwipeOffset] = useState({ x: 0, y: 0 });
  const [showCancelHint, setShowCancelHint] = useState(false);
  const [showLockHint, setShowLockHint] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const stateRef = useRef<RecordingState>("idle");
  const recognitionRef = useRef<any>(null);

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    return () => { cleanup(); };
  }, []);

  useEffect(() => {
    if (duration >= MAX_DURATION && (state === "recording" || state === "locked")) {
      toast.info("تم إرسال التسجيل تلقائياً (الحد الأقصى دقيقتان)");
      finishAndSend();
    }
  }, [duration, state]);

  const vibrate = (pattern: number | number[]) => {
    if ("vibrate" in navigator) navigator.vibrate(pattern);
  };

  const cleanup = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    mediaRecorderRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
  };

  const startWaveformVisualization = (stream: MediaStream) => {
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    audioCtxRef.current = audioCtx;
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      analyser.getByteFrequencyData(dataArray);
      const bars: number[] = [];
      const bandSize = Math.floor(dataArray.length / 18);
      for (let i = 0; i < 18; i++) {
        let sum = 0;
        for (let j = 0; j < bandSize; j++) {
          sum += dataArray[i * bandSize + j];
        }
        const avg = sum / bandSize;
        bars.push(Math.max(4, Math.min(28, (avg / 255) * 32)));
      }
      setWaveformBars(bars);
      animFrameRef.current = requestAnimationFrame(draw);
    };
    draw();
  };

  const startRecording = useCallback(async () => {
    if (disabled) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      streamRef.current = stream;

      startWaveformVisualization(stream);

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "audio/ogg";

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(250);
      mediaRecorderRef.current = recorder;

      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        const recognition = new SR();
        recognition.lang = "ar";
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognitionRef.current = recognition;

        recognition.onresult = (e: any) => {
          let fullText = "";
          for (let i = 0; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
              fullText += e.results[i][0].transcript + " ";
            }
          }
          if (fullText.trim()) {
            recognitionRef.current._lastTranscript = fullText.trim();
          }
        };
        recognition.onerror = () => {};
        recognition.onend = () => {
          if (stateRef.current === "recording" || stateRef.current === "locked") {
            try { recognition.start(); } catch {}
          }
        };
        try { recognition.start(); } catch {}
      }

      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

      vibrate(50);
      setState("recording");
    } catch (err: any) {
      if (err?.name === "NotAllowedError") {
        toast.error("يرجى السماح بالوصول للميكروفون في إعدادات المتصفح");
      } else if (err?.name === "NotFoundError") {
        toast.error("لم يتم العثور على ميكروفون");
      } else {
        toast.error("تعذّر الوصول للميكروفون");
      }
    }
  }, [disabled]);

  const cancelRecording = useCallback(() => {
    vibrate([100]);
    cleanup();
    setWaveformBars(new Array(18).fill(4));
    setDuration(0);
    setSwipeOffset({ x: 0, y: 0 });
    setShowCancelHint(false);
    setShowLockHint(false);
    setState("idle");
  }, []);

  const finishAndSend = useCallback(() => {
    vibrate(40);
    const recorder = mediaRecorderRef.current;
    const transcript = recognitionRef.current?._lastTranscript;

    if (transcript) {
      cleanup();
      setWaveformBars(new Array(18).fill(4));
      setDuration(0);
      setSwipeOffset({ x: 0, y: 0 });
      setState("processing");

      setTimeout(() => {
        setState("idle");
        onTranscription(transcript);
      }, 400);
      return;
    }

    if (recorder && recorder.state !== "inactive") {
      setState("processing");
      recorder.onstop = () => {
        const finalTranscript = recognitionRef.current?._lastTranscript;
        cleanup();
        setWaveformBars(new Array(18).fill(4));
        setDuration(0);
        setSwipeOffset({ x: 0, y: 0 });

        if (finalTranscript) {
          setTimeout(() => {
            setState("idle");
            onTranscription(finalTranscript);
          }, 400);
        } else {
          toast.error("لم يتم التقاط أي كلام — حاول مرة ثانية");
          setState("idle");
        }
      };
      recorder.stop();
    } else {
      cleanup();
      setWaveformBars(new Array(18).fill(4));
      setDuration(0);
      setState("idle");
      toast.error("لم يتم التقاط أي كلام — حاول مرة ثانية");
    }
  }, [onTranscription]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startPosRef.current = { x: e.clientX, y: e.clientY };
    startRecording();
  }, [startRecording]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (stateRef.current !== "recording") return;
    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;
    setSwipeOffset({ x: dx, y: dy });

    setShowCancelHint(dx < -20);
    setShowLockHint(dy < -20);

    if (dx < -SWIPE_LEFT_THRESHOLD) {
      cancelRecording();
      return;
    }

    if (dy < -SWIPE_UP_THRESHOLD) {
      vibrate([30, 30, 30]);
      setState("locked");
      setSwipeOffset({ x: 0, y: 0 });
      setShowCancelHint(false);
      setShowLockHint(false);
    }
  }, [cancelRecording]);

  const handlePointerUp = useCallback(() => {
    if (stateRef.current === "recording") {
      finishAndSend();
    }
    setSwipeOffset({ x: 0, y: 0 });
    setShowCancelHint(false);
    setShowLockHint(false);
  }, [finishAndSend]);

  useEffect(() => {
    if (state === "recording" || state === "locked") {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    } else {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    };
  }, [state]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const cancelOpacity = Math.min(1, Math.abs(Math.min(0, swipeOffset.x)) / SWIPE_LEFT_THRESHOLD);
  const lockOpacity = Math.min(1, Math.abs(Math.min(0, swipeOffset.y)) / SWIPE_UP_THRESHOLD);

  if (state === "idle") {
    return (
      <button
        onPointerDown={handlePointerDown}
        disabled={disabled}
        className="voice-rec-mic-idle"
        style={{ touchAction: "none" }}
        aria-label="اضغط مع الاستمرار للتسجيل"
      >
        <Mic className="h-[22px] w-[22px] text-white" />
      </button>
    );
  }

  if (state === "processing") {
    return (
      <div className="voice-rec-bar voice-rec-processing">
        <div className="flex items-center justify-center gap-2 w-full">
          <div className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-white/80">جاري تحليل التسجيل...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="voice-rec-bar voice-rec-active" style={{ direction: "rtl" }}>
      {state === "recording" && (
        <>
          {showCancelHint && (
            <div
              className="voice-rec-swipe-hint voice-rec-cancel-hint"
              style={{ opacity: cancelOpacity }}
            >
              <X className="h-4 w-4" /> إلغاء
            </div>
          )}
          {showLockHint && (
            <div
              className="voice-rec-swipe-hint voice-rec-lock-hint"
              style={{ opacity: lockOpacity }}
            >
              <Lock className="h-3.5 w-3.5" /> تثبيت
            </div>
          )}
        </>
      )}

      <div className="flex items-center gap-2 w-full px-3 py-2">
        <div className="voice-rec-dot" />
        <span className="voice-rec-timer" style={{ color: duration >= 110 ? "#EF4444" : "white" }}>
          {formatTime(duration)}
        </span>
        <div className="flex items-center gap-[3px] flex-1 justify-center h-7">
          {waveformBars.map((h, i) => (
            <div key={i} className="voice-rec-wave-bar" style={{ height: `${h}px` }} />
          ))}
        </div>
        {state === "recording" ? (
          <span className="text-[10px] text-white/50 whitespace-nowrap">← سحب للإلغاء</span>
        ) : (
          <div className="flex items-center gap-1 text-white/70">
            <Lock className="h-3 w-3" />
            <span className="text-[10px]">مثبّت</span>
          </div>
        )}
      </div>

      {state === "locked" && (
        <div className="flex items-center justify-between w-full px-4 pb-2">
          <button onClick={cancelRecording} className="voice-rec-action-btn voice-rec-cancel-btn">
            <X className="h-4 w-4" />
            <span>إلغاء</span>
          </button>
          <button onClick={finishAndSend} className="voice-rec-action-btn voice-rec-send-btn">
            <Check className="h-4 w-4" />
            <span>إرسال</span>
          </button>
        </div>
      )}
    </div>
  );
}
