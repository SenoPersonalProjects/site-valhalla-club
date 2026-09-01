import { HorizontalCarousel } from "@/components/ui/HorizontalCarousel";
import { SectionHeader } from "@/components/ui/SectionHeader";

import { TableCard, type RpgTable } from "./TableCard";

/*
 * Dados estáticos enquanto a integração com a API de mesas
 * ainda não está disponível.
 */
const tables: readonly RpgTable[] = [
  {
    id: "she-ra-protocolo-mecanus",
    name: "She-Ra: Protocolo Mecanus",
    system: "Corespring",
    master: "Vitor",
    status: "scheduled",
    description:
      "A Rebelião interceptou uma comunicação da Horda sobre um laboratório onde eles estão trabalhando com algo relacionado ao chamado Protocolo Mecanus. Agora, as princesas precisam ir até o local onde está esse laboratório para descobrir o que a Horda está tramando e impedi-los antes que seja tarde demais.",
    mode: "Online",
    location: "Discord do Club",
    schedule: "27/08 · 14h",
    frequency: "Sessão única",
    seats: {
      filled: 5,
    },
    players: ["Artemis", "Kauã", "Limas", "Elvis", "Bruna"],
    tags: ["Fantasia", "+14", "Novatos bem-vindos", "Ficha pronta"],
    contentWarning: "+14 — palavrões, bebidas alcoólicas e violência.",
    image: {
      src: "/images/tables/she-ra-protocolo-mecanus.png",
      alt: "Arte da mesa She-Ra: Protocolo Mecanus.",
      fit: "contain",
    },
    artwork: "citadel",
    href: "#contato",
    ctaLabel: "Falar com o Valhalla",
  },
];

export function TablesSection() {
  const [firstTable] = tables;

  return (
    <section
      aria-labelledby="mesas-heading"
      className="border-b border-border bg-surface"
      id="mesas"
    >
      <div className="mx-auto max-w-7xl overflow-hidden px-6 py-14 sm:px-10 sm:py-16 lg:px-12">
        <div className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-40 top-10 size-96 rotate-45 border border-primary/5"
          >
            <div className="absolute inset-16 border border-primary/5" />
          </div>

          <SectionHeader
            description="Conheça campanhas e aventuras conduzidas pela comunidade do Valhalla, com informações rápidas sobre sistema, mestre, vagas e frequência."
            eyebrow="Aventuras em andamento"
            id="mesas-heading"
            title="Mesas rolando"
          />

          <div className="relative mt-10 sm:mt-12">
            {!firstTable ? (
              <div
                className="rounded-xl border border-border bg-surface-elevated px-6 py-12 text-center sm:px-10 sm:py-16"
                role="status"
              >
                <div
                  aria-hidden="true"
                  className="mx-auto grid size-14 place-items-center rounded-full border border-primary/30 bg-primary/5 text-primary"
                >
                  <svg
                    className="size-6"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M4 6h16M4 12h16M4 18h10"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="1.7"
                    />
                  </svg>
                </div>

                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  Mesas rolando
                </p>

                <h3 className="mt-3 font-editorial text-2xl font-semibold text-foreground sm:text-3xl">
                  Nenhuma mesa disponível no momento.
                </h3>

                <p className="mx-auto mt-3 max-w-xl text-pretty text-sm leading-6 text-muted-foreground sm:text-base">
                  Novas aventuras serão divulgadas aqui assim que houver mesas
                  abertas ou campanhas em andamento.
                </p>

                <a
                  className="valhalla-cut-corners mt-6 inline-flex min-h-12 items-center justify-center border border-primary/60 bg-primary/5 px-6 py-3 text-xs font-bold uppercase tracking-[0.14em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                  href="#contato"
                >
                  Fale com o Valhalla
                </a>
              </div>
            ) : tables.length === 1 ? (
              <div className="mx-auto max-w-4xl">
                <TableCard table={firstTable} />
              </div>
            ) : (
              <HorizontalCarousel
                ariaLabel="Mesas de RPG em destaque"
                logicalSlideCount={tables.length}
                loop
                slideClassName="shrink-0 basis-[88%] sm:basis-[68%] lg:basis-[48%] xl:basis-[31.5%]"
              >
                {tables.map((table) => (
                  <TableCard key={table.id} table={table} />
                ))}
              </HorizontalCarousel>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
