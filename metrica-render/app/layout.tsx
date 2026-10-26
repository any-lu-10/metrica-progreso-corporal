import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description = "Registra tus medidas, descubre tendencias y conserva tu progreso corporal de forma privada en la nube.";

  return {
    metadataBase: new URL(origin),
    title: "Métrica — Tu progreso corporal",
    description,
    applicationName: "Métrica",
    manifest: "/manifest.webmanifest",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Métrica" },
    formatDetection: { telephone: false },
    openGraph: {
      title: "Métrica — Tu progreso corporal",
      description,
      type: "website",
      url: origin,
      images: [{ url: `${origin}/og.png`, width: 1792, height: 933, alt: "Métrica — Lo que mides, lo puedes mejorar." }],
    },
    twitter: { card: "summary_large_image", title: "Métrica — Tu progreso corporal", description, images: [`${origin}/og.png`] },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#151918",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
