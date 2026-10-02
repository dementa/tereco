import type { Metadata } from "next";
import Link from "next/link";
import { InstallButton } from "@/components/pwa/InstallButton";
import { TerecoMark } from "@/components/pwa/TerecoMark";

export const metadata: Metadata = {
  title: "TERECO Library — free notes, videos and past papers",
  description:
    "Free notes, video lessons, past papers and practice quizzes from TERECO teachers. Save them to your device and learn offline.",
  openGraph: {
    title: "TERECO Library",
    description: "Free notes, video lessons, past papers and practice quizzes — readable offline.",
    type: "website",
  },
};

/**
 * The public Library: open to anyone, no sign-in. Lists only items with no
 * audience targets (see getPublicLibraryContent); anything aimed at a school
 * or class stays inside the portals. Also the installed app's start page
 * (app/manifest.ts), so it carries the install button.
 */
export default function PublicLibraryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/library" className="flex items-center gap-2.5" aria-label="TERECO Library home">
            <span className="flex h-8 w-8 overflow-hidden rounded-lg shadow-sm">
              <TerecoMark size={32} mark={0.62} />
            </span>
            <span className="text-[15px] font-bold tracking-tight text-text-primary">
              TERECO <span className="font-medium text-text-muted">Library</span>
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <InstallButton />
            <Link
              href="/auth"
              className="inline-flex h-9 items-center rounded-lg bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-border bg-bg-subtle">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} TERECO. Free learning resources for every learner.</p>
          <p className="flex gap-4">
            <Link href="/library" className="hover:text-primary-700">
              Library
            </Link>
            <Link href="/auth" className="hover:text-primary-700">
              Teachers &amp; students sign in
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
