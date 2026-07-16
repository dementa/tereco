'use client'

import { AlertCircle } from 'lucide-react';
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  id?: string;
  error?: string;
  className?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  id,
  type = 'text',
  error,
  className = '',
  ...props
}) => (
  <div className="space-y-1.5">
    {label && <label htmlFor={id} className="text-xs font-medium text-[#5A7D8A] tracking-wide">{label}</label>}
    <div className="relative">
      <input
        id={id}
        type={type}
        className={`w-full rounded-xl border-2 ${error ? 'border-[#C26565]' : 'border-[#D1E0E8]'} bg-white px-4 py-2.5 sm:py-3 text-sm transition-all duration-200 focus:border-[#02465B] focus:outline-none focus:ring-2 focus:ring-[#02465B]/10 ${error ? 'focus:border-[#C26565] focus:ring-[#C26565]/20' : ''} ${className}`}
        {...props}
      />
    </div>
    {error && <p className="text-xs text-[#C26565] mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
  </div>
);