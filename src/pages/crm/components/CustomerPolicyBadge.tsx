// Compact chip showing customer class (A/B/C/D) + policy label.
// Read-only; reuses contact_class_policies as source of truth.

import { Shield } from "lucide-react";
import type { ContactSnapshot, PolicySnapshot } from "../lib/policyEngine";

const CLASS_FALLBACK: Record<string, { color: string; bg: string; border: string; label: string }> = {
  A: { color: "#15803D", bg: "#DCFCE7", border: "#86EFAC", label: "فئة A — مميز" },
  B: { color: "#0369A1", bg: "#E0F2FE", border: "#7DD3FC", label: "فئة B — جيد" },
  C: { color: "#A16207", bg: "#FEF3C7", border: "#FCD34D", label: "فئة C — عادي" },
  D: { color: "#B91C1C", bg: "#FEE2E2", border: "#FCA5A5", label: "فئة D — مخاطر" },
};

interface Props {
  contact: ContactSnapshot | null;
  policy: PolicySnapshot | null;
  size?: "sm" | "md";
  showIcon?: boolean;
}

export default function CustomerPolicyBadge({ contact, policy, size = "sm", showIcon = true }: Props) {
  if (!contact?.contact_class) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
        غير مصنّف
      </span>
    );
  }

  const fallback = CLASS_FALLBACK[contact.contact_class] ?? CLASS_FALLBACK.C;
  const color = policy?.color ?? fallback.color;
  const label = policy?.label ?? fallback.label;
  const padding = size === "md" ? "px-2.5 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]";
  const iconSize = size === "md" ? "h-3 w-3" : "h-2.5 w-2.5";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold border ${padding}`}
      style={{
        color,
        background: fallback.bg,
        borderColor: fallback.border,
      }}
      title={policy?.description ?? label}
    >
      {showIcon && <Shield className={iconSize} />}
      <span>{label}</span>
    </span>
  );
}
