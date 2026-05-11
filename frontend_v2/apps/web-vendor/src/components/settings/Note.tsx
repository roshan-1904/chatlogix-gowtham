import React from 'react';

interface NoteProps {
  variant?: 'info' | 'warning' | 'success';
  children: React.ReactNode;
  className?: string;
}

export function Note({ variant = 'info', children, className = '' }: NoteProps) {
  const variantStyles = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    success: 'bg-green-50 border-green-200 text-green-800',
  };

  return (
    <div className={`border rounded-lg p-3 ${variantStyles[variant]} ${className}`}>
      {children}
    </div>
  );
}

