'use client'

import { CheckCircle } from 'lucide-react';
import React from 'react';

interface StepperProps {
  steps: string[];
  currentStep: number;
  onStepClick?: (index: number) => void;
}

export const Stepper: React.FC<StepperProps> = ({ steps, currentStep, onStepClick }) => (
  <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-2 px-1 whitespace-nowrap scrollbar-hide">
    {steps.map((step, index) => (
      <div key={index} className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <button
          onClick={() => onStepClick?.(index)}
          className={`flex items-center gap-1 sm:gap-2 transition-all duration-200 ${index <= currentStep ? 'opacity-100' : 'opacity-40'}`}
        >
          <div className={`
            w-7 h-7 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-xs sm:text-sm font-medium transition-all duration-300
            ${index < currentStep ? 'bg-[#4A9C6D] text-white' :
              index === currentStep ? 'bg-[#02465B] text-white shadow-lg shadow-[#02465B]/20' :
              'bg-[#E8F0F5] text-[#8DA5B0]'}
          `}>
            {index < currentStep ? <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : index + 1}
          </div>
          <span className={`text-xs sm:text-sm hidden sm:inline ${index === currentStep ? 'font-medium text-[#02465B]' : 'text-[#8DA5B0]'}`}>
            {step}
          </span>
        </button>
        {index < steps.length - 1 && (
          <div className="w-4 sm:w-8 h-px bg-[#D1E0E8] mx-0.5" />
        )}
      </div>
    ))}
  </div>
);