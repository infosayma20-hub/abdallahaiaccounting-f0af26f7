import { useState, useCallback, useEffect } from "react";
import { Calculator } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const BUTTONS = [
  ["C", "±", "%", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "−"],
  ["1", "2", "3", "+"],
  ["00", "0", ".", "="],
];

const KEY_MAP: Record<string, string> = {
  "0": "0", "1": "1", "2": "2", "3": "3", "4": "4",
  "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
  ".": ".", "+": "+", "-": "−", "*": "×", "/": "÷",
  "Enter": "=", "=": "=", "Escape": "C", "Backspace": "C",
  "%": "%",
};

const QuickCalculator = () => {
  const tt = useTT();
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState("0");
  const [prev, setPrev] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [resetNext, setResetNext] = useState(false);

  const calculate = useCallback((a: number, b: number, operator: string): number => {
    switch (operator) {
      case "+": return a + b;
      case "−": return a - b;
      case "×": return a * b;
      case "÷": return b !== 0 ? a / b : 0;
      default: return b;
    }
  }, []);

  const handlePress = useCallback((btn: string) => {
    if (btn >= "0" && btn <= "9" || btn === "00") {
      setDisplay(d => {
        if (resetNext || d === "0") { setResetNext(false); return btn === "00" ? "0" : btn; }
        if (d.replace(/[^0-9]/g, "").length >= 15) return d;
        return d + btn;
      });
      return;
    }

    if (btn === ".") {
      setDisplay(d => {
        if (resetNext) { setResetNext(false); return "0."; }
        return d.includes(".") ? d : d + ".";
      });
      return;
    }

    if (btn === "C") {
      setDisplay("0"); setPrev(null); setOp(null); setResetNext(false);
      return;
    }

    if (btn === "±") {
      setDisplay(d => d === "0" ? d : d.startsWith("-") ? d.slice(1) : "-" + d);
      return;
    }

    if (btn === "%") {
      setDisplay(d => String(parseFloat(d) / 100));
      return;
    }

    if (["+", "−", "×", "÷"].includes(btn)) {
      const current = parseFloat(display);
      if (prev !== null && op && !resetNext) {
        const result = calculate(prev, current, op);
        setDisplay(String(Math.round(result * 1e10) / 1e10));
        setPrev(result);
      } else {
        setPrev(current);
      }
      setOp(btn);
      setResetNext(true);
      return;
    }

    if (btn === "=") {
      if (prev !== null && op) {
        const current = parseFloat(display);
        const result = calculate(prev, current, op);
        setDisplay(String(Math.round(result * 1e10) / 1e10));
        setPrev(null);
        setOp(null);
        setResetNext(true);
      }
    }
  }, [display, prev, op, resetNext, calculate]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const mapped = KEY_MAP[e.key];
      if (mapped) { e.preventDefault(); handlePress(mapped); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, handlePress]);

  const isOp = (btn: string) => ["+", "−", "×", "÷"].includes(btn);
  const isActiveOp = (btn: string) => op === btn && resetNext;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={cn(
          "relative w-9 h-9 rounded-lg flex items-center justify-center",
          "text-muted-foreground hover:text-foreground hover:bg-secondary",
          "transition-all duration-150 cursor-pointer",
          open && "bg-secondary text-foreground"
        )}>
          <Calculator className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[260px] p-3 rounded-xl" dir="ltr">
        {/* Display */}
        <div className="bg-secondary rounded-lg px-3 py-2.5 mb-2 min-h-[52px] flex flex-col justify-end items-end">
          {op && prev !== null && (
            <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
              {prev} {op}
            </span>
          )}
          <span
            className="text-xl font-bold text-foreground font-mono tabular-nums leading-tight"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            {display.length > 12 ? parseFloat(display).toExponential(6) : display}
          </span>
        </div>

        {/* Buttons */}
        <div className="grid grid-cols-4 gap-1">
          {BUTTONS.flat().map((btn, i) => (
            <button
              key={i}
              onClick={() => handlePress(btn)}
              className={cn(
                "h-10 rounded-lg text-sm font-semibold transition-all duration-100 active:scale-95",
                btn === "=" 
                  ? "bg-accent text-accent-foreground hover:opacity-90"
                  : btn === "C"
                  ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                  : isOp(btn)
                  ? isActiveOp(btn)
                    ? "bg-accent/20 text-accent ring-1 ring-accent/40"
                    : "bg-primary/10 text-primary hover:bg-primary/20"
                  : "bg-secondary hover:bg-secondary/80 text-foreground"
              )}
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              {btn}
            </button>
          ))}
        </div>

        <p className="text-[9px] text-muted-foreground text-center mt-2">{tt("آلة حاسبة سريعة")}</p>
      </PopoverContent>
    </Popover>
  );
};

export default QuickCalculator;
