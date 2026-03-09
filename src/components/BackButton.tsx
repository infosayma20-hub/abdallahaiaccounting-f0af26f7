import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface BackButtonProps {
  fallback?: string;
  className?: string;
}

const BackButton = ({ fallback = "/apps", className = "" }: BackButtonProps) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleBack}
          className={`p-2 rounded-xl hover:bg-muted transition-colors ${className}`}
          aria-label="رجوع"
        >
          <ArrowRight className="h-5 w-5 text-foreground" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom"><p>رجوع</p></TooltipContent>
    </Tooltip>
  );
};

export default BackButton;
