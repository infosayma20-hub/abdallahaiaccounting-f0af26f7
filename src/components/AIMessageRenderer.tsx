import { parseAIMessage } from '@/utils/parseAIMessage';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

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

  // Map of possible AI-generated routes to actual app routes
  const routeNormalizationMap: Record<string, string> = {
    '/sales': '/invoices',
    '/sales/invoices': '/invoices',
    '/sales/all': '/invoices',
    '/all-sales': '/invoices',
    '/sales/customers': '/contacts',
    '/sales/receipts': '/receipts',
    '/purchases': '/transactions',
    '/purchases/invoices': '/invoices',
    '/purchases/suppliers': '/contacts',
    '/accounting': '/transactions',
    '/accounting/journal': '/transactions',
    '/accounting/trial-balance': '/trial-balance',
    '/accounting/statement': '/account-statement',
    '/accounting/cheques': '/cheques',
    '/hr': '/employees',
    '/hr/employees': '/employees',
    '/hr/payroll': '/reports/hr-payroll',
    '/hr/attendance': '/hr-attendance',
    '/settings/billing': '/billing',
    '/journal': '/transactions',
    '/statement': '/account-statement',
    '/customers': '/contacts',
    '/suppliers': '/contacts',
    '/dashboard': '/dashboard',
    '/reports/profit-loss': '/profit-loss',
    '/reports/balance-sheet': '/balance-sheet',
  };

  const handleAction = (route: string, label: string) => {
    // Routes starting with / → navigate to page
    if (route.startsWith('/')) {
      const resolvedRoute = routeNormalizationMap[route] || route;
      navigate(resolvedRoute);
      return;
    }

    // Routes starting with @ → insert into chat input
    if (route.startsWith('@') && onActionInsert) {
      onActionInsert(label);
      return;
    }

    // Fallback: try inserting label
    if (onActionInsert) {
      onActionInsert(label);
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
        nativeSetter?.call(inputEl, label);
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.focus();
      }
    }
  };

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
              onClick={() => handleAction(part.route, part.label)}
              className="inline-flex items-center gap-1.5 my-1.5 mx-1 px-4 py-2 rounded-xl text-[13px] font-bold cursor-pointer transition-all duration-150 hover:scale-[1.03] hover:-translate-y-0.5 active:scale-[0.97]"
              style={{
                background: 'linear-gradient(135deg, #0A2342, #006D8F)',
                color: 'white',
                border: 'none',
                fontFamily: 'Tajawal, sans-serif',
                boxShadow: '0 2px 10px rgba(10,35,66,0.3)',
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {part.label}
            </button>
          );
        }
        return null;
      })}
    </div>
  );
}
