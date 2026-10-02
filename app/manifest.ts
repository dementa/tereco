import type { MetadataRoute } from "next";

/**
 * Makes TERECO installable (home screen on Android and iOS, an app window on
 * Windows and macOS). It opens on the public Library, the part that works
 * offline; signing in from there reaches every portal in the same window.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TERECO Library",
    short_name: "TERECO",
    description: "Notes, tutorials, past papers and practice quizzes — readable offline.",
    start_url: "/library",
    scope: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#02465B",
    icons: [
      { src: "/pwa-icons/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icons/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
