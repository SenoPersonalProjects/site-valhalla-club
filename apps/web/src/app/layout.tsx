import type { Metadata } from "next";
import {
  Cinzel,
  Cormorant_Garamond,
  Geist,
  MedievalSharp,
} from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap",
  weight: ["400", "600", "700"],
});

const cormorantGaramond = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant-garamond",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const medievalSharp = MedievalSharp({
  subsets: ["latin"],
  variable: "--font-medieval-sharp",
  display: "swap",
  weight: "400",
});

export const metadata: Metadata = {
  title: "Valhalla Clube",
  description: "Site do Valhalla Clube de RPG de mesa.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`h-full antialiased ${geist.variable} ${cinzel.variable} ${cormorantGaramond.variable} ${medievalSharp.variable}`}
    >
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
