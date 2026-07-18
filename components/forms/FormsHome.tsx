'use client'

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  BookOpen, Users, ClipboardCheck, FileText, School, Package,
  LogOut, Settings, Clock, CheckCircle, Shield, LayoutDashboard
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/components/auth/AuthContext';

interface FormsHomeProps {
  onSelectForm: (formId: string) => void;
  onLogout: () => void;
}

export const FormsHome: React.FC<FormsHomeProps> = ({ onSelectForm, onLogout }) => {
  const { user } = useAuth();
  const [greeting] = useState(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  });

  const forms = [
    { id: 'daily', name: 'Daily ICT Lesson Record', description: 'Complete lesson details, attendance, and progress tracking.', time: '5-7 min', status: 'active' as const, icon: BookOpen },
    { id: 'attendance', name: 'Attendance Register', description: 'Record daily student attendance and participation.', time: '2-3 min', status: 'coming' as const, icon: Users },
    { id: 'equipment', name: 'ICT Equipment Checklist', description: 'Verify and report ICT equipment status.', time: '3-4 min', status: 'coming' as const, icon: ClipboardCheck },
    { id: 'assessment', name: 'Assessment Report', description: 'Submit learner assessment results and feedback.', time: '6-8 min', status: 'coming' as const, icon: FileText },
    { id: 'inspection', name: 'School Inspection', description: 'Comprehensive school inspection report.', time: '8-10 min', status: 'coming' as const, icon: School },
    { id: 'inventory', name: 'Inventory Report', description: 'Report on ICT inventory and supplies.', time: '4-5 min', status: 'coming' as const, icon: Package },
  ];

  return (
    <div className="min-h-screen bg-bg p-3 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 sm:mb-8 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary-700 flex items-center justify-center shadow-sm shrink-0">
              <span className="text-white text-sm sm:text-base font-bold">TC</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl md:text-3xl font-semibold text-primary-900 tracking-tight truncate">
                {greeting}, {user?.name?.split(' ')[0]}
              </h1>
              <p className="text-text-muted text-xs sm:text-sm mt-0.5 flex items-center gap-2 flex-wrap">
                <span className="truncate max-w-[60vw] sm:max-w-none">{user?.school}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-success" />
                  <span className="text-success">Online</span>
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
            {user?.role === 'admin' && (
              <Link
                href="/admin"
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-primary-700 text-white hover:bg-primary-800 transition-all text-sm shrink-0"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden sm:inline">Admin Portal</span>
              </Link>
            )}
            <button className="p-2 rounded-xl hover:bg-bg-card hover:shadow-sm transition-all shrink-0">
              <Settings className="w-5 h-5 text-text-muted" />
            </button>
            <div className="h-8 w-px bg-primary-100 hidden sm:block" />
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl hover:bg-bg-card hover:shadow-sm transition-all text-sm text-text-muted hover:text-primary-700"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-bg-card rounded-2xl p-3 sm:p-4 mb-6 border border-primary-100 flex flex-col sm:flex-row sm:items-center gap-3"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-bg-muted flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-primary-700" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-primary-900 truncate">{user?.name}</p>
              <p className="text-xs text-text-muted truncate">{user?.role} • {user?.staffId}</p>
            </div>
          </div>
          <Badge variant="success" className="shrink-0 self-start sm:self-center">
            <CheckCircle className="w-3 h-3 mr-1" />
            Authenticated
          </Badge>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-5">
          {forms.map((form) => {
            const Icon = form.icon;
            return (
              <Card key={form.id} hover>
                <div className="flex flex-col h-full">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="p-2.5 sm:p-3 rounded-xl bg-bg-muted shrink-0">
                      <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary-700" />
                    </div>
                    <Badge variant={form.status === 'active' ? 'accent' : 'muted'} className="shrink-0">
                      {form.status === 'active' ? 'Available' : 'Coming Soon'}
                    </Badge>
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-primary-900">{form.name}</h3>
                  <p className="text-xs sm:text-sm text-text-muted mt-1 flex-1">{form.description}</p>
                  <div className="flex items-center justify-between gap-2 mt-4 sm:mt-5 pt-3 sm:pt-4 border-t border-primary-100">
                    <span className="text-xs text-text-faint flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      {form.time}
                    </span>
                    <Button
                      variant={form.status === 'active' ? 'primary' : 'outline'}
                      className="text-xs sm:text-sm px-4 sm:px-5 py-1.5 sm:py-2"
                      disabled={form.status !== 'active'}
                      onClick={() => form.status === 'active' && onSelectForm(form.id)}
                    >
                      {form.status === 'active' ? 'Start Form' : 'Unavailable'}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="mt-6 sm:mt-8 text-center text-xs text-text-faint flex flex-col sm:flex-row justify-center items-center gap-1.5 sm:gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
            Connected & Secured
          </span>
          <span className="hidden sm:inline">•</span>
          <span>TERECO Collect v2.0</span>
          <span className="hidden sm:inline">•</span>
          <span>Last login: {new Date().toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
};