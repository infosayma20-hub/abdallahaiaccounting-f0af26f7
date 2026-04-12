import { useState, useRef, useCallback } from "react";
import { ArrowUp, AtSign } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import WhatsAppVoiceRecorder from "./WhatsAppVoiceRecorder";

interface Props {
  onSend: (text: string, isVoice?: boolean) => void;
  sending: boolean;
  quickChips: string[];
  userId?: string;
}

const MobileInputDock = ({ onSend, sending, quickChips }: Props) => {
  const [inputValue, setInputValue] = useState("");
  const [isRecordingActive, setIsRecordingActive] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasText = inputValue.trim().length > 0;

  const handleTextSend = () => {
    if (!hasText || sending) return;
    onSend(inputValue.trim());
    setInputValue("");
  };

  const handleVoiceTranscription = useCallback((text: string) => {
    setIsRecordingActive(false);
    onSend(text, true);
  }, [onSend]);

  return (
    <div className="finix-dock">
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
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTextSend(); } }}
            placeholder="اكتب أو اضغط 🎤 للتحدث..."
            rows={1}
            className="w-full h-[52px] rounded-[26px] px-4 pr-12 text-[14px] resize-none bg-muted/50 border-2 border-border focus:border-foreground focus:bg-white focus:shadow-sm outline-none transition-all"
            style={{
              fontFamily: "Tajawal, sans-serif",
              color: "hsl(var(--foreground))",
              paddingTop: "14px",
              fontSize: "16px", // prevent iOS zoom
            }}
          />
          {/* @ button inside */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ color: "hsl(var(--accent))" }}
              >
                <AtSign className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>ذكر جهة أو حساب</p></TooltipContent>
          </Tooltip>
        </div>

        {/* Voice / Send button */}
        {hasText ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleTextSend}
                disabled={sending}
                className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 active:scale-95 transition-all disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--finix-navy-dark)))", boxShadow: "0 4px 14px rgba(13,27,42,0.4)" }}
              >
                <ArrowUp className="h-5 w-5 text-white" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>إرسال الرسالة</p></TooltipContent>
          </Tooltip>
        ) : (
          <WhatsAppVoiceRecorder
            onTranscription={handleVoiceTranscription}
            disabled={sending}
          />
        )}
      </div>
    </div>
  );
};

export default MobileInputDock;
