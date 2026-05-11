import React from 'react';

interface HelpTextProps {
  children: React.ReactNode;
  className?: string;
}

export function HelpText({ children, className = '' }: HelpTextProps) {
  return (
    <p className={`text-xs text-gray-500 ${className}`}>
      {children}
    </p>
  );
}

