import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Needly — Recruitment Decision Lab",
  description:
    "Vor der Suche sichtbar machen, was eine Rolle wirklich braucht — evidenzbasiert, nachvollziehbar und entscheidungsbereit.",
  applicationName: "Needly",
  robots: { index: false, follow: false }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07110e"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
