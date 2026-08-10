import { useEffect, useState } from 'react';
import { CheckCircle, HardDrive, WifiOff } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

import { usePathname, useParams, useRouter } from './shims/next-navigation';
import type { DeviceInfo, PreparedAssessment } from './tereco-bridge';

/**
 * Phase 0 shell for the offline desktop client.
 *
 * What this proves: the bundle boots from `file://` with no network, the shared
 * TERECO components and design tokens render outside Next.js, and the renderer
 * reaches the main process only through `window.tereco`.
 *
 * What it deliberately does not do yet: render `AssessmentTake`. That component
 * needs real questions, a real attempt and a real clock behind the bridge, all
 * of which arrive with the SQLite work in Phases 1-3 of issue #33. Wiring it to
 * stub data now would prove nothing and would have to be unpicked.
 */
export function App() {
  const pathname = usePathname();
  const match = /^\/assessment\/([^/]+)\/?$/.test(pathname);
  return match ? <PaperScreen /> : <ReadyScreen />;
}

function useBridge() {
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [prepared, setPrepared] = useState<PreparedAssessment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Opened outside Electron (a plain browser, or a build smoke test) the
      // bridge simply is not there. Say so plainly rather than throwing.
      if (!window.tereco) {
        if (!cancelled) {
          setError('Not running inside TERECO Collect.');
          setLoading(false);
        }
        return;
      }

      try {
        const [deviceInfo, list] = await Promise.all([
          window.tereco.device(),
          window.tereco.listPrepared(),
        ]);
        if (cancelled) return;
        setDevice(deviceInfo);
        setPrepared(list);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not read local storage.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { device, prepared, error, loading };
}

function ReadyScreen() {
  const router = useRouter();
  const { device, prepared, error, loading } = useBridge();

  return (
    <div className="flex h-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl">
        <Card className="p-8">
          <div className="flex items-center gap-3">
            <WifiOff className="h-6 w-6 text-primary-700" aria-hidden />
            <h1 className="text-xl font-semibold text-primary-900">Offline Assessment Mode</h1>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-neutral-600">
            This application runs from this computer. Once an assessment has been downloaded,
            you can switch the internet off and your work will be saved here.
          </p>

          {loading && <p className="mt-6 text-sm text-neutral-500">Reading local storage…</p>}

          {error && (
            <p className="mt-6 rounded-xl bg-neutral-100 p-4 text-sm text-neutral-700">{error}</p>
          )}

          {!loading && !error && prepared.length === 0 && (
            <p className="mt-6 rounded-xl bg-neutral-100 p-4 text-sm text-neutral-700">
              No assessment has been prepared on this computer yet. Connect to the internet and
              sign in to download one.
            </p>
          )}

          {prepared.map((item) => (
            <div
              key={item.assessmentId}
              className="mt-6 flex items-center justify-between rounded-xl border border-neutral-200 p-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-primary-600" aria-hidden />
                  <span className="font-medium text-primary-900">{item.title}</span>
                </div>
                <p className="mt-1 text-sm text-neutral-600">
                  {item.questionCount} questions · {Math.round(item.durationSeconds / 60)} minutes
                </p>
              </div>
              <Button onClick={() => router.push(`/assessment/${item.assessmentId}`)}>
                Start
              </Button>
            </div>
          ))}

          {device && (
            <p className="mt-8 flex items-center gap-2 text-xs text-neutral-500">
              <HardDrive className="h-3.5 w-3.5" aria-hidden />
              Device {device.deviceId} · v{device.appVersion}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

function PaperScreen() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  return (
    <div className="flex h-full items-center justify-center bg-background p-6">
      <Card className="w-full max-w-xl p-8">
        <h1 className="text-lg font-semibold text-primary-900">Assessment {id}</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          The paper renders here once the local database is in place. AssessmentTake is wired to
          this route in Phase 3.
        </p>
        <Button variant="outline" className="mt-6" onClick={() => router.push('/')}>
          Back
        </Button>
      </Card>
    </div>
  );
}
