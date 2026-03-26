import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      {/* Illustration */}
      <div className="w-40 h-40 mb-8 text-primary/20 flex items-center justify-center">
        {icon}
      </div>

      {/* Title */}
      <h2 className="text-2xl font-bold text-foreground mb-3" style={{ fontFamily: "Tajawal, sans-serif" }}>
        {title}
      </h2>

      {/* Description */}
      <p className="text-sm text-muted-foreground max-w-md leading-relaxed mb-8">
        {description}
      </p>

      {/* Actions */}
      {(primaryAction || secondaryAction) && (
        <div className="flex items-center gap-3">
          {primaryAction && (
            <Button onClick={primaryAction.onClick} className="gap-2 px-6 h-11 text-sm rounded-xl">
              {primaryAction.icon || <Plus className="h-4 w-4" />}
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button onClick={secondaryAction.onClick} variant="outline" className="gap-2 px-6 h-11 text-sm rounded-xl">
              {secondaryAction.icon || <Upload className="h-4 w-4" />}
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
