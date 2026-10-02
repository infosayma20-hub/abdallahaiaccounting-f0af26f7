import type { ComponentProps } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
      variants={{
        hidden: reduceMotion ? { opacity: 1 } : { opacity: 0, x: 26, y: 12, scale: 0.97 },
        visible: { opacity: 1, x: 0, y: 0, scale: 1 },
      }}
      transition={{ duration: reduceMotion ? 0 : 0.38, ease: [0.2, 0.8, 0.2, 1] }}
      {...attributes}
      {...listeners}
    >
      <AppCardV2 {...cardProps} animateEntry={false} />
    </motion.div>
  );
}