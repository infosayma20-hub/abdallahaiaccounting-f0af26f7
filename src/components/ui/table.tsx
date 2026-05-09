import * as React from "react";

export function Table({ children, className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div style={{
      border: '1px solid #E2E8F0',
      borderRadius: '12px',
      overflow: 'hidden',
      direction: 'rtl',
    }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        direction: 'rtl',
      }} className={className} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ children, className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead style={{ background: '#0D1B2E' }} className={className} {...props}>{children}</thead>;
}

export function TableRow({ children, className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr style={{ borderBottom: '1px solid hsl(var(--border))' }} className={className} {...props}>{children}</tr>;
}

export function TableHead({ children, className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th style={{
      padding: '10px 14px',
      textAlign: 'right',
      fontSize: '12px',
      fontWeight: 600,
      color: '#FFFFFF',
      letterSpacing: '0.3px',
      whiteSpace: 'nowrap',
      borderBottom: 'none',
    }} className={className} {...props}>
      {children}
    </th>
  );
}

export function TableBody({ children, className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props}>{children}</tbody>;
}

export function TableCell({ children, className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td style={{
      padding: '12px 14px',
      fontSize: '13px',
      color: 'hsl(var(--foreground))',
      borderBottom: '1px solid hsl(var(--border))'
    }} className={className} {...props}>
      {children}
    </td>
  );
}

export function TableFooter({ children, className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tfoot className={className} {...props}>{children}</tfoot>;
}

export function TableCaption({ children, className, ...props }: React.HTMLAttributes<HTMLTableCaptionElement>) {
  return <caption className={className} {...props}>{children}</caption>;
}
