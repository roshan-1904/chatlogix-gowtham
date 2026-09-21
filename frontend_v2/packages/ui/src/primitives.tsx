import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

// eslint-disable-next-line react/prefer-read-only-props
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly isLoading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  isLoading,
  children,
  type = 'button',
  ...props
}: Readonly<ButtonProps>) {
  const base =
    'inline-flex items-center justify-center font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-primary-500 text-white hover:bg-primary-500 focus:ring-primary-500',
    secondary: 'bg-secondary-500 text-white hover:bg-secondary-500 focus:ring-secondary-500',
    ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-300',
  };

  const sizes: Record<ButtonSize, string> = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-3 text-base',
  };

  const isDisabled = disabled || isLoading;

  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={isDisabled}
      {...props}
    >
      {isLoading ? 'Loading...' : children}
    </button>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          ref={ref}
          className={`w-full px-4 py-2 border rounded-lg outline-none bg-white text-gray-900 placeholder:text-gray-400 ${
            error ? 'border-red-500' : 'border-gray-300'
          } ${className}`}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'info' | 'secondary';

// eslint-disable-next-line react/prefer-read-only-props
export interface BadgeProps {
  readonly children: ReactNode;
  readonly variant?: BadgeVariant;
  readonly className?: string;
}

export function Badge({ children, variant = 'default', className = '' }: Readonly<BadgeProps>) {
  const styles: Record<BadgeVariant, string> = {
    default: 'bg-gray-100 text-gray-800',
    success: 'bg-secondary-500 text-white',
    warning: 'bg-yellow-500 text-white',
    info: 'bg-primary-500 text-white',
    secondary: 'bg-secondary-500 text-white',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

// eslint-disable-next-line react/prefer-read-only-props
export interface CardProps {
  readonly title?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly footer?: ReactNode;
}

export function Card({ title, children, className = '', footer }: Readonly<CardProps>) {
  const hasPadding = className.includes('p-') || className.includes('px-') || className.includes('py-');
  const paddingClass = hasPadding ? '' : 'p-4';

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200/60 ${paddingClass} ${className}`}>
      {title && <h3 className="text-sm font-medium text-gray-700 mb-1.5">{title}</h3>}
      <div>{children}</div>
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}
