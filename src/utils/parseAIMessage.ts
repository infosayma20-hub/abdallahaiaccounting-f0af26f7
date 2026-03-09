export type MessagePart =
  | { type: 'text'; content: string }
  | { type: 'action'; label: string; route: string };

export function parseAIMessage(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  // Matches both [action:LABEL:ROUTE] and [action:LABEL:ROUTE/]
  const actionRegex = /\[action:([^:\]]+):([^\]]+)\]/g;

  let lastIndex = 0;
  let match;

  while ((match = actionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index);
      if (textBefore.trim()) {
        parts.push({ type: 'text', content: textBefore });
      }
    }

    // Clean trailing slash from route if present
    let route = match[2].trim();
    if (route !== '/' && route.endsWith('/')) {
      route = route.slice(0, -1);
    }

    parts.push({
      type: 'action',
      label: match[1].trim(),
      route,
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (remaining.trim()) {
      parts.push({ type: 'text', content: remaining });
    }
  }

  return parts;
}
