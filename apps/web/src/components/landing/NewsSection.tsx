import { SectionHeader } from "@/components/ui/SectionHeader";

import { EventCarousel, type ClubEvent } from "./EventCarousel";

const events: readonly ClubEvent[] = [
  {
    id: "encontro-discord-ficha-rpg",
    name: "Aprenda a fazer sua ficha de RPG",
    date: "2026-08-20",
    time: "20:00",
    location: "Discord do Valhalla Club",
    description:
      "Encontro guiado para iniciantes, com explicação passo a passo para criar sua ficha e tirar dúvidas.",
    details:
      "Participe pelo Discord do Valhalla Club e prepare seu personagem com o apoio da comunidade.",
    status: "completed",
    category: "meeting",
    artwork: "welcome",
    image: {
      src: "/images/events/encontro-discord-ficha-rpg.png",
      alt: "Arte do encontro no Discord para criação de ficha de RPG",
    },
  },
  {
    id: "encontro-jogos-tabuleiro",
    name: "Encontro de Jogos de Tabuleiro",
    dateLabel: "Data a confirmar",
    location: "Aracaju Parque Shopping",
    description:
      "Encontro presencial para jogar, conhecer a comunidade e viver novas aventuras fora da mesa de RPG.",
    details:
      "O encontro será no Aracaju Parque Shopping, na Av. João Rodrigues, 42, bairro Industrial, Aracaju — SE.",
    status: "upcoming",
    category: "meeting",
    artwork: "winter",
    image: {
      src: "/images/events/encontro-jogos-tabuleiro.png",
      alt: "Arte do encontro presencial de jogos de tabuleiro do Valhalla Club",
      position: "top",
    },
  },
  {
    id: "aniversario-valhalla-6-anos",
    name: "6º Aniversário do Valhalla",
    date: "2026-08-08",
    location: "Barra dos Coqueiros, SE",
    description:
      "O Valhalla Club celebrou 6 anos de história em Barra dos Coqueiros, Sergipe.",
    details:
      "A comemoração aconteceu em 8 de agosto de 2026 e marcou o 6º aniversário do clube.",
    status: "completed",
    category: "celebration",
    artwork: "anniversary",
    image: {
      src: "/images/events/aniversario-valhalla-6-anos.png",
      alt: "Bolo comemorativo do aniversário do Valhalla Club",
      position: "center",
    },
  },
];

export function NewsSection() {
  return (
    <section
      aria-labelledby="eventos-heading"
      className="border-b border-border bg-background"
      id="eventos"
    >
      <div className="mx-auto max-w-7xl overflow-hidden px-6 py-14 sm:px-10 sm:py-16 lg:px-12">
        <div className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-28 -top-40 h-96 w-96 rotate-45 border border-primary/5"
          >
            <div className="absolute inset-16 border border-primary/5" />
          </div>

          <SectionHeader
            description="Acompanhe os eventos que fazem parte da história e da comunidade do Valhalla Club."
            eyebrow="Eventos"
            id="eventos-heading"
            title="Eventos"
          />

          <EventCarousel events={events} />
        </div>
      </div>
    </section>
  );
}
