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
    className={`bg-white rounded-2xl border border-[#E8EFF3] p-4 sm:p-6 backdrop-blur-sm ${hover ? 'hover:shadow-lg hover:border-[#D1E0E8] transition-all duration-200' : ''} ${className}`}
    whileHover={hover ? { y: -2 } : {}}
    transition={{ duration: 0.2 }}
  >
    {children}
  </motion.div>
);