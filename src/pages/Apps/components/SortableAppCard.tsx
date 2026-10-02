import type { ComponentProps } from "react";
import { GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import AppCardV2 from "./AppCardV2";
import { motion, useReducedMotion } from "framer-motion";

type Props = ComponentProps<typeof AppCardV2> & {
  sortableId: string;
};

export default function SortableAppCard({ sortableId, ...cardProps }: Props) {
  const reduceMotion = useReducedMotion();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId });

  return (
    <motion.div
      ref={setNodeRef}
      className={cn("relative min-w-0", isDragging && "z-30 opacity-70")}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      initial={reduceMotion ? false : { opacity: 0, x: 34, y: 18, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      transition={{ delay: reduceMotion ? 0 : 0.12 + Math.min(cardProps.index, 8) * 0.06, duration: 0.62, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <AppCardV2 {...cardProps} animateEntry={false} />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="اسحب لتغيير ترتيب التطبيق"
        title="اسحب لتغيير الترتيب"
        className="absolute right-1.5 top-1.5 z-20 h-7 w-7 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        onClick={(event) => event.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </Button>
    </motion.div>
  );
}