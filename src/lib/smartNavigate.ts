import type { NavigateFunction } from "react-router-dom";

/**
 * Smart navigation handler: Ctrl/Cmd+Click opens in new tab,
 * normal click uses React Router navigate.
 */
export function smartNavigate(
  e: React.MouseEvent,
  path: string,
  navigate: NavigateFunction
) {
  if (e.ctrlKey || e.metaKey || e.button === 1) {
    e.preventDefault();
    window.open(path, "_blank", "noopener,noreferrer");
  } else {
    navigate(path);
  }
}
