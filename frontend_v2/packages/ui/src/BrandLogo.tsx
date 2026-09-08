import type { ImgHTMLAttributes } from 'react';

export type BrandLogoVariant = 'wordmark' | 'icon';

export interface BrandLogoProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
  readonly variant?: BrandLogoVariant;
  readonly alt?: string;
}

export function BrandLogo({
  variant = 'wordmark',
  alt = 'ChatLogix',
  className,
  ...props
}: BrandLogoProps) {
  const isIcon = variant === 'icon';
  const sizeClass = className ?? (isIcon ? 'block h-8 w-8' : 'block h-8 w-auto');

  return (
    <img
      src={isIcon ? '/icon.svg' : '/logo.svg'}
      alt={alt}
      className={sizeClass}
      {...props}
    />
  );
}
