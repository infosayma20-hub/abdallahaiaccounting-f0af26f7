import { parseAIMessage } from '@/utils/parseAIMessage';
import { useNavigate } from 'react-router-dom';

interface Props {
  content: string;
  onActionInsert?: (text: string) => void;
}

export function AIMessageRenderer({ content, onActionInsert }: Props) {
  const navigate = useNavigate();
  const parts = parseAIMessage(content);

  // If no action tags found, render as plain text for performance
  if (parts.length === 1 && parts[0].type === 'text') {
    return <span style={{ whiteSpace: 'pre-wrap' }}>{parts[0].content}</span>;
  }

  return (
    <div className="ai-message-content">
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return (
            <span key={index} style={{ whiteSpace: 'pre-wrap' }}>
              {part.content}
            </span>
          );
        }

        if (part.type === 'action') {
          return (
            <button
              key={index}
              onClick={() => {
                if (part.route && part.route !== '/') {
                  navigate(part.route);
                } else if (onActionInsert) {
                  onActionInsert(part.label);
                } else {
                  const inputEl = document.querySelector(
                    'input[data-ai-input], textarea[data-ai-input]'
                  ) as HTMLInputElement;
                  if (inputEl) {
                    const nativeSetter = Object.getOwnPropertyDescriptor(
                      window.HTMLInputElement.prototype, 'value'
                    )?.set || Object.getOwnPropertyDescriptor(
                      window.HTMLTextAreaElement.prototype, 'value'
                    )?.set;
                    nativeSetter?.call(inputEl, part.label);
                    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                    inputEl.focus();
                  }
                }
              }}
              className="inline-flex items-center gap-1.5 my-1.5 px-4 py-2.5 rounded-xl text-[13px] font-bold cursor-pointer transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: 'linear-gradient(135deg, #0A2342, #006D8F)',
                color: 'white',
                border: 'none',
                fontFamily: 'Tajawal, sans-serif',
                boxShadow: '0 2px 8px rgba(10,35,66,0.25)',
              }}
            >
              ⚡ {part.label}
            </button>
          );
        }
        return null;
      })}
    </div>
  );
}
