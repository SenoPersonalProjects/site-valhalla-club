import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
