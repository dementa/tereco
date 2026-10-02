import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { InstallButton } from "@/components/pwa/InstallButton";

export const metadata: Metadata = {
  title: "Library · TERECO",
  description: "Notes, tutorials, past papers and practice quizzes — free to read, and readable offline.",
};

/**
 * The public Library: open to anyone, no sign-in. Lists only items with no
 * audience targets (see getPublicLibraryContent); anything aimed at a school
 * or class stays inside the portals. This is also the installed app's start
 * page (app/manifest.ts), so it carries the install button.
 */
export default function PublicLibraryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/library" className="flex items-center gap-2 font-bold text-primary-900">
            <BookOpen className="h-5 w-5 text-primary-700" aria-hidden /> TERECO Library
          </Link>
          <div className="flex items-center gap-2">
            <InstallButton />
            <Link href="/auth" className="text-sm font-medium text-primary-700 hover:underline px-2">
              Sign in
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
