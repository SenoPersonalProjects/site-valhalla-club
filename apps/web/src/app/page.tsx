import { AboutSection } from "@/components/landing/AboutSection";
import { Footer } from "@/components/landing/Footer";
import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { NewsSection } from "@/components/landing/NewsSection";
import { TeamSection } from "@/components/landing/TeamSection";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0c0a09] text-[#f0ebe0]">
      <Header />
      <HeroSection />
      <AboutSection />
      <NewsSection />
      <TeamSection />
      <Footer />
    </main>
  );
}
