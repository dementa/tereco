import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { ClipboardCheck, FileText, Laptop, Smile } from 'lucide-react';

// Listed in the order a teacher actually works: register at the start of the
// lesson, report and practical skills after it. Practical scoring reads its
// roster from the attendance session, so it deliberately sits last — it has
// nothing to show until the register exists. Behaviour Rating has no such
// dependency (it's a class/stream pick, not a session), so it sits with the
// other standalone forms rather than after practical.
const FORMS = [
  { href: '/staff/attendance', label: 'Attendance', description: 'Mark the roster at the start of a lesson.', icon: ClipboardCheck },
  { href: '/staff/lessons',    label: 'Lesson Reports', description: 'File what happened after the lesson.', icon: FileText },
  { href: '/staff/practical',  label: 'Practical Skills', description: 'Score lab skills for the learners you had.', icon: Laptop },
  { href: '/staff/behaviour',  label: 'Behaviour Rating', description: 'Rate how a class has been behaving this term.', icon: Smile },
];

export default function StaffFormsPage() {
  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">Data Forms</h1>
      <p className="text-sm text-text-muted mb-6">Field forms you fill as a teacher.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {FORMS.map((f) => {
          const Icon = f.icon;
          return (
            <Link key={f.href} href={f.href}>
              <Card hover className="p-5 h-full">
                <div className="p-2 sm:p-2.5 rounded-xl bg-bg-muted w-fit mb-2 sm:mb-3">
                  <Icon className="w-5 h-5 text-primary-700" />
                </div>
                <p className="font-semibold text-primary-900">{f.label}</p>
                <p className="text-sm text-text-muted mt-1">{f.description}</p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
