import { BRAND } from '@/constants/brand';

interface QoyodLogoProps {
  variant?: 'primary' | 'white' | 'dark' | 'icon-color' | 'icon-white' | 'icon-dark' | 'full' | 'icon';
  size?: 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
  alt?: string;
}

const sizeMap = { sm: 32, md: 80, lg: 140, xl: 200 };

// Map legacy variant names
const variantMap: Record<string, keyof typeof BRAND.logo> = {
  'primary': 'primary',
  'white': 'white',
  'dark': 'dark',
  'icon-color': 'iconColor',
  'icon-white': 'iconWhite',
  'icon-dark': 'iconDark',
  'full': 'primary',
  'icon': 'iconColor',
};

export const QoyodLogo = ({
  variant = 'primary',
  size = 'md',
  className = '',
  alt = 'QOYOD قيود ERP Software',
}: QoyodLogoProps) => {
  const logoKey = variantMap[variant] || 'primary';
  const src = BRAND.logo[logoKey];
  const width = typeof size === 'number' ? size : sizeMap[size];

  return (
    <img
      src={src}
      alt={alt}
      width={width}
      className={`qoyod-logo ${className}`}
      style={{ display: 'inline-block', height: 'auto', objectFit: 'contain' }}
      onError={(e) => {
        const t = e.target as HTMLImageElement;
        if (!t.src.endsWith('.png')) {
          t.src = BRAND.logo.fallbackPng;
        }
      }}
    />
  );
};

// Legacy export name for backward compatibility
export const FinixLogo = QoyodLogo;

export default QoyodLogo;
