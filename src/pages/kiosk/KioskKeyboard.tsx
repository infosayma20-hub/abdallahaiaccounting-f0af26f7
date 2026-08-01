import { Delete, CornerDownLeft, Globe, ArrowUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const AR_ROWS = [
  ["ض","ص","ث","ق","ف","غ","ع","ه","خ","ح","ج","د"],
  ["ش","س","ي","ب","ل","ا","ت","ن","م","ك","ط"],
  ["ئ","ء","ؤ","ر","لا","ى","ة","و","ز","ظ"],
];
const EN_ROWS = [
  ["q","w","e","r","t","y","u","i","o","p"],
  ["a","s","d","f","g","h","j","k","l"],
  ["z","x","c","v","b","n","m"],
];
const NUM_ROWS = [["1","2","3"],["4","5","6"],["7","8","9"],["0"]];

interface Props {
  mode?: "text" | "numeric";
  value: string;
  onChange: (v: string) => void;
  onDone?: () => void;
  primaryColor?: string;
}

export default function KioskKeyboard({ mode = "text", value, onChange, onDone, primaryColor = "#E53935" }: Props) {
  const [layout, setLayout] = useState<"ar" | "en">("ar");
  const [caps, setCaps] = useState(false);

  const press = (k: string) => onChange(value + (layout === "en" && caps ? k.toUpperCase() : k));
  const back = () => onChange(value.slice(0, -1));

  const keyCls = "h-14 min-w-[3rem] flex-1 rounded-xl bg-white border border-slate-200 shadow-sm text-xl font-bold text-slate-800 active:scale-95 transition select-none";

  if (mode === "numeric") {
    return (
      <div className="bg-slate-100 border-t border-slate-200 p-3">
        <div className="mx-auto grid max-w-xs grid-cols-3 gap-2">
          {["1","2","3","4","5","6","7","8","9"].map(k => (
            <button key={k} type="button" onClick={() => press(k)} className={cn(keyCls, "h-16 text-2xl")}>{k}</button>
          ))}
          <button type="button" onClick={back} className={cn(keyCls, "h-16 flex items-center justify-center")}><Delete className="h-6 w-6" /></button>
          <button type="button" onClick={() => press("0")} className={cn(keyCls, "h-16 text-2xl")}>0</button>
          <button type="button" onClick={onDone} className="h-16 rounded-xl text-white text-xl font-black active:scale-95" style={{ background: primaryColor }}>
            <CornerDownLeft className="h-6 w-6 mx-auto" />
          </button>
        </div>
      </div>
    );
  }

  const rows = layout === "ar" ? AR_ROWS : EN_ROWS;

  return (
    <div className="bg-slate-100 border-t border-slate-200 p-3 space-y-2" dir="ltr">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-1.5 justify-center">
          {row.map(k => (
            <button key={k} type="button" onClick={() => press(k)} className={keyCls}>
              {layout === "en" && caps ? k.toUpperCase() : k}
            </button>
          ))}
        </div>
      ))}
      <div className="flex gap-1.5 justify-center">
        <button type="button" onClick={() => setLayout(layout === "ar" ? "en" : "ar")} className={cn(keyCls, "max-w-[6rem] flex items-center justify-center gap-1 text-base")}>
          <Globe className="h-5 w-5" /> {layout === "ar" ? "EN" : "ع"}
        </button>
        {layout === "en" && (
          <button type="button" onClick={() => setCaps(c => !c)} className={cn(keyCls, "max-w-[5rem] flex items-center justify-center", caps && "bg-slate-800 text-white")}>
            <ArrowUp className="h-5 w-5" />
          </button>
        )}
        <button type="button" onClick={() => press(" ")} className={cn(keyCls, "max-w-[16rem]")}>———</button>
        <button type="button" onClick={back} className={cn(keyCls, "max-w-[6rem] flex items-center justify-center")}><Delete className="h-6 w-6" /></button>
        <button type="button" onClick={onDone} className="h-14 min-w-[5rem] rounded-xl text-white font-black active:scale-95 flex items-center justify-center" style={{ background: primaryColor }}>
          <CornerDownLeft className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
