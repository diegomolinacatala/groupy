import type { Metadata, Viewport } from "next";
import { Fraunces, Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "Groupy — Trabajo en grupo, en claro",
  description:
    "Groupy convierte vuestro trabajo en grupo en un plan repartido: tareas, bloques y un mapa compartido por código, con el progreso registrado tarea a tarea.",
  applicationName: "Groupy",
  appleWebApp: { title: "Groupy", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

// Phones: fit the device, keep the app chrome under the notch-safe area, and
// stop iOS from auto-zooming into every <input> under 16px (pinch-zoom still
// works on iOS). Android's keyboard resizes the layout instead of covering it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#f6f4ef",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
