'use client'

/**
 * The lesson report's "attach the attendance you already took" step. Hard
 * blocks submission (via the parent's validateStep) until a session is
 * selected — there is deliberately no live roster-marking fallback here
 * anymore, that lives in AttendanceForm.tsx / the standalone Attendance form.
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowRight } from 'lucide-react'
import { RadioCard, cn } from './wizardPrimitives'

export interface AvailableAttendanceSession {
  id: string
  takenAt: string
  present: number
  absent: number
}

interface Props {
  classId?: string
  streamId?: string
  date: string
  period: string
  isMissed: boolean
  selected: AvailableAttendanceSession | null
  onSelect: (s: AvailableAttendanceSession | null) => void
}

export function AttendanceAttachPanel({ classId, streamId, date, period, isMissed, selected, onSelect }: Props) {
  const [options, setOptions] = useState<AvailableAttendanceSession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Re-fetching for a new slot must never carry a stale match forward — a
  // session auto-picked for the previous class/date/period would otherwise
  // silently ride along if the teacher edits step 1 after a match happened.
  useEffect(() => {
    onSelect(null)
    setOptions([])
    setError('')

    if (isMissed || !classId || !date || !period) return
    let cancelled = false

    setLoading(true)
    const query = new URLSearchParams({ classId, date, period })
    if (streamId) query.set('streamId', streamId)

    fetch(`/api/attendance/available?${query.toString()}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d.success) {
          const found: AvailableAttendanceSession[] = d.data
          setOptions(found)
          if (found.length === 1) onSelect(found[0])
        } else {
          setError(d.message || 'Could not load matching attendance records.')
        }
      })
      .catch(() => { if (!cancelled) setError('Network error loading attendance records.') })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, streamId, date, period, isMissed])

  if (isMissed) return null

  if (loading) {
    return <p className="text-sm text-[#9BBAC5] py-4">Looking for matching attendance records…</p>
  }

  if (error) {
    return (
      <p role="alert" className="flex items-center gap-1.5 text-xs text-[#C0392B] py-2">
        <AlertCircle className="w-3.5 h-3.5" aria-hidden /> {error}
      </p>
    )
  }

  if (options.length === 0) {
    return (
      <div className="rounded-xl border border-[#C4952A]/30 bg-[#FCF3DE] px-4 py-3.5">
        <p className="text-sm text-[#8A6A16] mb-2">
          No attendance record found yet for this class, stream, date and period. Fill the Attendance
          form first, then come back to file this report.
        </p>
        <Link
          href="/staff/attendance/new"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#02465B] hover:text-[#035D77]"
        >
          Go to the Attendance form <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    )
  }

  if (options.length === 1) {
    const only = options[0]
    return (
      <div className="rounded-xl border border-[#02465B]/10 bg-[#EBF8FC] px-4 py-3.5">
        <p className="text-sm text-[#02465B] font-medium">
          Attached — attendance taken {new Date(only.takenAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
        <p className="text-xs text-[#5A7A85] mt-0.5">{only.present} present · {only.absent} absent</p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-2')}>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#02465B] mb-1">
        More than one attendance record matches — pick the right one
      </p>
      {options.map(o => (
        <RadioCard
          key={o.id}
          value={o.id}
          label={new Date(o.takenAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
          description={`${o.present} present · ${o.absent} absent`}
          selected={selected?.id === o.id}
          onChange={() => onSelect(o)}
        />
      ))}
    </div>
  )
}
