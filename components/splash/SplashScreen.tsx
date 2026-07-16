'use client'

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';

export const SplashScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [messageIndex, setMessageIndex] = useState(0);
  const messages = [
    'Initializing secure connection...',
    'Loading data collection forms...',
    'Verifying user permissions...',
    'Preparing workspace...',
    'Almost ready...'
  ];

  useEffect(() => {
    const interval = setInterval(() => setMessageIndex(i => (i + 1) % messages.length), 1200);
    const timer = setTimeout(onComplete, 4500);
    return () => { clearInterval(interval); clearTimeout(timer); };
  }, [onComplete]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7FAFC] px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="text-center max-w-sm w-full"
      >
        <div className="w-24 h-24 sm:w-28 sm:h-28 mx-auto rounded-3xl bg-gradient-to-br from-[#02465B] to-[#2C5F7A] flex items-center justify-center shadow-2xl shadow-[#02465B]/20">
          <span className="text-white text-2xl sm:text-3xl font-bold tracking-tight">TERECO</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-[#02465B] mt-6 tracking-tight">TERECO Collect</h1>
        <p className="text-[#5A7D8A] text-sm font-light tracking-wide mt-1">Educational Field Data Platform</p>
        <div className="mt-8 flex justify-center gap-2">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-[#02465B]"
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
            />
          ))}
        </div>
        <motion.p
          key={messageIndex}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="text-[#8DA5B0] text-sm mt-4 font-light"
        >
          {messages[messageIndex]}
        </motion.p>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-[#8DA5B0]">
          <Shield className="w-3.5 h-3.5" />
          <span>Secure Connection Established</span>
        </div>
      </motion.div>
    </div>
  );
};