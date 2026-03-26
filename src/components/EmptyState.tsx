import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
}

const EmptyState = ({ icon, title, description, primaryAction, secondaryAction }: EmptyStateProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center py-24 px-6 text-center"
    >
      {/* Icon container */}
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.15, duration: 0.4, type: "spring" }}
        className="w-28 h-28 mb-8 rounded-3xl bg-muted/40 border border-border/30 flex items-center justify-center"
      >
        <div className="text-muted-foreground/40">
          {icon}
        </div>
      </motion.div>

      {/* Title */}
      <h2 className="text-xl font-medium text-foreground mb-2" style={{ fontFamily: "Tajawal, sans-serif" }}>
        {title}
      </h2>

      {/* Description */}
      <p className="text-sm text-muted-foreground max-w-sm leading-relaxed mb-8">
        {description}
      </p>

      {/* Actions */}
      {(primaryAction || secondaryAction) && (
        <div className="flex items-center gap-3">
          {primaryAction && (
            <Button onClick={primaryAction.onClick} className="gap-2 px-8 h-12 text-sm rounded-xl shadow-sm">
              {primaryAction.icon || <Plus className="h-4 w-4" />}
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button onClick={secondaryAction.onClick} variant="outline" className="gap-2 px-6 h-12 text-sm rounded-xl">
              {secondaryAction.icon || <Upload className="h-4 w-4" />}
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default EmptyState;
