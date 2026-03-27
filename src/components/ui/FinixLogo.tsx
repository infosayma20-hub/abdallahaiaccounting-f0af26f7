interface QoyodLogoProps {
  variant?: 'full' | 'icon' | 'white';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function FinixLogo({ variant = 'full', size = 'md', className = '' }: QoyodLogoProps) {
  const sizes = {
    sm: { width: 28, fullWidth: 120 },
    md: { width: 36, fullWidth: 150 },
    lg: { width: 48, fullWidth: 180 },
  };

  const s = sizes[size];

  if (variant === 'icon') {
    return <img src="/logos/amwali-navy.jpg" alt="أموالي" width={s.width} height={s.width} className={className} style={{ display: 'inline-block' }} />;
  }

  if (variant === 'white') {
    return <img src="/logos/amwali-white.jpg" alt="AMWALI أموالي" width={s.fullWidth} className={className} style={{ display: 'inline-block' }} />;
  }

  // full
  return <img src="/logos/amwali-navy.jpg" alt="AMWALI أموالي" width={s.fullWidth} className={className} style={{ display: 'inline-block' }} />;
}

// Also export as QoyodLogo for new code
export const QoyodLogo = FinixLogo;
