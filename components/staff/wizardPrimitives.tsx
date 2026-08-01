'use client'

/**
 * Shared building blocks for TERECO's staff field-data-collection forms
 * (DailyLessonWizard, AttendanceForm, and any future one). Pulled out of
 * DailyLessonWizard.tsx verbatim when attendance-taking became its own form,
 * so both wizards render identically instead of drifting apart.
 *
 * Palette (locked, dark-mode immune via darkMode: 'class' + explicit values):
 *   Teal   #02465B  primary / nav / focus rings
 *   Amber  #F5CA93  Submit button ONLY (final irreversible action)
 *   Ice    #FFFFFF  page background
 *   White  #FFFFFF  card surfaces
 *   Ink    #011E28  primary text
 *   Slate  #666666  secondary text
 *   Mist   #A3A3A3  faint / placeholder
 *   Tint   #F5F5F5  focus fill / row hover
 *   Danger #C0392B  errors only
 */

import React, { useId, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, ChevronDown, CheckCircle2, Pencil } from 'lucide-react'

/* ─────────────────────────────────────────────────
   Primitive: cn
───────────────────────────────────────────────── */
export function cn(...c: (string | false | undefined | null)[]) { return c.filter(Boolean).join(' ') }

/* ─────────────────────────────────────────────────
   Primitive: FloatingInput
───────────────────────────────────────────────── */
export function FloatingInput({
  label, type = 'text', value, onChange, error, hint, required,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  label: string; type?: string; value: string; onChange: (v: string) => void
  error?: string; hint?: string; required?: boolean
}) {
  const id = useId()
  const [focused, setFocused] = useState(false)
  const lifted = focused || value.length > 0

  return (
    <div className="relative">
      <input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        required={required}
        className={cn(
          'peer w-full h-14 px-4 pt-5 pb-2 rounded-xl border bg-white text-sm text-[#011E28]',
          'outline-none transition-all duration-200 placeholder-transparent',
          error
            ? 'border-[#C0392B] ring-1 ring-[#C0392B]/20'
            : 'border-[#02465B]/15 hover:border-[#02465B]/30 focus:border-[#02465B] focus:ring-2 focus:ring-[#02465B]/10'
        )}
        placeholder={label}
        {...rest}
      />
      <label
        htmlFor={id}
        className={cn(
          'absolute left-4 pointer-events-none transition-all duration-200 font-medium select-none',
          lifted ? 'top-2 text-[10px] tracking-wide uppercase' : 'top-[17px] text-sm',
          error ? 'text-[#C0392B]' : focused ? 'text-[#02465B]' : 'text-[#A3A3A3]'
        )}
      >
        {label}{required && ' *'}
      </label>
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-[#C0392B]">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden /> {error}
        </p>
      )}
      {!error && hint && <p id={`${id}-hint`} className="mt-1.5 text-xs text-[#A3A3A3]">{hint}</p>}
    </div>
  )
}

/* ─────────────────────────────────────────────────
   Primitive: FloatingSelect
───────────────────────────────────────────────── */
export function FloatingSelect({
  label, options, value, onChange, error, hint, required,
}: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
  error?: string
  hint?: string
  required?: boolean
}) {
  const id = useId()
  const [focused, setFocused] = useState(false)
  const lifted = focused || value.length > 0

  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-invalid={!!error}
        required={required}
        className={cn(
          'peer w-full h-14 px-4 pt-5 pb-2 rounded-xl border bg-white text-sm text-[#011E28]',
          'outline-none appearance-none transition-all duration-200 cursor-pointer',
          // Deliberately NOT `text-transparent` when empty: native <option>
          // elements inherit their colour from the <select>, so hiding the
          // placeholder that way also hid every item in the open dropdown
          // until something was selected. The placeholder option below has no
          // text content, so it already renders blank on its own.
          error
            ? 'border-[#C0392B] ring-1 ring-[#C0392B]/20'
            : 'border-[#02465B]/15 hover:border-[#02465B]/30 focus:border-[#02465B] focus:ring-2 focus:ring-[#02465B]/10'
        )}
      >
        <option value="" disabled />
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <label
        htmlFor={id}
        className={cn(
          'absolute left-4 pointer-events-none transition-all duration-200 font-medium select-none',
          lifted ? 'top-2 text-[10px] tracking-wide uppercase' : 'top-[17px] text-sm',
          error ? 'text-[#C0392B]' : focused ? 'text-[#02465B]' : 'text-[#A3A3A3]'
        )}
      >
        {label}{required && ' *'}
      </label>
      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3] pointer-events-none" aria-hidden />
      {error && (
        <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-[#C0392B]">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden /> {error}
        </p>
      )}
      {!error && hint && <p className="mt-1.5 text-xs text-[#A3A3A3]">{hint}</p>}
    </div>
  )
}

/* ─────────────────────────────────────────────────
   Primitive: FloatingTextarea
───────────────────────────────────────────────── */
export function FloatingTextarea({
  label, value, onChange, error, required, rows = 3,
}: {
  label: string; value: string; onChange: (v: string) => void
  error?: string; required?: boolean; rows?: number
}) {
  const id = useId()
  const [focused, setFocused] = useState(false)
  const lifted = focused || value.length > 0

  return (
    <div className="relative">
      <textarea
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={rows}
        aria-invalid={!!error}
        required={required}
        className={cn(
          'peer w-full px-4 pt-7 pb-3 rounded-xl border bg-white text-sm text-[#011E28]',
          'outline-none resize-none transition-all duration-200',
          error
            ? 'border-[#C0392B] ring-1 ring-[#C0392B]/20'
            : 'border-[#02465B]/15 hover:border-[#02465B]/30 focus:border-[#02465B] focus:ring-2 focus:ring-[#02465B]/10'
        )}
        placeholder=" "
      />
      <label
        htmlFor={id}
        className={cn(
          'absolute left-4 pointer-events-none transition-all duration-200 font-medium select-none',
          lifted ? 'top-2.5 text-[10px] tracking-wide uppercase' : 'top-4 text-sm',
          error ? 'text-[#C0392B]' : focused ? 'text-[#02465B]' : 'text-[#A3A3A3]'
        )}
      >
        {label}{required && ' *'}
      </label>
      {error && (
        <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-[#C0392B]">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden /> {error}
        </p>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────
   Primitive: RadioCard
───────────────────────────────────────────────── */
export function RadioCard({
  value, label, description, selected, onChange,
}: { value: string; label: string; description?: string; selected: boolean; onChange: (v: string) => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onChange(value)}
      className={cn(
        'w-full text-left p-4 rounded-xl border-2 transition-all duration-150 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#02465B] focus-visible:ring-offset-1',
        selected
          ? 'border-[#02465B] bg-[#F5F5F5]'
          : 'border-[#02465B]/10 bg-white hover:border-[#02465B]/25 hover:bg-[#FFFFFF]'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={cn('text-sm font-semibold', selected ? 'text-[#02465B]' : 'text-[#011E28]')}>{label}</p>
          {description && <p className="text-xs text-[#666666] mt-0.5 leading-relaxed">{description}</p>}
        </div>
        <div className={cn(
          'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150',
          selected ? 'border-[#02465B] bg-[#02465B]' : 'border-[#A3A3A3]'
        )}>
          {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
        </div>
      </div>
    </button>
  )
}

/* ─────────────────────────────────────────────────
   Primitive: AttendanceRow — one learner, tap to mark absent
───────────────────────────────────────────────── */
export function AttendanceRow({
  name, systemId, present, onToggle,
}: { name: string; systemId: string | null; present: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 px-1 border-b border-[#02465B]/06 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#011E28] truncate">{name}</p>
        {systemId && <p className="text-xs text-[#A3A3A3]">{systemId}</p>}
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={!present}
        className={cn(
          'shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-150 cursor-pointer',
          present
            ? 'bg-[#F5F5F5] text-[#0489AE] hover:bg-[#D6F0F7]'
            : 'bg-[#C0392B]/10 text-[#C0392B] hover:bg-[#C0392B]/15'
        )}
      >
        {present ? 'Present' : 'Absent'}
      </button>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   Signature element: Segmented progress pill
───────────────────────────────────────────────── */
export function ProgressPill({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" role="progressbar" aria-valuenow={current + 1} aria-valuemin={1} aria-valuemax={total}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            'h-1.5 rounded-full transition-all duration-400',
            i === current
              ? 'flex-1 bg-[#02465B]'          // active — wide
              : i < current
              ? 'w-5 bg-[#0489AE]'              // done — medium teal
              : 'w-5 bg-[#02465B]/12'           // future — faint
          )}
          style={{ transition: 'all 350ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────────────
   Review field row
───────────────────────────────────────────────── */
export function ReviewRow({
  label, value, onEdit,
}: { label: string; value: string; onEdit?: () => void }) {
  if (!value || value.trim() === '') return null
  return (
    <div className="flex items-start justify-between gap-6 py-3 border-b border-[#02465B]/06 last:border-0 group">
      <p className="text-xs text-[#A3A3A3] font-medium shrink-0 w-32 pt-0.5">{label}</p>
      <p className="text-sm text-[#011E28] flex-1 leading-relaxed">{value}</p>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${label}`}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center gap-1 text-xs text-[#02465B] hover:text-[#035D77] transition-all duration-150 cursor-pointer flex-shrink-0"
        >
          <Pencil className="w-3 h-3" /> Edit
        </button>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────
   Success screen
───────────────────────────────────────────────── */
export function SuccessScreen({
  reference, teacherName, heading, subheading, anotherLabel, onAnother, onHome,
}: {
  reference: string
  teacherName: string
  heading: string
  subheading: string
  anotherLabel: string
  onAnother: () => void
  onHome: () => void
}) {
  const [countdown, setCountdown] = useState(5)

  useEffect(() => {
    const id = setInterval(() => setCountdown(c => {
      if (c <= 1) { clearInterval(id); onHome(); return 0 }
      return c - 1
    }), 1000)
    return () => clearInterval(id)
  }, [onHome])

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center justify-center min-h-screen bg-[#FFFFFF] px-6 text-center"
    >
      {/* Check mark */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 20 }}
        className="w-20 h-20 rounded-full flex items-center justify-center mb-8"
        style={{ background: 'linear-gradient(145deg, #02465B 0%, #0489AE 100%)' }}
      >
        <CheckCircle2 className="w-9 h-9 text-white" strokeWidth={1.75} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        <h2 className="text-2xl font-bold text-[#011E28] tracking-tight mb-2">{heading}</h2>
        <p className="text-[#666666] text-sm mb-6">{subheading}</p>

        {/* Reference card */}
        <div className="inline-block rounded-2xl border border-[#02465B]/12 bg-white px-8 py-5 mb-8"
          style={{ boxShadow: '0 2px 12px rgba(2,70,91,0.08)' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#A3A3A3] mb-1">Reference</p>
          <p className="text-xl font-bold text-[#02465B] tracking-wider font-mono">{reference}</p>
          <div className="mt-3 pt-3 border-t border-[#02465B]/08 space-y-0.5">
            <p className="text-xs text-[#666666]">{teacherName}</p>
            <p className="text-xs text-[#A3A3A3]">{new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={onAnother}
            className="w-full sm:w-auto h-11 px-6 rounded-xl bg-[#02465B] text-white text-sm font-semibold hover:bg-[#035D77] active:bg-[#02303F] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#02465B] focus-visible:ring-offset-2"
          >
            {anotherLabel}
          </button>
          <button
            type="button"
            onClick={onHome}
            className="w-full sm:w-auto h-11 px-6 rounded-xl border border-[#02465B]/20 text-[#02465B] text-sm font-semibold hover:bg-[#F5F5F5] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#02465B] focus-visible:ring-offset-2"
          >
            Back to forms
          </button>
        </div>

        {/* Auto-redirect countdown */}
        <p className="mt-6 text-xs text-[#A3A3A3]">
          Returning to forms in <span className="font-semibold text-[#666666]">{countdown}s</span>
        </p>
      </motion.div>
    </motion.div>
  )
}
