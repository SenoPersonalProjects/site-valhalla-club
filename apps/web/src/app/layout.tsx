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

const siteName = "Valhalla Club";
const siteTitle = "Valhalla Club | RPG de Mesa";
const siteDescription =
  "Conheça o Valhalla Club, uma comunidade de RPG de mesa em Aracaju com mesas, eventos e aventuras para jogadores iniciantes e experientes.";
const siteUrl =
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteName,
  url: new URL("/", siteUrl).toString(),
  logo: {
    "@type": "ImageObject",
    url: new URL("/icon.png", siteUrl).toString(),
    width: 512,
    height: 512,
  },
  description: siteDescription,
  email: "valhallaclubrpg@gmail.com",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Aracaju",
    addressRegion: "SE",
    addressCountry: "BR",
  },
  sameAs: ["https://www.instagram.com/valhallaclubrpg/"],
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  applicationName: siteName,
  keywords: [
    "RPG de mesa",
    "RPG em Aracaju",
    "Valhalla Club",
    "comunidade de RPG",
    "eventos de RPG",
  ],
  creator: siteName,
  publisher: siteName,
  category: "RPG de mesa",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: "/",
    siteName,
    locale: "pt_BR",
    type: "website",
  },
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
      <body className="flex min-h-full flex-col font-sans">
        <script
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd).replace(
              /</g,
              "\\u003c",
            ),
          }}
          type="application/ld+json"
        />
        {children}
      </body>
    </html>
  );
}
