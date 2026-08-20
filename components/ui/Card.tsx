'use client'

import { motion } from 'framer-motion';
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', hover = false }) => (
  <motion.div
    // Padding is deliberately smaller than the shell's own gutter on phones:
    // a card sits inside `main`'s padding, so `p-6` here meant a 360px screen
    // spent 64px of its width on nothing before any content rendered.
    className={`bg-white rounded-xl border border-[#EAEAEA] p-3.5 sm:p-5 ${hover ? 'hover:shadow-lg hover:border-[#E5E5E5] transition-all duration-200' : ''} ${className}`}
    whileHover={hover ? { y: -2 } : {}}
    transition={{ duration: 0.2 }}
  >
    {children}
  </motion.div>
);