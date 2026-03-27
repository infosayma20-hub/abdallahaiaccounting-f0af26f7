import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Rocket, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WelcomeModalProps {
  open: boolean;
  onStartTour: () => void;
  onSkip: () => void;
}

const WelcomeModal = ({ open, onStartTour, onSkip }: WelcomeModalProps) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          dir="rtl"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onSkip} />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="relative z-10 w-full max-w-md rounded-2xl border border-border/50 bg-card p-8 shadow-2xl"
          >
            <button onClick={onSkip} className="absolute left-4 top-4 text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-5 w-5" />
            </button>

            {/* Animated Icon */}
            <div className="flex justify-center mb-6">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                className="relative"
              >
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                  <Sparkles className="h-12 w-12 text-primary" />
                </div>
                <motion.div
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary"
                />
              </motion.div>
            </div>

            {/* Content */}
            <h2 className="text-2xl font-bold text-foreground text-center mb-2">
              🎉 أهلاً بك في أموالي
            </h2>
            <p className="text-muted-foreground text-center text-sm mb-6 leading-relaxed">
              نظامك المحاسبي الذكي جاهز!
              <br />
              خلّينا نعرّفك على التطبيقات خطوة بخطوة
            </p>

            {/* Buttons */}
            <div className="flex gap-3">
              <Button
                onClick={onStartTour}
                className="flex-1 gap-2 text-base h-12 rounded-xl"
              >
                <Rocket className="h-5 w-5" />
                يلا نبدأ!
              </Button>
              <Button
                variant="outline"
                onClick={onSkip}
                className="flex-1 h-12 rounded-xl text-muted-foreground"
              >
                تخطي
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WelcomeModal;
