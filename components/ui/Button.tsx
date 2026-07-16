'use client'

import { Loader2 } from 'lucide-react';
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  children: React.ReactNode;
  className?: string;
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  children,
  className = '',
  isLoading = false,
  ...props
}) => {
  const base = "inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 rounded-xl px-4 sm:px-6 py-2.5 sm:py-3 text-sm tracking-tight focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#02465B] disabled:opacity-60 disabled:cursor-not-allowed w-full sm:w-auto";

  const variants: Record<string, string> = {
    primary: "bg-[#02465B] text-white shadow-sm hover:shadow-md hover:bg-[#012B3A] active:scale-[0.98]",
    secondary: "bg-[#F5CA93] text-[#02465B] hover:bg-[#E8B87C] active:scale-[0.98]",
    outline: "border-2 border-[#D1E0E8] text-[#02465B] hover:bg-[#02465B]/5 active:scale-[0.98]",
    ghost: "text-[#5A7D8A] hover:bg-[#02465B]/5 active:scale-[0.98]",
  };

  return (
    <button
      className={`${base} ${variants[variant] || variants.primary} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
};