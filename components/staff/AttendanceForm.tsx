'use client'

/**
 * AttendanceForm — standalone attendance-taking, filed at the start of a
 * lesson, independently of any lesson report. A DailyLessonWizard filed
 * later for the same class/stream/date/period attaches whatever this
 * submits (see AttendanceAttachPanel.tsx) instead of marking a roster again.
 *
 * Roster-marking logic and styling here is unchanged from what used to live
 * inline in DailyLessonWizard's "Attendance" step — only pulled into its own
 * form, not redesigned.
 */

import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2,
  AlertCircle, Clock, Users, FileText, UserPlus, X, Search,
} from 'lucide-react'
import { useAuth } from '@/components/auth/AuthContext'
import {
  cn, FloatingInput, FloatingSelect, AttendanceRow, ProgressPill, SuccessScreen,
} from './wizardPrimitives'

/* ─────────────────────────────────────────────────
   Types
───────────────────────────────────────────────── */
interface FormData {
  school: string
  className: string
  stream: string
  date: string
  period: string
}

interface FieldError { [key: string]: string }

interface RosterEntry {
  enrollmentId: string
  studentId: string
  systemId: string | null
  name: string
}

interface DirectoryStream { id: string; name: string }
interface DirectoryClass {
  id: string
  level: number | null
  displayName: string
  hasStreams: boolean
  streams: DirectoryStream[]
}
interface DirectorySchool { id: string; name: string; classes: DirectoryClass[] }

const PERIODS = Array.from({ length: 8 }, (_, i) => `Period ${i + 1}`)

const STEPS = [
  { id: 'details', label: 'Class details', icon: FileText },
  { id: 'attendance', label: 'Attendance', icon: Users },
]

const INITIAL: FormData = {
  school: '', className: '', stream: '', date: new Date().toISOString().split('T')[0], period: '',
}

function validateStep(step: number, data: FormData, selectedClassHasStreams: boolean): FieldError {
  const err: FieldError = {}
  if (step === 0) {
    if (!data.school) err.school = 'Select a school'
    if (!data.className) err.className = 'Select a class'
    if (selectedClassHasStreams && !data.stream) err.stream = 'Select a stream'
    if (!data.date) err.date = 'Enter the date'
    if (!data.period) err.period = 'Select a period'
  }
  return err
}

export function AttendanceForm({ onBack }: { onBack: () => void }) {
  const { user } = useAuth()
  const [step, setStep] = useState(0)
  const [data, setData] = useState<FormData>({ ...INITIAL, school: user?.school || '' })
  const [errors, setErrors] = useState<FieldError>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [ref] = useState(() => `ATT-${String(Math.floor(100000 + Math.random() * 900000))}`)
  const topRef = useRef<HTMLDivElement>(null)
  const [directory, setDirectory] = useState<DirectorySchool[]>([])

  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [rosterError, setRosterError] = useState('')
  const [absentIds, setAbsentIds] = useState<Set<string>>(new Set())
  const [showAddLearner, setShowAddLearner] = useState(false)
  const [newLearner, setNewLearner] = useState({ firstName: '', lastName: '', gender: '' as '' | 'male' | 'female', dateOfBirth: '' })
  const [addingLearner, setAddingLearner] = useState(false)
  const [addLearnerError, setAddLearnerError] = useState('')
  const [pendingLearners, setPendingLearners] = useState<string[]>([])
  const [rosterQuery, setRosterQuery] = useState('')

  useEffect(() => {
    fetch('/api/directory/schools')
      .then(r => r.json())
      .then(d => { if (d.success) setDirectory(d.data) })
      .catch(() => {})
  }, [])

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setData(p => ({ ...p, [key]: value }))

  const selectedSchool = directory.find(s => s.name === data.school)
  const availableClasses = selectedSchool?.classes ?? []
  const selectedClass = availableClasses.find(c => c.displayName === data.className)
  const availableStreams = selectedClass?.streams ?? []
  const selectedStream = availableStreams.find(s => s.name === data.stream)

  const rosterSettled = !!selectedClass && (!selectedClass.hasStreams || !!selectedStream) && !!data.date && !!data.period

  useEffect(() => {
    if (!rosterSettled || !selectedClass) return
    let cancelled = false
    const query = selectedStream ? `?streamId=${selectedStream.id}` : ''

    Promise.resolve()
      .then(() => {
        if (cancelled) return undefined
        setRosterLoading(true)
        setRosterError('')
        return fetch(`/api/directory/classes/${selectedClass.id}/roster${query}`).then(r => r.json())
      })
      .then(d => {
        if (cancelled || !d) return
        if (d.success) { setRoster(d.data); setAbsentIds(new Set()); setRosterQuery('') }
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

  const activeRoster = rosterSettled ? roster : []
  const activeRosterIds = new Set(activeRoster.map(r => r.studentId))
  const effectiveAbsentIds = new Set([...absentIds].filter(id => activeRosterIds.has(id)))
  const presentCount = activeRoster.length - effectiveAbsentIds.size
  const absentCount = effectiveAbsentIds.size

  const trimmedRosterQuery = rosterQuery.trim().toLowerCase()
  const visibleRoster = trimmedRosterQuery
    ? activeRoster.filter(r =>
        r.name.toLowerCase().includes(trimmedRosterQuery) ||
        (r.systemId || '').toLowerCase().includes(trimmedRosterQuery)
      )
    : activeRoster

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
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: selectedSchool?.id, classId: selectedClass?.id, streamId: selectedStream?.id,
          date: data.date, period: data.period, attendance,
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
            label="Date"
            type="date"
            value={data.date}
            onChange={v => { set('date', v); clearErr('date') }}
            error={errors.date}
            required
          />
          <FloatingSelect
            label="Period"
            options={PERIODS}
            value={data.period}
            onChange={v => { set('period', v); clearErr('period') }}
            error={errors.period}
            required
          />
        </div>
      </div>
    ),

    1: (
      <div className="space-y-4">
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
            <>
              <div className="relative mb-2.5">
                <Search className="w-4 h-4 text-[#9BBAC5] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
                <input
                  type="text"
                  value={rosterQuery}
                  onChange={e => setRosterQuery(e.target.value)}
                  placeholder="Search by name or ID…"
                  aria-label="Search the roster by name or ID"
                  className={cn(
                    'w-full h-10 pl-9 pr-3 rounded-xl border bg-white text-sm text-[#011E28]',
                    'outline-none transition-all duration-200 placeholder-[#9BBAC5]',
                    'border-[#02465B]/15 hover:border-[#02465B]/30 focus:border-[#02465B] focus:ring-2 focus:ring-[#02465B]/10'
                  )}
                />
              </div>
              <div className="rounded-xl border border-[#02465B]/08 bg-white px-3">
                {visibleRoster.length === 0 ? (
                  <p className="text-sm text-[#9BBAC5] py-4 text-center">No student matches &ldquo;{rosterQuery.trim()}&rdquo;.</p>
                ) : (
                  visibleRoster.map(r => (
                    <AttendanceRow
                      key={r.studentId}
                      name={r.name}
                      systemId={r.systemId}
                      present={!effectiveAbsentIds.has(r.studentId)}
                      onToggle={() => toggleAbsent(r.studentId)}
                    />
                  ))
                )}
              </div>
            </>
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
        heading="Attendance submitted"
        subheading="This is ready to attach to a lesson report."
        anotherLabel="Take another attendance"
        onAnother={() => { setSubmitted(false); setData({ ...INITIAL, school: user?.school || '' }); setStep(0) }}
        onHome={onBack}
      />
    )
  }

  return (
    <div ref={topRef} className="min-h-screen bg-[#F5FDFF]">
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

          <div className="flex-1 max-w-xs mx-4">
            <ProgressPill current={step} total={STEPS.length} />
          </div>

          <p className="text-xs font-medium text-[#5A7A85] whitespace-nowrap flex-shrink-0">
            <span className="text-[#02465B] font-semibold">{step + 1}</span>/{STEPS.length}
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-5 sm:px-6 py-8 sm:py-10">
        <div className="flex gap-10 lg:gap-14">
          <aside className="hidden md:flex flex-col w-44 lg:w-52 flex-shrink-0 pt-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#9BBAC5] mb-5">
              Attendance
            </p>
            <nav className="space-y-0.5" role="navigation" aria-label="Form steps">
              {STEPS.map((s, i) => {
                const Icon = s.icon
                const isActive = i === step
                const isDone = i < step
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

            {user && (
              <div className="mt-auto pt-6 border-t border-[#02465B]/06">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#9BBAC5] mb-1">Submitting as</p>
                <p className="text-sm font-semibold text-[#011E28] truncate">{user.name}</p>
                <p className="text-xs text-[#9BBAC5] truncate">{user.staffId || user.id}</p>
              </div>
            )}
          </aside>

          <div className="flex-1 min-w-0">
            <div className="mb-7">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#0489AE] mb-1.5">
                Step {step + 1} of {STEPS.length}
              </p>
              <h1 className="text-2xl font-bold text-[#011E28] tracking-tight">
                {STEPS[step].label}
              </h1>
            </div>

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
                {isLastStep ? (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className={cn(
                      'flex items-center gap-2 h-11 px-6 rounded-xl text-sm font-bold transition-all duration-150 cursor-pointer',
                      'bg-[#F5CA93] text-[#011E28]',
                      'hover:bg-[#F7D6A9] active:bg-[#D4A055]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4952A] focus-visible:ring-offset-1',
                      'disabled:opacity-60 disabled:cursor-not-allowed'
                    )}
                  >
                    {submitting
                      ? <><span className="w-4 h-4 border-2 border-[#011E28]/30 border-t-[#011E28] rounded-full animate-spin" /> Submitting…</>
                      : <><CheckCircle2 className="w-4 h-4" /> Submit attendance</>
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
