'use client'

import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'accent' | 'success' | 'muted';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  className = ''
}) => {
  const variants: Record<string, string> = {
    default: 'bg-[#E8F0F5] text-[#02465B]',
    accent: 'bg-[#FDF0E6] text-[#02465B]',
    success: 'bg-green-100 text-green-700',
    muted: 'bg-gray-100 text-[#8DA5B0]',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};