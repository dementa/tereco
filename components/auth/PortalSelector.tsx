'use client'

import {
  ArrowRight,
  GraduationCap,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { motion } from 'framer-motion'

type Portal = 'admin' | 'staff' | 'student'

interface PortalSelectorProps {
  onSelect: (portal: Portal) => void
}

const portals = [
  {
    id: 'admin' as const,
    title: 'Administrator',
    description:
      'Manage schools, staff, students, assessments and system settings.',
    icon: ShieldCheck,
  },
  {
    id: 'staff' as const,
    title: 'Staff',
    description:
      'Access daily lesson forms, manage learners and submit reports.',
    icon: Users,
  },
  {
    id: 'student' as const,
    title: 'Student',
    description:
      'Take assessments, practice skills and monitor your progress.',
    icon: GraduationCap,
  },
]

export default function PortalSelector({
  onSelect,
}: PortalSelectorProps) {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-bg flex items-center justify-center px-6 py-12"
    >
      <div className="w-full max-w-6xl">

        {/* Header */}

        <div className="text-center mb-14">

          <div
            className="
              mx-auto
              w-20
              h-20
              rounded-3xl
              bg-primary-700
              text-white
              flex
              items-center
              justify-center
              shadow-xl
            "
          >
            <GraduationCap size={38} />
          </div>

          <h1 className="mt-6 text-4xl font-bold text-text-primary">
            Welcome to TERECO Collect
          </h1>

          <p className="mt-4 text-text-secondary max-w-2xl mx-auto leading-7">
            Choose how you would like to continue. Select the portal
            that matches your role in the system.
          </p>

        </div>

        {/* Cards */}

        <div className="grid gap-8 md:grid-cols-3">

          {portals.map((portal, index) => {
            const Icon = portal.icon

            return (
              <motion.button
                key={portal.id}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: index * 0.15,
                }}
                whileHover={{
                  y: -8,
                }}
                whileTap={{
                  scale: 0.98,
                }}
                onClick={() => onSelect(portal.id)}
                className="
                  group
                  rounded-3xl
                  bg-bg-card
                  border
                  border-primary-100
                  p-8
                  text-left
                  shadow-sm
                  hover:shadow-2xl
                  transition-all
                  duration-300
                "
              >

                <div
                  className="
                    w-16
                    h-16
                    rounded-2xl
                    bg-primary-50
                    flex
                    items-center
                    justify-center
                    text-primary-700
                    transition-all
                    duration-300
                    group-hover:bg-primary-700
                    group-hover:text-white
                  "
                >
                  <Icon size={32} />
                </div>

                <h2 className="mt-8 text-2xl font-bold text-text-primary">
                  {portal.title}
                </h2>

                <p className="mt-4 text-text-secondary leading-7">
                  {portal.description}
                </p>

                <div
                  className="
                    mt-8
                    flex
                    items-center
                    gap-2
                    font-semibold
                    text-primary-600
                    group-hover:text-primary-700
                  "
                >
                  Continue

                  <ArrowRight
                    size={18}
                    className="
                      transition-transform
                      group-hover:translate-x-1
                    "
                  />
                </div>

              </motion.button>
            )
          })}

        </div>

        {/* Footer */}

        <div className="mt-16 text-center">

          <p className="text-text-muted text-sm">
            TERECO Data Collection System
          </p>

          <p className="mt-2 text-xs text-text-faint">
            Select your role to begin.
          </p>

        </div>

      </div>
    </motion.main>
  )
}

