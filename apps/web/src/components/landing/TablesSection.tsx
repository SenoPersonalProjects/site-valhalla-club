import { HorizontalCarousel } from "@/components/ui/HorizontalCarousel";
import { SectionHeader } from "@/components/ui/SectionHeader";

import { TableCard, type RpgTable } from "./TableCard";

/*
 * Conteúdo temporário para desenvolvimento visual.
 *
 * Antes de lançar o MVP, substituir por mesas reais do Valhalla.
 * A estrutura já está preparada para, futuramente, receber os mesmos dados
 * por API sem alterar o componente visual.
 */
const tables: readonly RpgTable[] = [
  {
    id: "demo-cronicas-do-veu",
    name: "Crônicas do Véu",
    system: "Dungeons & Dragons 5e",
    master: "Mestre do Valhalla",
    status: "open",
    description:
      "Uma campanha de fantasia sombria para aventureiros que querem explorar ruínas, pactos antigos e escolhas com consequências.",
    mode: "Online",
    schedule: "Sábados · 19h",
    frequency: "Semanal",
    seats: {
      filled: 4,
      total: 6,
    },
    tags: ["Fantasia", "Fantasia Sombria", "Exploração"],
    level: "Iniciante",
    artwork: "portal",
    href: "#contato",
  },
  {
    id: "demo-ecos-de-arton",
    name: "Ecos de Arton",
    system: "Tormenta 20",
    master: "Mestre do Valhalla",
    status: "ongoing",
    description:
      "Heróis atravessam territórios em conflito enquanto antigas ameaças voltam a despertar nas fronteiras de Arton.",
    mode: "Presencial",
    schedule: "Domingos · 15h",
    frequency: "Quinzenal",
    seats: {
      filled: 5,
      total: 6,
    },
    tags: ["Fantasia heroica", "Exploração", "Política"],
    artwork: "citadel",
    href: "#contato",
  },
  {
    id: "demo-arquivos-secretos",
    name: "Arquivos Secretos",
    system: "Ordem Paranormal",
    master: "Mestre do Valhalla",
    status: "open",
    description:
      "Uma investigação sobre acontecimentos impossíveis coloca o grupo diante de registros que deveriam ter permanecido esquecidos.",
    mode: "Online",
    schedule: "Sextas · 20h",
    frequency: "Quinzenal",
    seats: {
      filled: 3,
      total: 5,
    },
    tags: ["Mistério", "Investigação", "Terror"],
    level: "Intermediário",
    artwork: "runes",
    href: "#contato",
  },
  {
    id: "demo-ultimo-salao",
    name: "O Último Salão",
    system: "Fabula Ultima",
    master: "Mestre do Valhalla",
    status: "ongoing",
    description:
      "Uma aventura focada nos personagens, descobertas e na construção coletiva de um mundo prestes a mudar para sempre.",
    mode: "Híbrida",
    schedule: "Terças · 19h30",
    frequency: "Semanal",
    seats: {
      filled: 4,
      total: 5,
    },
    tags: ["Narrativo", "Fantasia", "Personagens"],
    artwork: "portal",
    href: "#contato",
  },
];

export function TablesSection() {
  const hasTables = tables.length > 0;

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
            {hasTables ? (
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
            ) : (
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
            )}
          </div>

          <div className="relative mt-8 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>Quer mestrar ou encontrar uma mesa que combine com você?</p>

            <a
              className="font-semibold text-primary transition-colors hover:text-primary-hover"
              href="#contato"
            >
              Fale com o Valhalla →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
