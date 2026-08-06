import { AssessmentTake } from '@/components/assessment/AssessmentTake';

/**
 * Practising a closed paper (an E-Paper).
 *
 * Sits outside the (dashboard) group for the same reason take/[id] does: a
 * persistent nav sidebar beside a paper is a way to wander off halfway through.
 * Practice is untimed, so there is no clock to lose — but a half-finished
 * practice run still has answers in it worth not abandoning by accident.
 */
export default function PracticePaperPage() {
  return <AssessmentTake mode="practice" />;
}
