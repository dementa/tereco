import { ImageResponse } from "next/og";
import { TerecoMark } from "@/components/pwa/TerecoMark";

/** iOS home-screen icon (Add to Home Screen ignores the manifest's icons). */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<TerecoMark size={180} mark={0.62} />, size);
}
