'use client'

/**
 * DailyLessonWizard — TERECO Field Data Collection
 * ─────────────────────────────────────────────────
 * Palette (locked, dark-mode immune via darkMode: 'class' + explicit values):
 *   Teal   #02465B  primary / nav / focus rings
 *   Amber  #F5CA93  Submit button ONLY (final irreversible action)
 *   Ice    #F5FDFF  page background
 *   White  #FFFFFF  card surfaces
 *   Ink    #011E28  primary text
 *   Slate  #5A7A85  secondary text
 *   Mist   #9BBAC5  faint / placeholder
 *   Tint   #EBF8FC  focus fill / row hover
 *   Danger #C0392B  errors only
 *
 * Signature element: segmented teal progress pill — the one bold gesture.
 * Everything else is restrained.
 */

import React, { useState, useId, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, Save, Check, CheckCircle2,
  ChevronDown, Eye, EyeOff, AlertCircle, Clock, Users,
  Monitor, TrendingUp, FileText, Pencil, UserPlus, X,
} from 'lucide-react'
import { useAuth } from '@/components/auth/AuthContext'

/* ─────────────────────────────────────────────────
   Types
───────────────────────────────────────────────── */
interface FormData {
  // Step 1
  school: string
  className: string
  stream: string
  date: string
  period: string
  status: 'Completed' | 'Partially Completed' | 'Missed' | ''
  missedReason: string
  missedExplanation: string
  // Step 2
  learningArea: string
  specificSkill: string
  approach: string
  // Step 3
  computerAccess: string
  // Step 4
  overallProgress: string
  achievement: string
  challenges: 'Yes' | 'No' | ''
  challengeDetails: string
  supportRequired: string
}

interface FieldError { [key: string]: string }

interface RosterEntry {
  enrollmentId: string
  studentId: string
  systemId: string | null
  name: string
}

interface DirectoryStream { id: string; name: string }
/**
 * `displayName` is what the school calls this class — its own alias if it has
 * one, else the canonical P.n code. There is no longer a `name` column.
 */
interface DirectoryClass {
  id: string
  level: number | null
  displayName: string
  hasStreams: boolean
  streams: DirectoryStream[]
}
interface DirectorySchool { id: string; name: string; classes: DirectoryClass[] }

/* ─────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────── */
const LEARNING_AREAS = [
  'Computer Studies',
  'Information & Communication Technology',
  'Programming & Coding',
  'Data Analysis',
  'Web Design & Development',
  'Computer Networks',
  'Database Management',
  'Multimedia & Graphics',
]

const SKILLS: Record<string, string[]> = {
  'Computer Studies':                   ['Word processing', 'Spreadsheets', 'Presentations', 'File management', 'Internet safety'],
  'Information & Communication Technology': ['Email composition', 'Cloud storage', 'Digital citizenship', 'Online research', 'Data privacy'],
  'Programming & Coding':               ['Variables & data types', 'Control flow', 'Functions', 'Debugging', 'Simple projects'],
  'Data Analysis':                      ['Sorting & filtering', 'Charts & graphs', 'Formulas', 'Pivot tables', 'Data visualisation'],
  'Web Design & Development':           ['HTML structure', 'CSS styling', 'Responsive design', 'Forms', 'Publishing'],
  'Computer Networks':                  ['Network types', 'IP addressing', 'Troubleshooting', 'Security', 'Wireless networks'],
  'Database Management':                ['Tables & records', 'Queries', 'Forms & reports', 'Relationships', 'Data integrity'],
  'Multimedia & Graphics':              ['Image editing', 'Vector graphics', 'Video basics', 'Audio editing', 'Presentation design'],
}

const APPROACHES = ['Demonstration', 'Pair work', 'Group work', 'Individual practice', 'Discussion', 'Project-based', 'Flipped classroom']
const PROGRESS_LEVELS = ['Excellent', 'Good', 'Satisfactory', 'Needs improvement', 'Poor']
const PERIODS = Array.from({ length: 8 }, (_, i) => `Period ${i + 1}`)
const COMPUTER_ACCESS = ['Full access — 1 computer per learner', 'Shared — 2–3 learners per computer', 'Limited — 4+ per computer', 'No computer access']

const STEPS = [
  { id: 'details',    label: 'Lesson details',   icon: FileText  },
  { id: 'learning',   label: 'Learning',          icon: TrendingUp },
  { id: 'attendance', label: 'Attendance',         icon: Users     },
  { id: 'progress',   label: 'Learner progress',  icon: Monitor   },
  { id: 'review',     label: 'Review & submit',   icon: Check     },
]

const INITIAL: FormData = {
  school: '', className: '', stream: '', date: new Date().toISOString().split('T')[0],
  period: '', status: '', missedReason: '', missedExplanation: '',
  learningArea: '', specificSkill: '', approach: '',
  computerAccess: '',
  overallProgress: '', achievement: '', challenges: '',
  challengeDetails: '', supportRequired: '',
}

/* ─────────────────────────────────────────────────
   Validation
───────────────────────────────────────────────── */
function validateStep(step: number, data: FormData, selectedClassHasStreams: boolean): FieldError {
  const err: FieldError = {}
  if (step === 0) {
    if (!data.school)    err.school = 'Select a school'
    if (!data.className) err.className = 'Select a class'
    if (selectedClassHasStreams && !data.stream) err.stream = 'Select a stream'
    if (!data.date)      err.date = 'Enter the lesson date'
    if (!data.period)    err.period = 'Select a period'
    if (!data.status)    err.status = 'Select lesson status'
    if (data.status === 'Missed') {
      if (!data.missedReason.trim()) err.missedReason = 'Provide a reason'
    }
  }
  if (step === 1) {
    if (!data.learningArea)   err.learningArea = 'Select a learning area'
    if (!data.specificSkill)  err.specificSkill = 'Select a specific skill'
    if (!data.approach)       err.approach = 'Select an approach'
  }
  if (step === 2) {
    if (!data.computerAccess) err.computerAccess = 'Select computer access'
  }
  if (step === 3) {
    if (!data.overallProgress) err.overallProgress = 'Select overall progress'
    if (!data.achievement.trim()) err.achievement = 'Describe the main achievement'
    if (!data.challenges) err.challenges = 'Select yes or no'
    if (data.challenges === 'Yes' && !data.challengeDetails.trim())
      err.challengeDetails = 'Describe the challenges'
  }
  return err
}

/* ─────────────────────────────────────────────────
   Primitive: cn
───────────────────────────────────────────────── */
function cn(...c: (string | false | undefined | null)[]) { return c.filter(Boolean).join(' ') }

/* ─────────────────────────────────────────────────
   Primitive: FloatingInput
───────────────────────────────────────────────── */
function FloatingInput({
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
          error ? 'text-[#C0392B]' : focused ? 'text-[#02465B]' : 'text-[#9BBAC5]'
        )}
      >
        {label}{required && ' *'}
      </label>
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-[#C0392B]">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden /> {error}
        </p>
      )}
      {!error && hint && <p id={`${id}-hint`} className="mt-1.5 text-xs text-[#9BBAC5]">{hint}</p>}
    </div>
  )
}

/* ─────────────────────────────────────────────────
   Primitive: FloatingSelect
───────────────────────────────────────────────── */
function FloatingSelect({
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
          error ? 'text-[#C0392B]' : focused ? 'text-[#02465B]' : 'text-[#9BBAC5]'
        )}
      >
        {label}{required && ' *'}
      </label>
      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9BBAC5] pointer-events-none" aria-hidden />
      {error && (
        <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-[#C0392B]">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden /> {error}
        </p>
      )}
      {!error && hint && <p className="mt-1.5 text-xs text-[#9BBAC5]">{hint}</p>}
    </div>
  )
}

/* ─────────────────────────────────────────────────
   Primitive: FloatingTextarea
───────────────────────────────────────────────── */
function FloatingTextarea({
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
          error ? 'text-[#C0392B]' : focused ? 'text-[#02465B]' : 'text-[#9BBAC5]'
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
function RadioCard({
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
          ? 'border-[#02465B] bg-[#EBF8FC]'
          : 'border-[#02465B]/10 bg-white hover:border-[#02465B]/25 hover:bg-[#F5FDFF]'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={cn('text-sm font-semibold', selected ? 'text-[#02465B]' : 'text-[#011E28]')}>{label}</p>
          {description && <p className="text-xs text-[#5A7A85] mt-0.5 leading-relaxed">{description}</p>}
        </div>
        <div className={cn(
          'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150',
          selected ? 'border-[#02465B] bg-[#02465B]' : 'border-[#9BBAC5]'
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
function AttendanceRow({
  name, systemId, present, onToggle,
}: { name: string; systemId: string | null; present: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 px-1 border-b border-[#02465B]/06 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#011E28] truncate">{name}</p>
        {systemId && <p className="text-xs text-[#9BBAC5]">{systemId}</p>}
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={!present}
        className={cn(
          'shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-150 cursor-pointer',
          present
            ? 'bg-[#EBF8FC] text-[#0489AE] hover:bg-[#D6F0F7]'
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
function ProgressPill({ current, total }: { current: number; total: number }) {
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
function ReviewRow({
  label, value, onEdit,
}: { label: string; value: string; onEdit?: () => void }) {
  if (!value || value.trim() === '') return null
  return (
    <div className="flex items-start justify-between gap-6 py-3 border-b border-[#02465B]/06 last:border-0 group">
      <p className="text-xs text-[#9BBAC5] font-medium shrink-0 w-32 pt-0.5">{label}</p>
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
function SuccessScreen({
  reference, teacherName, onAnother, onHome,
}: { reference: string; teacherName: string; onAnother: () => void; onHome: () => void }) {
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
      className="flex flex-col items-center justify-center min-h-screen bg-[#F5FDFF] px-6 text-center"
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
        <h2 className="text-2xl font-bold text-[#011E28] tracking-tight mb-2">Lesson submitted</h2>
        <p className="text-[#5A7A85] text-sm mb-6">Your record has been saved successfully.</p>

        {/* Reference card */}
        <div className="inline-block rounded-2xl border border-[#02465B]/12 bg-white px-8 py-5 mb-8"
          style={{ boxShadow: '0 2px 12px rgba(2,70,91,0.08)' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#9BBAC5] mb-1">Reference</p>
          <p className="text-xl font-bold text-[#02465B] tracking-wider font-mono">{reference}</p>
          <div className="mt-3 pt-3 border-t border-[#02465B]/08 space-y-0.5">
            <p className="text-xs text-[#5A7A85]">{teacherName}</p>
            <p className="text-xs text-[#9BBAC5]">{new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={onAnother}
            className="w-full sm:w-auto h-11 px-6 rounded-xl bg-[#02465B] text-white text-sm font-semibold hover:bg-[#035D77] active:bg-[#02303F] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#02465B] focus-visible:ring-offset-2"
          >
            Submit another lesson
          </button>
          <button
            type="button"
            onClick={onHome}
            className="w-full sm:w-auto h-11 px-6 rounded-xl border border-[#02465B]/20 text-[#02465B] text-sm font-semibold hover:bg-[#EBF8FC] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#02465B] focus-visible:ring-offset-2"
          >
            Back to forms
          </button>
        </div>

        {/* Auto-redirect countdown */}
        <p className="mt-6 text-xs text-[#9BBAC5]">
          Returning to forms in <span className="font-semibold text-[#5A7A85]">{countdown}s</span>
        </p>
      </motion.div>
    </motion.div>
  )
}

/* ─────────────────────────────────────────────────
   Main wizard
───────────────────────────────────────────────── */
export function DailyLessonWizard({ onBack }: { onBack: () => void }) {
  const { user } = useAuth()
  const [step,        setStep]        = useState(0)
  const [data,        setData]        = useState<FormData>({ ...INITIAL, school: user?.school || '' })
  const [errors,      setErrors]      = useState<FieldError>({})
  const [touched,     setTouched]     = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [submitted,   setSubmitted]   = useState(false)
  const [direction,   setDirection]   = useState<1 | -1>(1)
  const [ref]   = useState(() => `TER-${String(Math.floor(100000 + Math.random() * 900000))}`)
  const topRef  = useRef<HTMLDivElement>(null)
  const [directory, setDirectory] = useState<DirectorySchool[]>([])

  // Attendance: the roster for the picked class/stream, and who's been
  // flipped to absent (absence is keyed by studentId; a learner not in this
  // set is present — that's the common case, so it costs nothing to store).
  const [roster,        setRoster]        = useState<RosterEntry[]>([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [rosterError,   setRosterError]   = useState('')
  const [absentIds,     setAbsentIds]     = useState<Set<string>>(new Set())
  const [showAddLearner, setShowAddLearner] = useState(false)
  const [newLearner, setNewLearner] = useState({ firstName: '', lastName: '', gender: '' as '' | 'male' | 'female', dateOfBirth: '' })
  const [addingLearner, setAddingLearner] = useState(false)
  const [addLearnerError, setAddLearnerError] = useState('')
  const [pendingLearners, setPendingLearners] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/directory/schools')
      .then(r => r.json())
      .then(d => { if (d.success) setDirectory(d.data) })
      .catch(() => {})
  }, [])

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setData(p => ({ ...p, [key]: value }))

  const isMissed    = data.status === 'Missed'
  const hasChallenges = data.challenges === 'Yes'
  const selectedSchool   = directory.find(s => s.name === data.school)
  const availableClasses = selectedSchool?.classes ?? []
  const selectedClass    = availableClasses.find(c => c.displayName === data.className)
  const availableStreams = selectedClass?.streams ?? []
  const selectedStream   = availableStreams.find(s => s.name === data.stream)
  const skillsForArea    = SKILLS[data.learningArea] || []

  // Whether there's a settled class (and stream, if it has one) to take
  // attendance against at all — a missed lesson, or a class/stream still
  // being picked, has nobody to fetch a roster for.
  const rosterSettled = !isMissed && !!selectedClass && (!selectedClass.hasStreams || !!selectedStream)

  // The roster is fetched once rosterSettled becomes true. When it isn't, the
  // effect simply does nothing — emptiness here is derived at render time via
  // `activeRoster` below, not written back into state, so switching away from
  // a class never needs this effect to reset anything itself.
  useEffect(() => {
    if (!rosterSettled || !selectedClass) return
    let cancelled = false
    const query = selectedStream ? `?streamId=${selectedStream.id}` : ''

    // The loading/error resets happen inside the first callback rather than
    // synchronously in the effect body, same reasoning as everywhere else in
    // this file that fetches on a dependency change.
    Promise.resolve()
      .then(() => {
        if (cancelled) return undefined
        setRosterLoading(true)
        setRosterError('')
        return fetch(`/api/directory/classes/${selectedClass.id}/roster${query}`).then(r => r.json())
      })
      .then(d => {
        if (cancelled || !d) return
        if (d.success) { setRoster(d.data); setAbsentIds(new Set()) }
        else setRosterError(d.message || 'Could not load the class roster.')
      })
      .catch(() => { if (!cancelled) setRosterError('Network error loading the class roster.') })
      .finally(() => { if (!cancelled) setRosterLoading(false) })

    return () => { cancelled = true }
  }, [rosterSettled, selectedClass, selectedStream])

  function toggleAbsent(studentId: string) {
    setAbsentIds(prev => {
      const next = new Set(prev)
      if (next.has(studentId)) next.delete(studentId); else next.add(studentId)
      return next
    })
  }

  // Stale roster/absence from a previously picked class never leaks through:
  // once the class changes, this recomputes to empty until the new fetch
  // lands, rather than trusting whatever the last successful fetch left in
  // state.
  const activeRoster = rosterSettled ? roster : []
  const activeRosterIds = new Set(activeRoster.map(r => r.studentId))
  const effectiveAbsentIds = new Set([...absentIds].filter(id => activeRosterIds.has(id)))
  const presentCount = activeRoster.length - effectiveAbsentIds.size
  const absentCount  = effectiveAbsentIds.size

  async function submitNewLearner() {
    if (!selectedClass || !selectedSchool) return
    if (!newLearner.firstName.trim() || !newLearner.lastName.trim()) {
      setAddLearnerError('First and last name are required.')
      return
    }
    setAddingLearner(true)
    setAddLearnerError('')
    try {
      const res = await fetch('/api/student-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: selectedSchool.id,
          classId: selectedClass.id,
          streamId: selectedStream?.id,
          firstName: newLearner.firstName.trim(),
          lastName: newLearner.lastName.trim(),
          gender: newLearner.gender || undefined,
          dateOfBirth: newLearner.dateOfBirth || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Could not submit that learner.')
      setPendingLearners(p => [...p, `${newLearner.firstName} ${newLearner.lastName}`])
      setNewLearner({ firstName: '', lastName: '', gender: '', dateOfBirth: '' })
      setShowAddLearner(false)
    } catch (e) {
      setAddLearnerError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setAddingLearner(false)
    }
  }

  /* Clear errors when field changes */
  const clearErr = (key: string) => {
    if (errors[key]) setErrors(e => { const n = { ...e }; delete n[key]; return n })
  }

  function scrollTop() {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function goNext() {
    const errs = validateStep(step, data, !!selectedClass?.hasStreams)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      setTouched(true)
      return
    }
    setErrors({})
    setDirection(1)
    setStep(s => Math.min(s + 1, STEPS.length - 1))
    scrollTop()
  }

  function goPrev() {
    setDirection(-1)
    setStep(s => Math.max(s - 1, 0))
    scrollTop()
  }

  function goToStep(i: number) {
    if (i < step) { setDirection(-1); setStep(i); scrollTop() }
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const attendance = activeRoster.map(r => ({
        studentId: r.studentId,
        enrollmentId: r.enrollmentId,
        present: !effectiveAbsentIds.has(r.studentId),
      }))
      const res = await fetch('/api/lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data, reference: ref, teacher: user?.name, attendance,
          schoolId: selectedSchool?.id, classId: selectedClass?.id, streamId: selectedStream?.id,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Submission failed')
      setSubmitted(true)
    } catch (e) {
      setErrors({ submit: e instanceof Error ? e.message : 'Something went wrong. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  const isLastStep = step === STEPS.length - 1

  /* ─── step content ─── */
  const stepContent: Record<number, React.ReactNode> = {
    0: (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FloatingSelect
            label="School"
            options={directory.map(s => s.name)}
            value={data.school}
            onChange={v => { set('school', v); set('className', ''); set('stream', ''); clearErr('school') }}
            error={errors.school}
            required
          />
          <FloatingSelect
            label="Class"
            options={availableClasses.map(c => c.displayName)}
            value={data.className}
            onChange={v => { set('className', v); set('stream', ''); clearErr('className') }}
            error={errors.className}
            required
            hint={data.school ? undefined : 'Select a school first'}
          />
        </div>
        {selectedClass?.hasStreams && (
          <FloatingSelect
            label="Stream"
            options={availableStreams.map(s => s.name)}
            value={data.stream}
            onChange={v => { set('stream', v); clearErr('stream') }}
            error={errors.stream}
            required
          />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FloatingInput
            label="Lesson date"
            type="date"
            value={data.date}
            onChange={v => { set('date', v); clearErr('date') }}
            error={errors.date}
            required
          />
          <FloatingSelect
            label="Lesson period"
            options={PERIODS}
            value={data.period}
            onChange={v => { set('period', v); clearErr('period') }}
            error={errors.period}
            required
          />
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#02465B] mb-2.5">
            Lesson status <span className="text-[#C0392B]">*</span>
          </p>
          <div className="space-y-2">
            {[
              { v: 'Completed',          d: 'Lesson was delivered in full'           },
              { v: 'Partially Completed', d: 'Lesson started but not fully delivered' },
              { v: 'Missed',             d: 'Lesson did not take place'               },
            ].map(o => (
              <RadioCard
                key={o.v}
                value={o.v}
                label={o.v}
                description={o.d}
                selected={data.status === o.v}
                onChange={v => {
                  const next = v as FormData['status']
                  // A lesson that happened carries no missed reason — the
                  // database enforces that, so switching away from "Missed"
                  // must clear these or the submission is rejected with a
                  // constraint error the teacher cannot act on.
                  setData(p => ({
                    ...p,
                    status: next,
                    missedReason: next === 'Missed' ? p.missedReason : '',
                    missedExplanation: next === 'Missed' ? p.missedExplanation : '',
                  }))
                  clearErr('status')
                }}
              />
            ))}
          </div>
          {errors.status && (
            <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-[#C0392B]">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden /> {errors.status}
            </p>
          )}
        </div>

        <AnimatePresence>
          {isMissed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="pl-4 border-l-2 border-[#C4952A] space-y-3 pt-1">
                <FloatingInput
                  label="Reason for missed lesson"
                  value={data.missedReason}
                  onChange={v => { set('missedReason', v); clearErr('missedReason') }}
                  error={errors.missedReason}
                  required
                  placeholder="e.g. Public holiday, school closure"
                />
                <FloatingTextarea
                  label="Additional explanation"
                  value={data.missedExplanation}
                  onChange={v => set('missedExplanation', v)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    ),

    1: (
      <div className="space-y-4">
        <FloatingSelect
          label="Learning area"
          options={LEARNING_AREAS}
          value={data.learningArea}
          onChange={v => { set('learningArea', v); set('specificSkill', ''); clearErr('learningArea') }}
          error={errors.learningArea}
          required
        />
        <FloatingSelect
          label="Specific skill"
          options={skillsForArea.length ? skillsForArea : ['Select a learning area first']}
          value={data.specificSkill}
          onChange={v => { set('specificSkill', v); clearErr('specificSkill') }}
          error={errors.specificSkill}
          required
          hint={data.learningArea ? undefined : 'Select a learning area first'}
        />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#02465B] mb-2.5">
            Lesson approach <span className="text-[#C0392B]">*</span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {APPROACHES.map(a => (
              <button
                key={a}
                type="button"
                onClick={() => { set('approach', a); clearErr('approach') }}
                className={cn(
                  'px-3 py-2.5 rounded-xl border text-sm font-medium transition-all duration-150 cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#02465B]',
                  data.approach === a
                    ? 'border-[#02465B] bg-[#EBF8FC] text-[#02465B]'
                    : 'border-[#02465B]/10 bg-white text-[#5A7A85] hover:border-[#02465B]/25 hover:text-[#011E28]'
                )}
              >
                {a}
              </button>
            ))}
          </div>
          {errors.approach && (
            <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-[#C0392B]">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden /> {errors.approach}
            </p>
          )}
        </div>
      </div>
    ),

    2: (
      <div className="space-y-4">
        {isMissed ? (
          <div className="rounded-xl border border-[#02465B]/10 bg-[#F5FDFF] px-4 py-3.5">
            <p className="text-sm text-[#5A7A85]">
              This lesson did not take place, so there is no attendance to record.
            </p>
          </div>
        ) : (
          <>
            {/* Live stats */}
            {activeRoster.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-[#EBF8FC] border border-[#02465B]/08 px-4 py-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#0489AE] mb-0.5">Present</p>
                  <p className="text-2xl font-bold text-[#011E28] tabular-nums">{presentCount}</p>
                </div>
                <div className="rounded-xl bg-[#EBF8FC] border border-[#02465B]/08 px-4 py-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#0489AE] mb-0.5">Absent</p>
                  <p className="text-2xl font-bold text-[#011E28] tabular-nums">{absentCount}</p>
                </div>
                <div className="rounded-xl bg-[#EBF8FC] border border-[#02465B]/08 px-4 py-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#0489AE] mb-0.5">Rate</p>
                  <p className="text-2xl font-bold text-[#011E28] tabular-nums">
                    {activeRoster.length > 0 ? `${Math.round((presentCount / activeRoster.length) * 100)}%` : '—'}
                  </p>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#02465B]">
                  Attendance — tap to mark absent
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddLearner(v => !v)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#02465B] hover:text-[#035D77] cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Add a learner not on this list
                </button>
              </div>

              {rosterLoading && <p className="text-sm text-[#9BBAC5] py-4">Loading the class roster…</p>}
              {!rosterLoading && rosterError && (
                <p role="alert" className="flex items-center gap-1.5 text-xs text-[#C0392B] py-2">
                  <AlertCircle className="w-3.5 h-3.5" aria-hidden /> {rosterError}
                </p>
              )}
              {!rosterLoading && !rosterError && activeRoster.length === 0 && (
                <p className="text-sm text-[#9BBAC5] py-4">
                  Nobody is currently enrolled in this class{data.stream ? ' / stream' : ''}.
                </p>
              )}
              {!rosterLoading && activeRoster.length > 0 && (
                <div className="rounded-xl border border-[#02465B]/08 bg-white px-3">
                  {activeRoster.map(r => (
                    <AttendanceRow
                      key={r.studentId}
                      name={r.name}
                      systemId={r.systemId}
                      present={!effectiveAbsentIds.has(r.studentId)}
                      onToggle={() => toggleAbsent(r.studentId)}
                    />
                  ))}
                </div>
              )}

              {pendingLearners.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {pendingLearners.map(name => (
                    <div key={name} className="flex items-center gap-2 text-xs text-[#8A6A16] bg-[#FCF3DE] rounded-lg px-3 py-2">
                      <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden />
                      {name} — pending approval, not yet on the roster
                    </div>
                  ))}
                </div>
              )}

              <AnimatePresence>
                {showAddLearner && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 p-4 rounded-xl border-2 border-[#02465B]/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[#02465B]">New learner</p>
                        <button type="button" onClick={() => setShowAddLearner(false)} aria-label="Cancel">
                          <X className="w-4 h-4 text-[#9BBAC5]" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <FloatingInput
                          label="First name"
                          value={newLearner.firstName}
                          onChange={v => setNewLearner(p => ({ ...p, firstName: v }))}
                          required
                        />
                        <FloatingInput
                          label="Last name"
                          value={newLearner.lastName}
                          onChange={v => setNewLearner(p => ({ ...p, lastName: v }))}
                          required
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <FloatingSelect
                          label="Gender (optional)"
                          options={['male', 'female']}
                          value={newLearner.gender}
                          onChange={v => setNewLearner(p => ({ ...p, gender: v as 'male' | 'female' }))}
                        />
                        <FloatingInput
                          label="Date of birth (optional)"
                          type="date"
                          value={newLearner.dateOfBirth}
                          onChange={v => setNewLearner(p => ({ ...p, dateOfBirth: v }))}
                        />
                      </div>
                      {addLearnerError && (
                        <p role="alert" className="flex items-center gap-1.5 text-xs text-[#C0392B]">
                          <AlertCircle className="w-3.5 h-3.5" aria-hidden /> {addLearnerError}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => void submitNewLearner()}
                        disabled={addingLearner}
                        className="w-full h-10 rounded-xl bg-[#02465B] text-white text-sm font-semibold hover:bg-[#035D77] disabled:opacity-60 cursor-pointer"
                      >
                        {addingLearner ? 'Submitting…' : 'Submit for approval'}
                      </button>
                      <p className="text-xs text-[#9BBAC5]">
                        Sent to a super admin to approve — they will not appear on the roster until then.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#02465B] mb-2.5">
            Computer access <span className="text-[#C0392B]">*</span>
          </p>
          <div className="space-y-2">
            {COMPUTER_ACCESS.map(o => (
              <RadioCard
                key={o}
                value={o}
                label={o.split(' — ')[0]}
                description={o.split(' — ')[1]}
                selected={data.computerAccess === o}
                onChange={v => { set('computerAccess', v); clearErr('computerAccess') }}
              />
            ))}
          </div>
          {errors.computerAccess && (
            <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-[#C0392B]">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden /> {errors.computerAccess}
            </p>
          )}
        </div>
      </div>
    ),

    3: (
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#02465B] mb-2.5">
            Overall learner progress <span className="text-[#C0392B]">*</span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PROGRESS_LEVELS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => { set('overallProgress', p); clearErr('overallProgress') }}
                className={cn(
                  'px-3 py-2.5 rounded-xl border text-sm font-medium transition-all duration-150 cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#02465B]',
                  data.overallProgress === p
                    ? 'border-[#02465B] bg-[#EBF8FC] text-[#02465B]'
                    : 'border-[#02465B]/10 bg-white text-[#5A7A85] hover:border-[#02465B]/25 hover:text-[#011E28]'
                )}
              >
                {p}
              </button>
            ))}
          </div>
          {errors.overallProgress && (
            <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-[#C0392B]">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden /> {errors.overallProgress}
            </p>
          )}
        </div>

        <FloatingTextarea
          label="Main achievement"
          value={data.achievement}
          onChange={v => { set('achievement', v); clearErr('achievement') }}
          error={errors.achievement}
          required
        />

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#02465B] mb-2.5">
            Challenges encountered <span className="text-[#C0392B]">*</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            {(['No', 'Yes'] as const).map(o => (
              <RadioCard
                key={o}
                value={o}
                label={o === 'No' ? 'No challenges' : 'Yes, challenges faced'}
                selected={data.challenges === o}
                onChange={v => { set('challenges', v as 'Yes' | 'No'); clearErr('challenges') }}
              />
            ))}
          </div>
          {errors.challenges && (
            <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-[#C0392B]">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden /> {errors.challenges}
            </p>
          )}
        </div>

        <AnimatePresence>
          {hasChallenges && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="pl-4 border-l-2 border-[#C4952A] space-y-3 pt-1">
                <FloatingTextarea
                  label="Describe the challenges"
                  value={data.challengeDetails}
                  onChange={v => { set('challengeDetails', v); clearErr('challengeDetails') }}
                  error={errors.challengeDetails}
                  required
                />
                <FloatingTextarea
                  label="Support required (optional)"
                  value={data.supportRequired}
                  onChange={v => set('supportRequired', v)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    ),

    4: (
      <div className="space-y-1">
        {/* Section: Lesson Details */}
        <div className="rounded-xl border border-[#02465B]/08 bg-white overflow-hidden"
          style={{ boxShadow: '0 1px 4px rgba(2,70,91,0.04)' }}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#02465B]/06 bg-[#F5FDFF]">
            <p className="text-xs font-bold uppercase tracking-wider text-[#02465B]">Lesson details</p>
            <button type="button" onClick={() => goToStep(0)}
              className="flex items-center gap-1 text-xs text-[#5A7A85] hover:text-[#02465B] transition-colors cursor-pointer">
              <Pencil className="w-3 h-3" /> Edit
            </button>
          </div>
          <div className="px-5 py-1 divide-y divide-[#02465B]/04">
            <ReviewRow label="School"  value={data.school}     onEdit={() => goToStep(0)} />
            <ReviewRow label="Class"   value={data.className}  onEdit={() => goToStep(0)} />
            <ReviewRow label="Stream"  value={data.stream}     onEdit={() => goToStep(0)} />
            <ReviewRow label="Date"    value={new Date(data.date).toLocaleDateString('en-GB', { dateStyle: 'long' })} />
            <ReviewRow label="Period"  value={data.period}     />
            <ReviewRow label="Status"  value={data.status}     />
            {isMissed && <ReviewRow label="Reason" value={data.missedReason} />}
          </div>
        </div>

        {/* Section: Learning */}
        {!isMissed && (
          <div className="rounded-xl border border-[#02465B]/08 bg-white overflow-hidden"
            style={{ boxShadow: '0 1px 4px rgba(2,70,91,0.04)' }}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#02465B]/06 bg-[#F5FDFF]">
              <p className="text-xs font-bold uppercase tracking-wider text-[#02465B]">Learning</p>
              <button type="button" onClick={() => goToStep(1)}
                className="flex items-center gap-1 text-xs text-[#5A7A85] hover:text-[#02465B] transition-colors cursor-pointer">
                <Pencil className="w-3 h-3" /> Edit
              </button>
            </div>
            <div className="px-5 py-1 divide-y divide-[#02465B]/04">
              <ReviewRow label="Learning area" value={data.learningArea}  />
              <ReviewRow label="Specific skill" value={data.specificSkill} />
              <ReviewRow label="Approach"       value={data.approach}      />
            </div>
          </div>
        )}

        {/* Section: Attendance */}
        {!isMissed && (
          <div className="rounded-xl border border-[#02465B]/08 bg-white overflow-hidden"
            style={{ boxShadow: '0 1px 4px rgba(2,70,91,0.04)' }}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#02465B]/06 bg-[#F5FDFF]">
              <p className="text-xs font-bold uppercase tracking-wider text-[#02465B]">Attendance</p>
              <button type="button" onClick={() => goToStep(2)}
                className="flex items-center gap-1 text-xs text-[#5A7A85] hover:text-[#02465B] transition-colors cursor-pointer">
                <Pencil className="w-3 h-3" /> Edit
              </button>
            </div>
            <div className="px-5 py-1 divide-y divide-[#02465B]/04">
              <ReviewRow label="Present"         value={String(presentCount)} />
              <ReviewRow label="Absent"          value={String(absentCount)}  />
              <ReviewRow label="Computer access" value={data.computerAccess.split(' — ')[0]} />
            </div>
          </div>
        )}

        {/* Section: Learner Progress */}
        {!isMissed && (
          <div className="rounded-xl border border-[#02465B]/08 bg-white overflow-hidden"
            style={{ boxShadow: '0 1px 4px rgba(2,70,91,0.04)' }}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#02465B]/06 bg-[#F5FDFF]">
              <p className="text-xs font-bold uppercase tracking-wider text-[#02465B]">Learner progress</p>
              <button type="button" onClick={() => goToStep(3)}
                className="flex items-center gap-1 text-xs text-[#5A7A85] hover:text-[#02465B] transition-colors cursor-pointer">
                <Pencil className="w-3 h-3" /> Edit
              </button>
            </div>
            <div className="px-5 py-1 divide-y divide-[#02465B]/04">
              <ReviewRow label="Overall progress" value={data.overallProgress}  />
              <ReviewRow label="Achievement"      value={data.achievement}       />
              <ReviewRow label="Challenges"       value={data.challenges}        />
              {hasChallenges && <ReviewRow label="Details"  value={data.challengeDetails} />}
              {hasChallenges && data.supportRequired && <ReviewRow label="Support" value={data.supportRequired} />}
            </div>
          </div>
        )}

        {errors.submit && (
          <div role="alert" className="flex items-center gap-3 rounded-xl border border-[#C0392B]/20 bg-[#FDECEA] px-4 py-3 text-sm text-[#C0392B]">
            <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden />
            {errors.submit}
          </div>
        )}
      </div>
    ),
  }

  if (submitted) {
    return (
      <SuccessScreen
        reference={ref}
        teacherName={user?.name || 'Teacher'}
        onAnother={() => { setSubmitted(false); setData({ ...INITIAL, school: user?.school || '' }); setStep(0) }}
        onHome={onBack}
      />
    )
  }

  return (
    <div ref={topRef} className="min-h-screen bg-[#F5FDFF]">
      {/* Top nav bar */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-[#02465B]/06">
        <div className="max-w-4xl mx-auto px-5 sm:px-6 h-14 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-[#5A7A85] hover:text-[#02465B] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#02465B] rounded-md"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to forms</span>
          </button>

          {/* SIGNATURE: segmented progress pill — centre of the nav bar */}
          <div className="flex-1 max-w-xs mx-4">
            <ProgressPill current={step} total={STEPS.length} />
          </div>

          {/* Step label */}
          <p className="text-xs font-medium text-[#5A7A85] whitespace-nowrap flex-shrink-0">
            <span className="text-[#02465B] font-semibold">{step + 1}</span>/{STEPS.length}
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-5 sm:px-6 py-8 sm:py-10">
        <div className="flex gap-10 lg:gap-14">

          {/* Left nav — desktop */}
          <aside className="hidden md:flex flex-col w-44 lg:w-52 flex-shrink-0 pt-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#9BBAC5] mb-5">
              Daily ICT Record
            </p>
            <nav className="space-y-0.5" role="navigation" aria-label="Form steps">
              {STEPS.map((s, i) => {
                const Icon = s.icon
                const isActive = i === step
                const isDone   = i < step
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => isDone ? goToStep(i) : undefined}
                    disabled={!isDone && !isActive}
                    aria-current={isActive ? 'step' : undefined}
                    className={cn(
                      'w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#02465B]',
                      isActive
                        ? 'bg-[#EBF8FC] text-[#02465B] font-semibold cursor-default'
                        : isDone
                        ? 'text-[#5A7A85] hover:bg-[#F5FDFF] hover:text-[#02465B] cursor-pointer'
                        : 'text-[#9BBAC5] cursor-default'
                    )}
                  >
                    <div className={cn(
                      'w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-all',
                      isActive ? 'bg-[#02465B] text-white' : isDone ? 'bg-[#D6F0F7] text-[#0489AE]' : 'bg-[#F0FAFD] text-[#9BBAC5]'
                    )}>
                      {isDone ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3 h-3" />}
                    </div>
                    <span className="truncate">{s.label}</span>
                  </button>
                )
              })}
            </nav>

            {/* Teacher info */}
            {user && (
              <div className="mt-auto pt-6 border-t border-[#02465B]/06">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#9BBAC5] mb-1">Submitting as</p>
                <p className="text-sm font-semibold text-[#011E28] truncate">{user.name}</p>
                <p className="text-xs text-[#9BBAC5] truncate">{user.staffId || user.id}</p>
              </div>
            )}
          </aside>

          {/* Right: form content */}
          <div className="flex-1 min-w-0">
            {/* Step heading */}
            <div className="mb-7">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#0489AE] mb-1.5">
                Step {step + 1} of {STEPS.length}
              </p>
              <h1 className="text-2xl font-bold text-[#011E28] tracking-tight">
                {STEPS[step].label}
              </h1>
            </div>

            {/* Animated step content */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0, x: direction > 0 ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction > 0 ? -20 : 20 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                {stepContent[step]}
              </motion.div>
            </AnimatePresence>

            {/* Footer nav */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 mt-8 pt-6 border-t border-[#02465B]/06">
              <button
                type="button"
                onClick={goPrev}
                disabled={step === 0}
                className={cn(
                  'flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold transition-all duration-150 cursor-pointer',
                  'border border-[#02465B]/20 text-[#5A7A85]',
                  'hover:border-[#02465B]/40 hover:text-[#02465B] hover:bg-[#F5FDFF]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#02465B] focus-visible:ring-offset-1',
                  'disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none'
                )}
              >
                <ArrowLeft className="w-4 h-4" /> Previous
              </button>

              <div className="flex items-center gap-2.5">
                {/* Save draft */}
                <button
                  type="button"
                  className={cn(
                    'flex items-center gap-2 h-11 px-4 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer',
                    'border border-[#02465B]/15 text-[#9BBAC5]',
                    'hover:border-[#02465B]/30 hover:text-[#5A7A85]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#02465B] focus-visible:ring-offset-1'
                  )}
                >
                  <Save className="w-4 h-4" /> Save draft
                </button>

                {/* Primary action */}
                {isLastStep ? (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className={cn(
                      'flex items-center gap-2 h-11 px-6 rounded-xl text-sm font-bold transition-all duration-150 cursor-pointer',
                      'bg-[#F5CA93] text-[#011E28]',          // amber — final irreversible action
                      'hover:bg-[#F7D6A9] active:bg-[#D4A055]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4952A] focus-visible:ring-offset-1',
                      'disabled:opacity-60 disabled:cursor-not-allowed'
                    )}
                  >
                    {submitting
                      ? <><span className="w-4 h-4 border-2 border-[#011E28]/30 border-t-[#011E28] rounded-full animate-spin" /> Submitting…</>
                      : <><CheckCircle2 className="w-4 h-4" /> Submit lesson</>
                    }
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={goNext}
                    className={cn(
                      'flex items-center gap-2 h-11 px-6 rounded-xl text-sm font-bold transition-all duration-150 cursor-pointer',
                      'bg-[#02465B] text-white',
                      'hover:bg-[#035D77] active:bg-[#02303F]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#02465B] focus-visible:ring-offset-1'
                    )}
                  >
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}