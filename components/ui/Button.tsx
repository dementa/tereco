'use client'

import { Loader2 } from 'lucide-react';
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  children: React.ReactNode;
  className?: string;
  isLoading?: boolean;
  /**
   * Sizes to its content at every width instead of going full-width on phones.
   * Use it whenever two or more buttons share a row: the default `w-full`
   * makes each of them demand the whole line, and they squash each other.
   *
   * This is a prop rather than a `className="w-auto"` override because there is
   * no tailwind-merge in this project — `w-full` and `w-auto` have equal
   * specificity, so which one wins depends on their order in the generated
   * stylesheet rather than the order you wrote them in. Not emitting the class
   * at all is the only deterministic way to opt out.
   */
  inline?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  children,
  className = '',
  isLoading = false,
  inline = false,
  ...props
}) => {
  // 44px on touch, 36px from `sm` up. 36px matches the search box and filter
  // selects in DataTable — a toolbar only reads as one row if everything on it
  // shares a height — but 36px is below the 44px minimum comfortable touch
  // target, so phones get the taller variant. (The old `py-3 px-6` was ~48px at
  // every width, which is why four buttons could not share a line with filters.)
  const base = `inline-flex items-center justify-center gap-2 font-medium transition-colors duration-150 rounded-lg h-11 sm:h-9 px-3.5 text-sm tracking-tight focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#02465B]/40 disabled:opacity-60 disabled:cursor-not-allowed ${
    inline ? 'w-auto shrink-0' : 'w-full sm:w-auto'
  }`;

  const variants: Record<string, string> = {
    primary: "bg-[#02465B] text-white hover:bg-[#012B3A]",
    secondary: "bg-[#F5CA93] text-[#02465B] hover:bg-[#E8B87C]",
    outline: "border border-[#E5E5E5] text-[#171717] hover:bg-[#FAFAFA] hover:border-[#D4D4D4]",
    ghost: "text-[#666666] hover:bg-[#F5F5F5] hover:text-[#171717]",
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