interface FinixLogoProps {
  variant?: 'full' | 'icon' | 'white';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function FinixLogo({ variant = 'full', size = 'md', className = '' }: FinixLogoProps) {
  const sizes = {
    sm: { icon: 24, text: 14, gap: 4 },
    md: { icon: 32, text: 18, gap: 6 },
    lg: { icon: 44, text: 24, gap: 8 },
  };

  const s = sizes[size];
  const isWhite = variant === 'white';
  const navyColor = isWhite ? '#FFFFFF' : '#0D1B2A';

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: s.gap,
        direction: 'ltr',
      }}
      dir="ltr"
    >
      {/* F + Phoenix Wing Icon */}
      <svg
        width={s.icon}
        height={s.icon}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Letter F — body */}
        <rect x="8" y="20" width="8" height="36" rx="2" fill={navyColor} />
        <rect x="8" y="20" width="28" height="8" rx="2" fill={navyColor} />
        <rect x="8" y="34" width="20" height="7" rx="2" fill={navyColor} />
        
        {/* Phoenix Wing — feathers emerging from top-right of F */}
        <path
          d="M36 20 C36 14, 40 6, 48 2 C44 10, 43 16, 36 20Z"
          fill="url(#finix-wing-grad)"
        />
        <path
          d="M36 18 C38 12, 44 4, 54 1 C48 10, 44 15, 36 18Z"
          fill="url(#finix-wing-grad)"
          opacity="0.85"
        />
        <path
          d="M36 16 C40 10, 48 3, 58 2 C52 10, 46 14, 36 16Z"
          fill="url(#finix-wing-grad)"
          opacity="0.65"
        />
        
        <defs>
          <linearGradient id="finix-wing-grad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#E8A020" />
            <stop offset="100%" stopColor="#F45E0C" />
          </linearGradient>
        </defs>
      </svg>

      {/* Wordmark */}
      {variant !== 'icon' && (
        <span
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 800,
            fontSize: s.text,
            color: navyColor,
            letterSpacing: '0.02em',
            lineHeight: 1,
          }}
        >
          FINIX
        </span>
      )}
    </div>
  );
}
