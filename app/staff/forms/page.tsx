import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { ClipboardCheck, FileText } from 'lucide-react';

const FORMS = [
  { href: '/staff/attendance', label: 'Attendance', description: 'Mark the roster at the start of a lesson.', icon: ClipboardCheck },
  { href: '/staff/lessons',    label: 'Lesson Reports', description: 'File what happened after the lesson.', icon: FileText },
];

export default function StaffFormsPage() {
  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">Data Forms</h1>
      <p className="text-sm text-text-muted mb-6">Field forms you fill as a teacher.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {FORMS.map((f) => {
          const Icon = f.icon;
          return (
            <Link key={f.href} href={f.href}>
              <Card hover className="p-5 h-full">
                <div className="p-2.5 rounded-xl bg-bg-muted w-fit mb-3">
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
