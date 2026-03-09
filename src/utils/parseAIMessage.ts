export type MessagePart =
  | { type: 'text'; content: string }
  | { type: 'action'; label: string; route: string };

export function parseAIMessage(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  const actionRegex = /\[action:([^:]+):([^\]]*?)\/\]/g;
  
  let lastIndex = 0;
  let match;

  while ((match = actionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index);
      if (textBefore.trim()) {
        parts.push({ type: 'text', content: textBefore });
      }
    }
    parts.push({
      type: 'action',
      label: match[1].trim(),
      route: match[2].trim(),
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
