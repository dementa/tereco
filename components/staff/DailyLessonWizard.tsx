'use client'

/**
 * DailyLessonWizard — TERECO Field Data Collection
 * ─────────────────────────────────────────────────
 * Filed AFTER the lesson. Attendance is no longer marked live here — it was
 * taken earlier through its own form (components/staff/AttendanceForm.tsx)
 * and this wizard just attaches that record (AttendanceAttachPanel.tsx),
 * auto-matched by class/stream/date/period.
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
 *
 * Signature element: segmented teal progress pill — the one bold gesture.
 * Everything else is restrained.
 */

import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, Save, Check, CheckCircle2,
  AlertCircle, Users, Monitor, TrendingUp, FileText, Pencil,
} from 'lucide-react'
import { useAuth } from '@/components/auth/AuthContext'
import {
  cn, FloatingInput, FloatingSelect, FloatingTextarea, RadioCard, ProgressPill, ReviewRow, SuccessScreen,
} from './wizardPrimitives'
import { AttendanceAttachPanel, type AvailableAttendanceSession } from './AttendanceAttachPanel'

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
  'Computer Studies':                   ['Computer Lab Rules & Regulation', 'Introduction to Computers', 'Mouse Skills', 'Keyboard Skills', 'Graphical User Interface 1'],
  'Information & Communication Technology': ['Email composition', 'Cloud storage', 'Digital citizenship', 'Online research', 'Data privacy'],
  'Programming & Coding':               ['Variables & data types', 'Control flow', 'Functions', 'Debugging', 'Simple projects'],
  'Data Analysis':                      ['Sorting & filtering', 'Charts & graphs', 'Formulas', 'Pivot tables', 'Data visualisation'],
  'Web Design & Development':           ['HTML structure', 'CSS styling', 'Responsive design', 'Forms', 'Publishing'],
  'Computer Networks':                  ['Network types', 'IP addressing', 'Troubleshooting', 'Security', 'Wireless networks'],
  'Database Management':                ['Tables & records', 'Queries', 'Forms & reports', 'Relationships', 'Data integrity'],
  'Multimedia & Graphics':              ['Image editing', 'Vector graphics', 'Video basics', 'Audio editing', 'Presentation design'],
}

const APPROACHES = ['Theory', 'Practical', 'Demonstration', 'Pair work', 'Group work', 'Individual practice', 'Discussion', 'Project-based', 'Flipped classroom']
const PROGRESS_LEVELS = ['Excellent', 'Good', 'Satisfactory', 'Needs improvement', 'Poor']
const PERIODS = Array.from({ length: 30 }, (_, i) => `Session ${i + 1}`)
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
function validateStep(
  step: number,
  data: FormData,
  selectedClassHasStreams: boolean,
  selectedSession: AvailableAttendanceSession | null
): FieldError {
  const err: FieldError = {}
  if (step === 0) {
    if (!data.school)    err.school = 'Select a school'
    if (!data.className) err.className = 'Select a class'
    if (selectedClassHasStreams && !data.stream) err.stream = 'Select a stream'
    if (!data.date)      err.date = 'Enter the lesson date'
    if (!data.period)    err.period = 'Select a session'
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
    if (data.status !== 'Missed' && !selectedSession)
      err.attendance = 'Attach an attendance record for this class before continuing'
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

  // Attendance is attached, not marked here — the id of whatever
  // AttendanceAttachPanel resolved (auto-matched or explicitly picked).
  const [selectedSession, setSelectedSession] = useState<AvailableAttendanceSession | null>(null)

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

  const presentCount = selectedSession?.present ?? 0
  const absentCount  = selectedSession?.absent ?? 0

  /* Clear errors when field changes */
  const clearErr = (key: string) => {
    if (errors[key]) setErrors(e => { const n = { ...e }; delete n[key]; return n })
  }

  function scrollTop() {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function goNext() {
    const errs = validateStep(step, data, !!selectedClass?.hasStreams, selectedSession)
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
      const res = await fetch('/api/lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data, reference: ref, teacher: user?.name,
          attendanceSessionId: isMissed ? undefined : selectedSession?.id,
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
            label="Lesson session"
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
                    ? 'border-[#02465B] bg-[#F5F5F5] text-[#02465B]'
                    : 'border-[#02465B]/10 bg-white text-[#666666] hover:border-[#02465B]/25 hover:text-[#011E28]'
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
          <div className="rounded-xl border border-[#02465B]/10 bg-[#FFFFFF] px-4 py-3.5">
            <p className="text-sm text-[#666666]">
              This lesson did not take place, so there is no attendance to record.
            </p>
          </div>
        ) : (
          <>
            {/* Live stats, derived from the attached attendance record */}
            {selectedSession && (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-[#F5F5F5] border border-[#02465B]/08 px-4 py-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#0489AE] mb-0.5">Present</p>
                  <p className="text-2xl font-bold text-[#011E28] tabular-nums">{presentCount}</p>
                </div>
                <div className="rounded-xl bg-[#F5F5F5] border border-[#02465B]/08 px-4 py-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#0489AE] mb-0.5">Absent</p>
                  <p className="text-2xl font-bold text-[#011E28] tabular-nums">{absentCount}</p>
                </div>
                <div className="rounded-xl bg-[#F5F5F5] border border-[#02465B]/08 px-4 py-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#0489AE] mb-0.5">Rate</p>
                  <p className="text-2xl font-bold text-[#011E28] tabular-nums">
                    {presentCount + absentCount > 0 ? `${Math.round((presentCount / (presentCount + absentCount)) * 100)}%` : '—'}
                  </p>
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#02465B] mb-2.5">
                Attendance
              </p>
              <AttendanceAttachPanel
                classId={selectedClass?.id}
                streamId={selectedStream?.id}
                date={data.date}
                period={data.period}
                isMissed={isMissed}
                selected={selectedSession}
                onSelect={setSelectedSession}
              />
              {errors.attendance && (
                <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-[#C0392B]">
                  <AlertCircle className="w-3.5 h-3.5" aria-hidden /> {errors.attendance}
                </p>
              )}
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
                    ? 'border-[#02465B] bg-[#F5F5F5] text-[#02465B]'
                    : 'border-[#02465B]/10 bg-white text-[#666666] hover:border-[#02465B]/25 hover:text-[#011E28]'
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
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#02465B]/06 bg-[#FFFFFF]">
            <p className="text-xs font-bold uppercase tracking-wider text-[#02465B]">Lesson details</p>
            <button type="button" onClick={() => goToStep(0)}
              className="flex items-center gap-1 text-xs text-[#666666] hover:text-[#02465B] transition-colors cursor-pointer">
              <Pencil className="w-3 h-3" /> Edit
            </button>
          </div>
          <div className="px-5 py-1 divide-y divide-[#02465B]/04">
            <ReviewRow label="School"  value={data.school}     onEdit={() => goToStep(0)} />
            <ReviewRow label="Class"   value={data.className}  onEdit={() => goToStep(0)} />
            <ReviewRow label="Stream"  value={data.stream}     onEdit={() => goToStep(0)} />
            <ReviewRow label="Date"    value={new Date(data.date).toLocaleDateString('en-GB', { dateStyle: 'long' })} />
            <ReviewRow label="Session" value={data.period}     />
            <ReviewRow label="Status"  value={data.status}     />
            {isMissed && <ReviewRow label="Reason" value={data.missedReason} />}
          </div>
        </div>

        {/* Section: Learning */}
        {!isMissed && (
          <div className="rounded-xl border border-[#02465B]/08 bg-white overflow-hidden"
            style={{ boxShadow: '0 1px 4px rgba(2,70,91,0.04)' }}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#02465B]/06 bg-[#FFFFFF]">
              <p className="text-xs font-bold uppercase tracking-wider text-[#02465B]">Learning</p>
              <button type="button" onClick={() => goToStep(1)}
                className="flex items-center gap-1 text-xs text-[#666666] hover:text-[#02465B] transition-colors cursor-pointer">
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
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#02465B]/06 bg-[#FFFFFF]">
              <p className="text-xs font-bold uppercase tracking-wider text-[#02465B]">Attendance</p>
              <button type="button" onClick={() => goToStep(2)}
                className="flex items-center gap-1 text-xs text-[#666666] hover:text-[#02465B] transition-colors cursor-pointer">
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
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#02465B]/06 bg-[#FFFFFF]">
              <p className="text-xs font-bold uppercase tracking-wider text-[#02465B]">Learner progress</p>
              <button type="button" onClick={() => goToStep(3)}
                className="flex items-center gap-1 text-xs text-[#666666] hover:text-[#02465B] transition-colors cursor-pointer">
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
        heading="Lesson submitted"
        subheading="Your record has been saved successfully."
        anotherLabel="Submit another lesson"
        onAnother={() => { setSubmitted(false); setData({ ...INITIAL, school: user?.school || '' }); setStep(0); setSelectedSession(null) }}
        onHome={onBack}
      />
    )
  }

  return (
    <div ref={topRef} className="min-h-screen bg-[#FFFFFF]">
      {/* Top nav bar */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-[#02465B]/06">
        <div className="max-w-4xl mx-auto px-5 sm:px-6 h-14 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-[#666666] hover:text-[#02465B] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#02465B] rounded-md"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to forms</span>
          </button>

          {/* SIGNATURE: segmented progress pill — centre of the nav bar */}
          <div className="flex-1 max-w-xs mx-4">
            <ProgressPill current={step} total={STEPS.length} />
          </div>

          {/* Step label */}
          <p className="text-xs font-medium text-[#666666] whitespace-nowrap flex-shrink-0">
            <span className="text-[#02465B] font-semibold">{step + 1}</span>/{STEPS.length}
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-5 sm:px-6 py-8 sm:py-10">
        <div className="flex gap-10 lg:gap-14">

          {/* Left nav — desktop */}
          <aside className="hidden md:flex flex-col w-44 lg:w-52 flex-shrink-0 pt-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#A3A3A3] mb-5">
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
                        ? 'bg-[#F5F5F5] text-[#02465B] font-semibold cursor-default'
                        : isDone
                        ? 'text-[#666666] hover:bg-[#FFFFFF] hover:text-[#02465B] cursor-pointer'
                        : 'text-[#A3A3A3] cursor-default'
                    )}
                  >
                    <div className={cn(
                      'w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-all',
                      isActive ? 'bg-[#02465B] text-white' : isDone ? 'bg-[#D6F0F7] text-[#0489AE]' : 'bg-[#F5F5F5] text-[#A3A3A3]'
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
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#A3A3A3] mb-1">Submitting as</p>
                <p className="text-sm font-semibold text-[#011E28] truncate">{user.name}</p>
                <p className="text-xs text-[#A3A3A3] truncate">{user.staffId || user.id}</p>
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
                  'border border-[#02465B]/20 text-[#666666]',
                  'hover:border-[#02465B]/40 hover:text-[#02465B] hover:bg-[#FFFFFF]',
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
                    'border border-[#02465B]/15 text-[#A3A3A3]',
                    'hover:border-[#02465B]/30 hover:text-[#666666]',
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
