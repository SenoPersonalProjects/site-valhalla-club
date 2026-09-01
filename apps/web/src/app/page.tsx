import { AboutSection } from "@/components/landing/AboutSection";
import { Footer } from "@/components/landing/Footer";
import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { NewsSection } from "@/components/landing/NewsSection";
import { TablesSection } from "@/components/landing/TablesSection";
import { TeamSection } from "@/components/landing/TeamSection";

export default function Home() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-background text-foreground">
        <HeroSection />
        <AboutSection />
        <NewsSection />
        <TablesSection />
        <TeamSection />
      </main>
      <Footer />
    </>
  );
}
