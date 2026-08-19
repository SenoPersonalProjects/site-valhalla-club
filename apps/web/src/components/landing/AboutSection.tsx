const steps = [
  {
    step: "01",
    title: "Bloco informativo 01",
    description: "Texto provisório.",
  },
  {
    step: "02",
    title: "Bloco informativo 02",
    description: "Texto provisório.",
  },
  {
    step: "03",
    title: "Bloco informativo 03",
    description: "Texto provisório.",
  },
];

export function AboutSection() {
  return (
    <section className="border-b border-border bg-surface" id="sobre">
      <div className="mx-auto max-w-7xl px-6 py-28 sm:px-10 lg:px-12">
        <div className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Seção sobre
            </p>
            <h2 className="mt-5 font-display text-4xl leading-tight text-foreground sm:text-5xl">
              Título provisório da seção sobre o Valhalla.
            </h2>
          </div>

          <p className="self-end font-editorial text-xl leading-8 text-muted-foreground">
            Texto provisório para explicar quem é o Valhalla, qual é a proposta
            do clube e por que essa seção existe na página.
          </p>
        </div>

        <div className="relative mt-16 grid gap-px md:grid-cols-3">
          <div className="absolute left-0 right-0 top-9 hidden h-px bg-border md:block" />

          {steps.map((item) => (
            <article className="relative bg-surface pr-8" key={item.step}>
              <div className="mb-6 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-elevated">
                <span className="font-display text-sm font-semibold text-primary">
                  {item.step}
                </span>
              </div>
              <h3 className="font-display text-xl font-semibold text-foreground">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {item.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
