import { ImageResponse } from "next/og";
import { TerecoMark } from "@/components/pwa/TerecoMark";

/**
 * The install icons listed in app/manifest.ts, drawn rather than stored as
 * PNGs so the brand colour lives in one place. "maskable" keeps the mark
 * inside the central 80% safe zone, since Android crops it to its own shape.
 */
const VARIANTS = {
  "192": { size: 192, mark: 0.62 },
  "512": { size: 512, mark: 0.62 },
  maskable: { size: 512, mark: 0.46 },
} as const;

export const dynamic = "force-static";

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((variant) => ({ variant }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ variant: string }> }) {
  const { variant } = await params;
  const spec = VARIANTS[variant as keyof typeof VARIANTS];
  if (!spec) return new Response("Not found", { status: 404 });
  return new ImageResponse(<TerecoMark size={spec.size} mark={spec.mark} />, { width: spec.size, height: spec.size });
}
