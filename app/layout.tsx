import type { Metadata, Viewport } from "next";
import { Quicksand } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { AuthProvider } from "@/components/auth/AuthContext";
import { RegisterSW } from "@/components/pwa/RegisterSW";

const quicksand = Quicksand({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "TERECO OPS",
  description: "TERECO Operations",
  // Installed from Safari's Add to Home Screen (the web manifest is app/manifest.ts).
  appleWebApp: { capable: true, title: "TERECO", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#02465B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${quicksand.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
        <RegisterSW />
      </body>
    </html>
  );
}