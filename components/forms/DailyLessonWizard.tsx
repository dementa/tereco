'use client'

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, CheckCircle, ArrowRight, ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useAuth } from '@/components/auth/AuthContext';
import { SCHOOLS } from '@/lib/constants';

interface FormData {
  school: string;
  class: string;
  date: string;
  period: string;
  status: string;
  missedReason: string;
  explanation: string;
  learningArea: string;
  specificSkill: string;
  lessonApproach: string;
  present: number;
  absent: number;
  computerAccess: string;
  overallProgress: string;
  achievement: string;
  challenges: string;
  supportRequired: string;
}

const learningAreaOptions = [
  { value: 'Computer Studies', label: 'Computer Studies' },
  { value: 'ICT', label: 'Information & Communication Technology' },
  { value: 'Programming', label: 'Programming & Coding' },
  { value: 'Data Analysis', label: 'Data Analysis' },
  { value: 'Web Design', label: 'Web Design & Development' },
  { value: 'Networking', label: 'Computer Networks' },
  { value: 'Database', label: 'Database Management' },
  { value: 'Multimedia', label: 'Multimedia & Graphics' },
];

const computerAccessOptions = [
  { value: 'Available', label: 'Available' },
  { value: 'Limited', label: 'Limited' },
  { value: 'None', label: 'None' },
];

const progressOptions = [
  { value: 'Excellent', label: 'Excellent' },
  { value: 'Good', label: 'Good' },
  { value: 'Average', label: 'Average' },
  { value: 'Needs Improvement', label: 'Needs Improvement' },
];

const STEP_LABELS = ['Lesson Details', 'Lesson Information', 'Attendance', 'Learner Progress', 'Review'];

export const DailyLessonWizard: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reference] = useState(() => 'TER-' + String(Math.floor(100000 + Math.random() * 900000)));

  const [data, setData] = useState<FormData>({
    school: user?.school || 'Nairobi Academy',
    class: 'Form 3A',
    date: new Date().toISOString().split('T')[0],
    period: '2',
    status: 'Completed',
    missedReason: '',
    explanation: '',
    learningArea: 'Computer Studies',
    specificSkill: 'Spreadsheet Data Analysis',
    lessonApproach: 'Blended',
    present: 28,
    absent: 2,
    computerAccess: 'Available',
    overallProgress: 'Good',
    achievement: 'Most students demonstrated understanding',
    challenges: 'No',
    supportRequired: '',
  });

  const classes = SCHOOLS[data.school] || ['Form 1A', 'Form 2A'];

  const update = (key: keyof FormData, value: string | number) =>
    setData(prev => ({ ...prev, [key]: value }));

  const next = () => currentStep < STEP_LABELS.length - 1 && setCurrentStep(currentStep + 1);
  const prev = () => currentStep > 0 && setCurrentStep(currentStep - 1);

  const isMissed = data.status === 'Missed';
  const showSupport = data.challenges === 'Yes';
  const isLastStep = currentStep === STEP_LABELS.length - 1;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const payload = { ...data };
      const response = await fetch('/api/lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to save lesson');
      }
      setIsSubmitted(true);
    } catch (error) {
      console.error('Submission error:', error);
      alert(error instanceof Error ? error.message : 'An error occurred while saving. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Small mono eyebrow + heading, used once per step — a real "you are here" marker, not decoration
  const SectionTitle: React.FC<{ n: number; title: string }> = ({ n, title }) => (
    <div className="mb-6">
      <span className="font-mono text-[11px] tracking-wide text-text-faint">
        Step {String(n).padStart(2, '0')} of {String(STEP_LABELS.length).padStart(2, '0')}
      </span>
      <h2 className="text-xl font-semibold text-primary-900 mt-0.5">{title}</h2>
      <div className="w-8 h-[3px] bg-accent-dark mt-3" />
    </div>
  );

  const renderStep = () => {
    if (isSubmitted) {
      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-14 sm:py-20">
          {/* Signature moment: a stamped confirmation, the one bold gesture in the whole flow */}
          <div className="relative w-24 h-24 mx-auto -rotate-6">
            <div className="absolute inset-0 rounded-full border-2 border-primary-900" />
            <div className="absolute inset-[6px] rounded-full border border-accent-dark" />
            <div className="absolute inset-0 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-primary-900" />
            </div>
          </div>
          <h2 className="text-lg sm:text-xl font-semibold mt-6 text-primary-900">Lesson record submitted</h2>
          <p className="font-mono text-sm tracking-wide text-primary-700 mt-2 -rotate-1 inline-block border border-primary-200 px-3 py-1">
            {reference}
          </p>
          <div className="mt-3 text-sm text-text-muted space-y-0.5">
            <p>{new Date().toLocaleString()}</p>
            <p>{user?.name}</p>
          </div>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3 px-4">
            <Button variant="primary" className="w-full sm:w-auto" onClick={() => { setIsSubmitted(false); setCurrentStep(0); }}>
              Log another lesson
            </Button>
            <Button variant="outline" className="w-full sm:w-auto" onClick={onBack}>
              Back to forms
            </Button>
          </div>
        </motion.div>
      );
    }

    switch (currentStep) {
      case 0:
        return (
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
            <SectionTitle n={1} title="Lesson Details" />
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                <Select
                  label="School"
                  id="school"
                  options={Object.keys(SCHOOLS).map(s => ({ value: s, label: s }))}
                  value={data.school}
                  onChange={(e) => {
                    update('school', e.target.value);
                    update('class', SCHOOLS[e.target.value]?.[0] || '');
                  }}
                />
                <Select
                  label="Class"
                  id="class"
                  options={classes.map(c => ({ value: c, label: c }))}
                  value={data.class}
                  onChange={(e) => update('class', e.target.value)}
                />
                <Input
                  label="Lesson Date"
                  id="date"
                  type="date"
                  value={data.date}
                  onChange={(e) => update('date', e.target.value)}
                />
                <Input
                  label="Lesson Period"
                  id="period"
                  value={data.period}
                  onChange={(e) => update('period', e.target.value)}
                  placeholder="e.g. 2"
                />
              </div>
              <Select
                label="Lesson Status"
                id="status"
                options={[
                  { value: 'Completed', label: 'Completed' },
                  { value: 'Partially Completed', label: 'Partially Completed' },
                  { value: 'Missed', label: 'Missed' },
                ]}
                value={data.status}
                onChange={(e) => update('status', e.target.value)}
              />
              <AnimatePresence>
                {isMissed && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-4 overflow-hidden pl-4 border-l-2 border-warning"
                  >
                    <Input
                      label="Reason for Missed Lesson"
                      id="missedReason"
                      value={data.missedReason}
                      onChange={(e) => update('missedReason', e.target.value)}
                      placeholder="e.g. Public holiday, school closure"
                    />
                    <Input
                      label="Explanation"
                      id="explanation"
                      value={data.explanation}
                      onChange={(e) => update('explanation', e.target.value)}
                      placeholder="Additional details..."
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        );

      case 1:
        return (
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
            <SectionTitle n={2} title="Lesson Information" />
            <div className="space-y-5">
              <Select
                label="Learning Area"
                id="learningArea"
                options={learningAreaOptions}
                value={data.learningArea}
                onChange={(e) => update('learningArea', e.target.value)}
              />
              <Input
                label="Specific Skill"
                id="specificSkill"
                value={data.specificSkill}
                onChange={(e) => update('specificSkill', e.target.value)}
                placeholder="e.g. Spreadsheet Data Analysis"
              />
              <Select
                label="Lesson Approach"
                id="lessonApproach"
                options={[
                  { value: 'Blended', label: 'Blended' },
                  { value: 'Practical', label: 'Practical' },
                  { value: 'Theory', label: 'Theory' },
                  { value: 'Discussion', label: 'Discussion' },
                ]}
                value={data.lessonApproach}
                onChange={(e) => update('lessonApproach', e.target.value)}
              />
            </div>
          </motion.div>
        );

      case 2:
        return (
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
            <SectionTitle n={3} title="Attendance" />
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
                <Input
                  label="Learners Present"
                  id="present"
                  type="number"
                  value={data.present}
                  onChange={(e) => update('present', parseInt(e.target.value) || 0)}
                />
                <Input
                  label="Learners Absent"
                  id="absent"
                  type="number"
                  value={data.absent}
                  onChange={(e) => update('absent', parseInt(e.target.value) || 0)}
                />
                <Select
                  label="Computer Access"
                  id="computerAccess"
                  options={computerAccessOptions}
                  value={data.computerAccess}
                  onChange={(e) => update('computerAccess', e.target.value)}
                />
              </div>
              <div className="flex divide-x divide-primary-100 border-t border-b border-primary-100">
                <div className="flex-1 px-1 py-4">
                  <p className="font-mono text-[11px] text-text-faint">Total learners</p>
                  <p className="font-mono text-2xl text-primary-900 mt-1">{data.present + data.absent}</p>
                </div>
                <div className="flex-1 px-4 py-4">
                  <p className="font-mono text-[11px] text-text-faint">Attendance rate</p>
                  <p className="font-mono text-2xl text-primary-900 mt-1">
                    {data.present + data.absent > 0 ? Math.round((data.present / (data.present + data.absent)) * 100) : 0}%
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        );

      case 3:
        return (
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
            <SectionTitle n={4} title="Learner Progress" />
            <div className="space-y-5">
              <Select
                label="Overall Learner Progress"
                id="overallProgress"
                options={progressOptions}
                value={data.overallProgress}
                onChange={(e) => update('overallProgress', e.target.value)}
              />
              <Input
                label="Main Achievement"
                id="achievement"
                value={data.achievement}
                onChange={(e) => update('achievement', e.target.value)}
                placeholder="What was the main achievement?"
              />
              <Select
                label="Challenges Encountered"
                id="challenges"
                options={[
                  { value: 'No', label: 'No challenges' },
                  { value: 'Yes', label: 'Yes, challenges faced' },
                ]}
                value={data.challenges}
                onChange={(e) => update('challenges', e.target.value)}
              />
              <AnimatePresence>
                {showSupport && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden pl-4 border-l-2 border-warning"
                  >
                    <Input
                      label="Support Required"
                      id="supportRequired"
                      value={data.supportRequired}
                      onChange={(e) => update('supportRequired', e.target.value)}
                      placeholder="Describe the support needed..."
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        );

      case 4:
        return (
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
            <SectionTitle n={5} title="Review" />
            <div className="divide-y divide-primary-100 border-t border-b border-primary-100">
              {Object.entries(data)
                .filter(([, value]) => String(value).trim() !== '')
                .map(([key, value], i) => (
                  <div key={key} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-4 py-2.5">
                    <span className="font-mono text-[11px] text-text-faint shrink-0">
                      {String(i + 1).padStart(2, '0')} {key.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <span className="text-sm text-primary-900 text-left sm:text-right break-words">
                      {String(value)}
                    </span>
                  </div>
                ))}
            </div>
            <div className="flex items-center gap-3 mt-5">
              <span className="font-mono text-[11px] text-text-faint shrink-0">Complete</span>
              <div className="flex-1 h-px bg-primary-100 relative">
                <div className="absolute inset-y-0 left-0 bg-primary-700" style={{ width: '82%', height: '2px', top: '-0.5px' }} />
              </div>
              <span className="font-mono text-[11px] text-primary-900 shrink-0">82%</span>
            </div>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-bg px-3 py-4 sm:px-6 sm:py-6 md:p-8 flex items-start justify-center">
      <div className="w-full max-w-3xl">
        <button
          onClick={onBack}
          className="text-sm text-text-muted hover:text-primary-700 mb-5 sm:mb-6 flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to forms
        </button>

        <div className="sm:flex sm:gap-10 lg:gap-14">
          {/* Vertical tab rail — ledger-tab feel, only on larger screens */}
          {!isSubmitted && (
            <aside className="hidden sm:block w-40 lg:w-48 shrink-0 pt-1">
              <p className="font-mono text-[11px] text-text-faint mb-4">Daily ICT Record</p>
              <nav className="space-y-0.5">
                {STEP_LABELS.map((label, i) => {
                  const isActive = i === currentStep;
                  const isDone = i < currentStep;
                  return (
                    <button
                      key={label}
                      onClick={() => (isDone || isActive) && setCurrentStep(i)}
                      disabled={!isDone && !isActive}
                      className={[
                        'w-full text-left flex items-center gap-2 py-2 pl-3 -ml-px border-l-2 text-sm transition-colors',
                        isActive
                          ? 'border-primary-900 text-primary-900 font-medium'
                          : isDone
                          ? 'border-primary-300 text-text-secondary hover:text-primary-700'
                          : 'border-primary-100 text-text-faint cursor-default',
                      ].join(' ')}
                    >
                      <span className="truncate">{label}</span>
                      {isDone && <Check className="w-3 h-3 text-primary-700 shrink-0 ml-auto" />}
                    </button>
                  );
                })}
              </nav>
            </aside>
          )}

          <div className="flex-1 min-w-0">
            {/* Mobile step strip */}
            {!isSubmitted && (
              <div className="sm:hidden mb-6">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[11px] text-text-faint">{STEP_LABELS[currentStep]}</span>
                  <span className="font-mono text-[11px] text-text-faint">
                    {currentStep + 1}/{STEP_LABELS.length}
                  </span>
                </div>
                <div className="h-px bg-primary-100 mt-2 relative">
                  <div
                    className="absolute inset-y-0 left-0 bg-primary-700 transition-all duration-300"
                    style={{ width: `${((currentStep + 1) / STEP_LABELS.length) * 100}%`, height: '2px', top: '-0.5px' }}
                  />
                </div>
              </div>
            )}

            <div className="min-h-[240px] sm:min-h-[300px]">
              {renderStep()}
            </div>

            {!isSubmitted && (
              <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2.5 sm:gap-0 pt-6 mt-6 border-t border-primary-100">
                <Button
                  variant="outline"
                  onClick={prev}
                  disabled={currentStep === 0 || isSubmitting}
                  className="w-full sm:w-auto"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Previous
                </Button>
                <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
                  <Button variant="outline" className="w-full sm:w-auto text-text-muted" disabled={isSubmitting}>
                    <Save className="w-4 h-4" />
                    Save draft
                  </Button>
                  <Button
                    variant={isLastStep ? 'secondary' : 'primary'}
                    onClick={isLastStep ? handleSubmit : next}
                    isLoading={isSubmitting && isLastStep}
                    disabled={isSubmitting}
                    className="w-full sm:w-auto"
                  >
                    {isLastStep ? 'Submit lesson' : 'Continue'}
                    {!isLastStep && <ArrowRight className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};