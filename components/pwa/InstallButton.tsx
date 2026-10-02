'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, Share } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

/**
 * "Install app". Chromium browsers (Android, Windows, macOS, ChromeOS) offer a
 * real install prompt through `beforeinstallprompt`; iOS has no such API, so
 * Safari users get the Share → Add to Home Screen instruction instead.
 * Renders nothing once installed, or where neither path exists.
 */
const noSubscribe = () => () => {};

export function InstallButton() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  // Read from the browser after hydration (the server snapshot is false), so
  // server and client render the same first frame.
  const ios = useSyncExternalStore(noSubscribe, () => isIosSafari() && !isStandalone(), () => false);

  useEffect(() => {
    if (isStandalone()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (prompt) {
    return (
      <Button
        inline
        variant="outline"
        onClick={async () => {
          await prompt.prompt();
          await prompt.userChoice;
          setPrompt(null);
        }}
      >
        <Download className="w-4 h-4" aria-hidden /> Install app
      </Button>
    );
  }

  if (ios) {
    return (
      <div className="relative">
        <Button inline variant="outline" onClick={() => setShowIosHint((v) => !v)} aria-expanded={showIosHint}>
          <Download className="w-4 h-4" aria-hidden /> Install app
        </Button>
        {showIosHint && (
          <p className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-border bg-white p-3 text-xs text-text-secondary shadow-lg z-20">
            Tap <Share className="inline w-3.5 h-3.5 -mt-0.5" aria-label="Share" /> in Safari&apos;s toolbar, then{' '}
            <strong>Add to Home Screen</strong>.
          </p>
        )}
      </div>
    );
  }

  return null;
}
