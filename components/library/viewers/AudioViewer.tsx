'use client';

export function AudioViewer({ src, title }: { src: string; title: string }) {
  return (
    <div className="rounded-xl bg-bg-muted p-4">
      <p className="text-sm font-medium text-primary-900 mb-2">{title}</p>
      <audio controls controlsList="nodownload" className="w-full">
        <source src={src} />
        Your browser cannot play this audio.
      </audio>
    </div>
  );
}
