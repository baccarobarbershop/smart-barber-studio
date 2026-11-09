import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ClientRecognitionHeader } from "@/components/navigation/ClientRecognitionHeader";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  title: "Smart Barber Studio | Premium Grooming Experience",
  description: "Assistente virtuale intelligente e gestione prenotazioni premium per il tuo salone.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Smart Barber",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="it"
      className="dark h-full antialiased"
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100 selection:bg-amber-500/30 selection:text-amber-200 font-sans">
        <ClientRecognitionHeader />
        {children}
        <PwaInstallPrompt />
        <SpeedInsights />
      </body>
    </html>
  );
}
