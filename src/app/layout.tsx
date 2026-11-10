import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ClientRecognitionHeader } from "@/components/navigation/ClientRecognitionHeader";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";

export const metadata: Metadata = {
  title: "Barbershop Roberto Baccaro | Barberia dal 1958 - Torino",
  description: "Barbershop Roberto Baccaro - Barberia \"Dal 1958\" a Torino in C.so Orbassano 230/a (presso \"Wild Effect\"). Tel. 331 81 76 178.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Barbershop Baccaro",
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
      </body>
    </html>
  );
}
