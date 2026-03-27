import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Rocket, Sparkles } from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";

// Simple confetti particles
const Confetti = () => {
  const colors = ["#4A9EE8", "#E8D5A3", "#1B3A5C", "#16A34A", "#7C3AED", "#006D8F"];
  const particles = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 1.5,
    duration: 2 + Math.random() * 2,
    color: colors[i % colors.length],
    size: 4 + Math.random() * 6,
    rotation: Math.random() * 360,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-sm"
          style={{
            width: p.size,
            height: p.size,
            background: p.color,
            left: `${p.x}%`,
            top: "-10px",
          }}
          initial={{ y: -20, opacity: 1, rotate: 0 }}
          animate={{
            y: ["-10px", "110vh"],
            opacity: [1, 1, 0],
            rotate: [0, p.rotation + 360],
            x: [0, (Math.random() - 0.5) * 80],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: "easeIn",
          }}
        />
      ))}
    </div>
  );
};

const STATS = [
  { target: 12, suffix: "", label: "أداة متصلة", emoji: "🔗" },
  { target: 100, suffix: "%", label: "دقة محاسبية", emoji: "✅" },
  { target: 5, suffix: "", label: "ثوانٍ لكل عملية", emoji: "⚡" },
];

interface Props {
  onComplete: () => void;
  onBack: () => void;
}

const OnboardingStep3 = ({ onComplete, onBack }: Props) => {
  const [showConfetti, setShowConfetti] = useState(true);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    setAnimate(true);
    const timer = setTimeout(() => setShowConfetti(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[70vh] px-6 py-10 bg-white relative">
      {showConfetti && <Confetti />}

      {/* Big Icon */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
        className="text-[80px] mb-4"
      >
        🚀
      </motion.div>

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="text-2xl font-extrabold text-slate-900 mb-2"
        style={{ fontFamily: "Tajawal, sans-serif" }}
      >
        أنت جاهز! 🎉
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="text-sm text-slate-500 text-center max-w-xs mb-8 leading-relaxed"
      >
        المحاسب الذكي يعرف الآن كل شيء
        <br />
        عن شركتك ومستعد للعمل
      </motion.p>

      {/* Stats with counter animation */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
        className="flex gap-4 mb-10 w-full max-w-sm"
      >
        {STATS.map((stat, i) => (
          <StatCard key={i} {...stat} delay={1 + i * 0.2} animate={animate} />
        ))}
      </motion.div>

      {/* CTA */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.6 }}
        onClick={onComplete}
        className="w-full max-w-sm py-4 rounded-2xl text-base font-bold transition-all hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-2 mb-4"
        style={{
          background: "linear-gradient(135deg, #1B3A5C, #2A5580)",
          color: "#fff",
          boxShadow: "0 8px 32px rgba(27,58,92,0.25)",
        }}
      >
        <Rocket className="h-5 w-5" />
        ابدأ الاستخدام
      </motion.button>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8 }}
        onClick={onBack}
        className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
      >
        ← العودة للخلف
      </motion.button>
    </div>
  );
};

const StatCard = ({
  target,
  suffix,
  label,
  emoji,
  delay,
  animate,
}: {
  target: number;
  suffix: string;
  label: string;
  emoji: string;
  delay: number;
  animate: boolean;
}) => {
  const value = useCountUp(target, 1500, animate);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 200 }}
      className="flex-1 text-center py-4 px-2 rounded-2xl bg-slate-50 border border-slate-200"
    >
      <div className="text-lg mb-1">{emoji}</div>
      <div className="text-2xl font-extrabold text-slate-900" style={{ fontFamily: "Tajawal, sans-serif" }}>
        {value}{suffix}
      </div>
      <div className="text-[10px] text-slate-500 mt-1">{label}</div>
    </motion.div>
  );
};

export default OnboardingStep3;
