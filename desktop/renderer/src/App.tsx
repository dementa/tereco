import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle,
  Download,
  Eye,
  EyeOff,
  HardDrive,
  Lock,
  LogOut,
  RefreshCw,
  User,
  WifiOff,
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AuthProvider, useAuth } from '@/components/auth/AuthContext';
import { AssessmentTake } from '@/components/assessment/AssessmentTake';

import { usePathname, useRouter } from './shims/next-navigation';
import { SyncStatus } from './SyncStatus';
import type { DeviceInfo, PreparedAssessment } from './tereco-bridge';

/**
 * TERECO Collect.
 *
 * Three screens, in the order the lab uses them: sign in and download while the
 * internet is on, sit the paper with it off, and let anything unsent go up on
 * its own when the connection comes back.
 *
 * The paper itself is the same `AssessmentTake` the web app renders. It reads
 * from the local database rather than the API because `window.tereco` exists
 * here — see lib/assessment/source.ts. Nothing about it is desktop-specific,
 * which is the whole reason there is one of it and not two.
 */
export function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

function Shell() {
  const pathname = usePathname();
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <Centered>Starting TERECO Collect…</Centered>;
  }

  if (!isAuthenticated) return <SignIn />;

  if (/^\/assessment\/[^/]+\/?$/.test(pathname)) {
    // AssessmentTake is shared byte-for-byte with the web app (see the
    // comment on App() above) and lays itself out with min-h-screen,
    // expecting the browser page itself to scroll. desktop/styles.css sets
    // `overflow: hidden` on body — every other screen manages its own scroll
    // region instead — so without this wrapper a question longer than the
    // window just ran off the bottom with no way to reach it.
    return (
      <div className="h-full overflow-y-auto">
        <AssessmentTake />
      </div>
    );
  }

  return <Home />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center bg-background p-6">
      <p className="text-sm text-neutral-500">{children}</p>
    </div>
  );
}

// ─── Sign in (needs the network) ───────────────────────────────────────────

function SignIn() {
  const { refresh } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!window.tereco) return;

    setBusy(true);
    setError('');
    try {
      // Unlike LoginScreen.tsx (components/auth/LoginScreen.tsx), this cannot
      // fetch('/api/auth/login') directly — the renderer has no network access
      // and no way to reach a credential; every request goes through main via
      // this bridge call instead. Everything else here matches that screen's
      // look on purpose, so the same app doesn't feel like two different ones.
      await window.tereco.signIn({ identifier, password });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-bg px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-primary-900">TERECO</h1>
          <p className="text-sm text-text-muted mt-2">Sign in to TERECO Collect</p>
        </div>

        <form onSubmit={submit} className="space-y-6">
          <div>
            <label htmlFor="identifier" className="text-xs font-medium text-text-secondary tracking-wide">
              Student ID
            </label>
            <div className="relative mt-2">
              <User className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" aria-hidden />
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full border-0 border-b border-border-strong bg-transparent pl-6 pr-2 py-2 text-sm text-text-primary transition-colors duration-200 focus:border-primary-700 focus:outline-none focus:ring-0"
                placeholder="e.g. TSF-2026-0001"
                autoFocus
                required
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="text-xs font-medium text-text-secondary tracking-wide">
              Password
            </label>
            <div className="relative mt-2">
              <Lock className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" aria-hidden />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border-0 border-b border-border-strong bg-transparent pl-6 pr-8 py-2 text-sm text-text-primary transition-colors duration-200 focus:border-primary-700 focus:outline-none focus:ring-0"
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-text-faint hover:text-primary-700 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 text-sm text-error"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden />
              <p>{error}</p>
            </motion.div>
          )}

          <Button
            variant="primary"
            className="w-full justify-center text-base h-11"
            type="submit"
            isLoading={busy}
          >
            Sign In
          </Button>
        </form>

        <p className="text-xs text-text-faint text-center mt-8">
          You need the internet for this step only. Once your assessment has downloaded you can
          switch it off.
        </p>
      </motion.div>
    </div>
  );
}

// ─── Home: what is ready, and what could still be downloaded ───────────────

interface Downloadable {
  systemId: string;
  title: string;
  timeLimit: number;
}

function Home() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [prepared, setPrepared] = useState<PreparedAssessment[]>([]);
  const [available, setAvailable] = useState<Downloadable[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [updateReady, setUpdateReady] = useState(false);

  // Never fires in dev or against a REMOTE_URL override — see initAutoUpdate
  // in main.js. Restarting is always the learner's own choice: this only ever
  // shows on the Home screen, never over a paper in progress.
  useEffect(() => window.tereco?.onUpdateReady(() => setUpdateReady(true)), []);

  const load = useCallback(async () => {
    if (!window.tereco) return;
    const [deviceInfo, list] = await Promise.all([
      window.tereco.device(),
      window.tereco.listPrepared(),
    ]);
    setDevice(deviceInfo);
    setPrepared(list);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  // Kept separate from `load` and allowed to fail quietly: listing what COULD be
  // downloaded needs the network, and by design the machine often has none. A
  // learner with a paper already prepared must not see an error because of it.
  useEffect(() => {
    const bridge = window.tereco;
    if (!bridge) return;

    void (async () => {
      try {
        setAvailable(await bridge.availableAssessments());
      } catch {
        setAvailable(null);
      }
    })();
  }, []);

  const download = async (systemId: string) => {
    if (!window.tereco) return;
    setBusyId(systemId);
    setError('');
    try {
      await window.tereco.prepare(systemId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download this assessment.');
    } finally {
      setBusyId(null);
    }
  };

  const preparedIds = new Set(prepared.map((p) => p.assessmentId));
  const notYetDownloaded = (available ?? []).filter(
    (a) => !preparedIds.has(a.systemId) && !prepared.some((p) => p.title === a.title)
  );

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-primary-900">
              {user?.name ?? 'TERECO Collect'}
            </h1>
            {user?.className && <p className="text-sm text-neutral-600">{user.className}</p>}
          </div>
          <Button inline variant="ghost" onClick={logout}>
            <LogOut className="mr-1.5 h-4 w-4" aria-hidden />
            Sign out
          </Button>
        </header>

        <SyncStatus />

        {updateReady && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-900"
          >
            <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1">
              An update has downloaded. It installs the next time TERECO Collect closes.
            </span>
            <Button inline variant="outline" onClick={() => window.tereco?.installUpdate()}>
              Restart now
            </Button>
          </div>
        )}

        {error && (
          <p className="rounded-xl bg-red-50 p-4 text-sm text-red-900" role="alert">
            {error}
          </p>
        )}

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <WifiOff className="h-5 w-5 text-primary-700" aria-hidden />
            <h2 className="font-semibold text-primary-900">Ready for offline assessment</h2>
          </div>

          {prepared.length === 0 ? (
            <p className="mt-3 text-sm leading-relaxed text-neutral-600">
              Nothing has been downloaded to this computer yet. Download an assessment below while
              you still have internet.
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm leading-relaxed text-neutral-600">
                These are saved on this computer.{' '}
                <span className="font-medium text-primary-900">
                  You may now switch off the internet.
                </span>{' '}
                Your work will be saved here.
              </p>

              <ul className="mt-4 space-y-3">
                {prepared.map((item) => (
                  <li
                    key={item.assessmentId}
                    className="flex items-center justify-between rounded-xl border border-neutral-200 p-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-primary-600" aria-hidden />
                        <span className="font-medium text-primary-900">{item.title}</span>
                      </div>
                      <p className="mt-1 text-sm text-neutral-600">
                        {item.questionCount} questions · {Math.round(item.durationSeconds / 60)}{' '}
                        minutes
                      </p>
                    </div>
                    {item.attemptStatus === 'submitted' ? (
                      // Already submitted: the main process refuses further writes to this
                      // attempt anyway (#33), but a disabled state here means the learner
                      // never gets that far and never sees a write fail with a raw error.
                      <span className="text-sm font-medium text-neutral-500">Submitted</span>
                    ) : (
                      <Button inline onClick={() => router.push(`/assessment/${item.assessmentId}`)}>
                        {item.attemptStatus === 'in_progress' ? 'Continue' : 'Start'}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {available === null ? (
          <p className="px-1 text-sm text-neutral-500">
            No internet, so new assessments cannot be listed. Anything already downloaded above
            still works.
          </p>
        ) : (
          notYetDownloaded.length > 0 && (
            <Card className="p-6">
              <h2 className="font-semibold text-primary-900">Available to download</h2>
              <ul className="mt-4 space-y-3">
                {notYetDownloaded.map((item) => (
                  <li
                    key={item.systemId}
                    className="flex items-center justify-between rounded-xl border border-neutral-200 p-4"
                  >
                    <div>
                      <span className="font-medium text-primary-900">{item.title}</span>
                      <p className="mt-1 text-sm text-neutral-600">{item.timeLimit} minutes</p>
                    </div>
                    <Button
                      inline
                      variant="outline"
                      isLoading={busyId === item.systemId}
                      onClick={() => download(item.systemId)}
                    >
                      <Download className="mr-1.5 h-4 w-4" aria-hidden />
                      Download
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )
        )}

        {device && (
          <p className="flex items-center gap-2 px-1 text-xs text-neutral-500">
            <HardDrive className="h-3.5 w-3.5" aria-hidden />
            Device {device.deviceId} · v{device.appVersion}
          </p>
        )}
      </div>
    </div>
  );
}
